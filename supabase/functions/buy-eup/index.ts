// BUY-EUP — the re-up door. A signed-in member buys E-Up credit with
// a card: dollars land on the platform's Stripe (the Equity Reserve's
// front pocket), the webhook mints the credit 1:1. The peg is sacred:
// $1 in = 1 E⤴ minted, the reserve eats the card fee. Purchased credit
// spends anywhere in the loop and never cashes out — that door is for
// EARNED credit only. Deploy like the others: exact name buy-eup,
// JWT verification OFF (it verifies callers itself via GoTrue).
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SK")!);
const SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = "https://mcclusterishere.github.io/McCluster-Portfolio/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors() });
  }
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "signed out" }, 401);
    const who = await fetch(SB + "/auth/v1/user", {
      headers: { apikey: ANON, Authorization: "Bearer " + jwt },
    });
    if (!who.ok) return json({ error: "signed out" }, 401);
    const uid = (await who.json()).id;
    if (!uid) return json({ error: "signed out" }, 401);

    const { amount } = await req.json();
    const amt = Math.round(Number(amount || 0) * 100) / 100;
    if (!(amt >= 5 && amt <= 1000)) return json({ error: "re-ups run 5 to 1,000" }, 400);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "E-Up credit — " + amt.toFixed(2) + " E⤴" },
            unit_amount: Math.round(amt * 100),
          },
          quantity: 1,
        },
      ],
      metadata: { kind: "eup", uid, amount: String(amt) },
      success_url: SITE + "market.html#yours",
      cancel_url: SITE + "market.html#yours",
    });
    return json({ url: session.url });
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
