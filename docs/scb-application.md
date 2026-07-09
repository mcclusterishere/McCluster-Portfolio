# From Blueprint to Platform — the SCB paper, applied

Companion document to *"Street Credit Bureau — Alternative Credit
Ecosystems: Models, Technologies, and a Blueprint"* (McCluster Corp).
The paper surveys how the world scores trust outside the FICO wall
and lays out the SCB blueprint. This document maps each prescription
onto the M Network build — what's live, where it lives, what waits.

| The paper prescribes | The platform built | Where | Status |
|---|---|---|---|
| Alternative payment data (rent, utility, phone) as credit signal | Deals that reach paid/completed; signed→done inside 30 days reads on-time | Street Score "Payment history" book (35%) | **Live** |
| Cash-flow underwriting over credit history | How many of the last 6 months saw deal money move, and volume | "Cash flow" book (20%) | **Live** |
| Community reputation & peer accountability (Grameen-style) | Client stars (deal-verified, ~3× weight) + peer stars, volume on a square root | Ratings system → "Community word" book (20%) | **Live** |
| Psychometric / gamified behavioral layer | The duality quiz, the grind (streaks, shadow board), the PSMF civic ride | "Behavior" book (15%) + marker registry | **Live** |
| Group membership in good standing | Listing live + fully dressed + tenure on the floor | "Tenure & seat" book (10%) | **Live** |
| An open ML scoring engine instead of proprietary black boxes | Two-model law: M-Grind (staging) trains M-Worth (live); Street Score composes the books — all code readable in the repo | js/streetscore.js · js/mworth.js · js/mgrind.js | **Live** |
| Mobile-first data capture | Device-keyed grind, every surface a sensor, offline-capable app | js/mgrind.js + the PWA | **Live** |
| Score transparency & coaching, not judgment | The dial shows its five books and weights; the weakest book speaks as "the next move" | The SCB room (market → 🏛 SCB) | **Live** |
| No record ≠ bad record (inclusion first) | Empty books start neutral-low, never zero | streetscore.js design rule | **Live** |
| Community institutions as economic units (VSLA pattern) | Programs trade on the floor; the crowd moves their price | providers.json `entity: program` ($EU) | **Live** |
| A community token for incentives (the paper's SCT) | M Token — closed-loop platform credit, minted only by the deal-completion trigger | mtoken ledger + docs/mtoken-schema.sql | **Live (closed loop)** |
| Everyday individuals as lenders (StreetFund / P2P) | Scoring engine ready to underwrite; lending is regulated in every US state | — | **Deferred to counsel** |
| Token with governance / value share | Closed-loop only until the attorney conversation | — | **Deferred to counsel** |
| On-chain attestations, smart-contract credit | Not before the token questions settle | — | **Deferred** |
| Open banking / utility data import (Plaid-class) | Real-world payment histories joining the books | — | **Roadmap** |
| Traditional bureau hybrid (Experian Boost pattern) | — | — | **Roadmap** |
| Cross-platform reach | Nightly stats snapshot (artists + artist_daily_stats live in DB, Action pending API keys) | docs/songstats-schema.sql | **Staged** |

## The one deliberate divergence

The paper writes toward a **bureau that serves lenders**. The build
inverts it: **the person owns the record** — the dial is owner-only,
computed client-side from rows RLS locks to them, and the platform
never sells or reports it. That inversion is what keeps SCB on the
right side of consumer-reporting law while the lending chapter waits
for counsel — and it's also the brand: *your street credit, kept by
you, shown to who you choose.*

## What the platform adds that the paper couldn't

The paper assumes signals must be imported. The M Network *generates*
them: the marketplace witnesses deals firsthand, the Heat counter
witnesses plays, the ratings system witnesses the community's word,
the grind witnesses showing up. First-party witnessed data is cleaner
than any scraped alternative-data feed — the moat is that the bureau
and the economy live in the same building.
