# stripe-webhook — the receipt writer

When a buyer's card clears, Stripe pings this function. It verifies the
signature (so only real Stripe events count), then writes the receipt to
the record: one row in `deal_payments` and the deal flipped to `paid`.
That's what turns a card charge into a fact on Our Street — the equity
draw fires, and when the provider later marks the work `completed`, the
E⤴ mint pays out. Money still *moves* without this (pay-deal already
routes the card to the provider's bank); this is what makes the platform
*know* it moved.

## Deploy (Supabase dashboard)

1. **Stripe → Developers → Webhooks → Add endpoint.**
   - URL: `https://fxbkvcrfbbcmrrupdcjt.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed` (that's the only one this needs).
   - Save → copy the **Signing secret** (`whsec_...`).
2. **Supabase → Edge Functions → Deploy a new function** → name it exactly
   `stripe-webhook`. Delete the template, paste the code below.
3. **Enforce JWT verification: OFF** — Stripe signs with its own header, not
   a Supabase token; leave JWT on and every event bounces at the gate.
4. **Add the secret:** Edge Functions → stripe-webhook → Secrets →
   `STRIPE_WEBHOOK_SECRET` = the `whsec_...` from step 1. `STRIPE_SK` and the
   service role are already in the vault.
5. Deploy. Back in Stripe, hit **Send test webhook → checkout.session.completed**
   — it should return 200, and preflight's "stripe-webhook" row goes green.

Requires `docs/equity-schema.sql` (the `deal_payments` table) already pasted.

## index.ts

```ts
// STRIPE-WEBHOOK — the receipt writer. Verifies Stripe's signature, then
// on a completed checkout writes deal_payments (idempotent on the session
// id) and flips the deal to 'paid'. Service role only; no member touches it.
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SK")!);
const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SB = Deno.env.get("SUPABASE_URL")!;
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SRV, Authorization: "Bearer " + SRV, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();               // RAW body — needed for the signature
  let event: Stripe.Event;
  try {
    // async variant: Deno verifies with SubtleCrypto
    event = await stripe.webhooks.constructEventAsync(body, sig, SECRET);
  } catch (e) {
    return new Response("bad signature: " + (e?.message || e), { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const dealId = s.metadata?.deal_id;
    const gross = (s.amount_total || 0) / 100;   // dollars the buyer actually paid
    if (dealId && gross > 0) {
      // 1 · the receipt — ref = session id makes it one row per capture
      await fetch(SB + "/rest/v1/deal_payments", {
        method: "POST",
        headers: { ...H, Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ deal_id: dealId, gross, ref: s.id }),
      });
      // 2 · the record — flip to paid, but never disturb a closed deal
      await fetch(
        SB + "/rest/v1/deals?id=eq." + dealId + "&status=not.in.(completed,declined)",
        { method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
          body: JSON.stringify({ status: "paid" }) },
      );
    }
  }
  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
```

## What it does NOT do (on purpose)

- It never mints E⤴. The mint fires only when the provider marks the deal
  `completed` (the work is done) — `mint_on_completion` in equity-schema.sql
  reads the captured total then. Paid ≠ delivered.
- It never holds money. Destination charges already routed the provider's
  full rate to their own Stripe balance at checkout; this only records it.
