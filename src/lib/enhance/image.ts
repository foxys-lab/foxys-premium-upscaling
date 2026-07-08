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

/** 2× enhance image → PNG blob + object URL for compare/download. */
export async function enhanceImage(
  file: File,
  onProgress?: ProgressCb,
): Promise<ImageEnhanceResult> {
  onProgress?.({ phase: "Reading image", progress: 5 });
  const img = await loadImage(file);

  onProgress?.({ phase: "Enhancing", progress: 25 });
  const engine = new WebGLEnhancer();
  try {
    const canvas = engine.enhanceSource(img, img.naturalWidth, img.naturalHeight, {
      scale: 2,
      sharp: 0.48,
      deblock: 0.25,
    });

    onProgress?.({ phase: "Encoding", progress: 80 });
    const preferJpeg =
      file.type === "image/jpeg" ||
      /\.jpe?g$/i.test(file.name);
    const blob = await canvasToBlob(
      canvas,
      preferJpeg ? "image/jpeg" : "image/png",
      preferJpeg ? 0.92 : undefined,
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
