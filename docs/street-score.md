# The Street Score — SCB's model, running on the platform

Implementation of the Street Credit Bureau paper ("Alternative
Credit Ecosystems: Models, Technologies, and a Blueprint") on the
M platform's own witnessed data. Engine: `js/streetscore.js`.
Shown on the profile (owner-only), snapshotted to the admin's
Grind board, fed by the grind and the ratings systems.

## Paper variable → platform signal

| The paper prescribes | The platform witnesses | Book | Weight |
|---|---|---|---|
| Rent/utility/phone payment history | Deals that reached paid/completed; signed→done inside 30 days reads on-time | **Payment history** | 35% |
| Cash-flow underwriting (income consistency) | How many of the last 6 months saw deal money move + volume | **Cash flow** | 20% |
| Community endorsements, rideshare-style ratings | Client stars (deal-verified, ~3× weight) + peer stars, volume on a square root | **Community word** | 20% |
| Psychometric / behavioral insights | The grind: engagement score, streaks, shadow-task depth, idle penalty (duality quiz can plug in later) | **Behavior** | 15% |
| Group membership in good standing | Listing live + fully dressed + time on the platform | **Tenure & seat** | 10% |

`score = 300 + 550 × Σ(weight × book)` — the familiar 300–850 dial.
Bands: 760+ Excellent · 670+ Good · 580+ Building · else Starting.

Design choices from the paper honored in code:
- **No record ≠ bad record**: empty books start neutral-low (0.35
  payment, 0.3 community), never zero — inclusion is the mission.
- **Coaching over judgment**: the card always shows the "next move"
  — the weakest weighted book's own advice, credit-builder style.
- **Privacy**: computed only from RLS-guarded books; only the owner
  sees their score. The admin board sees the number for synced
  accounts (the bureau function), never the public floor.

## What waits on the roadmap (from the paper, deliberately deferred)

- **P2P lending (StreetFund)**: lending is a regulated activity in
  every US state — this needs the attorney conversation and likely
  a partner (existing CDFI or lending-as-a-service) before a single
  loan. The scoring engine is ready to underwrite when that day comes.
- **Open banking / utility data import** (Plaid-class): real-world
  payment histories joining the platform books.
- **Traditional bureau hybrid** (Experian Boost pattern).
- **On-chain attestations / trustlines**: after the token questions
  are settled with counsel.
