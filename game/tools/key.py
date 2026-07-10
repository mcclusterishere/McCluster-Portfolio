"""BLOCK OPS asset kitchen — runs on the GitHub runner.

Keys the green-screen sprites to transparency (color-based, so enclosed
green regions key too), crops, squares and downscales them; feathers the
asphalt tile's wrap seam; and pastes a contact sheet so the desk can
eyeball scale and style coherence in one image.
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
RAW = os.path.join(GAME, "raw")
OUT = os.path.join(GAME, "assets")
os.makedirs(OUT, exist_ok=True)

SPRITES = {  # name -> shipped square size
    "runner": 128, "rusher": 128, "heavy": 144,
    "sedan": 512, "crate": 128, "package": 128,
}

def key_green(im):
    a = np.asarray(im.convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mask = (g > 90) & (g > r * 1.45) & (g > b * 1.45)
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    # soften the fringe: near-key pixels get partial alpha + despill
    near = (~mask) & (g > 70) & (g > r * 1.2) & (g > b * 1.2)
    alpha[near] = 120
    spill = g > np.maximum(r, b)
    g2 = np.where(spill, np.maximum(r, b), g)
    rgba = np.dstack([r, g2, b, alpha]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")

def crop_square(im, size):
    a = np.asarray(im)
    ys, xs = np.where(a[..., 3] > 40)
    if len(xs) == 0:
        return im.resize((size, size), Image.LANCZOS)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pad = 6
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(a.shape[1], x1 + pad), min(a.shape[0], y1 + pad)
    im = im.crop((x0, y0, x1, y1))
    side = max(im.width, im.height)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq.resize((size, size), Image.LANCZOS)

def seam_ratio(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(float)
    seam = abs(a[0] - a[-1]).mean() + abs(a[:, 0] - a[:, -1]).mean()
    base = abs(np.diff(a, axis=0)).mean() + abs(np.diff(a, axis=1)).mean()
    return round(seam / base, 2)

def feather_tile(im, band=12):
    """Wrap-feather: cross-fade each edge with the opposite edge so the
    tile is mathematically wrappable even if the paint isn't perfect."""
    a = np.asarray(im.convert("RGB")).astype(float)
    h, w, _ = a.shape
    for i in range(band):
        t = (i + 1) / (band + 1)
        a[i, :] = a[i, :] * (0.5 + t / 2) + a[h - band + i, :] * (0.5 - t / 2)
        a[h - 1 - i, :] = a[h - 1 - i, :] * (0.5 + t / 2) + a[band - 1 - i, :] * (0.5 - t / 2)
        a[:, i] = a[:, i] * (0.5 + t / 2) + a[:, w - band + i] * (0.5 - t / 2)
        a[:, w - 1 - i] = a[:, w - 1 - i] * (0.5 + t / 2) + a[:, band - 1 - i] * (0.5 - t / 2)
    return Image.fromarray(a.astype(np.uint8), "RGB")

for name, size in SPRITES.items():
    src = os.path.join(RAW, name + ".png")
    im = key_green(Image.open(src))
    im = crop_square(im, size)
    im.save(os.path.join(OUT, name + ".png"))
    print("sprite", name, size)

tile = Image.open(os.path.join(RAW, "asphalt.png")).convert("RGB").resize((256, 256), Image.LANCZOS)
tile_path = os.path.join(OUT, "asphalt.png")
tile.save(tile_path)
r0 = seam_ratio(tile_path)
if r0 > 1.3:
    feather_tile(tile).save(tile_path)
print("tile asphalt seam ratio", r0, "->", seam_ratio(tile_path))

# contact sheet: everyone at relative scale on the ground they'll stand on
sheet = Image.new("RGB", (900, 300))
strip = Image.open(tile_path)
for x in range(0, 900, 256):
    sheet.paste(strip, (x, 0))
    sheet.paste(strip, (x, 256))
x = 20
order = [("runner", 70), ("rusher", 66), ("heavy", 84), ("crate", 72), ("package", 84), ("sedan", 220)]
for name, disp in order:
    im = Image.open(os.path.join(OUT, name + ".png")).convert("RGBA").resize((disp, disp), Image.LANCZOS)
    sheet.paste(im, (x, 150 - disp // 2), im)
    x += disp + 26
sheet.save(os.path.join(GAME, "design", "contact-sheet.png"))
print("contact sheet written")
