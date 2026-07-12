# the-guide — the AI concierge at the door

This is the brain behind the floating ✦ Guide (`js/guide.js`) **and** the
Lobby's open-ended door (`js/lobby.js`). A member types what they're trying
to do, in their own words; this function reads it — plus a little context
about where they are and what card they're holding — and answers as **The
Guide**, the platform's resident concierge. It knows the whole building and
points people to the right floor.

Until this is deployed, both surfaces fall back gracefully: the Lobby routes
with its keyword scorer, and the ✦ Guide shows "The Guide isn't wired up yet."
Once it's live, the same field starts answering in Claude's own words.

The thread is remembered — every turn writes to `guide_chats` on the service
role, and the widget restores it on open. Nothing but this function writes
there, so the record can't be forged from a browser.

## Deploy (Supabase dashboard)

1. **Paste `docs/guide-schema.sql`** in the SQL Editor first (the
   `guide_chats` table + its RLS). One time.
2. **Supabase → Edge Functions → Deploy a new function** → name it exactly
   `the-guide`. Delete the template, paste the `index.ts` below.
3. **Enforce JWT verification: OFF.** The function checks the caller is a real
   signed-in member itself (against GoTrue), so anonymous accounts pass and
   forged tokens bounce — leaving JWT on would also work, but OFF keeps the
   check in one readable place and matches the rest of the AI functions.
4. **Add the secret:** Edge Functions → the-guide → Secrets →
   `ANTHROPIC_KEY` = your Anthropic API key (`sk-ant-...`). `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are already injected by the platform.
5. Deploy. Open the ✦ Guide on any page (signed in) and say "hey" — it should
   answer, and preflight's "the-guide" probe (if present) goes green.

**Model & cost.** Defaults to `claude-opus-4-8` — the sharpest router. This is
the one lever worth knowing: a concierge fires on every message, so if volume
climbs and you want to spend less per reply, change the one `MODEL` constant to
`claude-haiku-4-5` (fast and ~5× cheaper) and redeploy. Nothing else changes.

## index.ts

```ts
// THE GUIDE — the platform's concierge. Verifies the caller is a real member,
// answers as The Guide (knows the whole building), and remembers the thread in
// guide_chats on the service role. JWT verification is OFF at the platform
// level; the member check lives here.
const KEY = Deno.env.get("ANTHROPIC_KEY")!;
const SB = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The one lever: swap to "claude-haiku-4-5" for a faster, cheaper concierge.
const MODEL = "claude-opus-4-8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// The Guide's brief: who it is, the building it knows, and the honest limits.
const SYSTEM = `You are THE GUIDE — the resident concierge of the Equity Uprise
platform (the Street Credit Bureau at streetcreditbureau.com). A member has
typed what they're trying to do, in their own words. Your job is to point them
to the right floor of the building and get them moving. Warm, plain-spoken,
street-smart — never corporate, never a wall of text. 2–4 sentences, then a
clear next step. Respond directly with your answer; do not narrate your
reasoning or add preamble.

THE BUILDING — one building, floors people come in on:
- THE LOBBY (lobby.html): the open door. Where you meet most people first.
- THE TRADING FLOOR (market.html — "Our Street"): buy, sell, hire, get paid,
  or donate. Every member is a ticker; every deal closes on the record; card
  checkout moves real money and stamps their books. The economic engine.
- THE PENTHOUSE (profile.html): a member's own profile — films, music, a live
  ticker, receipts. "Get your own page / claim your ticker" lives here.
- THE BUREAU (civic.html, and market.html#scb): STREET CREDIT — a reputation
  score from 0 to 1000, built from six pillars (Capital 30%, Craft 15%, Reach
  15%, Community 15%, Consistency 10%, Co-sign 15%). Earned in the open, kept
  by the owner, shown to who they choose.
- THE GARAGE (rides.html — "WE"): the rides; how the movement rolls.
- THE WORKSHOP / the engine (reading-room.html, mission.html): learn how it
  works, run T.R.A.P.S. to earn up to 1,000 E⤴, read the papers.

E⤴ is the platform's own credit (the equity-up unit). T.R.A.P.S. is the
mission gauntlet that pays it out. When someone's clearly headed somewhere,
name the floor and the page, and tell them the one move that gets them started.

HONEST LIMITS — never break these:
- Street credit is a REPUTATION INDEX, not a credit score in the FCRA sense and
  not a security. It is owner-only, never sold, never reported, and never wired
  to lending, housing, or employment decisions.
- Don't promise money, returns, guaranteed outcomes, or anything a member
  hasn't actually earned. Never invent numbers about someone's account.
- If you don't know, say so and point them to the floor that would.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // 1) The caller must be a real member. Check the bearer against GoTrue.
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "sign in first" }, 401);
  const who = await fetch(`${SB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SVC },
  });
  if (!who.ok) return json({ error: "sign in first" }, 401);
  const user = await who.json();
  const uid: string = user.id;
  if (!uid) return json({ error: "sign in first" }, 401);

  // 2) What did they say + a little context about where they are.
  let say = "", ctx: Record<string, unknown> = {};
  try {
    const b = await req.json();
    say = String(b.say || "").slice(0, 500).trim();
    ctx = (b.ctx && typeof b.ctx === "object") ? b.ctx : {};
  } catch (_) { /* empty body */ }
  if (!say) return json({ reply: "Tell me what you're trying to do and I'll point you the right way." });

  // 3) Pull the recent thread for continuity (service role — read the room).
  const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const priorRes = await fetch(
    `${SB}/rest/v1/guide_chats?owner=eq.${uid}&order=at.desc&select=role,body&limit=10`,
    { headers: svcHeaders },
  ).catch(() => null);
  const prior = priorRes && priorRes.ok ? await priorRes.json() : [];
  const history = (Array.isArray(prior) ? prior.reverse() : []).map((m: { role: string; body: string }) => ({
    role: m.role === "guide" ? "assistant" : "user",
    content: m.body,
  }));

  // A compact note about where they are — helps The Guide aim.
  const here = Object.entries(ctx)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  const userTurn = here ? `[context — ${here}]\n${say}` : say;

  // 4) Ask The Guide. No thinking (a concierge should be instant); the system
  //    prompt already tells it to answer directly.
  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [...history, { role: "user", content: userTurn }],
    }),
  });
  if (!ai.ok) {
    const t = await ai.text();
    return json({ error: "the line dropped", detail: t.slice(0, 200) }, 502);
  }
  const out = await ai.json();
  const reply = (out.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim() || "I'm here — say that again?";

  // 5) Remember the turn (both sides) so the thread follows the member.
  fetch(`${SB}/rest/v1/guide_chats`, {
    method: "POST",
    headers: svcHeaders,
    body: JSON.stringify([
      { owner: uid, role: "user", body: say },
      { owner: uid, role: "guide", body: reply },
    ]),
  }).catch(() => { /* the reply already went out; the log is best-effort */ });

  return json({ reply });
});
```

## What the clients send

Both callers POST `{ say, ctx }` with the member's bearer token:

- `js/guide.js` (line ~182) sends `ctx = { page, card, social, distro, abandoned }`.
- `js/lobby.js` sends `ctx = { page: "lobby.html", intent: "route-at-the-door" }`
  and, if a reply comes back, replaces the templated concierge line with it —
  so the Lobby's cards still render deterministically while the greeting warms up.

Both expect `{ reply }`. Errors return `{ error }` (and the clients keep their
graceful fallbacks), so a bad key or a hiccup never breaks the door.
