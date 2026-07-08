# Architecture

## Goals

1. **Local-first** — video never leaves the device unless the user opts into a future cloud boost.
2. **Better than generic free tools** — presets, queue, resume, deblock, creator UX.
3. **GitHub-friendly** — MIT, CI, Pages deploy, clear model docs.

## Pipeline

```
┌──────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────┐
│  File    │→  │  WebCodecs  │→  │  WebGPU SR   │→  │ Encode   │
│  input   │   │  decode     │   │  (+ deblock) │   │ MP4/WebM │
└──────────┘   └─────────────┘   └──────────────┘   └──────────┘
                      │                  │
                      └──── Workers ─────┘
```

### Stages

| Stage | Tech | Notes |
|-------|------|--------|
| Ingest | File API / drag-drop | MP4, WebM, images first |
| Decode | WebCodecs `VideoDecoder` | Fallback: draw to canvas from `<video>` |
| Enhance | WebGPU compute (primary), WebGL fallback | Presets map to model + pre/post |
| Encode | WebCodecs `VideoEncoder` | H.264 when available, else VP9/WebM |
| Persist | Blob download; later OPFS checkpoints | Resume long jobs |

## Modules (`src/lib`)

| Module | Role |
|--------|------|
| `capabilities.ts` | Feature detection |
| `presets.ts` | Fast / Balanced / Anime / Max |
| `job.ts` | Job metadata + formatting |
| `gpu/` (planned) | Device, pipelines, tiling |
| `codecs/` (planned) | Demux / mux helpers |
| `queue.ts` (planned) | Batch multi-file jobs |

## Workers

Heavy loops run in `src/workers` so the UI stays responsive. Transfer `VideoFrame` / `ArrayBuffer` with zero-copy where possible.

## Models

See [models.md](./models.md). Weights should not bloat git history — use Git LFS, release assets, or a CDN with SHA-256 pins.

## Deploy

- **Dev:** `npm run dev` (Vite)
- **Prod static:** `npm run build` → `dist/`
- **GitHub Pages:** `.github/workflows/pages.yml` with `base: /ai-video-upscaler/`

## Security / privacy

- No analytics of video content.
- Optional anonymous error telemetry only if explicitly added later (off by default).
- Cloud boost (if any) must show a clear upload consent step.
