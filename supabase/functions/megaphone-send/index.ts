// THE MEGAPHONE dispatcher — the database rings this door (pg_net from
// megaphone_post) with the vaulted push_config private key as the pass.
// It carries ONE queued post out to the external lanes and writes the
// per-lane receipts back onto the queue row.
//
//   deploy: dashboard → Edge Functions → megaphone-send → JWT verification OFF
//   secrets (optional per lane):
//     MEGAPHONE_DISCORD_WEBHOOK — a Discord channel webhook URL
//       (Server Settings → Integrations → Webhooks → New → copy URL)
//     X_ID / X_SECRET — already vaulted for the handshake; the X lane
//       rides the member's own member_oauth tokens (tweet.write scope)

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

function json(x: unknown, status = 200) {
  return new Response(JSON.stringify(x), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// the X lane: fetch the owner's handshake token, refresh it when stale
// (offline.access keeps a refresh token in the vault)
async function xToken(owner: string): Promise<string | null> {
  const r = await fetch(
    `${SB_URL}/rest/v1/member_oauth?owner=eq.${owner}&provider=eq.x&select=access_token,refresh_token,expires_at&limit=1`,
    { headers: H },
  );
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  const t = rows[0];
  if (t.expires_at && new Date(t.expires_at).getTime() > Date.now() + 60_000) {
    return t.access_token || null;
  }
  if (!t.refresh_token) return t.access_token || null;
  const id = Deno.env.get("X_ID") ?? "";
  const sec = Deno.env.get("X_SECRET") ?? "";
  if (!id || !sec) return t.access_token || null;
  const rr = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${id}:${sec}`),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token }),
  });
  if (!rr.ok) return null;
  const nt = await rr.json();
  await fetch(`${SB_URL}/rest/v1/member_oauth?owner=eq.${owner}&provider=eq.x`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({
      access_token: nt.access_token,
      refresh_token: nt.refresh_token || t.refresh_token,
      expires_at: new Date(Date.now() + (nt.expires_in || 7200) * 1000).toISOString(),
    }),
  });
  return nt.access_token || null;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id || 0);
    if (!id || !body.secret) return json({ error: "no pass" }, 403);

    // the pass: the same vaulted private key push-send trusts
    const cr = await fetch(`${SB_URL}/rest/v1/push_config?id=eq.1&select=priv&limit=1`, { headers: H });
    const conf = await cr.json();
    if (!Array.isArray(conf) || !conf.length || body.secret !== conf[0].priv) {
      return json({ error: "no pass" }, 403);
    }

    const qr = await fetch(
      `${SB_URL}/rest/v1/megaphone_queue?id=eq.${id}&select=owner,body,targets,results,status&limit=1`,
      { headers: H },
    );
    const rows = await qr.json();
    if (!Array.isArray(rows) || !rows.length) return json({ error: "no such post" }, 404);
    const q = rows[0];
    if (q.status !== "queued") return json({ ok: true, note: "already carried" });
    const results: Record<string, string> = { ...(q.results || {}) };
    const targets: string[] = q.targets || [];

    if (targets.includes("discord")) {
      const hook = Deno.env.get("MEGAPHONE_DISCORD_WEBHOOK") ?? "";
      if (!hook) results.discord = "no webhook secret yet";
      else {
        try {
          const d = await fetch(hook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: String(q.body).slice(0, 1900) }),
          });
          results.discord = d.ok || d.status === 204 ? "sent" : "failed " + d.status;
        } catch {
          results.discord = "failed to reach Discord";
        }
      }
    }

    if (targets.includes("x")) {
      const tok = await xToken(q.owner);
      if (!tok) results.x = "connect X with the write scope first";
      else {
        try {
          const tw = await fetch("https://api.x.com/2/tweets", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ text: String(q.body).slice(0, 280) }),
          });
          results.x = tw.ok ? "sent" : "failed " + tw.status;
        } catch {
          results.x = "failed to reach X";
        }
      }
    }

    const vals = Object.values(results);
    const status = vals.length && vals.every((v) => v === "sent")
      ? "sent"
      : vals.some((v) => v === "sent")
      ? "partial"
      : "failed";
    await fetch(`${SB_URL}/rest/v1/megaphone_queue?id=eq.${id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ status, results }),
    });
    return json({ ok: true, status, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
