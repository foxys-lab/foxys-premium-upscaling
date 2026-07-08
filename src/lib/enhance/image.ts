import { canvasToBlob, WebGLEnhancer, type ProgressCb } from "./webgl";
import { enhanceWithWebSR, isWebSRAvailable } from "./websr-engine";

export interface ImageEnhanceResult {
  blob: Blob;
  objectUrl: string;
  compareBeforeUrl: string;
  cropBeforeUrl: string;
  cropAfterUrl: string;
  width: number;
  height: number;
  engine: "websr" | "webgl";
  network?: string;
  elapsedMs: number;
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

async function loadImgFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load result image"));
    img.src = url;
  });
}

/** Center crop at native pixels — no resize (shows real sharpness). */
async function centerCropUrl(
  source: HTMLImageElement | HTMLCanvasElement,
  size = 320,
): Promise<string> {
  const w =
    source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h =
    source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const side = Math.min(size, w, h);
  const sx = Math.max(0, Math.floor((w - side) / 2));
  const sy = Math.max(0, Math.floor((h - side) / 2));
  const c = document.createElement("canvas");
  c.width = side;
  c.height = side;
  const ctx = c.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D missing");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, sx, sy, side, side, 0, 0, side, side);
  // Always PNG for crops — no JPEG blur
  const blob = await canvasToBlob(c, "image/png");
  return URL.createObjectURL(blob);
}

export async function enhanceImage(
  file: File,
  onProgress?: ProgressCb,
): Promise<ImageEnhanceResult> {
  const t0 = performance.now();
  onProgress?.({ phase: "Reading image", progress: 5 });
  const img = await loadImage(file);

  // Always PNG for AI output — JPEG makes results look blurrier than free.upscaler
  const encodePng = (canvas: HTMLCanvasElement) => canvasToBlob(canvas, "image/png");

  const finish = async (
    canvas: HTMLCanvasElement,
    compareBefore: HTMLCanvasElement,
    engine: "websr" | "webgl",
    network?: string,
  ): Promise<ImageEnhanceResult> => {
    onProgress?.({ phase: "Saving PNG…", progress: 88 });
    const blob = await encodePng(canvas);
    const objectUrl = URL.createObjectURL(blob);
    const compareBeforeBlob = await canvasToBlob(compareBefore, "image/png");
    const compareBeforeUrl = URL.createObjectURL(compareBeforeBlob);

    const beforeImg = await loadImgFromUrl(compareBeforeUrl);
    const afterImg = await loadImgFromUrl(objectUrl);
    const cropBeforeUrl = await centerCropUrl(beforeImg);
    const cropAfterUrl = await centerCropUrl(afterImg);

    onProgress?.({ phase: "Done", progress: 100 });
    return {
      blob,
      objectUrl,
      compareBeforeUrl,
      cropBeforeUrl,
      cropAfterUrl,
      width: canvas.width,
      height: canvas.height,
      engine,
      network,
      elapsedMs: Math.round(performance.now() - t0),
    };
  };

  // ——— WebSR Large Anime4K (sharp, free.upscaler-class) ———
  try {
    if (await isWebSRAvailable()) {
      onProgress?.({ phase: "AI upscale (WebSR Large)…", progress: 12 });
      const result = await enhanceWithWebSR(
        img,
        img.naturalWidth,
        img.naturalHeight,
        onProgress,
      );
      return await finish(
        result.canvas,
        result.bilinearCompare,
        "websr",
        result.network,
      );
    }
  } catch (e) {
    console.error("WebSR failed:", e);
    onProgress?.({ phase: "AI failed — fast fallback…", progress: 40 });
  }

  // ——— WebGL fallback (will look softer — Chrome+WebGPU needed for sharp AI) ———
  onProgress?.({ phase: "WebGL fallback (softer)…", progress: 50 });
  const engine = new WebGLEnhancer();
  try {
    const canvas = engine.enhanceSource(
      img,
      img.naturalWidth,
      img.naturalHeight,
      { scale: 2, strength: 1.05 },
    );
    const bilinear = document.createElement("canvas");
    bilinear.width = canvas.width;
    bilinear.height = canvas.height;
    const bctx = bilinear.getContext("2d", { alpha: false });
    if (!bctx) throw new Error("2D missing");
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(img, 0, 0, bilinear.width, bilinear.height);
    return await finish(canvas, bilinear, "webgl");
  } finally {
    engine.destroy();
  }
}
