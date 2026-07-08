# AI Video Upscaler

**Free · Private · Browser-only** AI video & image upscaler.

Drop a video, pick a preset, download a sharper result. Processing runs **100% on your device** with WebGPU — files never leave your machine. No signup. No watermark. No cloud required.

> Inspired by [free.upscaler.video](https://free.upscaler.video/) / [WebSR](https://github.com/sb2702/websr), built to improve quality presets, batch jobs, resume, and creator UX.

---

## Why this exists

Casual upscalers are either:

| Tool type | Problem |
|-----------|---------|
| Topaz / pro desktop | Expensive, install + GPU setup |
| Canva / “free” web | Signup, time limits, watermarks |
| Video2X / Waifu2x | Great models, painful setup |
| free.upscaler.video | Excellent frictionless free tier — we aim to match that and add **better presets, batch, deblock, and clearer creator flow** |

**Our wedge:** same privacy story, smarter defaults (Anime / Real / AI-gen / Face), queue + resume, honest ETAs.

---

## Features (roadmap)

### MVP (in progress)
- [x] Project scaffold (Vite + React + TypeScript)
- [ ] Drag & drop video / image
- [ ] WebGPU capability check + clear fallbacks
- [ ] Presets: **Fast · Balanced · Anime · Max**
- [ ] Single-frame preview before full run
- [ ] Progress %, ETA, pause / resume
- [ ] Before / after split view
- [ ] MP4 or WebM download (browser-supported codecs)

### Phase 2
- [ ] Batch queue (multiple short clips)
- [ ] Denoise / deblock pre-pass
- [ ] Face-aware optional pass
- [ ] OPFS crash-safe checkpoints
- [ ] GitHub Pages deploy

### Phase 3
- [ ] Temporal consistency (less flicker)
- [ ] Optional cloud “boost” for long / exotic formats
- [ ] PWA / offline shell

---

## Quick start (local)

**Requirements:** Node 20+, modern Chrome or Edge (WebGPU).

```bash
# clone
git clone https://github.com/isaiahhaywood40-collab/ai-video-upscaler.git
cd ai-video-upscaler

# install
npm install

# dev server
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production build → dist/
npm run preview  # serve dist locally
```

---

## How it works

```
File → WebCodecs decode → WebGPU super-resolution → encode → download
         (local)              (local GPU)              (local)
```

- **Decode / encode:** [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- **Upscale:** WebGPU compute (Anime4K-style + compact SR models; model cards in `docs/models.md`)
- **Privacy:** no upload. We never see your video.

If WebGPU is missing, we show a clear message (and later: WebGL fallback).

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome 113+ | Best (WebGPU) |
| Edge 113+ | Best (WebGPU) |
| Safari 16+ | Partial / fallback TBD |
| Firefox 130+ | Partial / fallback TBD |

Desktop recommended. Mobile works for short clips but is slower.

---

## GitHub

| | |
|--|--|
| **Issues** | Bug reports & feature ideas |
| **Discussions** | Design, models, UX |
| **PRs** | Welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) |
| **License** | [MIT](LICENSE) |

Replace `isaiahhaywood40-collab` in this README and `package.json` after you create the remote.

### Create the remote (once)

```bash
# install GitHub CLI if needed: https://cli.github.com/
brew install gh
gh auth login

# from this folder
gh repo create ai-video-upscaler --public --source=. --remote=origin --push \
  --description "Free private browser AI video upscaler (WebGPU)"
```

Or on github.com → **New repository** → then:

```bash
git remote add origin https://github.com/isaiahhaywood40-collab/ai-video-upscaler.git
git push -u origin main
```

### Deploy to GitHub Pages (later)

Workflow stub: `.github/workflows/pages.yml` — enable **Settings → Pages → GitHub Actions** after the first green build.

---

## Project layout

```
ai-video-upscaler/
├── public/              # static assets
├── src/
│   ├── lib/             # codecs, gpu, models, job queue
│   ├── ui/              # React components
│   ├── workers/         # Web Workers for heavy work
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── docs/                # architecture, model cards
├── .github/             # CI, issue templates
└── README.md
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: open an issue first for big features; keep PRs focused; don’t commit large model binaries without discussion (use Git LFS or CDN).

---

## Disclaimer

Output quality depends on source material and your GPU. You’re responsible for rights to content you process. This is not affiliated with free.upscaler.video or Topaz Labs.

---

## Credits

- Concept peer: [free-ai-video-upscaler](https://github.com/sb2702/free-ai-video-upscaler) / [WebSR](https://github.com/sb2702/websr)
- Algorithms (planned integration): [Anime4K](https://github.com/bloc97/Anime4K), [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)

Built with ❤️ for creators who just need a cleaner free upscale.
