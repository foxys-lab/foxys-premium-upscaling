import type { PipelineConfig } from "./pipeline";
import type { PresetId } from "./presets";

export type JobStatus =
  | "idle"
  | "ready"
  | "previewing"
  | "running"
  | "paused"
  | "done"
  | "error";

export interface UpscaleJob {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  isVideo: boolean;
  isImage: boolean;
  presetId: PresetId;
  status: JobStatus;
  progress: number;
  /** Current pipeline stage label for polish. */
  stageLabel?: string;
  message?: string;
  createdAt: number;
}

export function createJobFromFile(
  file: File,
  presetId: PresetId,
): UpscaleJob {
  const mime = file.type || "";
  const isVideo = mime.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name);
  const isImage =
    mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: mime || "application/octet-stream",
    isVideo,
    isImage,
    presetId,
    status: "ready",
    progress: 0,
    createdAt: Date.now(),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Demo runner until WebGPU SR is wired — walks active stages for UI polish. */
export async function runDemoPipeline(
  job: UpscaleJob,
  config: PipelineConfig,
  onUpdate: ( partial: Partial<UpscaleJob>) => void,
): Promise<void> {
  const stages = config.stages.filter(
    (s) => s.strength > 0 && (!s.videoOnly || job.isVideo),
  );

  if (stages.length === 0) {
    onUpdate({
      status: "error",
      message: "All quality stages are off. Enable Super-resolution at least.",
      progress: 0,
    });
    return;
  }

  onUpdate({ status: "running", progress: 0, message: "Starting quality pipeline…" });

  const slice = 100 / stages.length;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    onUpdate({
      stageLabel: stage.label,
      message: `${stage.label} (${stage.strength}%)…`,
      progress: Math.round(i * slice),
    });
    // Simulated work — replace with real GPU work per stage
    await new Promise((r) => setTimeout(r, 280 + stage.strength * 4));
    onUpdate({
      progress: Math.round((i + 1) * slice),
    });
  }

  onUpdate({
    status: "done",
    progress: 100,
    stageLabel: undefined,
    message:
      "Demo complete — quality pipeline UI is live. Real WebGPU stages come next (see docs/quality-and-polish.md).",
  });
}
