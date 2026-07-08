# Model cards (planned)

Do not commit large weight files without team agreement. Prefer:

1. Download-on-first-use with checksum
2. GitHub Releases + Git LFS
3. Public CDN with versioned URLs

## Planned pipelines

| Pipeline key | Source inspiration | Use case | Browser feasibility |
|--------------|-------------------|----------|---------------------|
| `anime4k-lite` | Anime4K | Fast anime / 2D | High |
| `anime4k-plus` | Anime4K + light SR | AI anime shorts | High |
| `sr-medium` | Compact RealESRGAN-class | Photos / mixed | Medium |
| `sr-xl` | Larger SR | Max quality | Low–medium (tile heavily) |

## License checklist (before shipping weights)

- [ ] Confirm commercial/redistribution terms for each model
- [ ] Attribute authors in README / this file
- [ ] Pin version + SHA-256 of every downloaded artifact

## Evaluation

For each preset, keep a small fixture set (short public-domain clips):

- Anime line art
- AI-generated short
- Phone footage / compression artifacts
- Face close-up

Record qualitative notes + optional SSIM on a center crop (docs only; not a marketing claim).
