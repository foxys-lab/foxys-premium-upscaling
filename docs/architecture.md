# Architecture

## Goals

1. **Quality-first** — multi-stage pipeline beats single-pass free tools (see [quality-and-polish.md](./quality-and-polish.md)).
2. **Polish** — preset cards, stage sliders, compare scrubber, stage-aware progress.
3. **Local-first** — video never leaves the device unless the user opts into a future cloud boost.
4. **GitHub-friendly** — MIT, CI, Pages deploy, clear model docs.

## Pipeline

```
decode
  → deblock / artifact clean
  → super-resolution
  → edge clarity
  → temporal calm (video)
  → face refine (optional)
  → encode (bitrate-aware)
```

```
┌──────────┐   ┌─────────────┐   ┌────────────────────┐   ┌──────────┐
│  File    │→  │  WebCodecs  │→  │  Quality stages    │→  │ Encode   │
│  input   │   │  decode     │   │  (WebGPU / WebGL)  │   │ MP4/WebM │
└──────────┘   └─────────────┘   └────────────────────┘   └──────────┘
                      │                     │
                      └────── Workers ──────┘
```

### Stages

| Stage | Tech | Notes |
|-------|------|--------|
| Ingest | File API / drag-drop | MP4, WebM, images first |
| Decode | WebCodecs `VideoDecoder` | Fallback: draw to canvas from `<video>` |
| Enhance | Multi-stage; WebGPU primary | Presets set stage strengths 0–100 |
| Encode | WebCodecs `VideoEncoder` | Bitrate floor by resolution |
| Persist | Blob download; later OPFS | Resume long jobs |

## Modules (`src/lib`)

| Module | Role |
|--------|------|
| `capabilities.ts` | Feature detection |
| `pipeline.ts` | Stage model, cost estimate |
| `presets.ts` | Fast / Balanced / Anime / AI-gen / Face / Max |
| `job.ts` | Job metadata + demo runner |
| `gpu/` (planned) | Device, pipelines, tiling |
| `codecs/` (planned) | Demux / mux helpers |

## Workers

Heavy loops run in `src/workers` so the UI stays responsive. Transfer `VideoFrame` / `ArrayBuffer` with zero-copy where possible.

## Models

See [models.md](./models.md). Weights should not bloat git history — use Git LFS, release assets, or a CDN with SHA-256 pins.

## Deploy

- **Dev:** `npm run dev` (Vite)
- **Prod static:** `npm run build` → `dist/`
- **GitHub Pages:** `.github/workflows/pages.yml` with `base: /foxys-premium-upscaling/`

## Security / privacy

- No analytics of video content.
- Optional anonymous error telemetry only if explicitly added later (off by default).
- Cloud boost (if any) must show a clear upload consent step.
