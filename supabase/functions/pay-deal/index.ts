// PAY-DEAL — creates the Stripe Checkout for a signed deal.
// The buyer eats the platform fee (added on top); the provider's
// rate arrives whole. Deploy: Supabase → Edge Functions → paste,
// with secrets STRIPE_SK set. See docs/fees.md for the fee policy.
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SK")!);
const FEE_PCT = 0.08;   // the platform's cut — the CUSTOMER pays it on top
const PROC_PCT = 0.015; // processing, also the customer's — funds the per-sale instant payout

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors() });
  }
  try {
    const { deal_id, amount, provider_acct, title } = await req.json();
    if (!deal_id || !amount || !title) throw new Error("deal_id, amount, title required");

    const base = Math.round(Number(amount) * 100);         // the provider's money
    const fee = Math.round(base * FEE_PCT);                // the customer's platform fee
    const proc = Math.round(base * PROC_PCT);              // the customer's processing line

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { price_data: { currency: "usd", product_data: { name: title }, unit_amount: base }, quantity: 1 },
        { price_data: { currency: "usd", product_data: { name: "Platform fee" }, unit_amount: fee }, quantity: 1 },
        { price_data: { currency: "usd", product_data: { name: "Processing" }, unit_amount: proc }, quantity: 1 },
      ],
      // provider connected? route their money straight through
      ...(provider_acct
        ? { payment_intent_data: { application_fee_amount: fee + proc, transfer_data: { destination: provider_acct } } }
        : {}),
      metadata: { deal_id },
      success_url: "https://mcclusterishere.github.io/McCluster-Portfolio/market.html#yours",
      cancel_url: "https://mcclusterishere.github.io/McCluster-Portfolio/market.html#yours",
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 400);
  }
});

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}
