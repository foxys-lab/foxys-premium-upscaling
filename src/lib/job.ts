export type JobStatus =
  | "idle"
  | "ready"
  | "running"
  | "done"
  | "error";

export interface UpscaleJob {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  isVideo: boolean;
  isImage: boolean;
  status: JobStatus;
  progress: number;
  stageLabel?: string;
  message?: string;
  createdAt: number;
}

export function createJobFromFile(file: File): UpscaleJob {
  const mime = file.type || "";
  const isVideo =
    mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  const isImage =
    mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: mime || "application/octet-stream",
    isVideo,
    isImage,
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
