import type { BrowserCapabilities, CapabilityStatus } from "../lib/capabilities";

function Badge({ name, status }: { name: string; status: CapabilityStatus }) {
  const cls =
    status === "ok" ? "ok" : status === "warn" ? "warn" : status === "bad" ? "bad" : "";
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" aria-hidden />
      {name}
    </span>
  );
}

export function CapabilityBadges({
  caps,
}: {
  caps: BrowserCapabilities | null;
}) {
  if (!caps) {
    return (
      <div className="badge-row">
        <span className="badge">Probing GPU…</span>
      </div>
    );
  }

  return (
    <div className="badge-row" title={caps.details.join(" · ")}>
      <Badge name="WebGL" status={caps.webgl} />
      <Badge name="Recorder" status={caps.mediaRecorder} />
      <Badge name="WebGPU" status={caps.webgpu} />
    </div>
  );
}
