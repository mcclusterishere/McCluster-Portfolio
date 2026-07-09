# connect-onboard — the "Get paid by card" door

Every listing owner gets a door on their desk that opens Stripe Express
onboarding. Stripe hosts the whole flow (identity, bank account, compliance);
the platform never sees or stores anything but the resulting `acct_...` id.
Once Stripe verifies them (`charges_enabled`), their deals grow the
**Pay by card — checkout** button and money flows as a destination charge:
buyer pays, provider's full rate lands in their bank, the platform's
8% + 1.5% is carved off automatically. Nobody's money is ever held.

## Deploy (Supabase dashboard, same drill as pay-deal)

1. Edge Functions → **Deploy a new function** → name, exactly:
   `connect-onboard`
2. Delete the template in `index.ts`, paste the code below, no extra files.
3. **Enforce JWT verification: OFF** — the function verifies the caller's
   token itself against GoTrue (a signature-checked lookup, stronger than
   the gateway's decode) because the browser's CORS preflight carries no
   token and would bounce at the gateway.
4. Deploy. No new secrets: it uses `STRIPE_SK` (already in the vault) plus
   the platform-injected `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY`.

Requires the columns from `docs/payments-schema.sql` (with the column-level
revoke, only the service role can write `stripe_acct`/`charges_enabled` —
an owner can never stamp their own rail).

## index.ts

```ts
// CONNECT-ONBOARD — opens the Stripe Express door for a listing owner.
// The caller proves who they are (GoTrue verifies the token signature),
// the function finds THEIR listing, creates the Express account once,
// and hands back a Stripe-hosted onboarding link. When Stripe says
// charges_enabled, the row is stamped and the card rail goes live.
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SK")!);
const SB = Deno.env.get("SUPABASE_URL")!;
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = "https://mcclusterishere.github.io/McCluster-Portfolio/";
const H = { apikey: SRV, Authorization: "Bearer " + SRV, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors() });
  }
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "signed out" }, 401);

    // the token must be REAL — GoTrue checks the signature, not us
    const who = await fetch(SB + "/auth/v1/user", {
      headers: { apikey: ANON, Authorization: "Bearer " + jwt },
    });
    if (!who.ok) return json({ error: "signed out" }, 401);
    const uid = (await who.json()).id;
    if (!uid) return json({ error: "signed out" }, 401);

    const rows = await fetch(
      SB + "/rest/v1/providers?owner=eq." + uid + "&select=id,slug,stripe_acct&limit=1",
      { headers: H },
    ).then((r) => r.json());
    const row = rows && rows[0];
    if (!row) return json({ error: "no listing" }, 404);

    let acct = row.stripe_acct;
    if (acct) {
      const a = await stripe.accounts.retrieve(acct);
      if (a.charges_enabled) {
        await fetch(SB + "/rest/v1/providers?id=eq." + row.id, {
          method: "PATCH", headers: H,
          body: JSON.stringify({ charges_enabled: true }),
        });
        return json({ status: "live" });
      }
    } else {
      const a = await stripe.accounts.create({ type: "express" });
      acct = a.id;
      await fetch(SB + "/rest/v1/providers?id=eq." + row.id, {
        method: "PATCH", headers: H,
        body: JSON.stringify({ stripe_acct: acct }),
      });
    }

    const link = await stripe.accountLinks.create({
      account: acct,
      type: "account_onboarding",
      refresh_url: SITE + "market.html#yours",
      return_url: SITE + "market.html#yours",
    });
    return json({ status: row.stripe_acct ? "resume" : "started", url: link.url });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 400);
  }
});

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}
```

## Later upgrade

Subscribe the existing `stripe-webhook` endpoint to `account.updated` and
stamp `charges_enabled` the moment Stripe flips it, instead of on the next
desk visit. Not needed for launch — the desk re-checks on boot whenever an
account is mid-onboarding.
