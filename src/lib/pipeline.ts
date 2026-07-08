/**
 * Quality-first multi-stage pipeline.
 * Stages run in order; strength 0 = skip.
 */

export type StageId =
  | "deblock"
  | "upscale"
  | "detail"
  | "temporal"
  | "face";

export interface PipelineStage {
  id: StageId;
  label: string;
  description: string;
  /** 0–100. 0 skips the stage. */
  strength: number;
  /** Video-only stages hidden for images when false. */
  videoOnly?: boolean;
  /** Expensive; warn in UI. */
  heavy?: boolean;
}

export interface PipelineConfig {
  stages: PipelineStage[];
  scale: 2 | 4;
}

const STAGE_META: Record<
  StageId,
  Omit<PipelineStage, "strength">
> = {
  deblock: {
    id: "deblock",
    label: "Clean artifacts",
    description: "Reduce compression blocks before upscale (big win on AI & phone video).",
  },
  upscale: {
    id: "upscale",
    label: "Super-resolution",
    description: "AI detail reconstruction — the core 2× (or 4×) pass.",
  },
  detail: {
    id: "detail",
    label: "Edge clarity",
    description: "Light edge-aware sharpen. Too high = halos.",
  },
  temporal: {
    id: "temporal",
    label: "Temporal calm",
    description: "Stabilize shimmer between frames. Video only.",
    videoOnly: true,
  },
  face: {
    id: "face",
    label: "Face refine",
    description: "Optional face-aware restore. Slower, Max/Face presets.",
    heavy: true,
  },
};

export function stageOrder(): StageId[] {
  return ["deblock", "upscale", "detail", "temporal", "face"];
}

export function buildPipeline(
  strengths: Partial<Record<StageId, number>>,
  scale: 2 | 4 = 2,
): PipelineConfig {
  const stages = stageOrder().map((id) => {
    const meta = STAGE_META[id];
    const strength = clamp(
      strengths[id] ?? (id === "upscale" ? 80 : 0),
      0,
      100,
    );
    return { ...meta, strength };
  });
  return { stages, scale };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Estimated relative cost for ETA (arbitrary units). */
export function estimatePipelineCost(config: PipelineConfig): number {
  let cost = 0;
  for (const s of config.stages) {
    if (s.strength <= 0) continue;
    const w =
      s.id === "upscale"
        ? 4
        : s.id === "face"
          ? 5
          : s.id === "temporal"
            ? 2
            : 1;
    cost += w * (s.strength / 100) * (config.scale === 4 ? 1.8 : 1);
  }
  return Math.max(0.5, cost);
}

export function activeStages(config: PipelineConfig, isVideo: boolean): PipelineStage[] {
  return config.stages.filter(
    (s) => s.strength > 0 && (!s.videoOnly || isVideo),
  );
}
