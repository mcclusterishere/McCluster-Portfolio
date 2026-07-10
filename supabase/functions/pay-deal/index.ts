// PAY-DEAL — creates the Stripe Checkout for a signed deal.
// ALL-IN PRICING: the buyer sees ONE line, one price. The seller's
// ask (net) is grossed up by 9.5% into that price; the platform's
// cut is carved out as the application fee on the back end. No fee
// lines on any receipt — institutions can't pay surcharges, and
// nobody's receipt should read like one. See docs/fees.md.
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SK")!);
// All-in rate baked into the buyer's one price. Raised from 9.5% to 10%
// to fund the equity pool: the buyer carries half a point more, the house
// gives up half a point of its own margin, and together that funds the
// mandatory 1% draw every transaction makes into the pool. Processing and
// the platform's margin come out of the remaining ~9%.
const RATE = 0.10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors() });
  }
  try {
    const { deal_id, amount, price, provider_acct, title } = await req.json();
    if (!deal_id || !amount || !title) throw new Error("deal_id, amount, title required");

    const net = Math.round(Number(amount) * 100);              // the seller's money, cents
    let total = Math.round(Number(price || 0) * 100);          // the buyer's one price, cents
    if (!total || total < net) total = Math.round(net * (1 + RATE));
    const cut = total - net;                                   // the platform's, back-end only

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { price_data: { currency: "usd", product_data: { name: title }, unit_amount: total }, quantity: 1 },
      ],
      // provider connected? their net arrives whole: full charge minus
      // the application fee (= the platform's cut) lands on their account
      ...(provider_acct
        ? { payment_intent_data: { application_fee_amount: cut, transfer_data: { destination: provider_acct } } }
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
