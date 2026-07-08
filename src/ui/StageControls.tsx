import type { PipelineStage, StageId } from "../lib/pipeline";

interface StageControlsProps {
  stages: PipelineStage[];
  isVideo: boolean;
  disabled?: boolean;
  onChange: (id: StageId, strength: number) => void;
}

export function StageControls({
  stages,
  isVideo,
  disabled,
  onChange,
}: StageControlsProps) {
  const visible = stages.filter((s) => !s.videoOnly || isVideo);

  return (
    <div className="stage-list">
      <div className="section-head">
        <h3>Quality stages</h3>
        <p>Tune the pipeline. Super-resolution is required for real gains.</p>
      </div>
      {visible.map((s) => (
        <div
          key={s.id}
          className={`stage-row${s.strength <= 0 ? " off" : ""}${s.heavy ? " heavy" : ""}`}
        >
          <div className="stage-meta">
            <div className="stage-title-row">
              <span className="stage-name">{s.label}</span>
              {s.heavy && <span className="pill warn">Heavy</span>}
              <span className="stage-val">{s.strength}%</span>
            </div>
            <p className="stage-desc">{s.description}</p>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={s.strength}
            disabled={disabled}
            aria-label={`${s.label} strength`}
            onChange={(e) => onChange(s.id, Number(e.target.value))}
          />
        </div>
      ))}
    </div>
  );
}
