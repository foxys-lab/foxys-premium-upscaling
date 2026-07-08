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
import { estimatePipelineCost, type StageId } from "./lib/pipeline";
import {
  getPreset,
  pipelineFromStrengths,
  PRESETS,
  type PresetId,
} from "./lib/presets";
import { CapabilityBadges } from "./ui/CapabilityBadges";
import { CompareSlider } from "./ui/CompareSlider";
import { DropZone } from "./ui/DropZone";
import { PresetCards } from "./ui/PresetCards";
import { ProgressPanel } from "./ui/ProgressPanel";
import { StageControls } from "./ui/StageControls";

const PRESET_STORAGE_KEY = "foxy-premium-upscaling-preset";

function FoxMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden>
      <path
        d="M22 24l-6-8 10 4 6-6 6 6 10-4-6 8"
        fill="#f97316"
      />
      <path d="M18 38c0-8 6-14 14-14s14 6 14 14v2H18v-2z" fill="#ea580c" />
      <circle cx="28" cy="34" r="2" fill="#fff" />
      <circle cx="36" cy="34" r="2" fill="#fff" />
    </svg>
  );
}

export default function App() {
  const [caps, setCaps] = useState<BrowserCapabilities | null>(null);
  const [presetId, setPresetId] = useState<PresetId>(() => {
    try {
      const saved = localStorage.getItem(PRESET_STORAGE_KEY) as PresetId | null;
      if (saved && PRESETS.some((p) => p.id === saved)) return saved;
    } catch {
      /* ignore */
    }
    return "balanced";
  });
  const [strengths, setStrengths] = useState(() => {
    try {
      const saved = localStorage.getItem(PRESET_STORAGE_KEY) as PresetId | null;
      if (saved && PRESETS.some((p) => p.id === saved)) {
        return { ...getPreset(saved).strengths };
      }
    } catch {
      /* ignore */
    }
    return { ...getPreset("balanced").strengths };
  });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

  const ready = useMemo(
    () => (caps ? canRunLocalUpscale(caps) : false),
    [caps],
  );

  const scale = getPreset(presetId).scale;
  const pipeline = useMemo(
    () => pipelineFromStrengths(strengths, scale),
    [strengths, scale],
  );

  const cost = estimatePipelineCost(pipeline);
  const costLabel =
    cost < 2
      ? "Light"
      : cost < 4
        ? "Moderate"
        : cost < 6
          ? "Heavy"
          : "Very heavy";

  const selectPreset = (id: PresetId) => {
    setPresetId(id);
    setStrengths({ ...getPreset(id).strengths });
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    setJob((prev) => (prev ? { ...prev, presetId: id } : prev));
  };

  const onStageChange = (id: StageId, strength: number) => {
    setStrengths((prev) => ({ ...prev, [id]: strength }));
  };

  const onFile = (f: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    setPreviewUrl(url);
    setFile(f);
    setJob(createJobFromFile(f, presetId));
  };

  const clear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setJob(null);
    setBusy(false);
  };

  const start = async () => {
    if (!file || !job || busy) return;
    if (!ready) return;

    setBusy(true);
    const base = { ...job, presetId };
    setJob(base);

    await runDemoPipeline(base, pipeline, (partial) => {
      setJob((prev) => (prev ? { ...prev, ...partial } : prev));
    });
    setBusy(false);
  };

  const isVideo = job?.isVideo ?? true;
  const hasFile = Boolean(file && job);

  return (
    <div className="app">
      {!hasFile ? (
        /* ——— Landing: free.upscaler calm, Foxy brand ——— */
        <main className="app-main">
          <div className="landing">
            <div className="landing-brand">
              <FoxMark />
              Foxy&apos;s Lab
            </div>

            <h1>Foxy&apos;s Premium Upscaling</h1>

            <p className="landing-lede">
              Upscale videos or images with AI for free, right in your browser —
              no signups, installation, or config. Private on-device processing,
              multi-stage quality, open source.
            </p>

            <DropZone onFile={onFile} disabled={busy} variant="landing" />

            <div className="landing-trust">
              <span className="trust-chip">
                <strong>100%</strong> on your device
              </span>
              <span className="trust-chip">
                <strong>No</strong> upload · no watermark
              </span>
              <span className="trust-chip">
                <strong>Better</strong> presets &amp; pipeline
              </span>
            </div>

            <div className="better-row">
              <article>
                <h4>Clean first</h4>
                <p>Deblock artifacts before upscale — less mush on AI &amp; phone video.</p>
              </article>
              <article>
                <h4>Smart presets</h4>
                <p>Anime, AI-gen, Face, Max — not just Small / Medium / Large.</p>
              </article>
              <article>
                <h4>Judge quality</h4>
                <p>Before/after scrubber and stage controls after you pick a file.</p>
              </article>
            </div>
          </div>
        </main>
      ) : (
        /* ——— Workspace: quality tools after file ——— */
        <main className="app-main wide">
          <div className="workspace-top">
            <div>
              <h1>Foxy&apos;s Premium Upscaling</h1>
              <p className="sub">
                Choose a quality look, tune stages, then enhance — still fully local.
              </p>
            </div>
            <CapabilityBadges caps={caps} />
          </div>

          <section className="card">
            <div className="file-chip">
              <div>
                <strong>{job!.fileName}</strong>
                <span>
                  {formatBytes(job!.fileSize)}
                  {job!.isVideo ? " · video" : job!.isImage ? " · image" : ""}
                  {" · "}
                  {job!.mimeType}
                </span>
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                <DropZone
                  onFile={onFile}
                  disabled={busy}
                  variant="compact"
                />
                <button
                  type="button"
                  className="ghost sm"
                  onClick={clear}
                  disabled={busy}
                >
                  Start over
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <h3>Quality preset</h3>
              <p>Start here — then fine-tune stages if you want.</p>
            </div>
            <PresetCards
              presets={PRESETS}
              value={presetId}
              onChange={selectPreset}
              disabled={busy}
            />
          </section>

          <div className="layout-split">
            <section className="card">
              <StageControls
                stages={pipeline.stages}
                isVideo={isVideo}
                disabled={busy}
                onChange={onStageChange}
              />
              <div className="cost-row">
                <span>
                  Relative load: <strong>{costLabel}</strong>
                </span>
                <span className="muted">Scale {scale}× · browser GPU</span>
              </div>
            </section>

            <section className="card">
              <CompareSlider
                beforeUrl={previewUrl}
                afterUrl={null}
                emptyHint={
                  !previewUrl
                    ? "Video frame preview ships next. Images appear here for compare."
                    : "Enhanced result will appear on the right after processing."
                }
              />
            </section>
          </div>

          <section className="card">
            <div className="action-copy">
              <h3>Enhance</h3>
              <p>
                Multi-stage pipeline UI is ready. Real WebGPU quality passes are
                next — demo progress runs stages so you can feel the flow.
              </p>
            </div>
            <div className="actions">
              <button
                type="button"
                className="primary"
                disabled={!ready || busy}
                onClick={start}
              >
                {busy ? "Enhancing…" : "Enhance"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={clear}
              >
                Cancel
              </button>
            </div>
            <ProgressPanel job={job} />

            {!ready && caps && (
              <div className="notice warn">
                <strong>Browser not ready.</strong> Use latest Chrome or Edge on
                desktop (WebGPU + WebCodecs).{" "}
                <span className="muted">{caps.details.join(" · ")}</span>
              </div>
            )}
          </section>
        </main>
      )}

      <footer className="site-footer">
        <div className="site-footer-inner">
          <a
            href="https://github.com/foxys-lab/foxys-premium-upscaling/blob/main/docs/quality-and-polish.md"
            target="_blank"
            rel="noreferrer"
          >
            How it works
          </a>
          <span className="sep">|</span>
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
          <span>© Foxy&apos;s Lab · MIT · Free forever locally</span>
        </div>
      </footer>
    </div>
  );
}
