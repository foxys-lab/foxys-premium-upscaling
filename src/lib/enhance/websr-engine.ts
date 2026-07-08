/**
 * WebSR Anime4K CNN — free.upscaler.video engine class.
 *
 * Sharpness fixes:
 * - Never CSS-scale the WebGPU canvas (1×1 CSS caused blurry readback)
 * - Prefer Large anime network (cnn-2x-l-an)
 * - Full-res when possible (no soft downscale before AI)
 * - Pixel-perfect snapshot (no smoothing)
 */

import type { ProgressCb } from "./webgl";
import WebSR from "@websr/websr";

import weights2xL from "../../weights/anime4k/cnn-2x-l-an.json";
import weights2xM from "../../weights/anime4k/cnn-2x-m-an.json";
import weights2xS from "../../weights/anime4k/cnn-2x-s-an.json";

type NetworkName = "anime4k/cnn-2x-l" | "anime4k/cnn-2x-m" | "anime4k/cnn-2x-s";

let cachedDevice: GPUDevice | null = null;
let deviceLost = false;

async function getDevice(): Promise<GPUDevice> {
  if (cachedDevice && !deviceLost) return cachedDevice;
  const gpu = await WebSR.initWebGPU();
  if (!gpu) {
    throw new Error("WebGPU not available — use Chrome or Edge");
  }
  cachedDevice = gpu;
  deviceLost = false;
  try {
    gpu.lost.then(() => {
      deviceLost = true;
      cachedDevice = null;
    });
  } catch {
    /* ignore */
  }
  return gpu;
}

export async function isWebSRAvailable(): Promise<boolean> {
  try {
    if (!navigator.gpu) return false;
    await getDevice();
    return true;
  } catch {
    return false;
  }
}

/** Capture WebGPU canvas at native resolution — never scale. */
async function snapshotWebGPUCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
): Promise<HTMLCanvasElement> {
  try {
    await device.queue.onSubmittedWorkDone();
  } catch {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  // Prefer exact canvas buffer size (not CSS)
  const w = canvas.width;
  const h = canvas.height;
  if (w < 2 || h < 2) throw new Error("WebGPU canvas has invalid size");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(canvas, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "pixelated",
    } as ImageBitmapOptions);
  } catch {
    bitmap = await createImageBitmap(canvas);
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });
  if (!ctx) {
    bitmap.close();
    throw new Error("2D canvas missing");
  }
  // 1:1 copy — any smoothing here = blur
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, w, h);
  bitmap.close();

  // Detect failed/black readback
  const mid = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data;
  const strip = ctx.getImageData(0, Math.floor(h / 2), Math.min(32, w), 1).data;
  let sum = 0;
  for (let i = 0; i < strip.length; i += 4) {
    sum += strip[i]! + strip[i + 1]! + strip[i + 2]!;
  }
  if (sum < 8 && (mid[0]! + mid[1]! + mid[2]!) < 6) {
    throw new Error("WebGPU readback empty/black");
  }

  return out;
}

async function run2x(opts: {
  network: NetworkName;
  weights: unknown;
  source: ImageBitmap;
  width: number;
  height: number;
  device: GPUDevice;
}): Promise<HTMLCanvasElement> {
  const { network, weights, source, width, height, device } = opts;

  const canvas = document.createElement("canvas");
  // CRITICAL: only set attribute size. Do NOT set CSS width/height (that blurs capture).
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.style.cssText =
    "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(canvas);

  try {
    const websr = new WebSR({
      network_name: network,
      weights,
      gpu: device,
      canvas,
      resolution: { width, height },
    });

    await websr.render(source);

    // WebSR may resize canvas — re-read dimensions after render
    if (canvas.width < width || canvas.height < height) {
      // ensure at least 2x intent
      console.warn("WebSR canvas size unexpected", canvas.width, canvas.height);
    }

    const snapped = await snapshotWebGPUCanvas(canvas, device);
    await websr.destroy();

    // Must be ~2× input
    if (snapped.width < width * 1.5 || snapped.height < height * 1.5) {
      throw new Error(
        `AI output too small (${snapped.width}×${snapped.height}), expected ~${width * 2}×${height * 2}`,
      );
    }

    return snapped;
  } finally {
    canvas.remove();
  }
}

export interface WebSREnhanceResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  network: string;
  bilinearCompare: HTMLCanvasElement;
}

/**
 * Sharp 2× AI upscale — Large anime CNN (best still quality in this stack).
 */
export async function enhanceWithWebSR(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  onProgress?: ProgressCb,
): Promise<WebSREnhanceResult> {
  onProgress?.({ phase: "Starting GPU…", progress: 8 });
  const device = await getDevice();

  // Only downscale if truly huge (VRAM). free.upscaler keeps full frame.
  // Soft downscale before AI is a major cause of "blurrier than them".
  const maxIn = 2048;
  let workW = srcW;
  let workH = srcH;
  let bitmap: ImageBitmap;

  if (srcW > maxIn || srcH > maxIn) {
    const r = Math.min(maxIn / srcW, maxIn / srcH);
    workW = Math.max(2, Math.round(srcW * r));
    workH = Math.max(2, Math.round(srcH * r));
    // Draw with high quality to temp canvas then bitmap (cleaner than resize API)
    const tmp = document.createElement("canvas");
    tmp.width = workW;
    tmp.height = workH;
    const tctx = tmp.getContext("2d", { alpha: false });
    if (!tctx) throw new Error("2D missing");
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(source as CanvasImageSource, 0, 0, workW, workH);
    bitmap = await createImageBitmap(tmp);
  } else {
    bitmap = await createImageBitmap(source as ImageBitmapSource);
    workW = bitmap.width;
    workH = bitmap.height;
  }

  // Fair compare: same pixel size as AI output (2×)
  const bilinearCompare = document.createElement("canvas");
  bilinearCompare.width = workW * 2;
  bilinearCompare.height = workH * 2;
  {
    const bctx = bilinearCompare.getContext("2d", { alpha: false });
    if (!bctx) throw new Error("2D missing");
    // Lanczos-ish via high quality — this is the "non-AI" baseline
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(bitmap, 0, 0, bilinearCompare.width, bilinearCompare.height);
  }

  // Large first = sharper (free.upscaler XL). Then M, S.
  const attempts: { network: NetworkName; weights: unknown }[] = [
    { network: "anime4k/cnn-2x-l", weights: weights2xL },
    { network: "anime4k/cnn-2x-m", weights: weights2xM },
    { network: "anime4k/cnn-2x-s", weights: weights2xS },
  ];

  let lastErr: unknown;
  try {
    for (const a of attempts) {
      try {
        onProgress?.({
          phase: `AI super-res ${a.network} (${workW}×${workH} → ${workW * 2}×${workH * 2})…`,
          progress: 35,
        });
        const upscaled = await run2x({
          network: a.network,
          weights: a.weights,
          source: bitmap,
          width: workW,
          height: workH,
          device,
        });
        onProgress?.({ phase: "Done", progress: 100 });
        bitmap.close();
        return {
          canvas: upscaled,
          width: upscaled.width,
          height: upscaled.height,
          network: a.network,
          bilinearCompare,
        };
      } catch (e) {
        lastErr = e;
        console.warn(a.network, e);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("WebSR failed");
  } catch (e) {
    bitmap.close();
    throw e;
  }
}
