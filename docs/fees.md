# The fee policy — who eats what

One sentence: **the customer pays the platform; the provider keeps
their whole rate; the platform eats the payout costs it promises.**

## Money in (charges)

| Line | Who pays | How much |
|---|---|---|
| Provider's rate | customer | 100% → provider |
| Platform fee | **customer, on top** | 8% of the rate (`FEE_PCT` in `supabase/functions/pay-deal`) |
| Card processing | platform (inside its 8%) | ~2.9% + 30¢, Stripe's cut |

The provider sees their full rate. The customer sees rate + platform
fee at checkout, itemized. The platform's 8% covers processing,
the free instant transfers below, and the margin.

## Money out (payouts, once Stripe Connect Express is live)

| Payout | Cost to provider | Who eats the fee |
|---|---|---|
| Standard (1–2 business days) | **free, always** | nobody — Stripe standard payouts are free |
| Instant (minutes, to debit card) | **1 free per week** | platform eats Stripe's ~1.5% for that one |
| Extra instants in the same week | 1.5% pass-through | the provider, at cost — no markup |

The free weekly instant is tracked per provider per calendar week
(`payout_perks` — lands with the Connect build). It's the loyalty
mechanic: the platform visibly pays for something real, weekly.

## Bank linking

Providers link banks through **Stripe Express onboarding** (Stripe
runs KYC and stores the account; the platform never touches bank
credentials). Customers pay by card/Apple Pay/Google Pay; ACH debit
as a cheaper rail can come later via Stripe's `us_bank_account`
payment method — same checkout, lower processing, slower settle.

## The self-marking money (what's wired)

- **Stripe rail**: `checkout.session.completed` webhook flips the
  deal to `paid` automatically. No buttons.
- **Square rail (today)**: `payment.updated` webhook matches the
  payment note against the deal id or exact title + amount and
  flips it. The M Pay/Market "Pay by card — Square" doors now put
  the deal id in the copy so payers paste it into the note.
- Unmatched money stays human: "Mark paid" remains as the fallback,
  never the routine.
