// THE-BRAIN — the AI strategist on the desk's payroll.
// The admin taps "Run the deep brain" in Mission Control; this pulls
// the platform's whole live picture (members, deals, credit, events,
// the long book), hands it to a frontier model with one job — find
// what the numbers are saying and PITCH — and files the pitches on
// the same docket the nightly algorithm writes to. The brain proposes;
// the desk disposes. Nothing ships itself.
// Deploy: exact name the-brain, JWT verification OFF.
// Secrets: ANTHROPIC_KEY, SB_URL, SB_SERVICE_KEY.
const SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;
const AI_KEY = Deno.env.get("ANTHROPIC_KEY")!;
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function grab(path: string) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  try {
    // the desk only — every run costs a few cents
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "signed out" }, 401);
    const who = await fetch(SB + "/auth/v1/user", {
      headers: { apikey: ANON, Authorization: "Bearer " + jwt },
    });
    if (!who.ok) return json({ error: "signed out" }, 401);
    if (((await who.json()).email || "") !== "matthew@mccluster.org") {
      return json({ error: "the desk runs the brain" }, 403);
    }

    // the platform's whole picture, aggregates only — no message bodies,
    // no civic cards, no personal contact details leave the house
    const [providers, deals, ledger, events, pulse, pitches] = await Promise.all([
      grab("providers?select=status,roles,created_at,charges_enabled,id_verified,referred_by&limit=500"),
      grab("deals?select=status,kind,created_at,updated_at&limit=500"),
      grab("mtoken_ledger?select=delta,reason,created_at&order=created_at.desc&limit=800"),
      grab("events?select=name,at&order=at.desc&limit=4000"),
      grab("pulse_log?select=day,data&order=day.desc&limit=30"),
      grab("brain_pitches?select=title,status&limit=100"),
    ]);
    const eventCounts: Record<string, number> = {};
    (events || []).forEach((e: { name: string }) => { eventCounts[e.name] = (eventCounts[e.name] || 0) + 1; });

    const state = {
      members: (providers || []).length,
      listings_by_status: (providers || []).reduce((a: Record<string, number>, p: { status: string }) => {
        a[p.status] = (a[p.status] || 0) + 1; return a;
      }, {}),
      deals_by_status: (deals || []).reduce((a: Record<string, number>, d: { status: string }) => {
        a[d.status] = (a[d.status] || 0) + 1; return a;
      }, {}),
      credit_moves: (ledger || []).length,
      credit_by_reason: (ledger || []).reduce((a: Record<string, number>, l: { reason: string }) => {
        const k = (l.reason || "").split(":")[0].slice(0, 24);
        a[k] = (a[k] || 0) + 1; return a;
      }, {}),
      top_events: Object.entries(eventCounts).sort((x, y) => y[1] - x[1]).slice(0, 30),
      nightly_snapshots: pulse || [],
      pitches_already_open: (pitches || []).filter((p: { status: string }) => p.status === "new")
        .map((p: { title: string }) => p.title),
    };

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": AI_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-fable-5",
        max_tokens: 1600,
        messages: [{
          role: "user",
          content:
            "You are the resident strategist for a creator-economy platform (music marketplace, " +
            "closed-loop credit pegged 1:1 to the dollar, member exchange with staged prices, " +
            "referral engine, civic activation wing). Below is the platform's live telemetry as JSON. " +
            "Study it and produce the 3 to 5 HIGHEST-LEVERAGE upgrade pitches the owner should " +
            "consider, grounded in what the numbers actually show. Never repeat a title from " +
            "pitches_already_open. Be specific and honest — if the data is thin, the pitch can be " +
            "about getting the data. Reply with ONLY a JSON array: " +
            '[{"kind":"growth|funnel|economy|retention|civic|ops","title":"<max 60 chars>",' +
            '"pitch":"<2-3 sentences, concrete>","evidence":"<the numbers that argue for it>",' +
            '"impact":"<one line>","effort":"<minutes|small|a day|a build>"}]\n\n' +
            JSON.stringify(state),
        }],
      }),
    });
    if (!ai.ok) return json({ error: "the brain did not answer: " + ai.status }, 502);
    const out = await ai.json();
    const text = (out.content || []).map((c: { text?: string }) => c.text || "").join("");
    let ideas: Array<Record<string, string>> = [];
    try { ideas = JSON.parse(text.replace(/^[^\[]*/, "").replace(/[^\]]*$/, "")); } catch { /* fall through */ }
    if (!Array.isArray(ideas) || !ideas.length) {
      return json({ error: "the brain spoke but not in pitches — run it again" }, 502);
    }

    let filed = 0;
    for (const i of ideas.slice(0, 6)) {
      const r = await fetch(`${SB_URL}/rest/v1/brain_pitches`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          source: "ai",
          kind: String(i.kind || "growth").slice(0, 20),
          title: String(i.title || "untitled pitch").slice(0, 120),
          pitch: String(i.pitch || "").slice(0, 800),
          evidence: String(i.evidence || "").slice(0, 400),
          impact: String(i.impact || "").slice(0, 200),
          effort: String(i.effort || "").slice(0, 40),
        }),
      });
      if (r.ok) filed++;
    }
    return json({ filed, thought: ideas.length });
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
