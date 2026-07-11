# THE GOLD SHELF — strategy

## THE GOLDEN STANDARD (the filter, not a preference)
**Gold in to the house, value out from the house.** No partner ever holds,
receives, or redeems E⤴. Any platform whose model requires them to touch our
credit is disqualified before evaluation. Everything below passes.

## Lane 1 — Affiliate networks (EXECUTING NOW · $0 cost, revenue-positive)
Join as a publisher; partner discounts stock the shelf; members burn gold for
the code; the house earns the commission.

| Network | Why | Apply |
|---|---|---|
| ShareASale | easiest approval, thousands of SMB merchants | shareasale.com → publisher signup |
| Impact.com | the big brands, clean API for links/codes | impact.com → partnerships/publisher |
| CJ (Commission Junction) | deep retail catalog | cj.com → publisher |
| Awin / Rakuten | round out international + retail | later, volume-dependent |

Order: ShareASale first (days), Impact second. Site to list: the production
URL; audience: the association's members (creators, drivers, operators).
Approved merchant deals go straight into `data/gold-shelf.json` as
`status: "live"`, `fulfil: "code"`.

## Lane 2 — Reward payout APIs (READY, NOT MOVING YET)
Every one fits the standard: the house funds an account; a gold burn triggers
a payout from the house. Costs real dollars per redemption — price and cap
deliberately when armed.

| Platform | Cost shape | Catalog | Onboarding | Verdict |
|---|---|---|---|---|
| **Tremendous** | platform free; margin inside card rates; small fees on Visa/ACH | 1,000+ gift cards, prepaid Visa, ACH, PayPal | self-serve, API key same day | **first pick when we arm** |
| Tango Card | free-ish, volume pricing by negotiation | big brand catalog | sales-led, slower | second, at volume |
| Giftbit | credit-back on unclaimed cards | smaller | self-serve | niche fallback |
| Runa (WeGift) | wholesale discounts on cards | strongest international | sales-led | when members go global |

Decision rule: **arm Tremendous first** (self-serve, no platform fee, instant
API) once shelf revenue exists to fund redemptions; renegotiate into Tango or
Runa when monthly redemption volume justifies wholesale terms.

System readiness (already built): the shelf schema carries
`fulfil: "house" | "code" | "payout"` — payout offers slot in with zero
rework; redemptions already burn through `eup_pay` to the house, so the
funding math is one ledger query.

## Legal posture (unchanged)
Gold stays promotional credit: no cash value, redeemable only with the house.
Partner discounts and payouts are HOUSE inventory bought with house money —
the member's gold never crosses the wall.
