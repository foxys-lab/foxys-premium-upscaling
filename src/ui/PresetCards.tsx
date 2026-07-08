import type { PresetId, UpscalePreset } from "../lib/presets";

interface PresetCardsProps {
  presets: UpscalePreset[];
  value: PresetId;
  onChange: (id: PresetId) => void;
  disabled?: boolean;
}

export function PresetCards({
  presets,
  value,
  onChange,
  disabled,
}: PresetCardsProps) {
  return (
    <div className="preset-grid" role="listbox" aria-label="Quality preset">
      {presets.map((p) => {
        const selected = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            className={`preset-card tone-${p.tone}${selected ? " selected" : ""}`}
            onClick={() => onChange(p.id)}
          >
            <div className="preset-card-top">
              <span className="preset-label">{p.label}</span>
              {p.recommended && <span className="pill">Recommended</span>}
            </div>
            <span className="preset-tagline">{p.tagline}</span>
            <p>{p.description}</p>
          </button>
        );
      })}
    </div>
  );
}
