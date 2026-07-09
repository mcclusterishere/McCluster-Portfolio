# Street Credit Bureau — the Stripe App

The SCB score, installed inside any merchant's Stripe Dashboard.
Reads their own charges/disputes/tenure (permission-scoped, nothing
leaves the dashboard — the CSP declares no external connections),
renders the 300–850 dial with the five books and the next-move
coaching, and offers one door: open your Community Word book by
claiming a page on M Network.

Two views:
- **BureauHome** (`stripe.dashboard.home.overview`) — the dial, the
  books, the coaching, the M Network door.
- **PaymentBureau** (`stripe.dashboard.payment.detail`) — the stamp:
  what this specific payment did to the books.

The engine (`src/bureau.ts`) is the platform's street-score model
re-grounded in Stripe data. Same laws: empty books start neutral-low,
the weakest book coaches, the score belongs to the merchant.

## Ship it (run on a machine with the Stripe CLI; iPad won't cut it)

```bash
# 1 · the CLI + the apps plugin
brew install stripe/stripe-cli/stripe     # or: https://docs.stripe.com/stripe-cli
stripe login                              # browser auth into the SCB account

# 2 · from this folder
cd stripe-app
npm install

# 3 · preview it LIVE inside your own dashboard
stripe apps start

# 4 · upload to the account (private install)
stripe apps upload
```

Marketplace listing (the distribution play) comes after: App listing
form + Stripe's review. The pitch: financial-inclusion scoring for
small merchants, from a registered nonprofit, with a published white
paper — assets already live at /scb-paper.html.

## Before upload, verify against current docs
- Viewport names (`stripe.dashboard.home.overview`,
  `stripe.dashboard.payment.detail`) against
  https://docs.stripe.com/stripe-apps/reference/viewports
- Manifest fields with `stripe apps validate` (the CLI's own check)
- An `icon.png` (300×300) is required — use the M favicon emblem.

## The line we hold
The score is shown to the merchant about themselves — a personal
record, coaching, never consumer reporting. The day anyone wants
scores shown to lenders, that's an FCRA conversation with counsel
BEFORE a line of code.
