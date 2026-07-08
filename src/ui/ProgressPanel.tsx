import type { UpscaleJob } from "../lib/job";

interface ProgressPanelProps {
  job: UpscaleJob | null;
}

export function ProgressPanel({ job }: ProgressPanelProps) {
  if (!job || job.status === "idle" || job.status === "ready") {
    return null;
  }

  const running = job.status === "running";
  const done = job.status === "done";
  const err = job.status === "error";

  return (
    <div
      className={`progress-panel${done ? " done" : ""}${err ? " error" : ""}`}
      aria-live="polite"
    >
      <div className="progress-top">
        <span className="progress-title">
          {err
            ? "Something went wrong"
            : done
              ? "Complete"
              : job.stageLabel || "Working"}
        </span>
        <span className="progress-pct">{job.progress}%</span>
      </div>
      <div className="progress-track" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`progress-fill${running ? " pulse" : ""}`}
          style={{ width: `${job.progress}%` }}
        />
      </div>
      {job.message && <p className="progress-msg">{job.message}</p>}
    </div>
  );
}
