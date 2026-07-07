/* ============================================================
   MCC_DB — the platform's data access layer.
   Every feature (player resume, likes, recents, later playlists
   and entitlements) talks to THIS interface, never to storage
   directly. Two drivers behind the same calls:

   1. Local driver: anonymous visitors. Everything lives in this
      browser; the app works fully offline, no account needed.
   2. Supabase driver (armed): signed-in listeners get accounts
      with cross-device sync against the schema in
      docs/platform-schema.sql. Implemented straight over the
      GoTrue + PostgREST HTTP APIs — no vendored library.

   The anon key below is public by design; Row Level Security in
   the database is the wall. No secrets belong in this file.
   ============================================================ */
(function () {
  "use strict";

  var URL_ = "https://fxbkvcrfbbcmrrupdcjt.supabase.co";
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Ymt2Y3JmYmJjbXJydXBkY2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0Mjk5NzAsImV4cCI6MjA5OTAwNTk3MH0.ar1MYPC4gF9V7wn3UpTW0Q7PniGJdbBD1UmOKjNqJWU";

  var NS = "mccdb_";
  function jget(k, fb) { try { var v = JSON.parse(localStorage.getItem(NS + k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function jset(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} }
  function jdel(k) { try { localStorage.removeItem(NS + k); } catch (e) {} }

  /* ---------- local driver (anonymous / offline) ---------- */
  var local = {
    kind: "local",
    ready: Promise.resolve(),
    user: function () { return null; },
    progress: function (itemId, positionS) {
      var p = jget("plays", {});
      if (positionS === undefined) return Promise.resolve(p[itemId] || null);
      p[itemId] = { position_s: positionS, updated_at: Date.now() };
      jset("plays", p);
      return Promise.resolve(p[itemId]);
    },
    recents: function (limit) {
      var p = jget("plays", {});
      return Promise.resolve(Object.keys(p)
        .sort(function (a, b) { return p[b].updated_at - p[a].updated_at; })
        .slice(0, limit || 10)
        .map(function (id) { return { item_id: id, position_s: p[id].position_s }; }));
    },
    like: function (itemId, on) {
      var l = jget("likes", {});
      if (on === undefined) return Promise.resolve(!!l[itemId]);
      if (on) l[itemId] = Date.now(); else delete l[itemId];
      jset("likes", l);
      return Promise.resolve(!!l[itemId]);
    },
    likes: function () { return Promise.resolve(Object.keys(jget("likes", {}))); },
    entitlements: function () { return Promise.resolve([]); },
    signIn: function (email) { return sb.signIn(email); }, // sign-in always goes to the cloud
    signOut: function () { return Promise.resolve(); },
  };

  /* ---------- session plumbing ---------- */
  function saveSession(s) { jset("session", s); }
  function session() { return jget("session", null); }
  function jwtExp(tok) { try { return JSON.parse(atob(tok.split(".")[1])).exp * 1000; } catch (e) { return 0; } }

  // magic-link landing: tokens arrive in the URL hash
  (function catchMagicLink() {
    if (location.hash.indexOf("access_token=") === -1) return;
    var q = {};
    location.hash.slice(1).split("&").forEach(function (kv) {
      var p = kv.split("="); q[p[0]] = decodeURIComponent(p[1] || "");
    });
    if (q.access_token) {
      saveSession({ access_token: q.access_token, refresh_token: q.refresh_token || "" });
      history.replaceState(null, "", location.pathname + location.search);
    }
  })();

  function refresh() {
    var s = session();
    if (!s || !s.refresh_token) return Promise.resolve(null);
    return fetch(URL_ + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.access_token) { saveSession({ access_token: j.access_token, refresh_token: j.refresh_token }); return session(); }
      jdel("session"); return null;
    }).catch(function () { return s; }); // offline: keep the session, RLS still guards
  }

  function token() {
    var s = session();
    if (!s) return Promise.resolve(null);
    if (jwtExp(s.access_token) - Date.now() < 60000) return refresh().then(function (s2) { return s2 && s2.access_token; });
    return Promise.resolve(s.access_token);
  }

  function api(path, opts) {
    opts = opts || {};
    return token().then(function (t) {
      if (!t) throw new Error("signed out");
      var h = { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" };
      if (opts.prefer) h.Prefer = opts.prefer;
      return fetch(URL_ + "/rest/v1/" + path, { method: opts.method || "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    }).then(function (r) {
      if (!r.ok) throw new Error("api " + r.status);
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  function uid() {
    var s = session();
    if (!s) return null;
    try { return JSON.parse(atob(s.access_token.split(".")[1])).sub; } catch (e) { return null; }
  }
  function email() {
    var s = session();
    if (!s) return null;
    try { return JSON.parse(atob(s.access_token.split(".")[1])).email; } catch (e) { return null; }
  }

  /* ---------- supabase driver (signed in) ---------- */
  var sb = {
    kind: "supabase",
    ready: Promise.resolve(),
    user: function () { return session() ? { id: uid(), email: email() } : null; },

    progress: function (itemId, positionS) {
      if (positionS === undefined) {
        return api("plays?item_id=eq." + encodeURIComponent(itemId) + "&select=position_s")
          .then(function (rows) { return rows && rows[0] ? { position_s: +rows[0].position_s } : null; })
          .catch(function () { return local.progress(itemId); });
      }
      local.progress(itemId, positionS); // always mirror locally for offline
      return api("plays", {
        method: "POST", prefer: "resolution=merge-duplicates",
        body: { user_id: uid(), item_id: itemId, position_s: positionS, updated_at: new Date().toISOString() },
      }).catch(function () {});
    },
    recents: function (limit) {
      return api("plays?select=item_id,position_s&order=updated_at.desc&limit=" + (limit || 10))
        .then(function (rows) { return rows || []; })
        .catch(function () { return local.recents(limit); });
    },
    like: function (itemId, on) {
      if (on === undefined) {
        return api("likes?item_id=eq." + encodeURIComponent(itemId) + "&select=item_id")
          .then(function (rows) { return !!(rows && rows.length); })
          .catch(function () { return local.like(itemId); });
      }
      local.like(itemId, on);
      if (on) return api("likes", { method: "POST", prefer: "resolution=merge-duplicates", body: { user_id: uid(), item_id: itemId } }).then(function () { return true; }).catch(function () { return true; });
      return api("likes?item_id=eq." + encodeURIComponent(itemId), { method: "DELETE" }).then(function () { return false; }).catch(function () { return false; });
    },
    likes: function () {
      return api("likes?select=item_id").then(function (rows) {
        return (rows || []).map(function (r) { return r.item_id; });
      }).catch(function () { return local.likes(); });
    },
    entitlements: function () {
      return api("entitlements?select=sku,expires_at").then(function (rows) { return rows || []; }).catch(function () { return []; });
    },
    signIn: function (emailAddr) {
      return fetch(URL_ + "/auth/v1/otp", {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddr, create_user: true, options: { email_redirect_to: location.origin + location.pathname } }),
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.msg || j.error_description || "sign-in failed"); });
        return true;
      });
    },
    signOut: function () { jdel("session"); return Promise.resolve(); },
  };

  window.MCC_DB = session() ? sb : local;
  window.MCC_AUTH = { signIn: sb.signIn, signOut: sb.signOut, user: sb.user };
})();
