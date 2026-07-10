// VERIFY-ID — the mark is earned by being real.
// A signed-in member asks for verification; Stripe Identity runs the
// hosted flow (government ID + selfie match) and holds the documents.
// The webhook stamps the verdict on the listing. Deploy like the
// others: exact name verify-id, JWT verification OFF (it verifies
// callers itself via GoTrue). Uses STRIPE_SK + platform-injected keys.
// Stripe side: enable Identity (Dashboard → Identity), and add the
// event identity.verification_session.verified to the webhook.
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

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      options: { document: { require_matching_selfie: true, require_live_capture: true } },
      metadata: { uid },
      return_url: SITE + "market.html#yours",
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
