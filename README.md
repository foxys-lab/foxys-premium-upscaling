# Foxy's Premium Upscaling

**Free · Private · One-click** browser video & image upscaler.

Choose a file → **Enhance** → compare → **Download**.  
Processing is **100% on-device** (WebGL). No signup. No upload. No watermark.

**Live:** https://foxys-lab.github.io/foxys-premium-upscaling/

---

## How it works

```
File → WebGL quality pipeline (2×) → compare / download
         fully local GPU
```

Automatic pipeline (no user knobs):

1. **Clean** — mild deblock / soft artifact reduction  
2. **Upscale** — 2× Catmull-Rom style cubic  
3. **Clarity** — edge-aware unsharp  

- **Images** → PNG or JPEG download + before/after scrubber  
- **Video** → WebM download (VP8/VP9 via MediaRecorder), audio kept when the browser allows  

---

## Use it

1. Open the [live site](https://foxys-lab.github.io/foxys-premium-upscaling/) (Chrome or Edge recommended)  
2. Choose an image or short video  
3. Press **Enhance**  
4. Drag the compare slider (images)  
5. **Download**

---

## Develop

```bash
git clone https://github.com/foxys-lab/foxys-premium-upscaling.git
cd foxys-premium-upscaling
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

Requires Node 20+.

---

## Browser support

| Feature | Need |
|---------|------|
| Enhance images | WebGL |
| Enhance video | WebGL + MediaRecorder |
| Best experience | Chrome / Edge desktop |

---

## Project layout

```
src/
  lib/enhance/   # WebGL engine, image + video paths
  lib/           # capabilities, jobs
  ui/            # dropzone, compare, progress
  App.tsx        # simple one-click UX
```

---

## License

MIT · © Foxy's Lab

Not affiliated with free.upscaler.video or Topaz Labs.
