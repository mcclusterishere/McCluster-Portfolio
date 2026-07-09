# The Behavior Engine — how the whole platform reads a human

One sentence: **every surface is a sensor, every sensor feeds a model,
every model pays the person back in something they can feel — price,
rank, score, or a room that knows them.**

## The loop

```
   SIGNALS IN                MODELS                    PAID BACK AS
   ─────────                 ──────                    ────────────
   plays (Heat)         ┐
   scroll / dwell       │    M-Grind (staging)    →    +% on your staged price,
   sessions / streaks   ├──▶ shadow board              streaks, daily tasks
   device identity      │
   quiz answers         ┘         │ trains
                                  ▼
   deals / bookings     ┐    M-Worth (live)       →    your true dollar worth
   ratings (client/peer)├──▶ SEAT+LABOR+DEMAND         (🔒 owner-only)
   listing completeness ┘    +behavior+rep
                                  │ composes
                                  ▼
   payment punctuality  ┐    Street Score          →   300–850 credit dial
   cash-flow months     ├──▶ (SCB paper)               + "next move" coaching
   community word       ┘
                                  ▼
   engagement (tracks)  ──▶  M-Stock / floor      →    public points, the ticker,
                             engagement channel        programs riding their crowd
                                  ▼
   persona signals      ──▶  Duality (present     →    For-You picks, autopilot
   (site behavior)           vs. scroll)               door copy, persona card
                                  ▼
   lyric-poll answers   ──▶  Civic markers        →    issue signals for Equity
   (PSMF, consent-first)     (14 civic markers)        Uprise, CP ranks, the ride
```

## The five families of markers

1. **Attention markers** (the duality quiz + psychology registry, 9):
   habit, scroll-pull, presence — measured by what the hands do,
   answered by the inverse challenge.
2. **Civic markers** (PSMF poll, 14): freedom pressure, policy burden,
   civic distrust, displacement pressure… — consent-gated, aggregate
   signals only, never diagnoses.
3. **Conduct markers** (the grind shadow board, 9): night owl, closer,
   scholar, wanderer, vr pilot… — inferred from movement through the
   platform, admin-visible, gamified as hidden achievements.
4. **Reputation markers** (ratings): the client's word (~3×) vs. the
   peer's word — verified by deals, capped so no one word rules.
5. **Commerce markers** (deals + money): punctuality, volume,
   consistency — the Street Score books.

## The two-model law

The **staging model (M-Grind)** moves fast and gambles nothing: it can
bend a *staged* price a few percent and hand out tasks, streaks and
comebacks. The **live model (M-Worth)** moves slow and means it: real
dollars, computed only from RLS-guarded rows the owner alone can read.
The staging model's exhaust (tagged `model:grind_v2`) is the training
diet for tuning the live model's behavior weights. Gamification runs
hot on stage so the money model can stay honest in production.

## The privacy walls (non-negotiable)

- Dollars are owner-only; the public floor speaks in points.
- Hidden plays never leave the device.
- Poll answers move only with consent; analytics gets event names.
- The fan book export gives creators THEIR audience, never anyone else's.

## Expansion under way

The registry is growing from 9 + 14 markers into a full atlas —
several families, each with its own explanation page (the
psychology-markers pattern), covering conduct, commerce, and social
markers with the same rule everywhere: named, explained, sourced,
and answerable by the person wearing them.
