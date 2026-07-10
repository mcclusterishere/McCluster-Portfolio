// SIGNAL-SWEEP — the nightly read of the outside world.
// Reads every member's banked spotify_artist / youtube_channel identifiers
// from the locker and records real public numbers (followers, popularity,
// views, subscribers) into external_signals. The score's Reach pillar
// upgrades from in-app plays to real-world signals as this table fills.
//
// Spotify compliance (developer.spotify.com/terms + the OpenAPI spec):
// - Client Credentials flow ONLY — this is public, non-user data on a
//   secure backend. No user tokens, no scopes, secret never leaves here.
// - Endpoints per the spec: POST accounts.spotify.com/api/token, then
//   GET /v1/artists?ids=… (batch ≤50). Fields read: followers.total,
//   popularity, name, id.
// - 429s honor Retry-After with exponential backoff; no tight loops.
// - We store only derived numeric metrics per day (our analytics), not
//   cached Spotify content; anywhere these numbers show in the app they
//   are attributed to Spotify. Never used to train models.
//
// Deploy: exact name signal-sweep, JWT verification OFF.
// Secrets: SPOTIFY_ID, SPOTIFY_SECRET, YOUTUBE_KEY, LASTFM_KEY (any subset —
// missing sources are skipped), SWEEP_SECRET (guards the cron door).
const SB = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SERVICE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SPOTIFY_ID = Deno.env.get("SPOTIFY_ID") || "";
const SPOTIFY_SECRET = Deno.env.get("SPOTIFY_SECRET") || "";
const YOUTUBE_KEY = Deno.env.get("YOUTUBE_KEY") || "";
const LASTFM_KEY = Deno.env.get("LASTFM_KEY") || "";
const SWEEP_SECRET = Deno.env.get("SWEEP_SECRET") || "";
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

// polite fetch: exponential backoff, Retry-After honored, max 4 tries
async function polite(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, init);
    if (r.status !== 429 && r.status < 500) return r;
    const ra = parseInt(r.headers.get("Retry-After") || "0", 10);
    await new Promise((ok) => setTimeout(ok, Math.max(ra * 1000, 2 ** i * 1000)));
  }
  return await fetch(url, init);
}

async function spotifyToken(): Promise<string | null> {
  if (!SPOTIFY_ID || !SPOTIFY_SECRET) return null;
  const r = await polite("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) return null;
  return (await r.json()).access_token || null;
}

function idOf(v: string, kind: string): string {
  // accept raw IDs or pasted URLs (open.spotify.com/artist/…, youtube.com/channel/…)
  const s = String(v || "").trim();
  if (kind === "spotify_artist") {
    const m = s.match(/artist[/:]([A-Za-z0-9]{10,})/);
    return (m ? m[1] : s).split("?")[0];
  }
  const m = s.match(/channel\/(UC[\w-]{10,})/);
  return (m ? m[1] : s).split("?")[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(null, 204);
  try {
    // the door: the cron secret, or a signed-in desk
    const okCron = SWEEP_SECRET && req.headers.get("x-sweep-secret") === SWEEP_SECRET;
    let okDesk = false;
    if (!okCron) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (jwt) {
        const who = await fetch(SB + "/auth/v1/user", { headers: { apikey: ANON, Authorization: "Bearer " + jwt } });
        okDesk = who.ok && ((await who.json()).email || "") === "matthew@mccluster.org";
      }
    }
    if (!okCron && !okDesk) return json({ error: "the sweep runs on the desk's word or the cron's secret" }, 401);
    if (!SB || !SB_KEY) return json({ error: "redeploy so SUPABASE_URL/SERVICE_ROLE_KEY inject" }, 500);

    // every banked outside identifier, with its owner
    const r = await fetch(
      `${SB}/rest/v1/member_identifiers?kind=in.(spotify_artist,youtube_channel,lastfm_user)&select=owner,kind,value`,
      { headers: H },
    );
    const rows: Array<{ owner: string; kind: string; value: string }> = r.ok ? await r.json() : [];
    const out: Array<Record<string, unknown>> = [];
    const today = new Date().toISOString().slice(0, 10);

    // SPOTIFY — batch ≤50 artist IDs per the spec
    const sids = rows.filter((x) => x.kind === "spotify_artist").map((x) => ({ owner: x.owner, id: idOf(x.value, x.kind) }));
    const token = sids.length ? await spotifyToken() : null;
    if (token) {
      for (let i = 0; i < sids.length; i += 50) {
        const batch = sids.slice(i, i + 50);
        const a = await polite(`https://api.spotify.com/v1/artists?ids=${batch.map((b) => b.id).join(",")}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!a.ok) continue;
        for (const art of ((await a.json()).artists || [])) {
          if (!art) continue;
          const owner = batch.find((b) => b.id === art.id)?.owner;
          if (!owner) continue;
          out.push({ owner, source: "spotify", kind: "followers", value: art.followers?.total ?? 0, at: today });
          out.push({ owner, source: "spotify", kind: "popularity", value: art.popularity ?? 0, at: today });
        }
      }
    }

    // YOUTUBE — channels.list part=statistics, batch ≤50
    const yids = rows.filter((x) => x.kind === "youtube_channel").map((x) => ({ owner: x.owner, id: idOf(x.value, x.kind) }));
    if (YOUTUBE_KEY && yids.length) {
      for (let i = 0; i < yids.length; i += 50) {
        const batch = yids.slice(i, i + 50);
        const y = await polite(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${batch.map((b) => b.id).join(",")}&key=${YOUTUBE_KEY}`,
        );
        if (!y.ok) continue;
        for (const ch of ((await y.json()).items || [])) {
          const owner = batch.find((b) => b.id === ch.id)?.owner;
          if (!owner) continue;
          const st = ch.statistics || {};
          out.push({ owner, source: "youtube", kind: "views", value: +st.viewCount || 0, at: today });
          out.push({ owner, source: "youtube", kind: "subscribers", value: +st.subscriberCount || 0, at: today });
        }
      }
    }

    // LAST.FM — per-user listener info (one call each; small N, polite pace)
    const lids = rows.filter((x) => x.kind === "lastfm_user");
    if (LASTFM_KEY) {
      for (const u of lids) {
        const f = await polite(
          `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(u.value)}&api_key=${LASTFM_KEY}&format=json`,
        );
        if (!f.ok) continue;
        const info = (await f.json()).user || {};
        out.push({ owner: u.owner, source: "lastfm", kind: "scrobbles", value: +info.playcount || 0, at: today });
      }
    }

    if (out.length) {
      const w = await fetch(`${SB}/rest/v1/external_signals`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(out),
      });
      if (!w.ok) return json({ error: "couldn't file the signals: " + (await w.text()).slice(0, 140) }, 502);
    }
    return json({ swept: rows.length, filed: out.length, sources: { spotify: !!token, youtube: !!YOUTUBE_KEY, lastfm: !!LASTFM_KEY } });
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
      "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-sweep-secret",
    },
  });
}
