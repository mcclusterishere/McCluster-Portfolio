// SCAN-PROOF — the AI eyes on the mission docket.
// The desk taps "Scan" on a turned-in proof; this function pulls the
// image from the private vault, shows it to a vision model with the
// mission brief, and stamps PASS/FAIL + a one-line reason on the row.
// The desk always outranks the machine — the verdict is a recommendation
// the admin can overrule with the same buttons.
// Deploy: exact name scan-proof, JWT verification OFF (it checks the
// caller itself — only the admin's sign-in may trigger a scan).
// Secrets: ANTHROPIC_KEY (console.anthropic.com), SB_URL, SB_SERVICE_KEY.
const SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;
const AI_KEY = Deno.env.get("ANTHROPIC_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  try {
    // only the desk scans — every scan costs a fraction of a cent
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "signed out" }, 401);
    const who = await fetch(SB + "/auth/v1/user", {
      headers: { apikey: ANON, Authorization: "Bearer " + jwt },
    });
    if (!who.ok) return json({ error: "signed out" }, 401);
    const email = (await who.json()).email || "";
    if (email !== "matthew@mccluster.org") return json({ error: "the desk scans" }, 403);

    const { id } = await req.json();
    if (!id) return json({ error: "which proof?" }, 400);
    const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

    const rowR = await fetch(`${SB_URL}/rest/v1/mission_proofs?id=eq.${id}&select=*`, { headers: H });
    const row = (await rowR.json())[0];
    if (!row) return json({ error: "no such proof" }, 404);

    const fileR = await fetch(`${SB_URL}/storage/v1/object/proofs/${row.path}`, { headers: H });
    if (!fileR.ok) return json({ error: "the file is missing from the vault" }, 404);
    const bytes = new Uint8Array(await fileR.arrayBuffer());
    if (bytes.length > 5_000_000) return json({ error: "too big to scan — review it by eye" }, 400);
    let b64 = "";
    for (let i = 0; i < bytes.length; i += 32768) {
      b64 += String.fromCharCode(...bytes.subarray(i, i + 32768));
    }
    b64 = btoa(b64);
    const mime = row.kind && row.kind.startsWith("image/") ? row.kind : "image/jpeg";

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": AI_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
            { type: "text", text:
              `You are reviewing proof submitted for a creative-platform mission.\n` +
              `Mission: "${row.mission}"\n` +
              `Member's note: "${(row.note || "").slice(0, 300)}"\n\n` +
              `Does this image plausibly show the mission was completed? Judge generously ` +
              `but reject blank, irrelevant, or obviously recycled/stock images.\n` +
              `Reply with ONLY JSON: {"pass": true|false, "reason": "<one short sentence>"}` },
          ],
        }],
      }),
    });
    if (!ai.ok) return json({ error: "the eyes did not answer: " + ai.status }, 502);
    const out = await ai.json();
    const text = (out.content || []).map((c: { text?: string }) => c.text || "").join("");
    let verdict = { pass: false, reason: "unreadable answer — review by eye" };
    try { verdict = JSON.parse(text.replace(/^[^{]*/, "").replace(/[^}]*$/, "")); } catch (_e) { /* keep default */ }

    await fetch(`${SB_URL}/rest/v1/mission_proofs?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: verdict.pass ? "passed" : "failed",
        verdict: String(verdict.reason || "").slice(0, 240),
      }),
    });
    return json({ pass: !!verdict.pass, reason: verdict.reason });
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
