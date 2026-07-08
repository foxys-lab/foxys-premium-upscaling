import { WebGLEnhancer, type ProgressCb } from "./webgl";

export interface VideoEnhanceResult {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
}

function waitEvent(el: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const err = () => {
      cleanup();
      reject(new Error(`Media event failed: ${event}`));
    };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener("error", err);
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", err, { once: true });
  });
}

function pickMimeType(): string {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const t of types) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(t)
    ) {
      return t;
    }
  }
  return "video/webm";
}

/**
 * Enhance video 2× via WebGL + MediaRecorder (local).
 * Keeps audio when the browser allows track mixing.
 */
export async function enhanceVideo(
  file: File,
  onProgress?: ProgressCb,
): Promise<VideoEnhanceResult> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }

  onProgress?.({ phase: "Loading video", progress: 3 });
  const srcUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = srcUrl;

  try {
    await waitEvent(video, "loadedmetadata");
    // Some browsers need this for dimensions
    if (video.readyState < 2) {
      video.currentTime = 0;
      await waitEvent(video, "seeked").catch(() => undefined);
    }

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    if (!srcW || !srcH) throw new Error("Could not read video size");

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const fps = 30;
    const scale = 2;
    const outW = Math.min(srcW * scale, 3840);
    const outH = Math.round((srcH / srcW) * outW);

    const engine = new WebGLEnhancer();
    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW;
    outCanvas.height = outH;
    const octx = outCanvas.getContext("2d");
    if (!octx) throw new Error("2D canvas unavailable");

    const canvasStream = outCanvas.captureStream(fps);
    // Try to keep audio
    try {
      const raw = video as HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const vStream =
        raw.captureStream?.call(video) || raw.mozCaptureStream?.call(video);
      const audioTracks = vStream?.getAudioTracks?.() ?? [];
      for (const t of audioTracks) {
        canvasStream.addTrack(t);
      }
    } catch {
      /* video-only is fine */
    }

    const mime = pickMimeType();
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(canvasStream, {
      mimeType: mime,
      videoBitsPerSecond: Math.min(16_000_000, outW * outH * 4),
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Recording failed"));
    });

    onProgress?.({ phase: "Enhancing video", progress: 8 });
    recorder.start(250);

    // Play through and process frames
    video.currentTime = 0;
    await video.play();

    let lastDrawn = -1;
    const processFrame = () => {
      if (video.ended || video.paused) return;
      const t = video.currentTime;
      if (t !== lastDrawn) {
        lastDrawn = t;
        const glCanvas = engine.enhanceSource(video, srcW, srcH, {
          scale: outW / srcW,
          sharp: 0.42,
          deblock: 0.28,
        });
        octx.drawImage(glCanvas, 0, 0, outW, outH);
        if (duration > 0) {
          const pct = 8 + Math.min(90, (t / duration) * 85);
          onProgress?.({
            phase: "Enhancing video",
            progress: Math.round(pct),
          });
        }
      }
    };

    await new Promise<void>((resolve, reject) => {
      let raf = 0;
      const tick = () => {
        try {
          if (video.ended) {
            resolve();
            return;
          }
          processFrame();
          raf = requestAnimationFrame(tick);
        } catch (e) {
          cancelAnimationFrame(raf);
          reject(e);
        }
      };
      video.onended = () => {
        processFrame();
        resolve();
      };
      video.onerror = () => reject(new Error("Video playback failed"));
      raf = requestAnimationFrame(tick);
    });

    video.pause();
    // Final frame
    if (video.readyState >= 2) {
      const glCanvas = engine.enhanceSource(video, srcW, srcH, {
        scale: outW / srcW,
        sharp: 0.42,
        deblock: 0.28,
      });
      octx.drawImage(glCanvas, 0, 0, outW, outH);
    }

    onProgress?.({ phase: "Finishing encode", progress: 95 });
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;

    engine.destroy();

    const blob = new Blob(chunks, { type: mime.split(";")[0] || "video/webm" });
    if (blob.size < 100) {
      throw new Error("Output video was empty — try a shorter MP4/WebM clip");
    }
    const objectUrl = URL.createObjectURL(blob);
    onProgress?.({ phase: "Done", progress: 100 });
    return { blob, objectUrl, width: outW, height: outH };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(srcUrl);
  }
}
