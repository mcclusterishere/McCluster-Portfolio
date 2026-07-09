# The fee policy — one price, split on the back end

One sentence: **the buyer sees exactly one number; the seller names
what they want to receive and it arrives whole; the platform's
9.5% is built into the price and carved out behind the curtain.**

## Why all-in pricing (not fee lines)

Institutions — counties included — can't pay payment options that
surcharge them, and a receipt with "Platform fee" and "Processing"
lines reads like one. Several states regulate card-fee pass-through
as a visible line at all. All-in pricing sidesteps every bit of it:
the invoice price IS the price. Economically nothing moved — the
same 9.5% spread exists — it just lives inside the number instead
of underneath it.

## The math (RATE = 0.095 everywhere)

- Seller asks **N** → buyer's one price **P = N × 1.095** (rounded to cents).
- Buyer-initiated (keypad "Pay"): the punched number IS **P**;
  the seller receives **N = P ÷ 1.095**.
- Single source of truth in code: `MCC_STRIPE.quote(net)` and
  `MCC_STRIPE.net(price)` in `js/payments.js`; `RATE` in
  `supabase/functions/pay-deal` (one line item at `P`,
  `application_fee_amount = P − N`).
- Deal terms carry both: `terms.fee` = the seller's net,
  `terms.price` = the buyer's one number. Payer-side UI shows
  `price`; payee-side UI shows `fee`.

## Money in (charges)

| | Amount |
|---|---|
| Buyer pays (one line, one price) | P |
| Seller receives (destination charge, whole) | N |
| Platform keeps (back-end application fee) | P − N (9.5% of N) |
| Stripe's ~2.9% + 30¢ | out of the platform's cut |

## Money out (payouts, once Stripe Connect Express is live)

| Payout | Cost to provider | Who eats the fee |
|---|---|---|
| Standard (1–2 business days) | **free, always** | nobody — Stripe standard payouts are free |
| Instant (minutes, to debit card) | **free after every sale** — each paid deal banks one platform-paid instant | platform (pre-funded by the 1.5% share of the built-in spread) |
| Instants with no banked sale behind them | 1.5% pass-through | the provider, at cost — no markup |

The perk is per SALE, not per week: every deal that reaches `paid`
credits the provider one instant payout on the house.

## Bank linking

Providers link banks through **Stripe Express onboarding** (Stripe
runs KYC and stores the account; the platform never touches bank
credentials). Buyers pay by card/Apple Pay/Google Pay; ACH debit
as a cheaper rail can come later via Stripe's `us_bank_account`
payment method — same checkout, lower processing, slower settle —
and it's the rail institutional buyers (counties) will prefer.

## The self-marking money (what's wired)

- **Stripe rail**: `checkout.session.completed` webhook flips the
  deal to `paid` automatically. No buttons.
- Money that moves outside the app stays human: the payment note +
  "Mark paid — money moved outside the app" remains as the fallback,
  never the routine.
