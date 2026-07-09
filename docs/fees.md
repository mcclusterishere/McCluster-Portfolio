# The fee policy — who eats what

One sentence: **the customer pays the platform AND the processing;
the provider keeps their whole rate and gets an instant payout on
the house every time they make a sale.**

## Money in (charges)

| Line | Who pays | How much |
|---|---|---|
| Provider's rate | customer | 100% → provider |
| Platform fee | **customer, on top** | 8% of the rate (`FEE_PCT` in `supabase/functions/pay-deal`) |
| Processing | **customer, on top** | 1.5% of the rate (`PROC_PCT`) — itemized at checkout |
| Card processing (Stripe's ~2.9% + 30¢) | platform, out of the 9.5% it collected | Stripe's cut |

The provider sees their full rate. The customer sees rate +
platform fee + processing at checkout, all itemized. The 1.5%
processing line exists for one reason: it pre-funds the instant
payout below, so the platform can promise it on every sale.

## Money out (payouts, once Stripe Connect Express is live)

| Payout | Cost to provider | Who eats the fee |
|---|---|---|
| Standard (1–2 business days) | **free, always** | nobody — Stripe standard payouts are free |
| Instant (minutes, to debit card) | **free after every sale** — each paid deal banks one platform-paid instant | platform (pre-funded by the customer's 1.5% processing line) |
| Instants with no banked sale behind them | 1.5% pass-through | the provider, at cost — no markup |

The perk is per SALE, not per week: every deal that reaches `paid`
credits the provider one instant payout on the house
(`payout_perks` — lands with the Connect build, keyed to deal ids
instead of calendar weeks). Sell three times, cash out instantly
three times. The loyalty mechanic is now the sales mechanic.

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
