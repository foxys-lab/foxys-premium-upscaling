import { useEffect, useMemo, useRef, useState } from "react";
import {
  canEnhanceVideo,
  canRunLocalUpscale,
  detectCapabilities,
  type BrowserCapabilities,
} from "./lib/capabilities";
import {
  createJobFromFile,
  formatBytes,
  type UpscaleJob,
} from "./lib/job";
import {
  downloadBlob,
  enhanceMedia,
  type EnhanceResult,
} from "./lib/enhance";
import { canvasToBlob } from "./lib/enhance/webgl";
import { CompareSlider } from "./ui/CompareSlider";
import { DetailCrops } from "./ui/DetailCrops";
import { DropZone } from "./ui/DropZone";
import { ProgressPanel } from "./ui/ProgressPanel";

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

function revokeQuiet(url: string | null | undefined) {
  if (!url || !url.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [caps, setCaps] = useState<BrowserCapabilities | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [afterCanvas, setAfterCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [job, setJob] = useState<UpscaleJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [diag, setDiag] = useState<string>("");

  const previewRef = useRef<string | null>(null);
  const afterRef = useRef<string | null>(null);
  /** Permanent slot for AI WebGPU canvas — never unmount while viewing result */
  const aiSlotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    detectCapabilities().then((c) => {
      if (!cancelled) {
        setCaps(c);
        setDiag(
          `WebGPU=${c.webgpu} · WebGL=${c.webgl} · ${c.details.slice(0, 2).join(" · ")}`,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      revokeQuiet(previewRef.current);
      revokeQuiet(afterRef.current);
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Keep live AI canvas mounted in the permanent slot (free.upscaler pattern)
  useEffect(() => {
    const slot = aiSlotRef.current;
    if (!slot || !afterCanvas) return;
    // Move canvas into stable slot so WebGPU presentation stays alive
    if (afterCanvas.parentElement !== slot) {
      slot.replaceChildren();
      afterCanvas.style.cssText =
        "display:block;width:100%;height:100%;object-fit:contain;position:absolute;inset:0;";
      slot.appendChild(afterCanvas);
    }
  }, [afterCanvas, result]);

  const ready = useMemo(
    () => (caps ? canRunLocalUpscale(caps) : false),
    [caps],
  );

  const setPreview = (url: string | null) => {
    if (previewRef.current && previewRef.current !== url) {
      revokeQuiet(previewRef.current);
    }
    previewRef.current = url;
    setPreviewUrl(url);
  };

  const setAfter = (url: string | null) => {
    if (afterRef.current && afterRef.current !== url) {
      revokeQuiet(afterRef.current);
    }
    afterRef.current = url;
    setAfterUrl(url);
  };

  const onFile = (f: File) => {
    setResult(null);
    setError(null);
    setAfter(null);
    setAfterCanvas(null);
    setFullscreen(false);
    aiSlotRef.current?.replaceChildren();

    const isImage =
      f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name);

    if (isImage) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }

    setFile(f);
    setJob(createJobFromFile(f));
  };

  const clear = () => {
    setPreview(null);
    setAfter(null);
    setAfterCanvas(null);
    setResult(null);
    setFile(null);
    setJob(null);
    setBusy(false);
    setError(null);
    setFullscreen(false);
    aiSlotRef.current?.replaceChildren();
  };

  const start = async () => {
    if (!file || !job || busy || !caps) return;
    if (!ready) return;

    if (job.isVideo && !canEnhanceVideo(caps)) {
      setError("This browser cannot export video. Try Chrome or Edge.");
      return;
    }

    setBusy(true);
    setError(null);
    setAfter(null);
    setAfterCanvas(null);
    setResult(null);
    aiSlotRef.current?.replaceChildren();

    setJob({
      ...job,
      status: "running",
      progress: 0,
      stageLabel: "Starting",
      message: "Preparing…",
    });

    try {
      if (job.isImage && !previewRef.current) {
        setPreview(URL.createObjectURL(file));
      }

      const enhanced = await enhanceMedia(file, (p) => {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "running",
                progress: p.progress,
                stageLabel: p.phase,
                message: `${p.phase}…`,
              }
            : prev,
        );
      });

      // Prefer live WebGPU canvas for display (not black snapshot)
      if (
        "liveCanvas" in enhanced &&
        enhanced.liveCanvas instanceof HTMLCanvasElement
      ) {
        setAfterCanvas(enhanced.liveCanvas);
      }

      // Snapshot URL only if non-black
      if (enhanced.objectUrl) {
        setAfter(enhanced.objectUrl);
      }
      setResult(enhanced);

      if (
        "compareBeforeUrl" in enhanced &&
        typeof enhanced.compareBeforeUrl === "string" &&
        enhanced.compareBeforeUrl
      ) {
        setPreview(enhanced.compareBeforeUrl);
      }

      const net =
        "network" in enhanced
          ? (enhanced as { network?: string }).network
          : undefined;
      const snapNote =
        "snapshotOk" in enhanced && enhanced.snapshotOk === false
          ? " · live GPU display"
          : "";

      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: "done",
              progress: 100,
              stageLabel: "Done",
              message: `Enhanced to ${enhanced.width}×${enhanced.height} · REAL AI ${net || ""}${snapNote}`,
            }
          : prev,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              progress: 0,
              stageLabel: "Error",
              message: msg,
            }
          : prev,
      );
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async () => {
    if (!result) return;
    // Prefer live canvas capture at download time (canvas is on-screen)
    if (afterCanvas) {
      try {
        const c = afterCanvas as HTMLCanvasElement & {
          convertToBlob?: (o?: { type?: string }) => Promise<Blob>;
        };
        if (typeof c.convertToBlob === "function") {
          const blob = await c.convertToBlob({ type: "image/png" });
          downloadBlob(blob, result.downloadName);
          return;
        }
        const blob = await canvasToBlob(afterCanvas, "image/png");
        downloadBlob(blob, result.downloadName);
        return;
      } catch {
        /* fall through */
      }
    }
    downloadBlob(result.blob, result.downloadName);
  };

  const hasFile = Boolean(file && job);
  const done = job?.status === "done" && Boolean(result);

  return (
    <div className="app">
      {/* Stable mount point for WebGPU AI canvas — free.upscaler pattern */}
      <div
        ref={aiSlotRef}
        className={`ai-live-slot${done && afterCanvas ? " ai-live-slot-active" : ""}`}
        aria-hidden={!done}
      />

      <main className="app-main">
        <div className="landing">
          {!done && (
            <>
              <div className="landing-brand">
                <FoxMark />
                Foxy&apos;s Lab
              </div>
              <h1>Foxy&apos;s Premium Upscaling</h1>
              <p className="landing-lede">
                Real Anime4K CNN AI in your browser (WebGPU). Private, free, no
                upload.
              </p>
              {diag && <p className="diag-line">{diag}</p>}
            </>
          )}

          {done && (
            <div className="landing-brand result-brand">
              <FoxMark />
              Foxy&apos;s Premium Upscaling
            </div>
          )}

          {!hasFile ? (
            <>
              <DropZone onFile={onFile} disabled={busy} variant="landing" />
              <div className="landing-trust">
                <span className="trust-chip">
                  <strong>Real AI</strong> · Anime4K CNN
                </span>
                <span className="trust-chip">
                  <strong>Chrome/Edge</strong> · WebGPU
                </span>
                <span className="trust-chip">
                  <strong>No</strong> watermark
                </span>
              </div>
            </>
          ) : done ? (
            <div className="result-card">
              <CompareSlider
                beforeUrl={previewUrl}
                afterUrl={afterUrl}
                afterCanvas={afterCanvas}
                compact
              />

              {"cropBeforeUrl" in (result ?? {}) &&
                result &&
                "cropBeforeUrl" in result &&
                result.cropBeforeUrl &&
                result.cropAfterUrl && (
                  <DetailCrops
                    beforeUrl={result.cropBeforeUrl}
                    afterUrl={result.cropAfterUrl}
                  />
                )}

              <button
                type="button"
                className="btn-fullscreen"
                onClick={() => setFullscreen(true)}
              >
                <span className="fs-icon" aria-hidden>
                  ⛶
                </span>
                View Fullscreen Comparison
              </button>

              <div className="result-actions">
                <button type="button" className="btn-secondary" onClick={clear}>
                  Upscale another
                  <span aria-hidden> ↻</span>
                </button>
                <button
                  type="button"
                  className="btn-primary-solid"
                  onClick={() => void onDownload()}
                >
                  Download upscaled image
                  <span aria-hidden> ↓</span>
                </button>
              </div>

              {result && (
                <p className="result-meta">
                  {result.width}×{result.height}
                  {"isRealAI" in result && result.isRealAI
                    ? ` · REAL AI ${"network" in result && result.network ? result.network : ""}`
                    : ""}
                  {"elapsedMs" in result && result.elapsedMs
                    ? ` · ${(result.elapsedMs / 1000).toFixed(1)}s`
                    : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="simple-workspace">
              <div className="file-chip simple-file">
                <div>
                  <strong>{job!.fileName}</strong>
                  <span>
                    {formatBytes(job!.fileSize)}
                    {job!.isVideo ? " · video" : " · image"}
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

              {previewUrl && !busy && (
                <div className="pre-enhance-thumb">
                  <img src={previewUrl} alt="Selected" />
                </div>
              )}

              <div className="simple-actions">
                <button
                  type="button"
                  className="dropzone-btn"
                  disabled={!ready || busy}
                  onClick={() => void start()}
                >
                  {busy ? "Upscaling…" : "Upscale"}
                </button>
              </div>

              <ProgressPanel job={job} />

              {error && (
                <div className="notice warn">
                  <strong>AI upscale failed.</strong>
                  <br />
                  {error}
                  <br />
                  <span className="muted">
                    Use desktop Chrome/Edge → Cmd+Shift+R → chrome://gpu must
                    show WebGPU. Try a smaller PNG/JPG.
                  </span>
                  <div className="actions" style={{ marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      className="dropzone-btn"
                      disabled={busy || !ready}
                      onClick={() => void start()}
                    >
                      Retry AI upscale
                    </button>
                  </div>
                </div>
              )}

              {!ready && caps && (
                <div className="notice warn">
                  <strong>WebGPU required for real AI.</strong> Desktop Chrome
                  or Edge only.{" "}
                  <span className="muted">{caps.details.join(" · ")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {fullscreen && (previewUrl || afterUrl || afterCanvas) && (
        <div
          className="fs-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setFullscreen(false)}
        >
          <div className="fs-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fs-top">
              <span>Fullscreen comparison</span>
              <button
                type="button"
                className="ghost sm"
                onClick={() => setFullscreen(false)}
              >
                Close ✕
              </button>
            </div>
            <CompareSlider
              beforeUrl={previewUrl}
              afterUrl={afterUrl}
              afterCanvas={afterCanvas}
              compact
              className="fs-track"
            />
          </div>
        </div>
      )}

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
          <span>Real AI · WebSR Anime4K · WebGPU</span>
        </div>
      </footer>
    </div>
  );
}
