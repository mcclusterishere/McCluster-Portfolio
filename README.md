# Matthew McCluster — Cinematic 3D-Scroll Portfolio

Ink black. Ruby red. Cream. One director.

An award-style, scroll-driven portfolio: a frame-by-frame **hero orbit**
scrubbed on a `<canvas>` as you scroll, kinetic letter-by-letter display
type, a stats strip, cinematic scenes behind every section, and a BOOK
NOW finale.

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
- Cinematic clips are cut into frame sequences and scrubbed on canvas —
  `assets/frames/<scene>_0001..NNNN.jpg` (20fps), lerp-smoothed for a
  buttery scroll
- `assets/video/*.mp4` + `*.webm` are kept as no-frames fallbacks

## Structure

- `index.html` — the cinematic home
- `hire.html`, `ecosystem.html`, `brand.html`, `equity-uprise.html`,
  `catalogue.html`, `role.html`, song pages — the lightweight rooms
- `css/style.css` — one stylesheet, design tokens up top
- `js/` — the scroll engine (`main.js`) and per-feature modules
- `data/` — JSON registries that drive the data-built pages

## Booking

- matthew@mccluster.org
- @McClusterishere everywhere
