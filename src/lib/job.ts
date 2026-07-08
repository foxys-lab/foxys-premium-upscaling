import type { PresetId } from "./presets";

export type JobStatus =
  | "idle"
  | "ready"
  | "running"
  | "paused"
  | "done"
  | "error";

export interface UpscaleJob {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  presetId: PresetId;
  status: JobStatus;
  progress: number;
  message?: string;
  createdAt: number;
}

export function createJobFromFile(
  file: File,
  presetId: PresetId,
): UpscaleJob {
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
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
