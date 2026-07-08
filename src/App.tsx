import { useEffect, useMemo, useState } from "react";
import {
  canRunLocalUpscale,
  detectCapabilities,
  type BrowserCapabilities,
} from "./lib/capabilities";
import {
  createJobFromFile,
  formatBytes,
  runDemoPipeline,
  type UpscaleJob,
} from "./lib/job";
import { pipelineFromPreset } from "./lib/presets";
import { CompareSlider } from "./ui/CompareSlider";
import { DropZone } from "./ui/DropZone";
import { ProgressPanel } from "./ui/ProgressPanel";

/** One automatic quality path — no user tuning. */
const AUTO_PRESET = "balanced" as const;

/** Lightweight demo "after" so the compare scrubber is useful until real WebGPU ships. */
async function makeDemoEnhancedUrl(sourceUrl: string): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  img.src = sourceUrl;
  await img.decode();

  const scale = 2;
  const w = Math.min(img.naturalWidth * scale, 1920);
  const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceUrl;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  // Mild clarity pass (placeholder for real SR)
  ctx.filter = "contrast(1.06) saturate(1.04)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not build preview"));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      "image/png",
    );
  });
}

function FoxMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden>
      <path d="M22 24l-6-8 10 4 6-6 6 6 10-4-6 8" fill="#f97316" />
      <path d="M18 38c0-8 6-14 14-14s14 6 14 14v2H18v-2z" fill="#ea580c" />
      <circle cx="28" cy="34" r="2" fill="#fff" />
      <circle cx="36" cy="34" r="2" fill="#fff" />
    </svg>
  );
}

export default function App() {
  const [caps, setCaps] = useState<BrowserCapabilities | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [job, setJob] = useState<UpscaleJob | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    detectCapabilities().then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (afterUrl) URL.revokeObjectURL(afterUrl);
    };
  }, [afterUrl]);

  const ready = useMemo(
    () => (caps ? canRunLocalUpscale(caps) : false),
    [caps],
  );

  const pipeline = useMemo(() => pipelineFromPreset(AUTO_PRESET), []);

  const onFile = (f: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (afterUrl) URL.revokeObjectURL(afterUrl);
    const url = f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    setPreviewUrl(url);
    setAfterUrl(null);
    setFile(f);
    setJob(createJobFromFile(f, AUTO_PRESET));
  };

  const clear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (afterUrl) URL.revokeObjectURL(afterUrl);
    setPreviewUrl(null);
    setAfterUrl(null);
    setFile(null);
    setJob(null);
    setBusy(false);
  };

  const start = async () => {
    if (!file || !job || busy) return;
    if (!ready) return;

    setBusy(true);
    if (afterUrl) {
      URL.revokeObjectURL(afterUrl);
      setAfterUrl(null);
    }
    const base = { ...job, presetId: AUTO_PRESET };
    setJob(base);

    await runDemoPipeline(base, pipeline, (partial) => {
      setJob((prev) => (prev ? { ...prev, ...partial } : prev));
    });

    // Image: build a compare "after" so scrubber works; video compare comes with WebCodecs.
    if (previewUrl && file.type.startsWith("image/")) {
      try {
        const enhanced = await makeDemoEnhancedUrl(previewUrl);
        setAfterUrl(enhanced);
      } catch {
        /* keep after empty */
      }
    }

    setBusy(false);
  };

  const hasFile = Boolean(file && job);
  const done = job?.status === "done";

  return (
    <div className="app">
      <main className="app-main">
        <div className="landing">
          <div className="landing-brand">
            <FoxMark />
            Foxy&apos;s Lab
          </div>

          <h1>Foxy&apos;s Premium Upscaling</h1>

          <p className="landing-lede">
            Upscale videos or images with AI for free, right in your browser —
            no signups, no settings, no upload. Quality is handled
            automatically on your device.
          </p>

          {!hasFile ? (
            <>
              <DropZone onFile={onFile} disabled={busy} variant="landing" />

              <div className="landing-trust">
                <span className="trust-chip">
                  <strong>One click</strong> — no quality knobs
                </span>
                <span className="trust-chip">
                  <strong>100%</strong> on your device
                </span>
                <span className="trust-chip">
                  <strong>No</strong> watermark
                </span>
              </div>
            </>
          ) : (
            <div className="simple-workspace">
              <div className="file-chip simple-file">
                <div>
                  <strong>{job!.fileName}</strong>
                  <span>
                    {formatBytes(job!.fileSize)}
                    {job!.isVideo ? " · video" : job!.isImage ? " · image" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost sm"
                  onClick={clear}
                  disabled={busy}
                >
                  Choose another
                </button>
              </div>

              <div className="simple-compare">
                <CompareSlider
                  beforeUrl={previewUrl}
                  afterUrl={afterUrl}
                  emptyHint={
                    previewUrl
                      ? "Press Enhance — then drag to compare original vs result."
                      : job!.isVideo
                        ? "Video compare frames ship with WebGPU. Enhance still runs the quality pipeline."
                        : "Choose an image to compare quality here."
                  }
                />
              </div>

              <div className="simple-actions">
                <button
                  type="button"
                  className="dropzone-btn"
                  disabled={!ready || busy}
                  onClick={start}
                >
                  {busy ? "Enhancing…" : done ? "Enhance again" : "Enhance"}
                </button>
              </div>

              <ProgressPanel job={job} />

              {done && afterUrl && (
                <p className="simple-done-note">
                  Drag the slider to compare. Real WebGPU super-resolution comes
                  next — this preview is automatic and local only.
                </p>
              )}

              {!ready && caps && (
                <div className="notice warn">
                  <strong>Browser not ready.</strong> Use the latest Chrome or
                  Edge on a computer.{" "}
                  <span className="muted">{caps.details.join(" · ")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <a
            href="https://github.com/foxys-lab/foxys-premium-upscaling"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
          <span className="sep">|</span>
          <a
            href="https://github.com/foxys-lab/foxys-premium-upscaling/issues"
            target="_blank"
            rel="noreferrer"
          >
            Feedback
          </a>
          <span className="sep">|</span>
          <span>© Foxy&apos;s Lab · Free · Private · Automatic quality</span>
        </div>
      </footer>
    </div>
  );
}
