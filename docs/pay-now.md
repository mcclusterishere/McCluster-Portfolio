# pay-now — the shareable pay widget's rail

`pay.html?to=<slug>` is a clean, single-purpose payment page a creator can drop
in an Instagram bio or text to a client. It shows their name, craft, and price,
and one button. This is the function behind that button.

It's the direct-pay cousin of `pay-deal`: no deal, no login required for the
payer. The caller (the widget) POSTs a slug + amount; the function looks the
creator up **server-side** (service role), confirms they're truly onboarded to
Stripe (`charges_enabled`), and opens a Checkout Session that pays them by
**destination charge** — the creator's full rate lands in their bank, the
platform fee is carved off automatically, nobody's money is ever held.

**Apple Pay and Google Pay ride on this for free:** Stripe Checkout shows the
Apple Pay sheet on iOS Safari and Google Pay on Android Chrome automatically —
no embedded button, no Apple domain registration needed.

## The gate (paid-direct only)

The widget pays the **named creator directly**. If a slug has no `stripe_acct`,
or `charges_enabled` is not `true`, the function returns `409 {error:"not_live"}`
and the widget shows "finishing payout setup" instead of charging anyone. A
creator becomes payable the moment they finish the **connect-onboard** door
(`docs/connect-onboard.md`). The two `house` slugs (`mccluster`,
`equity-uprise`) are always payable — they collect on the platform's own account.

## Deploy (Supabase dashboard, same drill as pay-deal)

1. Edge Functions → **Deploy a new function** → name it exactly `pay-now`.
2. Delete the template `index.ts`, paste the code below, no extra files.
3. **Enforce JWT verification: OFF** — the payer is a walk-up client with no
   account; the function itself resolves the payee and never trusts a
   client-supplied Stripe account id.
4. Deploy. No new secrets: it uses `STRIPE_SK` (already set) plus the
   platform-injected `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Requires the columns from `docs/payments-schema.sql` (`stripe_acct`,
`charges_enabled`) — already in `docs/live-engine.sql`.

## index.ts

```ts
// PAY-NOW — the shareable pay widget's rail. A walk-up client pays a
// named creator directly. The function resolves the payee server-side
// (service role), refuses anyone who isn't truly Stripe-onboarded, and
// opens a Checkout Session as a destination charge. Apple Pay / Google
// Pay appear automatically on the hosted checkout.
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SK")!);
const SB = Deno.env.get("SUPABASE_URL")!;
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://streetcreditbureau.com";
const HOUSE: Record<string, boolean> = { mccluster: true, "equity-uprise": true };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const { slug, amount, title, fee_pct = 8 } = await req.json().catch(() => ({}));
  const s = String(slug || "").toLowerCase().trim();
  const gross = Math.max(0, Number(amount) || 0);
  if (!s || gross < 1) return json({ error: "bad_request" }, 400);

  const house = !!HOUSE[s];
  let acct: string | null = null;

  if (!house) {
    // resolve the payee server-side — never trust a client-supplied acct id
    const rowRes = await fetch(
      `${SB}/rest/v1/providers?slug=eq.${encodeURIComponent(s)}&select=stripe_acct,charges_enabled&limit=1`,
      { headers: { apikey: SRV, Authorization: `Bearer ${SRV}` } },
    );
    const rows = await rowRes.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !row.stripe_acct || row.charges_enabled !== true) {
      return json({ error: "not_live" }, 409);
    }
    acct = row.stripe_acct as string;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: String(title || "Payment").slice(0, 250) },
        unit_amount: Math.round(gross * 100),
      },
      quantity: 1,
    }],
    // house collects on the platform's own account; a creator is a destination charge
    ...(acct ? {
      payment_intent_data: {
        application_fee_amount: Math.round(gross * fee_pct),
        transfer_data: { destination: acct },
      },
    } : {}),
    metadata: { slug: s, kind: "direct" },
    success_url: `${SITE}/pay.html?to=${encodeURIComponent(s)}&done=1`,
    cancel_url: `${SITE}/pay.html?to=${encodeURIComponent(s)}`,
  });

  return json({ url: session.url });
});
```

## Notes

- **Receipts / the ledger.** Stripe emails the payer a receipt automatically.
  If you later want direct pays to write into the platform's own books, extend
  `stripe-webhook` to handle `checkout.session.completed` where
  `metadata.kind === "direct"` (it currently keys off `deal_id`). Not required
  for the creator to get paid.
- **Fee.** `fee_pct` defaults to 8 to match `pay-deal`; the widget already shows
  the buyer the all-in price via `MCC_STRIPE.quote()`, so the creator receives
  the rate they named.
