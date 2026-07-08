import {
  canvasToBlob,
  WebGLEnhancer,
  type ProgressCb,
} from "./webgl";

export interface ImageEnhanceResult {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

/**
 * Pick scale so small images get more resolution boost,
 * large images still get a strong restore (min 2×, up to 4× if tiny).
 */
function autoScale(w: number, h: number): number {
  const long = Math.max(w, h);
  if (long < 640) return 4;
  if (long < 1280) return 3;
  if (long < 2048) return 2;
  return 2;
}

/** Enhance image → high-quality PNG/JPEG + object URL. */
export async function enhanceImage(
  file: File,
  onProgress?: ProgressCb,
): Promise<ImageEnhanceResult> {
  onProgress?.({ phase: "Reading image", progress: 5 });
  const img = await loadImage(file);
  const scale = autoScale(img.naturalWidth, img.naturalHeight);

  onProgress?.({
    phase: `Upscaling ${scale}× + restoring detail`,
    progress: 20,
  });

  const engine = new WebGLEnhancer();
  try {
    // Double-pass for stronger visible gain: enhance once, then light restore-scale if small
    let canvas = engine.enhanceSource(
      img,
      img.naturalWidth,
      img.naturalHeight,
      { scale, strength: 0.95 },
    );

    onProgress?.({ phase: "Second clarity pass", progress: 65 });
    // Second pass at 1× with high strength = extra line/CAS punch on already-upscaled result
    canvas = engine.enhanceSource(canvas, canvas.width, canvas.height, {
      scale: 1,
      strength: 0.75,
    });

    onProgress?.({ phase: "Encoding", progress: 88 });
    const preferJpeg =
      file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
    // Prefer PNG for AI art (cleaner lines)
    const usePng = !preferJpeg || /\.png$/i.test(file.name);
    const blob = await canvasToBlob(
      canvas,
      usePng ? "image/png" : "image/jpeg",
      usePng ? undefined : 0.95,
    );
    const objectUrl = URL.createObjectURL(blob);

    onProgress?.({ phase: "Done", progress: 100 });
    return {
      blob,
      objectUrl,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    engine.destroy();
  }
}
