# Income Flows — What's Wired, What It Pays, What's Next

**Owner:** Matthew McCluster · July 2026
**Rule of the house:** everything network runs under the Equity Uprise nonprofit
(workforce-development framing); personal commercial work (builds, the Limited
Offer, day rates) stays McCluster Corp. Rail: Stripe going forward; live Square
links stay until replaced.

---

## 1. Flows that are LIVE and can take money today

| Flow | Where | Rail | State |
|---|---|---|---|
| Song donations ("Donate & own it") | 6 song pages | Square links | **LIVE** |
| Mission fund ("Support the Mission") | Hero · footer · Equity Uprise · Heal the 3 | Square link | **LIVE** |
| Limited Offer — $14,400/yr (or $1,992/mo) | offer.html + home teaser + 360 bag pin | Claim email → invoice | **LIVE** (1 of 3 claimed) |
| Web builds — $10k / $14–24k / $25k+ | book-web.html, hire.html | Quote email | **LIVE** |
| Photo & video day booking | book-photo.html, book-video.html | Booking email | **LIVE** |
| Vaunt referral | cockpit pin, universe page, song page | Vaunt pays the house | **LIVE** |

## 2. Flows built and WAITING ON A LINK (paste-in, zero code)

| Flow | Slot in js/payments.js | What to create in Stripe |
|---|---|---|
| Subscribe to McCluster | `subscribe` | Recurring Payment Link |
| The Network Tithe (10%) | `tithe` | One-time, customer-sets-price |
| Member residual giving | `membership` | Recurring, customer-sets-price |
| $20 Registry Walkthrough | `idguide` | One-time $20 |

## 3. Flows designed and waiting on OPERATIONS

- **Marketplace bookings** — directory + booking sheet + Talent inbox all live;
  money moves off-platform (provider collects), tithe on honor. First proving
  run: Laire or a Decibel session.
- **The Equity path (We Bet On You)** — provider keeps 100% of their rate,
  network price is higher, the spread is the network's equity. Needs: Stripe
  Connect + the legal pass on client-facing language before first enrollment.
- **Deals with fees** — the Collab Room records signed fees; the money itself
  still moves person-to-person. Stripe Connect turns these into collected,
  receipted payments.
- **Spaces** — two properties + Decibel listable now via the space intake;
  booking agreements templated in the blueprint; access windows before locks.
- **Grants** — 501(c)(3) active, two proclamations, workforce story, and now
  receipts (Collab Room, packets, badges, cohort). Needs the 2-page program
  one-sheet.

## 4. The pitch that ties it together — "The Equity Part"

One sentence, true at every register: **"Part of every dollar you spend here
builds the next artist."** Providers pick a door — the **Tithe** (keep 100%,
give 10% on your honor) or the **Equity** (keep 100% of your rate; the network
price is higher and the spread funds your page, your ads, your development,
and the artist behind you). The on-device model (`MCC_MODEL.pitch()`) decides
which door a given visitor hears first: mission-leaning people meet the tithe,
builders meet the equity.

## 5. The M Stock — engagement that compounds into revenue

Every member's labor is tracked as a ticker (`js/mstock.js`): completed
bookings, signed deals, logged performances, and a live listing move it up;
quiet days drift it down against the market's pace. Dollars (signed deal fees)
are **private by default** — one tap shows, one tap hides. Why it makes money:
it gamifies exactly the actions that generate tithe/equity flow, it gives
providers a reason to complete bookings *on the record* instead of off it,
and public stock curves (opt-in) become social proof for the directory.

## 6. Enhancement queue, in order of expected dollars

1. Four Stripe links → every dead button converts (days).
2. Clients #2 and #3 via the Vaunt-universe loop → $28,800 (weeks).
3. Walkthrough product line: PRO-money guide, split-sheet playbook, Meta
   verification setup at $20–$49 (weeks).
4. First on-record marketplace loop + tithe (weeks).
5. Stripe Connect: collected payments, the equity spread, automated 1099s
   (month; after accountant review of UBIT).
6. Spaces with deposits (month).
7. Grant one-sheet → applications (quarter).
8. Public M Stock + proof strips ("X deals signed, Y shows reported") once
   the numbers are real (quarter).
