// ============================================================
// OAUTH-CONNECT — the one-tap handshake.
//
// A member taps "Connect YouTube" (or Spotify) on their desk,
// logs in at the provider, and the back end links itself:
//   /start?provider=youtube&t=<their JWT>  → provider login URL
//   callback (?code&state)                 → exchange the code,
//     bank the tokens in member_oauth, auto-bank the identifier
//     VERIFIED (their channel really is theirs — they just proved
//     it by logging in), file today's stats instantly, and send
//     them back to their desk.
//
// Secrets: GOOGLE_OAUTH_ID, GOOGLE_OAUTH_SECRET (new),
//          SPOTIFY_ID, SPOTIFY_SECRET (already set for the sweep).
// Deploy with JWT verification OFF — the callback arrives from
// Google/Spotify with no JWT; identity rides the signed state.
// ============================================================
const SB = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SERVICE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const G_ID = Deno.env.get("GOOGLE_OAUTH_ID") || "";
const G_SECRET = Deno.env.get("GOOGLE_OAUTH_SECRET") || "";
const S_ID = Deno.env.get("SPOTIFY_ID") || "";
const S_SECRET = Deno.env.get("SPOTIFY_SECRET") || "";
const SITE = Deno.env.get("SITE_URL") || "https://mcclusterishere.github.io/McCluster-Portfolio";
const SELF = SB + "/functions/v1/oauth-connect";

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
async function readState(state: string): Promise<{ uid: string; provider: string } | null> {
  const parts = (state || "").split(".");
  if (parts.length !== 4) return null;
  const body = parts.slice(0, 3).join(".");
  if ((await hmac(body)) !== parts[3]) return null;
  if (Date.now() > +parts[2]) return null;
  return { uid: parts[0], provider: parts[1] };
}
async function whoIs(jwt: string): Promise<string | null> {
  const r = await fetch(SB + "/auth/v1/user", { headers: { apikey: ANON, Authorization: "Bearer " + jwt } });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.id || null;
}
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
    const jwt = url.searchParams.get("t") || "";
    const uid = await whoIs(jwt);
    if (!uid) return new Response(JSON.stringify({ error: "sign in first" }), { status: 401 });
    const state = await makeState(uid, provider);
    let go = "";
    if (provider === "youtube") {
      go = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: G_ID, redirect_uri: SELF, response_type: "code",
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        access_type: "offline", prompt: "consent", state });
    } else if (provider === "spotify") {
      go = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
        client_id: S_ID, redirect_uri: SELF, response_type: "code",
        scope: "user-read-email", state });
    } else return new Response(JSON.stringify({ error: "unknown provider" }), { status: 400 });
    return new Response(JSON.stringify({ url: go }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  // ---- the callback: the provider sends them back with a code ----
  const code = url.searchParams.get("code") || "";
  const st = await readState(url.searchParams.get("state") || "");
  if (!code || !st) return back("handshake-failed", false);

  try {
    if (st.provider === "youtube") {
      const tok = await (await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: G_ID, client_secret: G_SECRET,
          redirect_uri: SELF, grant_type: "authorization_code" }) })).json();
      if (!tok.access_token) return back("youtube-token-failed", false);
      const ch = await (await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        { headers: { Authorization: "Bearer " + tok.access_token } })).json();
      const c = ch?.items?.[0];
      if (!c) return back("no-channel-on-account", false);
      await svc("member_oauth", { method: "POST", body: JSON.stringify({
        owner: st.uid, provider: "youtube", ext_id: c.id, ext_name: c.snippet?.title || "",
        access_token: tok.access_token, refresh_token: tok.refresh_token || "",
        expires_at: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString() }) });
      // the identifier banks itself, VERIFIED — they just logged in to prove it
      await svc("member_identifiers", { method: "POST", body: JSON.stringify({
        owner: st.uid, kind: "youtube_channel", value: c.id,
        label: c.snippet?.title || "connected by login", verified: true }) });
      // instant gratification: today's real numbers file now, not at 8:17
      const stats = c.statistics || {};
      await svc("external_signals", { method: "POST", body: JSON.stringify([
        { owner: st.uid, source: "youtube", kind: "views", value: +stats.viewCount || 0 },
        { owner: st.uid, source: "youtube", kind: "subs", value: +stats.subscriberCount || 0 },
      ]) });
      return back("youtube:" + (c.snippet?.title || "connected"), true);
    }

    if (st.provider === "spotify") {
      const tok = await (await fetch("https://accounts.spotify.com/api/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(S_ID + ":" + S_SECRET) },
        body: new URLSearchParams({ code, redirect_uri: SELF, grant_type: "authorization_code" }) })).json();
      if (!tok.access_token) return back("spotify-token-failed", false);
      const me = await (await fetch("https://api.spotify.com/v1/me",
        { headers: { Authorization: "Bearer " + tok.access_token } })).json();
      if (!me?.id) return back("spotify-profile-failed", false);
      await svc("member_oauth", { method: "POST", body: JSON.stringify({
        owner: st.uid, provider: "spotify", ext_id: me.id, ext_name: me.display_name || "",
        access_token: tok.access_token, refresh_token: tok.refresh_token || "",
        expires_at: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString() }) });
      await svc("member_identifiers", { method: "POST", body: JSON.stringify({
        owner: st.uid, kind: "spotify_user", value: me.id,
        label: me.display_name || "connected by login", verified: true }) });
      return back("spotify:" + (me.display_name || "connected"), true);
    }
  } catch (_e) { return back("handshake-error", false); }
  return back("unknown-provider", false);
});
