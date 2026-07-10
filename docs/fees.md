# The fee policy — one price, split on the back end

One sentence: **the buyer sees exactly one number; the seller names
what they want to receive and it arrives whole; the platform's
10% is built into the price and carved out behind the curtain —
1% of which is the mandatory draw into the equity pool.**

## Why all-in pricing (not fee lines)

Institutions — counties included — can't pay payment options that
surcharge them, and a receipt with "Platform fee" and "Processing"
lines reads like one. Several states regulate card-fee pass-through
as a visible line at all. All-in pricing sidesteps every bit of it:
the invoice price IS the price. Economically nothing moved — the
same 9.5% spread exists — it just lives inside the number instead
of underneath it.

## The math (RATE = 0.10 everywhere)

The rate moved from 9.5% to 10% to fund the equity pool: the buyer
carries **+0.5%**, the house gives up **−0.5%** of its own margin, and
together those fund the **1% equity draw** on every transaction. Nobody
takes a full-point hit; the pool is real money, withheld at the source.

- Seller asks **N** → buyer's one price **P = N × 1.10** (rounded to cents).
- Buyer-initiated (keypad "Pay"): the punched number IS **P**;
  the seller receives **N = P ÷ 1.10**.
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
| The One Percent Fund | 1% of every completed deal accrues to the community chest — **taken from the platform's own cut**, never from the buyer's price or the seller's net (docs/fund-schema.sql trigger) |

So the working split of the 9.5% spread: ~2.9%+30¢ to Stripe,
1% of the deal to the Fund, the remainder is the house's margin.
The buyer still sees ONE number; the seller still receives their
ask whole. The Fund changes where the house's own money goes —
not what anyone else pays or receives.

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
