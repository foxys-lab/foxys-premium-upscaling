/**
 * WebSR Anime4K CNN — free.upscaler.video engine.
 *
 * CRITICAL: WebGPU swapchain only shows the last presented frame while the
 * canvas stays in the document. free.upscaler never snapshots to a blob for
 * display — it paints into a permanent <canvas>.
 *
 * API:
 *   enhanceWithWebSR(source, w, h, onProgress, outputCanvas?)
 *   - If outputCanvas is provided, AI paints into THAT canvas (keep it mounted).
 *   - Also builds a 2D PNG blob for download when capture works.
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

function makeBilinear2x(
  bitmap: ImageBitmap,
  workW: number,
  workH: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = workW * 2;
  c.height = workH * 2;
  const ctx = c.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D missing");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/** Best-effort snapshot for download; display uses live canvas. */
async function trySnapshot(
  webgpuCanvas: HTMLCanvasElement,
  gpu: GPUDevice,
): Promise<HTMLCanvasElement | null> {
  const w = webgpuCanvas.width;
  const h = webgpuCanvas.height;
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
  const ctx = out.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  try {
    const c = webgpuCanvas as HTMLCanvasElement & {
      convertToBlob?: (o?: { type?: string }) => Promise<Blob>;
    };
    if (typeof c.convertToBlob === "function") {
      const blob = await c.convertToBlob({ type: "image/png" });
      const bmp = await createImageBitmap(blob);
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
    } else {
      const bmp = await createImageBitmap(webgpuCanvas);
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
    }
  } catch {
    try {
      ctx.drawImage(webgpuCanvas, 0, 0, w, h);
    } catch {
      return null;
    }
  }

  // Reject solid black
  const d = ctx.getImageData(
    Math.floor(w / 4),
    Math.floor(h / 4),
    Math.min(32, w),
    Math.min(32, h),
  ).data;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    max = Math.max(max, d[i]!, d[i + 1]!, d[i + 2]!);
  }
  if (max < 8) return null;
  return out;
}

export interface WebSREnhanceResult {
  /** 2D canvas for download if snapshot worked; may equal live for display. */
  canvas: HTMLCanvasElement;
  /** WebGPU canvas — MUST stay mounted in the UI for visible AI result. */
  liveCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  network: string;
  bilinearCompare: HTMLCanvasElement;
  isRealAI: true;
  snapshotOk: boolean;
}

/**
 * Paint AI into `outputCanvas` if provided (preferred — keep that node in React).
 * Otherwise creates a canvas you must keep mounted.
 */
export async function enhanceWithWebSR(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  onProgress?: ProgressCb,
  outputCanvas?: HTMLCanvasElement | null,
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

  const outW = workW * 2;
  const outH = workH * 2;
  const bilinearCompare = makeBilinear2x(bitmap, workW, workH);

  // Use caller-provided canvas (stays in React tree) or create one
  const canvas = outputCanvas ?? document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  // Ensure in document for presentation
  if (!canvas.isConnected) {
    canvas.style.cssText =
      "position:fixed;left:0;top:0;opacity:0.02;z-index:9999;pointer-events:none;";
    canvas.style.width = `${outW}px`;
    canvas.style.height = `${outH}px`;
    document.body.appendChild(canvas);
  }

  const attempts: { network: NetworkName; weights: unknown }[] = [
    { network: "anime4k/cnn-2x-m", weights: weights2xM },
    { network: "anime4k/cnn-2x-l", weights: weights2xL },
  ];

  let lastErr: unknown;

  for (const a of attempts) {
    try {
      onProgress?.({ phase: `Real AI: ${a.network}`, progress: 45 });
      const gpuNow = await getDevice(WebSR);

      // If canvas already has a webgpu context from a prior run, we need a fresh canvas
      // (getContext('webgpu') can only be called once). Clone if needed.
      let paintCanvas = canvas;
      try {
        // probe if webgpu context already taken by something else
        const existing = paintCanvas.getContext("webgpu");
        if (!existing) {
          // might throw if 2d was used — create fresh
        }
      } catch {
        paintCanvas = document.createElement("canvas");
        paintCanvas.width = outW;
        paintCanvas.height = outH;
        paintCanvas.style.cssText =
          "position:fixed;left:0;top:0;opacity:0.02;z-index:9999;pointer-events:none;";
        paintCanvas.style.width = `${outW}px`;
        paintCanvas.style.height = `${outH}px`;
        document.body.appendChild(paintCanvas);
      }

      // WebSR constructor calls getContext('webgpu') — canvas must never have had another context
      const websr = new WebSR({
        network_name: a.network,
        weights: a.weights,
        gpu: gpuNow,
        canvas: paintCanvas,
        resolution: { width: workW, height: workH },
      });

      await websr.render(bitmap);
      await websr.render(bitmap);

      // Keep canvas presented at real size so it stays visible when moved into UI
      paintCanvas.style.opacity = "1";
      paintCanvas.style.position = "relative";
      paintCanvas.style.left = "0";
      paintCanvas.style.top = "0";
      paintCanvas.style.width = "100%";
      paintCanvas.style.height = "100%";
      paintCanvas.style.zIndex = "auto";

      onProgress?.({ phase: "Saving download copy…", progress: 85 });
      const snap = await trySnapshot(paintCanvas, gpuNow);

      bitmap.close();
      onProgress?.({ phase: "Real AI complete", progress: 100 });

      return {
        canvas: snap ?? paintCanvas,
        liveCanvas: paintCanvas,
        width: outW,
        height: outH,
        network: a.network,
        bilinearCompare,
        isRealAI: true,
        snapshotOk: Boolean(snap),
      } as WebSREnhanceResult & { snapshotOk: boolean };
    } catch (e) {
      lastErr = e;
      console.error(`AI ${a.network} failed:`, e);
      device = null;
    }
  }

  bitmap.close();
  const detail =
    lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown");
  throw new Error(`Real AI failed: ${detail}`);
}
