# The McCluster Platform: An On-Device Behavioral Engine
### White paper · v1 · July 2026

**Author of record:** Matthew McCluster · McCluster Corp / Equity Uprise
**Scope:** the platform as deployed at `mcclusterishere.github.io/McCluster-Portfolio` on July 8, 2026 — the app, the algorithmic models behind it, an adversarial critique, and the changes made in this revision.

---

## 1. What the system is

A static site that behaves like a platform. There is no application server: GitHub Pages serves the pages, Supabase (Postgres + RLS) is the system of record, Square is the payment rail, and **all behavioral intelligence runs in the visitor's own browser**. The architecture is five organs around one nervous system:

| Organ | File | Job |
|---|---|---|
| **The nervous system** | `MCC_TRACK` (analytics.js) | Every signal on the site — plays, taps, quiz answers, deals, dwell — passes through one function |
| **The interest model** | `MCC_MODEL` (analytics.js) | Classifies every signal into six domains, decays them, and decides what to show next and in which voice |
| **The identity layer** | `MCC_PERSONA` (persona.js) | Values, not behavior: the scroll/present duality measured by quizzes and marker flips |
| **The ticker** | `MCC_STOCK` (mstock.js) | Every member's labor as a stock: real platform actions in, a living index out |
| **The continuity layer** | `MCC_RADIO` (polish.js) + `sync.js` | Sound follows the visitor across pages; signed-in state follows them across devices |

Surfaces that act on the models: the For You card, the exit-intent card, the appbar signal dot, the pitch door (tithe/equity), the Music tab transport, and the public index on every profile.

## 2. The algorithms, plainly

**Interest decay.** Every domain score halves every 14 days of absence: `score ×= 0.5^(days/14)`. The model's opinion of you is always mostly about the recent you.

**Engagement heat.** The stage ladder (new → warming → locked) runs on a decaying activity counter, not lifetime totals — a hot June cannot make a cold October read as committed. **New this revision: the streak** — consecutive-day visits are tracked as a habit signal (`profile().streak`).

**Goal memory.** Conversion events stamp their domain for 14 days; the model stops selling a door the visitor already walked through.

**Impression fatigue.** Every suggestion counts its own impressions; five silent shows rotate a domain out, one tap forgives it, and fatigue itself decays (7-day half-life). This is the system's only true learning loop today: it updates on negative evidence.

**The voice selector.** `persuade()` maps the dominant domain to a rhetoric: client→scarcity, org/civic→mission, artist→proof, listener→belonging. Same destination, the door each psyche answers to. The pitch door locks for 7 days so the story never contradicts itself mid-week.

**Attention.** Dwell time and scroll depth report once per page (sendBeacon), classified by the room they happened in, log-capped so a parked tab cannot farm interest.

**The M Stock walk.** Thirty days, additive: `v += earned − pressure + wiggle`, floored at 38. Earned: completed bookings (+6), signed deals (+8), locked (+3), performances (+4), a listing going live (+5). Pressure: `0.35·ln(marketN+1)·0.4` on workless days — the floor moves faster as the market grows. **Changed this revision (see §4):** live listings now earn a continuous *standing* credit (+0.55/day), and the daily wiggle is normalized to zero mean per member.

**Privacy invariant.** Everything above lives in localStorage. Nothing about an anonymous visitor leaves their device. Signed-in members may opt into `device_state` sync (owner-only RLS) — continuity is a choice, never a default.

## 3. Adversarial critique — what a hostile reviewer finds

1. **The wiggle was destiny (fixed §4).** The stock's daily drift was seeded per member; an unlucky hash biased a member's whole curve. Two identical cold accounts could sit 20+ index points apart forever. That is not a market; that is astrology.
2. **One-shot credits couldn't hold par (fixed §4).** The walk is additive, so *when* a credit lands never mattered — only how often. A verified member with a live listing but a quiet week drifted under 100 while doing everything right. Standing must be continuous or the index punishes patience.
3. **Weights are still authored, not learned.** Every coefficient in this paper was set by judgment. The fatigue loop learns; nothing else does. The honest path to learned weights is audience-level aggregation (the planned Cloudflare Worker), never individual tracking.
4. **Single-device blindness remains for anonymous visitors** — by design, and worth the cost, but it means every model understates its regulars.
5. **The public index runs on public facts only** (standing + market pace); real labor stays private until the member signs in. Correct for privacy, but it compresses the public spread between a hustler and a holder. Opt-in "show my labor publicly" is the roadmap fix.
6. **The persuasion layer's restraint is configuration, not constitution.** The 72-hour exit cap, the 12-second grace, the warm-only rule — all one commit away from removal. This paper is the covenant: the caps are the product.
7. **Survivorship in the ticker:** declined deals and denied listings apply no pressure. A member could farm standing by never risking. Roadmap: risk-taking (proposals sent) should count, win or lose — the All In principle.

## 4. Changed in this revision, and why

- **Continuous standing credit (+0.55/day for live listings).** Verified standing now *holds* par; labor moves you above it. Before: standing 92 (under par — punished for existing). After: standing ≈115, cold ≈93, working member ≈123. The index now says what it means: *verified and present beats absent; working beats both.*
- **Zero-mean drift.** The wiggle is normalized per member over the window: identical inputs now produce identical values for any two members. Wiggle without destiny.
- **The streak signal.** Habit joins the model: consecutive-day visits tracked and exposed, ready to feed stage and suggestions.
- **The back door everywhere.** Every page but home now carries a floating back button — real history when it exists, the front door when it doesn't. (A navigation fix, but hostile review flagged dead-ends as the top UX complaint.)
- **The vault keeper (new script).** `tools/backup.mjs` + a weekly GitHub Action export every Supabase table to a 90-day workflow artifact. PII (booking contacts, the SMS list) is never committed to the repo — the export lives only in the artifact store behind repo permissions.

## 5. Scripts shipped for installation

| Script | Runs | You must do |
|---|---|---|
| `tools/backup.mjs` + `.github/workflows/backup.yml` | Weekly (Mon 9:00 UTC) + on demand | Add repo secret **SUPABASE_SERVICE_KEY** (GitHub → Settings → Secrets → Actions) |
| `tools/audit-static.mjs` + `site-audit.yml` | Every push | Nothing — already live |
| `tools/mcp/server.mjs` | On demand (AI console access) | Optional: set the same service key in env for admin-level MCP |
| `docs/*.sql` (market, sync) | Once, in Supabase SQL editor | Paste and run (market-schema.sql and sync-schema.sql still pending) |

## 6. Roadmap, in force order

1. Worker-based anonymous aggregation → learned weights and honest A/B power.
2. Risk-counting in the ticker (proposals sent move the index, win or lose).
3. Opt-in public labor display on profiles (the spread becomes real).
4. Archetype naming layer over the six domains, grounded in the catalogue's own bars (pending the founder's blessing on names).
5. Rights ledger (deal JSON → queryable split rows) — the exchange floor under "trading music like positions."
