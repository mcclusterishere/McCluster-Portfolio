// STRIPE-WEBHOOK — the money marks itself. When Checkout completes,
// the deal it carries flips to 'paid' with the service role; nobody
// taps "Mark paid" for card money ever again. On completion the
// database's mint trigger then pays the M Tokens. When Stripe
// Identity verifies a member's government ID, the same wire stamps
// the verified mark on their listing.
// Secrets: STRIPE_SK, STRIPE_WEBHOOK_SECRET, SB_URL, SB_SERVICE_KEY.
// Stripe dashboard → Webhooks → endpoint = this function's URL,
// events: checkout.session.completed, identity.verification_session.verified.
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

  const H = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // a paid deal flips itself
    const dealId = session.metadata?.deal_id;
    if (dealId) {
      const r = await fetch(`${SB_URL}/rest/v1/deals?id=eq.${dealId}`, {
        method: "PATCH", headers: H, body: JSON.stringify({ status: "paid" }),
      });
      if (!r.ok) console.error("deal flip failed", dealId, r.status);

      // RECORD THE REAL MONEY. This row is the only thing that lets a
      // later completion mint credit, and it's the base for the 1%
      // equity draw. A browser can't forge it — only this webhook, on
      // the service role, writes deal_payments. Replay-safe on ref.
      const gross = Math.round(Number(session.amount_total || 0)) / 100;
      if (gross > 0) {
        const rp = await fetch(`${SB_URL}/rest/v1/deal_payments`, {
          method: "POST", headers: H,
          body: JSON.stringify({ deal_id: dealId, gross, ref: session.id }),
        });
        if (!rp.ok && rp.status !== 409) console.error("payment record failed", session.id, rp.status);
      }
    }

    // an E-Up purchase mints — dollars in the reserve first, credit second.
    // unique (owner, ref, reason) makes a replayed webhook mint nothing twice.
    if (session.metadata?.kind === "eup" && session.metadata?.uid) {
      const amt = Math.round(Number(session.metadata.amount || 0) * 100) / 100;
      if (amt > 0) {
        const r2 = await fetch(`${SB_URL}/rest/v1/mtoken_ledger`, {
          method: "POST", headers: H,
          body: JSON.stringify({
            owner: session.metadata.uid, delta: amt,
            reason: "purchase", ref: session.id,
          }),
        });
        if (!r2.ok && r2.status !== 409) console.error("mint failed", session.id, r2.status);
      }
    }
  }

  // Stripe Identity confirmed a real person behind the account: stamp
  // the verified mark on their listing. Stripe keeps the documents;
  // only the verdict and the verified name land here.
  if (event.type === "identity.verification_session.verified") {
    const vs = event.data.object as Stripe.Identity.VerificationSession;
    const uid = vs.metadata?.uid;
    if (uid) {
      const doc = vs.verified_outputs;
      const name = [doc?.first_name, doc?.last_name].filter(Boolean).join(" ") || null;
      const r = await fetch(`${SB_URL}/rest/v1/providers?owner=eq.${uid}`, {
        method: "PATCH", headers: H,
        body: JSON.stringify({ id_verified: true, verified_name: name }),
      });
      if (!r.ok) console.error("verify stamp failed", uid, r.status);
    }
  }
  return new Response("ok");
});
