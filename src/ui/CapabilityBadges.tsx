import type { BrowserCapabilities, CapabilityStatus } from "../lib/capabilities";

function label(status: CapabilityStatus): string {
  if (status === "ok") return "ok";
  if (status === "warn") return "warn";
  if (status === "bad") return "bad";
  return "unknown";
}

function Badge({
  name,
  status,
}: {
  name: string;
  status: CapabilityStatus;
}) {
  return (
    <span className={`badge ${label(status)}`}>
      {name}: {status}
    </span>
  );
}

export function CapabilityBadges({ caps }: { caps: BrowserCapabilities | null }) {
  if (!caps) {
    return (
      <div className="badge-row">
        <span className="badge">Checking GPU…</span>
      </div>
    );
  }

  return (
    <div className="badge-row" title={caps.details.join(" · ")}>
      <Badge name="WebGPU" status={caps.webgpu} />
      <Badge name="WebCodecs" status={caps.webcodecs} />
      <Badge name="WebGL" status={caps.webgl} />
    </div>
  );
}
