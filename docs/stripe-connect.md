# Stripe Connect — the USD rails, ready to arm

The deal engine already models the money (fee, splits, statuses).
Stripe Connect makes it real: the buyer pays by card, the provider
gets paid out to their bank, the platform fee splits off
automatically, and Stripe carries every license.

## Your setup (once, ~30 minutes)

1. **stripe.com → create account** — use the business identity
   (EIN, bank account for platform fees).
2. Dashboard → **Connect → Get started** → choose **Express**
   accounts (Stripe hosts provider onboarding + payouts; least
   code, least liability).
3. Collect two keys from Developers → API keys:
   - `pk_live_...` (publishable — goes in the site config)
   - `sk_live_...` (secret — **Supabase Edge Function secret only**,
     never the repo)
4. In Supabase: `supabase secrets set STRIPE_SK=sk_live_...`

## The flow (already matched to the deal engine)

```
deal signed → buyer taps "Pay by card"
  → Edge Function creates a Checkout Session:
      amount = terms.fee
      application_fee = platform's cut
      transfer to provider's Express account
  → Stripe hosts the payment page → webhook flips deal → paid
  → provider marks completed → the mint trigger pays M Tokens
```

Provider onboarding: the desk gets a "Set up payouts" button →
Edge Function creates an Express account link → provider finishes
on Stripe → their account id lands on the listing row
(`providers.stripe_acct`).

## The Edge Function (deploy when keys exist)

```ts
// supabase/functions/pay-deal/index.ts
import Stripe from "npm:stripe";
const stripe = new Stripe(Deno.env.get("STRIPE_SK")!);

Deno.serve(async (req) => {
  const { deal_id, amount, provider_acct, title, fee_pct = 8 } = await req.json();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "usd",
      product_data: { name: title }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
    payment_intent_data: {
      application_fee_amount: Math.round(amount * fee_pct),
      transfer_data: { destination: provider_acct },
    },
    metadata: { deal_id },
    success_url: "https://streetcreditbureau.com/market.html#yours",
    cancel_url: "https://streetcreditbureau.com/market.html#yours",
  });
  return Response.json({ url: session.url });
});
```

Plus a `stripe-webhook` function that verifies the signature and
sets the deal's status to `paid` with the service role — ask and
it gets written the day the account exists.

## Why Express and not our own custody

Stripe holds the money-transmitter licenses, runs KYC on every
provider, files the 1099s, and eats the fraud liability. The
platform keeps the experience, the fee, and the data — which is
exactly the leverage that matters. Custody can come later through
Treasury when the volume argues for it.
