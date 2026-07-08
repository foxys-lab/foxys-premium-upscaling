/**
 * WebSR Anime4K CNN — free.upscaler engine.
 *
 * Dark-screen root cause: capturing a WebGPU canvas that was never presented
 * (off-screen 0-opacity / wrong size) often returns solid black in Chrome.
 *
 * Fix: present the canvas on-screen at native pixel size (opacity ~0), wait for
 * GPU + 2 animation frames, then convertToBlob. Never call websr.destroy()
 * (it kills the GPUDevice).
 */

import type { ProgressCb } from "./webgl";
import weights2xL from "../../weights/anime4k/cnn-2x-l-an.json";
import weights2xM from "../../weights/anime4k/cnn-2x-m-an.json";

type NetworkName = "anime4k/cnn-2x-l" | "anime4k/cnn-2x-m";

type WebSRInstance = {
  canvas: HTMLCanvasElement;
  render: (source: ImageBitmap) => Promise<void>;
};

type WebSRStatic = {
  new (params: {
    canvas: HTMLCanvasElement;
    weights: unknown;
    network_name: NetworkName;
    gpu: GPUDevice;
    resolution?: { width: number; height: number };
  }): WebSRInstance;
  initWebGPU: () => Promise<GPUDevice | false>;
};

declare global {
  interface Window {
    WebSR?: WebSRStatic;
  }
}

let WebSRClass: WebSRStatic | null = null;
let device: GPUDevice | null = null;

function resolveWebSR(mod: unknown): WebSRStatic | null {
  if (!mod) return null;
  const m = mod as Record<string, unknown>;
  const cand = (m.default ?? m.WebSR ?? m) as WebSRStatic;
  if (cand && typeof cand.initWebGPU === "function") return cand;
  return null;
}

async function loadWebSRClass(): Promise<WebSRStatic> {
  if (WebSRClass) return WebSRClass;

  try {
    const mod = await import("@websr/websr");
    const resolved = resolveWebSR(mod);
    if (resolved) {
      WebSRClass = resolved;
      return resolved;
    }
  } catch (e) {
    console.warn("import(@websr/websr) failed", e);
  }

  if (window.WebSR && typeof window.WebSR.initWebGPU === "function") {
    WebSRClass = window.WebSR;
    return WebSRClass;
  }

  const base = import.meta.env.BASE_URL || "/";
  const src = `${base}vendor/websr.js`;

  await new Promise<void>((resolve, reject) => {
    const prev = document.querySelector<HTMLScriptElement>(
      'script[data-foxy-websr="1"]',
    );
    if (prev) {
      if (window.WebSR) resolve();
      else {
        prev.addEventListener("load", () => resolve(), { once: true });
        prev.addEventListener(
          "error",
          () => reject(new Error("WebSR script error")),
          { once: true },
        );
        setTimeout(() => {
          if (window.WebSR) resolve();
          else reject(new Error("WebSR global missing after script"));
        }, 4000);
      }
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.foxyWebsr = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });

  const fromWindow = resolveWebSR(window.WebSR);
  if (!fromWindow) {
    throw new Error("WebSR AI library did not expose window.WebSR");
  }
  WebSRClass = fromWindow;
  return fromWindow;
}

async function getDevice(WebSR: WebSRStatic): Promise<GPUDevice> {
  if (device) {
    try {
      void device.queue;
      return device;
    } catch {
      device = null;
    }
  }
  if (!navigator.gpu) {
    throw new Error("No WebGPU — use desktop Chrome or Edge.");
  }
  const gpu = await WebSR.initWebGPU();
  if (!gpu) {
    throw new Error("WebGPU device failed — check chrome://gpu");
  }
  device = gpu;
  try {
    gpu.lost.then(() => {
      device = null;
    });
  } catch {
    /* ignore */
  }
  return gpu;
}

export async function isWebSRAvailable(): Promise<boolean> {
  try {
    if (!navigator.gpu) return false;
    const WebSR = await loadWebSRClass();
    await getDevice(WebSR);
    return true;
  } catch (e) {
    console.warn("WebSR unavailable:", e);
    return false;
  }
}

function meanLuma(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const { width: w, height: h } = canvas;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 32));
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Present WebGPU canvas on-screen (nearly invisible) then snapshot.
 * Offscreen / opacity-0 canvases often snapshot as pure black in Chrome.
 */
async function capturePresentedWebGPUCanvas(
  canvas: HTMLCanvasElement,
  gpu: GPUDevice,
): Promise<HTMLCanvasElement> {
  const w = canvas.width;
  const h = canvas.height;

  // Present at true pixel size (1 CSS px = 1 canvas px) so browser composites correctly
  const prev = {
    position: canvas.style.position,
    left: canvas.style.left,
    top: canvas.style.top,
    opacity: canvas.style.opacity,
    zIndex: canvas.style.zIndex,
    pointerEvents: canvas.style.pointerEvents,
    width: canvas.style.width,
    height: canvas.style.height,
  };

  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.opacity = "0.01";
  canvas.style.zIndex = "2147483646";
  canvas.style.pointerEvents = "none";
  // IMPORTANT: match buffer size so no scaling/blur/black
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  try {
    await gpu.queue.onSubmittedWorkDone();
  } catch {
    /* ignore */
  }

  // Two frames for presentation
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D context missing");
  ctx.imageSmoothingEnabled = false;

  const c = canvas as HTMLCanvasElement & {
    convertToBlob?: (o?: { type?: string }) => Promise<Blob>;
  };

  let ok = false;
  if (typeof c.convertToBlob === "function") {
    try {
      const blob = await c.convertToBlob({ type: "image/png" });
      const bmp = await createImageBitmap(blob);
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      ok = true;
    } catch (e) {
      console.warn("convertToBlob failed", e);
    }
  }

  if (!ok) {
    try {
      const bmp = await createImageBitmap(canvas);
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      ok = true;
    } catch (e) {
      console.warn("createImageBitmap failed", e);
    }
  }

  if (!ok) {
    // Last resort: drawImage of the live canvas
    ctx.drawImage(canvas, 0, 0, w, h);
  }

  // Restore styles
  Object.assign(canvas.style, prev);

  const luma = meanLuma(out);
  if (luma < 2) {
    throw new Error(
      "AI produced a black frame (WebGPU capture). Retry, or use a smaller image.",
    );
  }

  return out;
}

export interface WebSREnhanceResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  network: string;
  bilinearCompare: HTMLCanvasElement;
  isRealAI: true;
}

export async function enhanceWithWebSR(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  onProgress?: ProgressCb,
): Promise<WebSREnhanceResult> {
  onProgress?.({ phase: "Loading real AI (WebSR)…", progress: 6 });
  const WebSR = await loadWebSRClass();
  const gpu = await getDevice(WebSR);

  onProgress?.({ phase: "Preparing image…", progress: 18 });

  const maxIn = 1280;
  let workW = srcW;
  let workH = srcH;
  let bitmap: ImageBitmap;

  if (srcW > maxIn || srcH > maxIn) {
    const r = Math.min(maxIn / srcW, maxIn / srcH);
    workW = Math.max(2, Math.round(srcW * r));
    workH = Math.max(2, Math.round(srcH * r));
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

  if (workW < 2 || workH < 2) {
    bitmap.close();
    throw new Error("Image too small");
  }

  const bilinearCompare = document.createElement("canvas");
  bilinearCompare.width = workW * 2;
  bilinearCompare.height = workH * 2;
  {
    const bctx = bilinearCompare.getContext("2d", { alpha: false });
    if (!bctx) throw new Error("2D missing");
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(bitmap, 0, 0, bilinearCompare.width, bilinearCompare.height);
  }

  const attempts: { network: NetworkName; weights: unknown }[] = [
    { network: "anime4k/cnn-2x-m", weights: weights2xM }, // medium first (stable, like free.upscaler default)
    { network: "anime4k/cnn-2x-l", weights: weights2xL },
  ];

  let lastErr: unknown;

  for (const a of attempts) {
    const canvas = document.createElement("canvas");
    canvas.width = workW * 2;
    canvas.height = workH * 2;
    document.body.appendChild(canvas);

    try {
      onProgress?.({
        phase: `Real AI: ${a.network}`,
        progress: 45,
      });

      const gpuNow = await getDevice(WebSR);

      const websr = new WebSR({
        network_name: a.network,
        weights: a.weights,
        gpu: gpuNow,
        canvas,
        resolution: { width: workW, height: workH },
      });

      // Render twice — first frame sometimes presents empty on some GPUs
      await websr.render(bitmap);
      await websr.render(bitmap);

      onProgress?.({ phase: "Capturing AI image…", progress: 80 });
      const out = await capturePresentedWebGPUCanvas(canvas, gpuNow);

      canvas.remove();
      bitmap.close();

      onProgress?.({ phase: "Real AI complete", progress: 100 });
      return {
        canvas: out,
        width: out.width,
        height: out.height,
        network: a.network,
        bilinearCompare,
        isRealAI: true,
      };
    } catch (e) {
      lastErr = e;
      console.error(`AI ${a.network} failed:`, e);
      canvas.remove();
      device = null;
    }
  }

  bitmap.close();
  const detail =
    lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown");
  throw new Error(`Real AI failed: ${detail}`);
}
