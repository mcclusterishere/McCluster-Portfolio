// ============================================================
// DISCORD-BOT — the first embassy. The floor, inside Discord.
//
// Serverless: Discord sends slash-command interactions here over
// HTTPS (no bot process to host). Commands:
//   /tape            — the top of the board, live listing prices
//   /price <ticker>  — one desk: listing price, person price, cred
//   /floor           — how the market works + the door to RISE
//
// Setup (one time):
//   1) discord.com/developers/applications → New Application
//   2) Secrets here: DISCORD_PUBLIC_KEY (General Information),
//      DISCORD_APP_ID (same page), DISCORD_BOT_TOKEN (Bot tab)
//   3) Deploy this function: exact name discord-bot, JWT OFF
//   4) Paste the function URL into "Interactions Endpoint URL" —
//      Discord PINGs it; on that ping the commands REGISTER
//      THEMSELVES (no CLI, no curl)
//   5) OAuth2 → URL Generator → scopes: bot + applications.commands
//      → open the URL, invite it to the server
// ============================================================
const SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const PUB = Deno.env.get("DISCORD_PUBLIC_KEY") || "";
const APP_ID = Deno.env.get("DISCORD_APP_ID") || "";
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") || "";
const SITE = Deno.env.get("SITE_URL") || "https://mcclusterishere.github.io/McCluster-Portfolio";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function verify(req: Request, body: string): Promise<boolean> {
  try {
    const sig = req.headers.get("X-Signature-Ed25519") || "";
    const ts = req.headers.get("X-Signature-Timestamp") || "";
    if (!sig || !ts || !PUB) return false;
    const key = await crypto.subtle.importKey("raw", hexToBytes(PUB),
      { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key,
      hexToBytes(sig), new TextEncoder().encode(ts + body));
  } catch (_e) { return false; }
}

// the commands register themselves the first time Discord pings
let registered = false;
async function registerCommands() {
  if (registered || !APP_ID || !BOT_TOKEN) return;
  registered = true;
  await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
    method: "PUT",
    headers: { Authorization: "Bot " + BOT_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify([
      { name: "tape", description: "The Equity Uprise board — live listing prices, top of the tape" },
      { name: "price", description: "One desk: listing price, person price, street credit",
        options: [{ type: 3, name: "ticker", description: "The ticker or slug — like MCC", required: true }] },
      { name: "floor", description: "What the floor is and how to get your E⤴ Card" },
    ]),
  }).catch(() => {});
}

async function board(): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(SB + "/rest/v1/rpc/score_board", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + ANON },
    body: JSON.stringify({ p_limit: 50 }),
  });
  return r.ok ? await r.json() : [];
}
function money(v: unknown): string { return "$" + (+(v ?? 0)).toFixed(2); }
function reply(content: string) {
  return new Response(JSON.stringify({ type: 4, data: { content } }),
    { headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await verify(req, body))) return new Response("bad signature", { status: 401 });
  const it = JSON.parse(body || "{}");

  // PING: Discord checking the endpoint — answer PONG, plant the commands
  if (it.type === 1) {
    registerCommands();
    return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });
  }

  if (it.type === 2) {
    const cmd = it.data?.name || "";
    try {
      if (cmd === "tape") {
        const rows = (await board()).slice(0, 5);
        if (!rows.length) return reply("The tape is quiet — the floor prints at :07.");
        const lines = rows.map((r, i) =>
          `**${i + 1}. $${String(r.ticker || r.slug).toUpperCase()}** ${r.name} — listing ${money(r.price)} · person ${money(r.person_price)} · cred ${r.score ?? "—"}`);
        return reply("📈 **THE TAPE — Equity Uprise**\n" + lines.join("\n") +
          `\n_Real work, real prices. The floor: ${SITE}/market.html_`);
      }
      if (cmd === "price") {
        const want = String(it.data?.options?.[0]?.value || "").toLowerCase().replace(/^\$/, "");
        const rows = await board();
        const r = rows.find((x) =>
          String(x.ticker || "").toLowerCase() === want || String(x.slug || "").toLowerCase() === want);
        if (!r) return reply(`No desk answers to "${want}" — the whole board: ${SITE}/market.html`);
        return reply(`**$${String(r.ticker || r.slug).toUpperCase()} · ${r.name}**\n` +
          `Listing price: **${money(r.price)}** · The person: **${money(r.person_price)}** · Street credit: **${r.score ?? "—"} / 1000**\n` +
          `_The whole record, in the open: ${SITE}/page.html?who=${r.slug}_`);
      }
      if (cmd === "floor") {
        return reply("🃏 **Equity Uprise** — a member floor where real work moves real prices.\n" +
          "Every member holds an E⤴ Card (dealt by decisions, not answers), every listing trades on what it actually earns, " +
          "and every number on the tape is a receipt.\n" +
          `**Get your card:** ${SITE}/rise.html`);
      }
    } catch (_e) {
      return reply("The floor hiccuped — try again in a second.");
    }
  }
  return new Response(JSON.stringify({ type: 4, data: { content: "Unknown move." } }),
    { headers: { "Content-Type": "application/json" } });
});
