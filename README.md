# Matthew McCluster — Cinematic 3D-Scroll Portfolio

Ink black. Ruby red. Cream. One director.

An award-style, scroll-driven portfolio in the spirit of the Awwwards SOTY genre:
a 161-frame **hero orbit** (Seedance 2.0, 1080p) scrubbed on a `<canvas>` as you
scroll, kinetic letter-by-letter display type, a stats strip, three pillars over
"The Graphic Designer" clip, selected work over "The Songwriter" clip, and a
BOOK NOW finale.

## Run it

Any static server from the repo root:

```bash
python3 -m http.server 8213
# then open http://localhost:8213
```

## Stack

- Vanilla HTML/CSS/JS — no build step
- [Lenis](https://lenis.darkroom.engineering/) smooth scroll + GSAP ScrollTrigger (vendored in `vendor/`)
- Anton + Archivo fonts (self-hosted in `assets/fonts/`)
- Every clip is scroll-scrubbed: `assets/frames/{hero,designer,songwriter}_0001..0161.jpg`
  (20fps; hero @ 1536px, backgrounds @ 1280px), lerp-smoothed canvas scrubs
- `assets/video/*.mp4` + `*.webm` are kept only as no-frames fallbacks

## Asset pipeline

The three clips were generated with Seedance 2.0 (std, 1080p, 16:9, ~8s, silent)
using the "McCluster" identity reference element on every generation.
`.github/workflows/fetch-assets.yml` downloads the clips from the URLs in
`assets-manifest.json` and cuts the hero frame sequence with ffmpeg — push a
change to `assets-manifest.json` to regenerate.

## Booking

- matthew@mccluster.org
- @McClusterishere everywhere
