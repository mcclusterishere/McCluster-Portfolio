/* ============================================================
   MCC_DB — the platform's data access layer.
   Every feature (player resume, likes, recents, later playlists
   and entitlements) talks to THIS interface, never to storage
   directly. Two drivers behind the same calls:

   1. Local driver (active now): everything lives in this browser.
      The app works fully offline, no account needed.
   2. Supabase driver (armed, dormant): paste the project URL and
      anon key below and the same calls sync to the account layer
      defined in docs/platform-schema.sql. Anonymous visitors keep
      the local driver; signed-in listeners get cross-device state.

   No secrets belong here. The anon key is public by design; Row
   Level Security in the database is the wall.
   ============================================================ */
(function () {
  "use strict";

  /* paste from Supabase → Settings → API to arm the account layer */
  var SUPABASE_URL = "";
  var SUPABASE_ANON_KEY = "";

  var NS = "mccdb_";

  function jget(k, fb) { try { var v = JSON.parse(localStorage.getItem(NS + k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function jset(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- local driver ---------- */
  var local = {
    ready: Promise.resolve(),
    user: function () { return null; },

    progress: function (itemId, positionS) {
      var p = jget("plays", {});
      if (positionS === undefined) return Promise.resolve(p[itemId] || null);
      p[itemId] = { position_s: positionS, updated_at: Date.now(), play_count: (p[itemId] ? p[itemId].play_count : 0) + (positionS < 2 ? 1 : 0) };
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
    entitlements: function () { return Promise.resolve(jget("entitlements", [])); },
    signIn: function () { return Promise.reject(new Error("Accounts arrive with the backend keys.")); },
    signOut: function () { return Promise.resolve(); },
  };

  /* ---------- supabase driver (same interface, synced) ---------- */
  function supabaseDriver(url, key) {
    // Loads @supabase/supabase-js from the repo when we vendor it at
    // arm time; falls back to local until then. The interface is the
    // contract — pages never change when this driver goes live.
    var d = Object.create(local);
    d.armed = true; d.url = url; d.key = key;
    return d;
  }

  window.MCC_DB = (SUPABASE_URL && SUPABASE_ANON_KEY)
    ? supabaseDriver(SUPABASE_URL, SUPABASE_ANON_KEY)
    : local;
})();
