import WebSR from '@websr/websr';

import type {
  WorkerRequestMessage,
  WorkerResponseMessage,
  InitData,
  Resolution
} from './types/worker-messages';

// Processors — same path as free-ai-video-upscaler
import pipelineProcessor from './processors/pipeline-processor';

// Worker state
let gpu: any | false;
let websr: WebSR;
let upscaled_canvas: OffscreenCanvas;
let original_canvas: OffscreenCanvas;
let resolution: Resolution;
let ctx: ImageBitmapRenderingContext | null;
let pauseLock: Promise<void> | null = null;
let resolvePause: (() => void) | null = null;

// Default weights (medium / real-life) — same as upstream
const weights = require('./weights/cnn-2x-m-rl.json');

/**
 * Check if WebGPU is supported in this environment
 */
async function isSupported(): Promise<void> {
  gpu = await WebSR.initWebGPU();

  postMessage({
    cmd: 'isSupported',
    data: gpu !== false
  } satisfies WorkerResponseMessage);
}

/**
 * Initialize the worker with canvases and create WebSR instance
 * (identical to free-ai-video-upscaler, plus ready signal)
 */
async function init(config: InitData): Promise<void> {
  if (!gpu) {
    gpu = await WebSR.initWebGPU();
  }
  if (!gpu) {
    throw new Error('WebGPU not available');
  }

  websr = new WebSR({
    network_name: "anime4k/cnn-2x-m",
    weights,
    resolution: config.resolution,
    gpu: gpu,
    canvas: config.upscaled as any
  });

  resolution = config.resolution;
  upscaled_canvas = config.upscaled;
  original_canvas = config.original;

  ctx = original_canvas.getContext('bitmaprenderer');

  // Left side of compare: plain 2× resize (not AI)
  const bitmap2 = await createImageBitmap(config.bitmap, {
    resizeHeight: config.resolution.height * 2,
    resizeWidth: config.resolution.width * 2,
  });

  if (ctx) {
    ctx.transferFromImageBitmap(bitmap2);
  }

  // Right side: real Anime4K / WebSR AI (signal ready even if render is slow)
  try {
    await websr.render(config.bitmap as any);
  } catch (err) {
    console.error('WebSR render failed', err);
    throw err;
  }

  postMessage({ cmd: 'ready' } satisfies WorkerResponseMessage);
}

/**
 * Switch to a different AI upscaling network and re-render
 */
async function switchNetwork(name: string, nextWeights: any, bitmap: ImageBitmap): Promise<void> {
  if (!websr) {
    throw new Error('WebSR not initialized yet');
  }
  websr.switchNetwork(name as any, nextWeights);
  await websr.render(bitmap as any);
  postMessage({ cmd: 'networkReady' } satisfies WorkerResponseMessage);
}

/**
 * Export current AI canvas as PNG (images). Optionally re-render first.
 */
async function exportImage(bitmap?: ImageBitmap): Promise<void> {
  if (!upscaled_canvas || !websr) {
    throw new Error('Upscaler not ready. Choose a file again.');
  }
  postMessage({ cmd: 'progress', data: 30 });
  if (bitmap) {
    await websr.render(bitmap as any);
  }
  postMessage({ cmd: 'progress', data: 70 });
  const blob = await upscaled_canvas.convertToBlob({ type: 'image/png' });
  postMessage({ cmd: 'progress', data: 100 });
  postMessage({ cmd: 'finished', data: blob } satisfies WorkerResponseMessage);
}

self.onmessage = async function (event: MessageEvent<WorkerRequestMessage>) {
  if (!event.data.cmd) return;

  try {
    switch (event.data.cmd) {
      case 'init':
        await init(event.data.data);
        break;

      case 'isSupported':
        await isSupported();
        break;

      case 'pause':
        if (!pauseLock) {
          pauseLock = new Promise(resolve => { resolvePause = resolve; });
          postMessage({ cmd: 'paused' } satisfies WorkerResponseMessage);
        }
        break;

      case 'resume':
        if (pauseLock && resolvePause) {
          resolvePause();
          pauseLock = null;
          resolvePause = null;
          postMessage({ cmd: 'resumed' } satisfies WorkerResponseMessage);
        }
        break;

      case 'process':
        if (!websr || !upscaled_canvas || !original_canvas || !resolution) {
          postMessage({
            cmd: 'error',
            data: 'Upscaler not ready. Reload and choose a file again.',
          } satisfies WorkerResponseMessage);
          break;
        }
        // Same pipeline as competitor (WebDemuxer → WebSR → WebCodecs → mediabunny)
        await pipelineProcessor({
          file: event.data.file,
          inputHandle: event.data.inputHandle,
          outputHandle: event.data.outputHandle,
          websr,
          upscaled_canvas,
          original_canvas,
          resolution,
          getPauseLock: () => pauseLock,
        });
        break;

      case 'exportImage':
        await exportImage(event.data.bitmap);
        break;

      case 'network':
        await switchNetwork(
          event.data.data.name,
          event.data.data.weights,
          event.data.data.bitmap
        );
        break;
    }
  } catch (err: any) {
    console.error('Worker error:', err);
    postMessage({
      cmd: 'error',
      data: err?.message || String(err) || 'Worker failed',
    } satisfies WorkerResponseMessage);
  }
};

self.onerror = (event) => {
  postMessage({
    cmd: 'error',
    data: typeof event === 'string' ? event : (event as ErrorEvent).message || 'Worker error',
  } satisfies WorkerResponseMessage);
};
