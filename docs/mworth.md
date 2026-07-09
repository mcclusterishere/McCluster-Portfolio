# M-Worth — how a person is priced, and who gets to see it

## The two numbers

| Number | Unit | Who sees it | Where it lives |
|---|---|---|---|
| **M-Score** | points | everyone, on the floor | `market.html` watchlist, tape, index |
| **True worth** | dollars | **the owner only** | profile card, own row on the floor |

The floor is public theater with real bones: relative performance,
momentum, direction. The dollars are personal.

## The algorithm

```
WORTH = (SEAT + LABOR + DEMAND + STAGE) × MOMENTUM
```

Every signal decays with age (45-day half-life unless noted) — the
number is about who you are, not who you were.

| Book | What counts | Weight |
|---|---|---|
| **SEAT** | a live listing | $150 flat |
| | listing completeness (name, headline, photo, roles, ticker, rate, amenities, blurb) | up to $350, pro-rated |
| **LABOR** | deal fees, by status: paid/completed | 100% of fee |
| | signed | 60% |
| | locked | 45% |
| | countered | 30% |
| | proposed | 20% |
| **DEMAND** | each booking request | $40 |
| | each deal aimed at you | $25 |
| **STAGE** | each logged performance (90-day half-life — a stage stays on the résumé) | $120 |
| **MOMENTUM** | 7-day activity vs 30-day | ×0.85 (silent) to ×1.25 (hot week) |

Implementation: `js/mworth.js` — `MCC_WORTH.appraise(inputs)` returns
`{ worth, momentum, breakdown[] }`; `MCC_WORTH.mine()` gathers the
owner's books and appraises.

## The privacy wall — enforced, not promised

True worth is computed **client-side from the owner's own rows**:
deals, booking requests, and performances are readable only by their
owner under Row Level Security. The database will not answer those
queries for anyone else, so another member's true worth *cannot be
computed*, even by a curious developer with the console open.

What the public floor uses instead: the listing's public shape
(tenure, completeness, promo) plus a seeded day-walk — enough to
show a living market without leaking a single private dollar.

## Tuning

All weights live at the top of `js/mworth.js` (`DEAL_W`, and the
constants in `appraise`). Change them there; this document is the
contract for what each knob means.

---

## The staging model — M-GRIND (`js/mgrind.js`)

Two models, one destiny: **M-GRIND runs now** and prices *interaction*;
**M-WORTH** is the deep book priced on money and record. Every grind
event leaves through the analytics pipe tagged `model: grind_v1` with
its **device id** — that exhaust is the training set for the live
model, and the grind score already feeds the live book as a small
`behavior` input (capped $50).

| Grind mechanic | Effect |
|---|---|
| Fulfilled task | **+1%** each, max **3 counted/day** (board offers 6 — you can't clear it in a day) |
| Login streak | +0.25%/consecutive day, cap +5% |
| Idle day | **−1%** each, floor −10%; engagement score bleeds 4%/idle day |
| Hard clamp | net bend held to **[−10%, +8%]**, applied to the *staged* price only |

Money outweighs the grind ~10× by construction: the grind bends inside
a capped band while labor dollars are uncapped in the true book.

**Devices are instruments.** Each device mints a permanent
`mcc_device_id` and keeps its own ledger; the account is the sum of
its devices, and training data keeps them apart.

**The behavior variables in the live book** (v2): sessions (×$2, cap
$100), read-depth (×$20, cap $60), devices (×$15, cap $45), grind
score (×$0.05, cap $50).
