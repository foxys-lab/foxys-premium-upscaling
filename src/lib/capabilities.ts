export type CapabilityStatus = "ok" | "warn" | "bad" | "unknown";

export interface BrowserCapabilities {
  webgpu: CapabilityStatus;
  webcodecs: CapabilityStatus;
  webgl: CapabilityStatus;
  details: string[];
}

function hasWebCodecs(): boolean {
  return (
    typeof VideoDecoder !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined"
  );
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/** Probe browser features required for client-side upscaling. */
export async function detectCapabilities(): Promise<BrowserCapabilities> {
  const details: string[] = [];

  let webgpu: CapabilityStatus = "bad";
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        webgpu = "ok";
        details.push("WebGPU adapter available");
      } else {
        webgpu = "warn";
        details.push("navigator.gpu present but no adapter");
      }
    } catch (err) {
      webgpu = "warn";
      details.push(
        `WebGPU request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    details.push("WebGPU not supported in this browser");
  }

  const webcodecs: CapabilityStatus = hasWebCodecs() ? "ok" : "bad";
  if (webcodecs === "ok") {
    details.push("WebCodecs available");
  } else {
    details.push("WebCodecs missing — video encode/decode will fail");
  }

  const webgl: CapabilityStatus = hasWebGL() ? "ok" : "bad";
  if (webgl === "ok") {
    details.push("WebGL available (fallback path)");
  }

  return { webgpu, webcodecs, webgl, details };
}

export function canRunLocalUpscale(caps: BrowserCapabilities): boolean {
  // MVP: require WebCodecs + (WebGPU or WebGL)
  return (
    caps.webcodecs === "ok" &&
    (caps.webgpu === "ok" || caps.webgl === "ok")
  );
}
