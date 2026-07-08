import { useEffect, useMemo, useState } from "react";
import {
  canRunLocalUpscale,
  detectCapabilities,
  type BrowserCapabilities,
} from "./lib/capabilities";
import { createJobFromFile, formatBytes, type UpscaleJob } from "./lib/job";
import { PRESETS, type PresetId } from "./lib/presets";
import { CapabilityBadges } from "./ui/CapabilityBadges";
import { DropZone } from "./ui/DropZone";

export default function App() {
  const [caps, setCaps] = useState<BrowserCapabilities | null>(null);
  const [presetId, setPresetId] = useState<PresetId>("balanced");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<UpscaleJob | null>(null);
  const [log, setLog] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    detectCapabilities().then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = useMemo(
    () => (caps ? canRunLocalUpscale(caps) : false),
    [caps],
  );

  const onFile = (f: File) => {
    setFile(f);
    setJob(createJobFromFile(f, presetId));
    setLog("");
  };

  const startStub = async () => {
    if (!file || !job) return;
    if (!ready) {
      setLog("This browser cannot run local upscaling yet.");
      return;
    }

    // Pipeline stub — real WebGPU SR lands next.
    setJob({ ...job, status: "running", progress: 0, message: "Queued…" });
    setLog(
      "Upscale pipeline not wired yet. Scaffold is ready for WebGPU models. " +
        "See docs/architecture.md and the GitHub roadmap.",
    );

    for (let p = 10; p <= 100; p += 10) {
      await new Promise((r) => setTimeout(r, 80));
      setJob((prev) =>
        prev
          ? {
              ...prev,
              progress: p,
              message: p < 100 ? "Demo progress…" : "Demo complete (no SR yet)",
              status: p < 100 ? "running" : "done",
            }
          : prev,
      );
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>AI Video Upscaler</h1>
          <p>
            Free, private, browser-only super-resolution. Your files never leave
            this device.
          </p>
        </div>
        <CapabilityBadges caps={caps} />
      </header>

      <main className="card">
        <DropZone onFile={onFile} />

        {file && job && (
          <div className="file-meta">
            {job.fileName} · {formatBytes(job.fileSize)} ·{" "}
            {job.mimeType || "unknown type"}
            {job.status !== "idle" && job.status !== "ready" && (
              <>
                <br />
                status: {job.status} · {job.progress}%
                {job.message ? ` · ${job.message}` : ""}
              </>
            )}
          </div>
        )}

        <div className="grid-2" style={{ marginTop: "1.25rem" }}>
          <label className="field">
            Preset
            <select
              value={presetId}
              onChange={(e) => {
                const id = e.target.value as PresetId;
                setPresetId(id);
                setJob((prev) => (prev ? { ...prev, presetId: id } : prev));
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.description}
                </option>
              ))}
            </select>
          </label>

          <div className="notice" style={{ marginTop: 0 }}>
            <strong>Privacy:</strong> decode → upscale → encode all run locally.
            No account. No watermark.
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!file || !ready}
            onClick={startStub}
          >
            Start upscale
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!file}
            onClick={() => {
              setFile(null);
              setJob(null);
              setLog("");
            }}
          >
            Clear
          </button>
        </div>

        {!ready && caps && (
          <div className="notice">
            <strong>Browser not ready.</strong> Use the latest Chrome or Edge on
            desktop for WebGPU + WebCodecs. Details: {caps.details.join(" · ")}
          </div>
        )}

        {log && (
          <div className="notice">
            <strong>Note:</strong> {log}
          </div>
        )}
      </main>

      <footer className="footer">
        <span>MIT · Open source on GitHub</span>
        <span>
          <a
            href="https://github.com/isaiahhaywood40-collab/ai-video-upscaler"
            target="_blank"
            rel="noreferrer"
          >
            Repository
          </a>
          {" · "}
          <a
            href="https://github.com/isaiahhaywood40-collab/ai-video-upscaler/issues"
            target="_blank"
            rel="noreferrer"
          >
            Issues
          </a>
        </span>
      </footer>
    </div>
  );
}
