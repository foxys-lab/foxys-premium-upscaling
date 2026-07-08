/**
 * WebSR Anime4K CNN (free.upscaler.video engine).
 *
 * Black-right-panel bug: snapshotting WebGPU swapchain canvases often returns
 * solid black. free.upscaler avoids this by *displaying the WebGPU canvas live*.
 *
 * We do both:
 * 1) Keep the painted WebGPU canvas for on-screen display
 * 2) Copy via createImageBitmap → bitmaprenderer → 2d (Chromium-safe)
 * 3) Never call websr.destroy() (destroys GPUDevice)
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

/** Keep last live WebGPU canvas so UI can mount it if blob copy fails. */
let lastLiveCanvas: HTMLCanvasElement | null = null;

export function takeLastLiveCanvas(): HTMLCanvasElement | null {
  const c = lastLiveCanvas;
  lastLiveCanvas = null;
  return c;
}

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

  if (window.WebSR?.initWebGPU) {
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
          else reject(new Error("WebSR global missing"));
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
  if (!fromWindow) throw new Error("WebSR global not found");
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
  if (!gpu) throw new Error("WebGPU device failed — check chrome://gpu");
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

function sampleStats(canvas: HTMLCanvasElement): { mean: number; max: number } {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { mean: 0, max: 0 };
  const w = canvas.width;
  const h = canvas.height;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 24));
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  let max = 0;
  let n = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const yv = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      sum += yv;
      max = Math.max(max, yv);
      n++;
    }
  }
  return { mean: n ? sum / n : 0, max };
}

/**
 * Copy WebGPU canvas → 2D canvas using ImageBitmap transfer (Chromium-safe).
 */
async function copyWebGPUTo2D(
  webgpuCanvas: HTMLCanvasElement,
  gpu: GPUDevice,
): Promise<HTMLCanvasElement> {
  const w = webgpuCanvas.width;
  const h = webgpuCanvas.height;

  // Present on-screen at 1:1 CSS pixels so the compositor has real content
  webgpuCanvas.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${w}px`,
    `height:${h}px`,
    "opacity:0.02",
    "z-index:2147483646",
    "pointer-events:none",
  ].join(";");

  try {
    await gpu.queue.onSubmittedWorkDone();
  } catch {
    /* ignore */
  }
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;

  // Method A: bitmaprenderer transfer (best for WebGPU → CPU)
  try {
    const bmp = await createImageBitmap(webgpuCanvas);
    const br = out.getContext("bitmaprenderer") as ImageBitmapRenderingContext | null;
    if (br && "transferFromImageBitmap" in br) {
      br.transferFromImageBitmap(bmp);
      // Move pixels to a 2d canvas (bitmaprenderer can't toBlob on all browsers)
      const out2 = document.createElement("canvas");
      out2.width = w;
      out2.height = h;
      const ctx2 = out2.getContext("2d", { alpha: false });
      if (!ctx2) throw new Error("2d missing");
      ctx2.imageSmoothingEnabled = false;
      // draw from bitmaprenderer canvas via another bitmap
      const bmp2 = await createImageBitmap(out);
      ctx2.drawImage(bmp2, 0, 0);
      bmp2.close();
      const stats = sampleStats(out2);
      if (stats.max > 8) return out2;
    } else {
      bmp.close();
    }
  } catch (e) {
    console.warn("bitmaprenderer path failed", e);
  }

  // Method B: convertToBlob
  try {
    const c = webgpuCanvas as HTMLCanvasElement & {
      convertToBlob?: (o?: { type?: string }) => Promise<Blob>;
    };
    if (typeof c.convertToBlob === "function") {
      const blob = await c.convertToBlob({ type: "image/png" });
      const bmp = await createImageBitmap(blob);
      const ctx = out.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("2d missing");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const stats = sampleStats(out);
      if (stats.max > 8) return out;
    }
  } catch (e) {
    console.warn("convertToBlob path failed", e);
  }

  // Method C: direct drawImage
  {
    const ctx = out.getContext("2d", { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(webgpuCanvas, 0, 0, w, h);
      const stats = sampleStats(out);
      if (stats.max > 8) return out;
    }
  }

  throw new Error(
    "Could not copy AI canvas (still black). This is a browser WebGPU readback limit — try Chrome latest.",
  );
}

export interface WebSREnhanceResult {
  canvas: HTMLCanvasElement;
  /** Live WebGPU canvas (for on-screen display if needed). */
  liveCanvas: HTMLCanvasElement;
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
  await getDevice(WebSR);

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
    { network: "anime4k/cnn-2x-m", weights: weights2xM },
    { network: "anime4k/cnn-2x-l", weights: weights2xL },
  ];

  let lastErr: unknown;

  for (const a of attempts) {
    // Visible (tiny opacity) full-size canvas — required for non-black readback
    const canvas = document.createElement("canvas");
    canvas.width = workW * 2;
    canvas.height = workH * 2;
    canvas.setAttribute("data-foxy-ai", "1");
    document.body.appendChild(canvas);

    try {
      onProgress?.({ phase: `Real AI: ${a.network}`, progress: 45 });
      const gpuNow = await getDevice(WebSR);

      const websr = new WebSR({
        network_name: a.network,
        weights: a.weights,
        gpu: gpuNow,
        canvas,
        resolution: { width: workW, height: workH },
      });

      // Double render — first frame can be empty on some GPUs
      await websr.render(bitmap);
      await websr.render(bitmap);

      onProgress?.({ phase: "Copying AI pixels…", progress: 78 });
      const out = await copyWebGPUTo2D(canvas, gpuNow);

      // Keep live canvas available (free.upscaler style display)
      lastLiveCanvas = canvas;
      // Don't remove live canvas yet — App may mount it; hide off-screen
      canvas.style.cssText =
        "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none;";

      bitmap.close();
      onProgress?.({ phase: "Real AI complete", progress: 100 });

      return {
        canvas: out,
        liveCanvas: canvas,
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
