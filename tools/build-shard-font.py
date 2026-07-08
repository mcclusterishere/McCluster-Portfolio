#!/usr/bin/env python3
"""
McCluster M — the favicon IS the typeface.

Not a pixel grid: every glyph is solid slab geometry pulled straight from
the mark — heavy stems, one shared 45-degree shard cut on every free
terminal, chamfered outer corners, and a capital M built exactly like the
favicon (deep center V, sheared legs).

Variants:
  Solid  — the signature
  Heavy  — wider stems, tighter air
  Split  — every glyph sliced once along the shard angle (the two-shard echo)
  Slant  — the solid cut, leaning forward

Outputs TTF + WOFF into assets/fonts/mccluster/ (run from repo root):
  python3 tools/build-shard-font.py
"""
from __future__ import annotations
import math
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parents[1] / "assets" / "fonts" / "mccluster"
UPM, ASC, DESC = 1000, 880, -220
CAP = 720          # cap height
MID = 330          # waistline for E/B/S mid bars

# ---------------------------------------------------------------- geometry
def stem(x, y0, y1, w, top="flat", bot="flat", c=None):
    """Vertical slab. 'cut' terminals shear 45° descending-right (the shard)."""
    c = c if c is not None else CUT
    return [(x, y0 + (c if bot == "cut" else 0)), (x, y1),
            (x + w, y1 - (c if top == "cut" else 0)), (x + w, y0)]

def bar(x0, x1, y, h, l="flat", r="flat", c=None):
    """Horizontal slab. 'cut' ends shear along the same shard angle."""
    c = c if c is not None else CUT
    return [(x0, y), (x0 + (c if l == "cut" else 0), y + h),
            (x1, y + h), (x1 - (c if r == "cut" else 0), y)]

def diag(x0, y0, x1, y1, w):
    """Thick diagonal slab between two centerline points."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    return [(x0 - nx, y0 - ny), (x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny)]

def ring(x0, y0, x1, y1, vw, hw, ch):
    """Rectangular ring: chamfered outer contour + rect hole (reverse wound)."""
    outer = [(x0 + ch, y0), (x0, y0 + ch), (x0, y1 - ch), (x0 + ch, y1),
             (x1 - ch, y1), (x1, y1 - ch), (x1, y0 + ch), (x1 - ch, y0)]
    hole = [(x0 + vw, y0 + hw), (x1 - vw, y0 + hw), (x1 - vw, y1 - hw), (x0 + vw, y1 - hw)]
    return [outer, hole]

def clip_half(poly, a, b, keep_left):
    """Sutherland–Hodgman clip of poly against line a→b."""
    def side(p):
        s = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        return s if keep_left else -s
    out = []
    n = len(poly)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        sp, sq = side(p), side(q)
        if sp >= 0:
            out.append(p)
        if (sp > 0) != (sq > 0) and sp != sq:
            t = sp / (sp - sq)
            out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out if len(out) >= 3 else None

# ---------------------------------------------------------------- letterforms
def glyphset(W, C, gap):
    """Build all glyphs for one stem weight. Returns {char: (contours, advance)}."""
    global CUT
    CUT = C
    HB = int(min(W * 0.86, 152))  # horizontal bar weight — capped so counters never close
    CH = int(W * 0.62)          # outer chamfer
    SB = 46                     # side bearing
    B = 470                     # standard body width
    G = {}

    def put(ch, contours, width):
        G[ch] = ([c for c in contours if c], width + 2 * SB)

    R_ = B - W                  # right stem x for standard body

    # --- the wordmark letters first: M C L U S T E R O ---
    MW = 660
    put("M", [stem(0, 0, CAP, W, bot="cut"), stem(MW - W, 0, CAP, W, bot="cut"),
              diag(W * 0.55, CAP - 10, MW / 2, 205, W * 0.94),
              diag(MW - W * 0.55, CAP - 10, MW / 2, 205, W * 0.94)], MW)
    put("C", ring(0, 0, B, CAP, W, HB, CH)[:1] +
             [ [(W, HB), (B, HB), (B - CUT, 0), (W, 0)] ] and
             [ [(0 + CH, 0), (0, CH), (0, CAP - CH), (CH, CAP), (B, CAP), (B, CAP - HB),
                (W, CAP - HB), (W, HB), (B, HB), (B - CUT, 0)] ], B)
    put("L", [stem(0, 0, CAP, W, top="cut"), bar(0, B - 16, 0, HB, r="cut")], B - 16)
    put("U", [ [(CH, 0), (0, CH), (0, CAP), (W, CAP), (W, HB), (R_, HB), (R_, CAP),
                (B, CAP), (B, CH), (B - CH, 0)] ], B)
    sw = B - 10
    put("S", [bar(0, sw, CAP - HB, HB, l="cut"), stem(0, MID, CAP - HB + 2, W),
              bar(0, sw, MID, HB), stem(sw - W, HB - 2, MID, W),
              bar(0, sw, 0, HB, r="cut")], sw)
    put("T", [bar(0, B, CAP - HB, HB), stem((B - W) / 2, 0, CAP - HB + 2, W, bot="cut")], B)
    put("E", [stem(0, 0, CAP, W), bar(W - 2, B - 16, CAP - HB, HB, r="cut"),
              bar(W - 2, B - 70, MID, HB, r="cut"), bar(W - 2, B - 16, 0, HB, r="cut")], B - 16)
    put("R", ring(0, MID, B, CAP, W, HB, CH) +
             [stem(0, 0, MID + 2, W), diag(W + 70, MID + 20, B - 30, 0, W * 0.98)], B)
    put("O", ring(0, 0, B, CAP, W, HB, CH), B)

    # --- rest of the caps ---
    put("A", [diag(W * 0.52, 6, B / 2, CAP - 34, W * 1.02),
              diag(B - W * 0.52, 6, B / 2, CAP - 34, W * 1.02),
              bar(B * 0.24, B * 0.76, 175, HB)], B)
    put("B", [stem(0, 0, CAP, W),
              bar(W - 2, B - CH, CAP - HB, HB), bar(W - 2, B - 40, MID, HB), bar(W - 2, B - CH, 0, HB),
              [(R_, MID + HB), (R_, CAP - HB), (B - CH, CAP - HB), (B, CAP - CH), (B, MID + HB)],
              [(R_, HB), (R_, MID), (B, MID), (B, CH), (B - CH, HB)]], B)
    put("D", ring(0, 0, B, CAP, W, HB, CH), B)  # squared D reads as O-frame with left stem
    G["D"][0].append(stem(0, 0, CAP, W))
    put("F", [stem(0, 0, CAP, W, bot="cut"), bar(W - 2, B - 16, CAP - HB, HB, r="cut"),
              bar(W - 2, B - 70, MID, HB, r="cut")], B - 16)
    put("G", [ [(CH, 0), (0, CH), (0, CAP - CH), (CH, CAP), (B, CAP), (B, CAP - HB),
                (W, CAP - HB), (W, HB), (B, HB), (B, 0)],
               stem(R_, HB - 2, MID + 2, W),
               bar(int(B * 0.48), B, MID + 2, HB, l="cut")], B)
    put("H", [stem(0, 0, CAP, W), stem(R_, 0, CAP, W), bar(W - 2, R_ + 2, MID, HB)], B)
    put("I", [stem(0, 0, CAP, W, top="cut", bot="cut")], W)
    put("J", [ [(CH, 0), (0, CH), (0, HB + 40), (W, HB + 40), (W, HB), (R_, HB),
                (R_, CAP), (B, CAP), (B, CH), (B - CH, 0)],
               bar(R_ - 90, B, CAP - HB, 0)[:0] or None,
             ], B)
    put("K", [stem(0, 0, CAP, W), diag(W + 10, MID + 40, B + 6, CAP, W, ) ,
              diag(W + 10, MID + 40, B + 6, 0, W)], B)
    put("N", [stem(0, 0, CAP, W), stem(R_, 0, CAP, W), diag(W * 0.5, CAP - 24, B - W * 0.5, 24, W)], B)
    put("P", ring(0, MID, B, CAP, W, HB, CH) + [stem(0, 0, MID + 2, W, bot="cut")], B)
    put("Q", ring(0, 0, B, CAP, W, HB, CH) + [diag(B - W - 60, 170, B + 24, -36, W * 0.9)], B)
    put("V", [diag(W * 0.52, CAP, B / 2, 20, W * 1.02), diag(B - W * 0.52, CAP, B / 2, 20, W * 1.02)], B)
    WW = 680
    put("W", [stem(0, 0, CAP, W, top="cut"), stem(WW - W, 0, CAP, W, top="cut"),
              diag(W * 0.55, 12, WW / 2, CAP - 190, W * 0.92),
              diag(WW - W * 0.55, 12, WW / 2, CAP - 190, W * 0.92)], WW)
    put("X", [diag(W * 0.5, 0, B - W * 0.5, CAP, W * 1.04), diag(W * 0.5, CAP, B - W * 0.5, 0, W * 1.04)], B)
    put("Y", [diag(W * 0.5, CAP, B / 2, MID + 20, W), diag(B - W * 0.5, CAP, B / 2, MID + 20, W),
              stem((B - W) / 2, 0, MID + 60, W, bot="cut")], B)
    put("Z", [bar(0, B, CAP - HB, HB, l="cut"), bar(0, B, 0, HB, r="cut"),
              diag(W * 0.62, HB - 10, B - W * 0.62, CAP - HB + 10, W)], B)

    # --- digits ---
    put("0", ring(0, 0, B, CAP, W, HB, CH) + [diag(B / 2 - 60, MID - 60, B / 2 + 60, MID + 130, 56)], B)
    put("1", [stem(120, 0, CAP, W, top="cut"), diag(6, CAP - 120, 130, CAP - 30, HB * 0.9),
              bar(0, 340, 0, HB)], 340)
    put("2", [bar(0, B, CAP - HB, HB, l="cut"), stem(R_, MID, CAP - HB + 2, W),
              bar(0, B, MID, HB), stem(0, HB - 2, MID + 2, W), bar(0, B, 0, HB, r="cut")], B)
    put("3", [bar(0, B, CAP - HB, HB, l="cut"), bar(70, B, MID, HB, l="cut"),
              bar(0, B, 0, HB, l="cut"), stem(R_, 0, CAP, W)], B)
    put("4", [stem(R_ - 60, 0, CAP, W, top="cut", bot="cut"), stem(0, 175, CAP, W, top="cut"),
              bar(0, B, 175, HB)], B)
    put("5", [bar(0, B, CAP - HB, HB, r="cut"), stem(0, MID, CAP - HB + 2, W),
              bar(0, B, MID, HB), stem(R_, HB - 2, MID + 2, W), bar(0, B, 0, HB, l="cut")], B)
    put("6", [stem(0, 0, CAP, W), bar(W - 2, int(B * 0.9), CAP - HB, HB, r="cut"),
              bar(W - 2, B, MID, HB), stem(R_, 0, MID + 2, W), bar(0, B, 0, HB)], B)
    put("7", [bar(0, B, CAP - HB, HB, l="cut"), diag(B - W * 0.6, CAP - HB + 6, 150, 0, W)], B)
    put("8", ring(0, MID, B, CAP, W, HB, CH) + ring(0, 0, B, MID + HB, W, HB, CH), B)
    put("9", [stem(R_, 0, CAP, W, bot="cut"), bar(0, W + 2, MID, HB),
              stem(0, MID - 2, CAP, W), bar(0, B, CAP - HB, HB)], B)

    # --- punctuation ---
    dot = W + 24
    put(".", [stem(0, 0, dot, dot, top="cut")], dot)
    put(",", [ [(0, -110), (0, dot), (dot, dot - CUT), (dot, 0), (dot * 0.45, -110)] ], dot)
    put(":", [stem(0, 0, dot, dot, top="cut"), stem(0, CAP - dot, CAP, dot, top="cut")], dot)
    put(";", G[","][0] + [stem(0, CAP - dot, CAP, dot, top="cut")], dot + 2 * SB - 2 * SB) if False else \
        put(";", [G[","][0][0], stem(0, CAP - dot, CAP, dot, top="cut")], dot)
    put("!", [stem(0, 220, CAP, W, top="cut"), stem(0, 0, dot - 20, W)], W)
    put("?", [bar(0, B - 90, CAP - HB, HB, l="cut"), stem(B - 90 - W, MID + 30, CAP - HB + 2, W),
              stem((B - 90 - W) / 2, 220, MID + 30 + HB, W),
              stem((B - 90 - W) / 2, 0, dot - 20, W)], B - 90)
    put("-", [bar(0, 330, MID, HB, l="cut", r="cut")], 330)
    put("+", [bar(0, 380, MID - HB / 2 + HB / 2, 0)[:0] or bar(0, 380, MID, HB),
              stem((380 - W) / 2, MID - 120, MID + HB + 120, W)], 380)
    put("=", [bar(0, 380, MID + 70, HB), bar(0, 380, MID - 90, HB)], 380)
    put("/", [diag(40, -40, 420, CAP + 20, W)], 460)
    put("\\", [diag(40, CAP + 20, 420, -40, W)], 460)
    put("(", [ [(200, -60), (60, 120), (60, CAP - 120), (200, CAP + 60), (200 + CUT, CAP + 60 - CUT),
                (60 + W, CAP - 140), (60 + W, 140), (200 + CUT, -60 + CUT)] ], 240)
    put(")", [ [(40, -60 + 0), (40 - 0 + CUT * 0, -60), (180, 120), (180, CAP - 120), (40, CAP + 60),
                (40 + CUT, CAP + 60), (180 + 0, CAP - 140 + 0), (180 - W + 0, CAP - 140),
                (180 - W, 140), (40 + CUT, -60)] ], 220)
    put("'", [stem(0, CAP - 200, CAP, W, bot="cut")], W)
    put('"', [stem(0, CAP - 200, CAP, W, bot="cut"), stem(W + 70, CAP - 200, CAP, W, bot="cut")], 2 * W + 70)
    put("$", G["S"][0] + [stem((sw - 90) / 2, -70, CAP + 70, 90, top="cut", bot="cut")], sw)
    put("%", ring(0, CAP - 280, 280, CAP, 92, 84, 60) + ring(B - 90, 0, B + 190, 280, 92, 84, 60) +
             [diag(60, 0, B + 120, CAP, W * 0.86)], B + 190)
    put("#", [stem(120, 0, CAP, W * 0.75, top="cut", bot="cut"),
              stem(320, 0, CAP, W * 0.75, top="cut", bot="cut"),
              bar(0, 520, CAP - 250, HB * 0.8), bar(0, 520, 170, HB * 0.8)], 520)
    put(" ", [], 330)

    # the favicon itself, exact: two staggered shards (PUA U+E000)
    put("", [ [(0, 190), (0, 760), (190, 575), (190, 10)],
                    [(285, 60), (285, 640), (475, 455), (475, -120)] ], 475)
    return G

# ---------------------------------------------------------------- variants
def shear(contours, k):
    return [[(x + y * k, y) for (x, y) in c] for c in contours]

def split(contours, adv, gap=30):
    """One shard-angle slice through the glyph center: the two-shard echo."""
    cx = adv / 2
    d = (1.0, 1.15)  # slice direction ≈ the cut angle, rising right
    a1 = (cx - gap * 0.6 - d[0] * 2000, 360 - d[1] * 2000)
    b1 = (cx - gap * 0.6 + d[0] * 2000, 360 + d[1] * 2000)
    a2 = (cx + gap * 0.6 - d[0] * 2000, 360 - d[1] * 2000)
    b2 = (cx + gap * 0.6 + d[0] * 2000, 360 + d[1] * 2000)
    out = []
    for c in contours:
        p1 = clip_half(c, a1, b1, True)
        p2 = clip_half(c, a2, b2, False)
        if p1: out.append(p1)
        if p2: out.append(p2)
    return out or contours

VARIANTS = {
    "Solid": dict(W=172, C=150, track=0),
    "Heavy": dict(W=205, C=170, track=6),
    "Split": dict(W=185, C=155, track=0, split=True),
    "Slant": dict(W=172, C=150, track=0, slant=0.20),
}

def build(name, cfg):
    G = glyphset(cfg["W"], cfg["C"], 0)
    glyph_order = [".notdef", "space"]
    glyphs, cmap, widths = {}, {}, {}

    def draw(contours):
        pen = TTGlyphPen(None)
        for c in contours:
            pts = [(round(x), round(y)) for x, y in c]
            if len(pts) < 3: continue
            pen.moveTo(pts[0])
            for p in pts[1:]: pen.lineTo(p)
            pen.closePath()
        return pen.glyph()

    # notdef = one shard
    glyphs[".notdef"] = draw([[(0, 0), (0, 700), (180, 530), (180, -170)]])
    widths[".notdef"] = (270, 45)
    glyphs["space"] = draw([]); widths["space"] = (G[" "][1], 0)
    cmap[ord(" ")] = "space"

    for ch, (contours, adv) in G.items():
        if ch == " ": continue
        cs = contours
        if cfg.get("split"): cs = split(cs, adv)
        if cfg.get("slant"): cs = shear(cs, cfg["slant"])
        gname = "uni%04X" % ord(ch)
        glyph_order.append(gname)
        glyphs[gname] = draw(cs)
        widths[gname] = (adv + cfg.get("track", 0) * 2, 45)
        cmap[ord(ch)] = gname
        if ch.isalpha():  # lowercase rides the caps — the mark only speaks caps
            cmap[ord(ch.lower())] = gname

    fam = "McCluster M " + name
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(widths)
    fb.setupHorizontalHeader(ascent=ASC, descent=DESC)
    fb.setupNameTable({"familyName": fam, "styleName": "Regular",
                       "fullName": fam, "psName": "McClusterM-" + name,
                       "uniqueFontIdentifier": "McClusterM-" + name + ";3.0"})
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=DESC, usWinAscent=ASC + 60, usWinDescent=-DESC + 60)
    fb.setupPost()
    OUT.mkdir(parents=True, exist_ok=True)
    ttf = OUT / ("McClusterM-%s.ttf" % name)
    fb.save(str(ttf))
    f = TTFont(str(ttf)); f.flavor = "woff"; f.save(str(OUT / ("McClusterM-%s.woff" % name)))
    print("built", fam)

if __name__ == "__main__":
    for name, cfg in VARIANTS.items():
        build(name, cfg)
    print("done →", OUT)
