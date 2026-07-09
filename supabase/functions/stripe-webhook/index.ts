// STRIPE-WEBHOOK — the money marks itself. When Checkout completes,
// the deal it carries flips to 'paid' with the service role; nobody
// taps "Mark paid" for card money ever again. On completion the
// database's mint trigger then pays the M Tokens.
// Secrets: STRIPE_SK, STRIPE_WEBHOOK_SECRET, SB_URL, SB_SERVICE_KEY.
// Stripe dashboard → Webhooks → endpoint = this function's URL,
// event: checkout.session.completed.
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SK")!);
const WH = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WH);
  } catch (e) {
    return new Response("bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const dealId = session.metadata?.deal_id;
    if (dealId) {
      const r = await fetch(`${SB_URL}/rest/v1/deals?id=eq.${dealId}`, {
        method: "PATCH",
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ status: "paid" }),
      });
      if (!r.ok) console.error("deal flip failed", dealId, r.status);
    }
  }
  return new Response("ok");
});
