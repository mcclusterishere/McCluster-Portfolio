// PUSH-SEND — the platform speaks to every pocket.
// Two jobs in one door:
//   {action:"pubkey"} — anyone: returns the platform's VAPID public
//     key, MINTING and vaulting the keypair in push_config on first
//     call (no key ever touches the repo, a browser, or a chat).
//   {action:"send", title, body, url, to?} — the admin only: pushes
//     to every banked subscription (or one member by ticker/slug),
//     pruning subscriptions the push services report dead.
// Deploy: exact name push-send, JWT verification OFF.
// Secrets: SB_URL, SB_SERVICE_KEY (already vaulted for the webhook).
import webpush from "npm:web-push@3";

const SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function config() {
  const r = await fetch(`${SB_URL}/rest/v1/push_config?id=eq.1&select=*`, { headers: H });
  const row = (await r.json())[0];
  if (row) return row;
  const keys = webpush.generateVAPIDKeys();
  const w = await fetch(`${SB_URL}/rest/v1/push_config`, {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ id: 1, pub: keys.publicKey, priv: keys.privateKey }),
  });
  if (!w.ok) throw new Error("could not vault the keypair: " + w.status);
  return (await w.json())[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "pubkey") {
      const c = await config();
      return json({ pub: c.pub });
    }

    if (body.action === "send") {
      // only the desk speaks — check the caller against GoTrue
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "signed out" }, 401);
      const who = await fetch(SB + "/auth/v1/user", {
        headers: { apikey: ANON, Authorization: "Bearer " + jwt },
      });
      if (!who.ok) return json({ error: "signed out" }, 401);
      if (((await who.json()).email || "") !== "matthew@mccluster.org") {
        return json({ error: "the desk speaks" }, 403);
      }

      const c = await config();
      webpush.setVapidDetails("mailto:matthew@mccluster.org", c.pub, c.priv);

      let filter = "";
      if (body.to) {
        const t = String(body.to).replace(/[^a-zA-Z0-9-]/g, "");
        const pr = await fetch(
          `${SB_URL}/rest/v1/providers?or=(ticker.ilike.${t},slug.ilike.${t})&select=owner&limit=1`,
          { headers: H });
        const p = (await pr.json())[0];
        if (!p || !p.owner) return json({ error: "no member behind that name" }, 404);
        filter = `&owner=eq.${p.owner}`;
      }
      const sr = await fetch(`${SB_URL}/rest/v1/push_subs?select=endpoint,sub${filter}&limit=2000`, { headers: H });
      const subs = await sr.json();

      const payload = JSON.stringify({
        title: String(body.title || "M Network").slice(0, 80),
        body: String(body.body || "").slice(0, 240),
        url: String(body.url || "market.html").slice(0, 200),
      });
      let sent = 0, gone = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification(s.sub, payload);
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode || 0;
          if (code === 404 || code === 410) {
            gone++;
            await fetch(`${SB_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
              method: "DELETE", headers: H,
            });
          }
        }
      }
      return json({ sent, gone, total: subs.length });
    }

    return json({ error: "which action?" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
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
