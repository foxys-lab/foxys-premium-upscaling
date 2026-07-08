# Contributing

Thanks for helping improve the free browser AI video upscaler.

## Ground rules

1. **Privacy first** — core upscaling stays client-side. Cloud “boost” must be opt-in and clearly labeled.
2. **No giant binaries in git** without agreement — models go through LFS, releases, or a CDN with checksums.
3. **Small PRs** beat mega-PRs. One concern per PR when possible.
4. Be kind in issues and reviews.

## Dev setup

```bash
git clone https://github.com/isaiahhaywood40-collab/ai-video-upscaler.git
cd ai-video-upscaler
npm install
npm run dev
```

Use Chrome/Edge with WebGPU for GPU features.

## Branch & commit style

- Branch: `feat/...`, `fix/...`, `docs/...`
- Commits: short imperative (`Add Anime preset preview`, not `Added stuff`)

## Pull requests

1. Open an issue for large features first.
2. Ensure `npm run typecheck` and `npm run build` pass.
3. Describe what you changed and how you tested (browser + GPU if relevant).
4. Screenshots/GIFs for UI changes help a lot.

## Reporting bugs

Use the bug report template. Include:

- Browser + version (and OS)
- GPU (integrated vs dedicated if known)
- File type / resolution / length (no need to upload private media)
- Console errors

## Code of conduct

Be respectful. Harassment or spam issues/PRs will be closed.
