# Quality & polish — product north star

We do not win on “also free.” We win when output looks **cleaner** and the app feels **premium**.

free.upscaler.video wins friction. We match friction, then beat them on:

1. **Perceived quality** (detail, less mush, less flicker, less blocks)
2. **Craft** (preview, controls, comparison, calm progress, no junk upsells)

---

## Quality strategy

### Principle: multi-stage, not one blurry upscale

Most free tools apply a single super-resolution pass per frame. That often:

- amplifies compression blocks
- softens lines (bad for anime)
- shimmers frame-to-frame
- oversharpens skin / noise

**Our pipeline (quality-first):**

```
decode frame
  → 1. artifact clean (deblock / mild denoise)     [optional, default on for AI-gen]
  → 2. super-resolution (content preset model)
  → 3. detail recovery (unsharp / edge-aware)     [light, preset-dependent]
  → 4. temporal stabilize (blend with prior)      [video only]
  → 5. face refine (optional, Face / Max)         [slow path]
  → encode (high bitrate, correct color range)
```

Each stage has a **strength** 0–100. Presets only set defaults; advanced users can tune.

### What “better quality” means (measurable)

| Criterion | free.upscaler typical | Our bar |
|-----------|----------------------|---------|
| Edges (anime) | Soft or ringing | Clean lines, less halo |
| AI-gen mush | Upscaled mush | Deblock first → clearer structure |
| Motion | Independent frames → flicker | Temporal blend / consistency |
| Faces | Generic SR | Optional face-aware pass |
| Encode | Browser default | Controlled CRF / bitrate, 4:2:0, no double-crush |
| Honesty | Always “enhance” | Preview frame; skip if already sharp |

### Benchmark set (freeze these clips)

Keep under `fixtures/` (git-lfs or external) — never ship private media:

1. **Anime** — hard lines, flat color  
2. **AI short** — diffusion grain / mush  
3. **Phone** — heavy H.264 blocks  
4. **Face** — character or person close-up  
5. **Already HD** — should not make worse  

Every model change: side-by-side A/B before merge.

### Model roadmap (quality order)

| Priority | Tech | Why |
|----------|------|-----|
| P0 | Anime4K-class + compact RealESRGAN | Browser-viable baseline that can beat naive upscale |
| P1 | Pre-pass deblock (shader or tiny CNN) | Biggest free win on compressed video |
| P2 | Temporal (optical flow lite / EMA) | Flicker is the #1 “cheap AI” tell |
| P3 | Face restore (CodeFormer-tiny / GFPGAN-class via ONNX) | Optional Max/Face only |
| P4 | Larger ONNX via WebGPU EP | Quality ceiling when device allows |

Weights: download-on-demand + SHA-256. Never bloat the repo.

### Encode quality (often ignored)

Upscale is wasted if encode crushes it:

- Prefer hardware H.264 high profile when available  
- Bitrate floor by resolution (e.g. 1080p ≥ ~8–12 Mbps for short clips)  
- Preserve full range / avoid wrong color space  
- Option: lossless-ish intermediate for image sequences (PNG/WebP) for power users  

---

## Polish strategy

### Principle: pro tool calm, not crypto landing page

| Do | Don’t |
|----|--------|
| One clear primary action | Mid-flow guilt upsells |
| Instant frame preview | Force full render to “see quality” |
| Preset cards with plain language | Only S/M/L/XL |
| Scrub before/after | Tiny static thumbs only |
| Progress with stage name + ETA | Bare % |
| Empty / error / unsupported states | Silent fail |
| Keyboard + a11y focus | Mouse-only |

### Polish surface checklist

**Visual**
- [x] Refined dark theme, type scale, spacing system  
- [x] Preset cards (not only `<select>`)  
- [x] Quality stage toggles with strength  
- [x] Progress bar + stage label  
- [x] Comparison scrubber shell  
- [ ] Micro-motion (respect `prefers-reduced-motion`)  
- [ ] Sample gallery “quality proof” on marketing half  

**Interaction**
- [x] Drag/drop + keyboard on dropzone  
- [ ] Pinch/scroll zoom on comparison  
- [ ] Space to play preview  
- [ ] Remember last preset (localStorage)  
- [ ] Crash-safe resume messaging  

**Copy**
- Honest limits (“Max is slow on iGPU”)  
- No fake “4K cinematic AI magic” claims  
- Privacy one-liner always visible, never shouty  

---

## Product rule

> If a change doesn’t improve **output quality** or **clarity/craft of the experience**, it waits.

Batch, cloud boost, i18n, mobile apps = after quality pipeline looks clearly better on the benchmark set.

---

## Phase plan (quality + polish only)

### Phase Q1 — Foundation (current)
- Multi-stage pipeline config in code  
- Polished UI shell: presets, stages, comparison, progress  
- Capability detection  

### Phase Q2 — First real quality
- Image path end-to-end (easier than video)  
- Canvas/WebGL or WebGPU 2× Fast + Anime  
- Live one-frame preview  
- Download PNG/WebP  

### Phase Q3 — Video quality
- WebCodecs loop + same pipeline  
- Temporal stage on  
- Bitrate-aware encode  
- A/B scrub on result  

### Phase Q4 — Ceiling
- Face pass  
- Larger models with tiling  
- Fixture CI (optional visual regression on sample frames)  

---

## Definition of done for “better quality”

A stranger prefers our output on ≥3/5 benchmark clips in a blind A/B vs free.upscaler.video, **and** says the app feels clearer/more premium than a raw open-source demo.
