// ============================================================
// OAUTH-CONNECT v2 — THE HANDSHAKE, as a registry.
//
// One function, every platform. A member taps Connect on their
// desk, logs in at the provider, and the back end links itself:
//   /start?provider=<id>&t=<their JWT>  → provider login URL
//   callback (?code&state)              → exchange the code, bank
//     tokens in member_oauth, bank the identifier VERIFIED (they
//     just proved the account by logging in), file today's stats
//     into external_signals, and send them back to their desk.
//
// Adding a platform = one entry in REG + its secrets pair in the
// dashboard. Providers without secrets answer "not armed yet" —
// the client shows that honestly instead of a broken door.
//
// Secrets (set the pairs you have; skip the rest):
//   GOOGLE_OAUTH_ID / GOOGLE_OAUTH_SECRET
//   SPOTIFY_ID      / SPOTIFY_SECRET
//   GITHUB_OAUTH_ID / GITHUB_OAUTH_SECRET
//   TWITCH_ID       / TWITCH_SECRET
//   REDDIT_ID       / REDDIT_SECRET
//   X_ID            / X_SECRET
// Deploy with JWT verification OFF — the callback arrives from the
// provider with no JWT; identity rides the signed state.
// ============================================================
const SB = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SERVICE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SITE = Deno.env.get("SITE_URL") || "https://mcclusterishere.github.io/McCluster-Portfolio";
const SELF = SB + "/functions/v1/oauth-connect";
const UA = "EquityUprise/1.0 (+" + SITE + ")";

function env(k: string) { return Deno.env.get(k) || ""; }

// ---- the registry: every platform the handshake speaks ----
type Prov = {
  idKey: string; secretKey: string;
  authUrl: string; tokenUrl: string;
  scope: string; extraAuth?: Record<string, string>;
  basicAuth?: boolean;          // token exchange wants Basic client:secret
  jsonAccept?: boolean;         // ask for JSON back (GitHub)
  pkcePlain?: boolean;          // provider requires PKCE (X) — plain, derived from state
  // after tokens: read the account + file signals; return [extId, extName, signals[]]
  me: (access: string, clientId: string) => Promise<[string, string, { source: string; kind: string; value: number }[]] | null>;
  identKind: string;
};
const REG: Record<string, Prov> = {
  youtube: {
    idKey: "GOOGLE_OAUTH_ID", secretKey: "GOOGLE_OAUTH_SECRET",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    extraAuth: { access_type: "offline", prompt: "consent" },
    identKind: "youtube_channel",
    me: async (access) => {
      const ch = await (await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        { headers: { Authorization: "Bearer " + access } })).json();
      const c = ch?.items?.[0];
      if (!c) return null;
      const s = c.statistics || {};
      return [c.id, c.snippet?.title || "", [
        { source: "youtube", kind: "views", value: +s.viewCount || 0 },
        { source: "youtube", kind: "subs", value: +s.subscriberCount || 0 },
      ]];
    },
  },
  spotify: {
    idKey: "SPOTIFY_ID", secretKey: "SPOTIFY_SECRET",
    authUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    scope: "user-read-email", basicAuth: true,
    identKind: "spotify_user",
    me: async (access) => {
      const me = await (await fetch("https://api.spotify.com/v1/me",
        { headers: { Authorization: "Bearer " + access } })).json();
      if (!me?.id) return null;
      const sig = [];
      if (me.followers && +me.followers.total > 0)
        sig.push({ source: "spotify", kind: "followers", value: +me.followers.total });
      return [me.id, me.display_name || "", sig];
    },
  },
  github: {
    idKey: "GITHUB_OAUTH_ID", secretKey: "GITHUB_OAUTH_SECRET",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user", jsonAccept: true,
    identKind: "github_user",
    me: async (access) => {
      const me = await (await fetch("https://api.github.com/user",
        { headers: { Authorization: "Bearer " + access, "User-Agent": UA } })).json();
      if (!me?.login) return null;
      return [String(me.id), me.login, [
        { source: "github", kind: "followers", value: +me.followers || 0 },
        { source: "github", kind: "repos", value: +me.public_repos || 0 },
      ]];
    },
  },
  twitch: {
    idKey: "TWITCH_ID", secretKey: "TWITCH_SECRET",
    authUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scope: "user:read:email",
    identKind: "twitch_user",
    me: async (access, clientId) => {
      const h = { Authorization: "Bearer " + access, "Client-Id": clientId };
      const me = (await (await fetch("https://api.twitch.tv/helix/users", { headers: h })).json())?.data?.[0];
      if (!me?.id) return null;
      const fol = await (await fetch("https://api.twitch.tv/helix/channels/followers?broadcaster_id=" + me.id,
        { headers: h })).json();
      return [me.id, me.display_name || me.login || "", [
        { source: "twitch", kind: "followers", value: +fol?.total || 0 },
      ]];
    },
  },
  reddit: {
    idKey: "REDDIT_ID", secretKey: "REDDIT_SECRET",
    authUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    scope: "identity", basicAuth: true, extraAuth: { duration: "permanent" },
    identKind: "reddit_user",
    me: async (access) => {
      const me = await (await fetch("https://oauth.reddit.com/api/v1/me",
        { headers: { Authorization: "Bearer " + access, "User-Agent": UA } })).json();
      if (!me?.name) return null;
      return [me.name, me.name, [
        { source: "reddit", kind: "karma", value: +me.total_karma || 0 },
      ]];
    },
  },
  x: {
    idKey: "X_ID", secretKey: "X_SECRET",
    authUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scope: "users.read tweet.read", basicAuth: true, pkcePlain: true,
    identKind: "x_user",
    me: async (access) => {
      const me = (await (await fetch("https://api.x.com/2/users/me?user.fields=public_metrics",
        { headers: { Authorization: "Bearer " + access } })).json())?.data;
      if (!me?.id) return null;
      return [me.id, me.username || me.name || "", [
        { source: "x", kind: "followers", value: +me.public_metrics?.followers_count || 0 },
      ]];
    },
  },
};

const enc = new TextEncoder();
async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(SB_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function makeState(uid: string, provider: string): Promise<string> {
  const exp = Date.now() + 15 * 60 * 1000;
  const body = `${uid}.${provider}.${exp}`;
  return `${body}.${await hmac(body)}`;
}
async function readState(state: string): Promise<{ uid: string; provider: string; body: string } | null> {
  const parts = (state || "").split(".");
  if (parts.length !== 4) return null;
  const body = parts.slice(0, 3).join(".");
  if ((await hmac(body)) !== parts[3]) return null;
  if (Date.now() > +parts[2]) return null;
  return { uid: parts[0], provider: parts[1], body };
}
// X requires PKCE: the verifier derives from the state body, so the
// callback can rebuild it with nothing stored
async function verifierFor(body: string): Promise<string> {
  return (await hmac("pkce." + body)).slice(0, 64);
}
async function whoIs(jwt: string): Promise<{ id: string; email: string } | null> {
  const r = await fetch(SB + "/auth/v1/user", { headers: { apikey: ANON, Authorization: "Bearer " + jwt } });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.id ? { id: j.id, email: j.email || "" } : null;
}
// providers still in a platform's development mode ride the admin's
// account only — everyone else gets an honest answer, not a broken door
const ADMIN_ONLY = new Set(["spotify"]);
const ADMIN_EMAIL = "matthew@mccluster.org";
function svc(path: string, init: RequestInit = {}) {
  return fetch(SB + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal", ...(init.headers || {}) },
  });
}
function back(msg: string, ok: boolean) {
  return new Response(null, { status: 302,
    headers: { Location: SITE + "/market.html?connected=" + encodeURIComponent(msg) + (ok ? "" : "&failed=1") + "#yours" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ---- /start: hand back the provider's login door ----
  if (url.pathname.endsWith("/start")) {
    const provider = url.searchParams.get("provider") || "";
    const p = REG[provider];
    const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
    if (!p) return new Response(JSON.stringify({ error: "unknown provider" }), { status: 400, headers: cors });
    if (!env(p.idKey) || !env(p.secretKey))
      return new Response(JSON.stringify({ error: provider + " is not armed yet — the desk knows" }), { status: 503, headers: cors });
    const jwt = url.searchParams.get("t") || "";
    const who = await whoIs(jwt);
    if (!who) return new Response(JSON.stringify({ error: "sign in first" }), { status: 401, headers: cors });
    if (ADMIN_ONLY.has(provider) && who.email !== ADMIN_EMAIL)
      return new Response(JSON.stringify({ error: provider + " rides the admin desk only while it's in development mode" }), { status: 403, headers: cors });
    const state = await makeState(who.id, provider);
    const q: Record<string, string> = {
      client_id: env(p.idKey), redirect_uri: SELF, response_type: "code",
      scope: p.scope, state, ...(p.extraAuth || {}) };
    if (p.pkcePlain) {
      q.code_challenge = await verifierFor(state.split(".").slice(0, 3).join("."));
      q.code_challenge_method = "plain";
    }
    return new Response(JSON.stringify({ url: p.authUrl + "?" + new URLSearchParams(q) }), { headers: cors });
  }

  // ---- the callback: the provider sends them back with a code ----
  const code = url.searchParams.get("code") || "";
  const st = await readState(url.searchParams.get("state") || "");
  if (!code || !st) return back("handshake-failed", false);
  const p = REG[st.provider];
  if (!p) return back("unknown-provider", false);

  try {
    const form: Record<string, string> = { code, redirect_uri: SELF, grant_type: "authorization_code" };
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA };
    if (p.basicAuth) headers.Authorization = "Basic " + btoa(env(p.idKey) + ":" + env(p.secretKey));
    else { form.client_id = env(p.idKey); form.client_secret = env(p.secretKey); }
    if (p.pkcePlain) { form.code_verifier = await verifierFor(st.body); form.client_id = env(p.idKey); }
    if (p.jsonAccept) headers.Accept = "application/json";
    const tok = await (await fetch(p.tokenUrl, { method: "POST", headers, body: new URLSearchParams(form) })).json();
    if (!tok.access_token) return back(st.provider + "-token-failed", false);

    const who = await p.me(tok.access_token, env(p.idKey));
    if (!who) return back(st.provider + "-profile-failed", false);
    const [extId, extName, signals] = who;

    await svc("member_oauth", { method: "POST", body: JSON.stringify({
      owner: st.uid, provider: st.provider, ext_id: extId, ext_name: extName,
      access_token: tok.access_token, refresh_token: tok.refresh_token || "",
      expires_at: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString() }) });
    // the identifier banks itself, VERIFIED — they just logged in to prove it
    await svc("member_identifiers", { method: "POST", body: JSON.stringify({
      owner: st.uid, kind: p.identKind, value: extId,
      label: extName || "connected by login", verified: true }) });
    // instant gratification: today's real numbers file now, not at the sweep
    if (signals.length) {
      await svc("external_signals", { method: "POST",
        body: JSON.stringify(signals.map((s) => ({ owner: st.uid, ...s }))) });
    }
    return back(st.provider + ":" + (extName || "connected"), true);
  } catch (_e) { return back("handshake-error", false); }
});
