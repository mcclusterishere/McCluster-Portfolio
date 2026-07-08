#!/usr/bin/env node
/* ============================================================
   The M Network MCP server.
   Dependency-free stdio MCP server that gives Claude (Claude
   Code, Claude Desktop, or any MCP client) hands on the network:
   list the live providers, file booking requests, read and work
   the inbox, count the SMS list.

   The same walls as the site: the anon key can only see live
   listings and file requests. Set SUPABASE_TOKEN (a signed-in
   provider's access token) or SUPABASE_SERVICE_KEY (owner only,
   never committed anywhere) to unlock the inbox tools.

   Run it:        node tools/mcp/server.mjs
   Wire it up:    claude mcp add mcc-network -- node tools/mcp/server.mjs
   ============================================================ */

const URL_ = process.env.SUPABASE_URL || "https://fxbkvcrfbbcmrrupdcjt.supabase.co";
const ANON = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Ymt2Y3JmYmJjbXJydXBkY2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0Mjk5NzAsImV4cCI6MjA5OTAwNTk3MH0.ar1MYPC4gF9V7wn3UpTW0Q7PniGJdbBD1UmOKjNqJWU";
const ELEVATED = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_TOKEN || null;

async function rest(path, { method = "GET", body, elevated = false, prefer } = {}) {
  const bearer = elevated && ELEVATED ? ELEVATED : ANON;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_KEY && elevated ? ELEVATED : ANON,
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

/* ---------- the tools ---------- */
const TOOLS = [
  {
    name: "list_providers",
    description: "List the live, M-Verified providers on the network (photographers, videographers, web builders, studios, stages) with their categories, areas, and booking info.",
    inputSchema: { type: "object", properties: {
      category: { type: "string", description: "Optional filter: Photo, Video, Web, Studios, or Stages" },
    } },
    run: async ({ category }) => {
      let rows = await rest("providers?status=eq.live&select=id,slug,name,headline,area,roles,blurb,href");
      if (category) rows = rows.filter((p) => (p.roles || []).includes(category));
      return rows;
    },
  },
  {
    name: "request_booking",
    description: "File a booking request with a provider on the network. The provider answers from the Talent App. Requires the requester's name and a way to reach them (email or phone).",
    inputSchema: { type: "object", required: ["provider_slug", "name", "contact"], properties: {
      provider_slug: { type: "string", description: "The provider's slug from list_providers" },
      name: { type: "string" },
      contact: { type: "string", description: "Email or phone" },
      date_wanted: { type: "string", description: "Date or timeframe, freeform" },
      details: { type: "string", description: "What the booking is for" },
    } },
    run: async (a) => {
      const found = await rest(`providers?slug=eq.${encodeURIComponent(a.provider_slug)}&status=eq.live&select=id,name`);
      const p = found && found[0];
      await rest("booking_requests", { method: "POST", prefer: "return=minimal", body: {
        provider_id: p ? p.id : null, provider_slug: a.provider_slug,
        name: a.name, contact: a.contact,
        date_wanted: a.date_wanted || "", details: a.details || "",
      } });
      return { ok: true, provider: p ? p.name : a.provider_slug, note: "Request filed. The provider replies from the Talent App; the network's tithe is 10% on completed work, never a commission wall." };
    },
  },
  {
    name: "list_booking_requests",
    description: "Read the booking inbox (requires SUPABASE_TOKEN of a signed-in provider, or the owner's SUPABASE_SERVICE_KEY). Optionally filter by status: new, accepted, declined, done.",
    inputSchema: { type: "object", properties: { status: { type: "string" } } },
    run: async ({ status }) => {
      if (!ELEVATED) throw new Error("Set SUPABASE_TOKEN (provider) or SUPABASE_SERVICE_KEY (owner) to read the inbox.");
      const q = status ? `&status=eq.${encodeURIComponent(status)}` : "";
      return rest(`booking_requests?order=created_at.desc&select=*${q}`, { elevated: true });
    },
  },
  {
    name: "set_booking_status",
    description: "Work a booking request: accept, decline, or mark done (elevated access required, same as list_booking_requests).",
    inputSchema: { type: "object", required: ["id", "status"], properties: {
      id: { type: "string" }, status: { type: "string", enum: ["accepted", "declined", "done"] },
    } },
    run: async ({ id, status }) => {
      if (!ELEVATED) throw new Error("Elevated access required.");
      await rest(`booking_requests?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", elevated: true, prefer: "return=minimal", body: { status } });
      return { ok: true, id, status };
    },
  },
  {
    name: "sms_list_size",
    description: "Count the SMS marketing opt-in list (owner's SUPABASE_SERVICE_KEY required — the list itself is never exposed).",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      if (!process.env.SUPABASE_SERVICE_KEY) throw new Error("Owner's SUPABASE_SERVICE_KEY required.");
      const rows = await rest("sms_optins?select=id", { elevated: true });
      return { optins: rows.length };
    },
  },
];

/* ---------- minimal stdio MCP plumbing (JSON-RPC 2.0) ---------- */
const out = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
let buf = "";
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    handle(req).catch((e) => {
      if (req.id !== undefined) out({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message: String(e.message || e) } });
    });
  }
});

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    out({ jsonrpc: "2.0", id, result: {
      protocolVersion: params && params.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "mcc-network", version: "1.0.0" },
    } });
  } else if (method === "notifications/initialized") {
    /* no reply to notifications */
  } else if (method === "tools/list") {
    out({ jsonrpc: "2.0", id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
  } else if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) throw new Error(`unknown tool: ${params.name}`);
    try {
      const result = await tool.run(params.arguments || {});
      out({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
    } catch (e) {
      out({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true } });
    }
  } else if (id !== undefined) {
    out({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}
