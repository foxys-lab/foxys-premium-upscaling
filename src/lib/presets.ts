import { buildPipeline, type PipelineConfig, type StageId } from "./pipeline";

export type PresetId =
  | "fast"
  | "balanced"
  | "anime"
  | "ai_gen"
  | "face"
  | "max";

export interface UpscalePreset {
  id: PresetId;
  label: string;
  tagline: string;
  description: string;
  /** For UI badge color */
  tone: "sky" | "violet" | "mint" | "amber" | "rose" | "slate";
  recommended?: boolean;
  scale: 2 | 4;
  strengths: Partial<Record<StageId, number>>;
}

export const PRESETS: UpscalePreset[] = [
  {
    id: "fast",
    label: "Fast",
    tagline: "Preview grade",
    description: "Light clean + quick 2×. Weak GPUs and draft checks.",
    tone: "slate",
    scale: 2,
    strengths: {
      deblock: 25,
      upscale: 55,
      detail: 20,
      temporal: 15,
      face: 0,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    tagline: "Best default",
    description: "Clean → SR → mild temporal. Most clips should start here.",
    tone: "sky",
    recommended: true,
    scale: 2,
    strengths: {
      deblock: 45,
      upscale: 80,
      detail: 35,
      temporal: 40,
      face: 0,
    },
  },
  {
    id: "anime",
    label: "Anime",
    tagline: "Lines first",
    description: "Protects hard edges & flat color. Ideal for 2D / AI anime.",
    tone: "violet",
    scale: 2,
    strengths: {
      deblock: 35,
      upscale: 85,
      detail: 45,
      temporal: 50,
      face: 0,
    },
  },
  {
    id: "ai_gen",
    label: "AI-gen",
    tagline: "Kill the mush",
    description: "Stronger deblock before SR — diffusion grain & soft AI video.",
    tone: "mint",
    scale: 2,
    strengths: {
      deblock: 70,
      upscale: 80,
      detail: 30,
      temporal: 45,
      face: 0,
    },
  },
  {
    id: "face",
    label: "Face",
    tagline: "Character close-ups",
    description: "SR plus face refine. Slower; use on portraits / heroes.",
    tone: "rose",
    scale: 2,
    strengths: {
      deblock: 40,
      upscale: 80,
      detail: 25,
      temporal: 35,
      face: 65,
    },
  },
  {
    id: "max",
    label: "Max",
    tagline: "Quality ceiling",
    description: "Heaviest path. Slow on integrated GPUs — preview a frame first.",
    tone: "amber",
    scale: 2,
    strengths: {
      deblock: 55,
      upscale: 100,
      detail: 40,
      temporal: 55,
      face: 50,
    },
  },
];

export function getPreset(id: PresetId): UpscalePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[1]!;
}

export function pipelineFromPreset(id: PresetId): PipelineConfig {
  const p = getPreset(id);
  return buildPipeline(p.strengths, p.scale);
}

export function pipelineFromStrengths(
  strengths: Partial<Record<StageId, number>>,
  scale: 2 | 4,
): PipelineConfig {
  return buildPipeline(strengths, scale);
}
