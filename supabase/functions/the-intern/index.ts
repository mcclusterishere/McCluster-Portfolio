// THE-INTERN — Gemini's seat in the AI city.
// The desk's junior hire: every morning it reads the same aggregate
// telemetry the Brain reads (counts only — no messages, no personal
// data), writes the MORNING DIGEST (what moved in the last 24h), and
// drafts up to three LISTING POLISH suggestions for sparse unclaimed
// listings. Everything it produces is filed as text on the desk's
// docket (brain_pitches, source 'gemini') for a HUMAN to read.
//
// The org chart: the Brain (Claude, frontier) holds strategy; the
// Guide (Claude, economy) works the floor; the Intern (Gemini Flash)
// does the morning chores. Two vendors on purpose — no single model's
// blind spots run this desk.
//
// AI Desk Charter applies in full: the intern reads, reasons, and
// recommends. It cannot move money, verify identity, approve
// cash-outs, see private member data, or speak for the platform.
//
// Deploy: exact name the-intern, JWT verification OFF.
// Secrets: GEMINI_KEY (aistudio.google.com/apikey), INTERN_SECRET
// (guards the cron door — any phrase you invent).
const SB = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SERVICE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const GEMINI_KEY = Deno.env.get("GEMINI_KEY") || "";
const INTERN_SECRET = Deno.env.get("INTERN_SECRET") || "";
const MODEL = "gemini-2.5-flash"; // the intern runs the fast, cheap seat
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

const CHARTER =
  "You are The Intern — Gemini's seat on the AI desk of Matthew McCluster's creator platform " +
  "(music marketplace, member exchange, the Our World game, the Equity Uprise civic wing). " +
  "You work under the AI Desk Charter: you read, reason, and recommend; you NEVER move money, " +
  "verify identity, approve anything, or speak for the platform — a human desk decides everything. " +
  "You see aggregate numbers only, never private member data. Be concrete, brief, and honest; " +
  "if the data is thin, say so plainly. Never invent numbers.";

async function grab(path: string) {
  try {
    const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function gemini(prompt: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: CHARTER + "\n\n" + prompt }] }],
        generationConfig: { maxOutputTokens: 900, temperature: 0.4 },
      }),
    },
  );
  if (!r.ok) throw new Error(`the intern's brain answered ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim();
}

async function file(kind: string, title: string, pitch: string, evidence: string) {
  await fetch(`${SB}/rest/v1/brain_pitches`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      source: "gemini", kind: kind.slice(0, 20), title: title.slice(0, 120),
      pitch: pitch.slice(0, 800), evidence: evidence.slice(0, 400),
      impact: "intern desk note", effort: "read it",
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(null, 204);
  try {
    // the door: the cron secret, or the desk itself
    const okCron = INTERN_SECRET && req.headers.get("x-intern-secret") === INTERN_SECRET;
    let okDesk = false;
    if (!okCron) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (jwt) {
        const who = await fetch(SB + "/auth/v1/user", { headers: { apikey: ANON, Authorization: "Bearer " + jwt } });
        okDesk = who.ok && ((await who.json()).email || "") === "matthew@mccluster.org";
      }
    }
    if (!okCron && !okDesk) return json({ error: "the intern answers to the desk or the morning bell" }, 401);
    if (!GEMINI_KEY) return json({ error: "the intern isn't hired yet — set the GEMINI_KEY secret" }, 500);
    if (!SB || !SB_KEY) return json({ error: "redeploy so SUPABASE_URL/SERVICE_ROLE_KEY inject" }, 500);

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [providers, deals, ledger, events, signals] = await Promise.all([
      grab(`providers?select=status,roles,created_at,claimed&limit=500`),
      grab(`deals?select=status,kind,created_at&created_at=gte.${since}&limit=200`),
      grab(`mtoken_ledger?select=delta,reason,created_at&created_at=gte.${since}&limit=400`),
      grab(`events?select=name&at=gte.${since}&limit=3000`),
      grab(`external_signals?select=source,kind,value,at&order=at.desc&limit=200`),
    ]);
    const eventCounts: Record<string, number> = {};
    (events || []).forEach((e: { name: string }) => { eventCounts[e.name] = (eventCounts[e.name] || 0) + 1; });
    const digestState = {
      members_total: (providers || []).length,
      new_deals_24h: (deals || []).length,
      credit_moves_24h: (ledger || []).length,
      top_events_24h: Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 15),
      latest_outside_signals: (signals || []).slice(0, 20),
    };

    // chore 1 — THE MORNING DIGEST
    const digest = await gemini(
      "Write the desk's MORNING DIGEST from this last-24h telemetry JSON. Max 120 words, plain " +
      "and specific: what moved, what stalled, the one thing the desk should look at first today. " +
      "No headers, no bullets, just the note.\n\n" + JSON.stringify(digestState),
    );
    const today = new Date().toISOString().slice(0, 10);
    await file("ops", `Morning digest — ${today}`, digest, `24h: ${(deals || []).length} deals, ${(ledger || []).length} credit moves, ${(events || []).length} events`);

    // chore 2 — LISTING POLISH: draft better lines for sparse listings
    const sparse = (providers || []).filter((p: { claimed?: boolean; status?: string }) => p && p.claimed === false).slice(0, 3);
    let polished = 0;
    if (sparse.length) {
      const rows = await grab(`providers?claimed=eq.false&select=name,headline,blurb,roles&limit=3`);
      if (rows && rows.length) {
        const polish = await gemini(
          "For each listing below, draft ONE stronger headline (max 9 words) and ONE tighter blurb " +
          "(max 30 words) in a warm, confident voice. These are DRAFTS a human desk reviews — say nothing " +
          "you can't see in the data. Reply as plain text, one block per listing, name first.\n\n" +
          JSON.stringify(rows),
        );
        await file("growth", `Intern drafts — listing polish (${rows.length})`, polish, "unclaimed listings with sparse copy");
        polished = rows.length;
      }
    }

    return json({ filed: 1 + (polished ? 1 : 0), digest_words: digest.split(/\s+/).length, polished });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-intern-secret",
    },
  });
}
