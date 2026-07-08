export type PresetId = "fast" | "balanced" | "anime" | "max";

export interface UpscalePreset {
  id: PresetId;
  label: string;
  description: string;
  /** Target scale factor (2x default for browser). */
  scale: 2 | 4;
  /** Relative compute cost 1–5 for ETA hints. */
  cost: 1 | 2 | 3 | 4 | 5;
  /** Future model / pipeline key. */
  pipeline: string;
}

export const PRESETS: UpscalePreset[] = [
  {
    id: "fast",
    label: "Fast",
    description: "Light sharpen + 2×. Best for previews and weak GPUs.",
    scale: 2,
    cost: 1,
    pipeline: "anime4k-lite",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Default quality/speed mix for most clips.",
    scale: 2,
    cost: 2,
    pipeline: "sr-medium",
  },
  {
    id: "anime",
    label: "Anime",
    description: "Lines & flat color friendly (AI anime / 2D).",
    scale: 2,
    cost: 2,
    pipeline: "anime4k-plus",
  },
  {
    id: "max",
    label: "Max",
    description: "Heavier model. Slow on integrated GPUs.",
    scale: 2,
    cost: 5,
    pipeline: "sr-xl",
  },
];

export function getPreset(id: PresetId): UpscalePreset {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) return PRESETS[1]!;
  return found;
}
