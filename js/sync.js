/* ============================================================
   MCC_SYNC — cross-device continuity, opt-in by design.
   Anonymous visitors are untouched: their model and persona
   never leave the device. A SIGNED-IN member (their choice,
   their key) gets the same brain on every device:

     on load  → pull their device_state row; if the cloud copy
                has seen more life than this device's, adopt it
     on leave → push this device's state up (keepalive fetch)

   Freshness is judged by the model's own `last` timestamp —
   last writer wins, no merge gymnastics. Runs only on pages
   that already carry backend.js (the signed-in surfaces).
   ============================================================ */
(function () {
  "use strict";
  var S = window.MCC_SUPA;
  if (!S) return;

  var K_MODEL = "mcc_model_v1", K_PERSONA = "mcc_persona_v1";
  function local(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; }
  }
  function keep(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  function authed(path, opts) {
    opts = opts || {};
    return S.token().then(function (t) {
      if (!t) throw new Error("signed out");
      var h = { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": "application/json" };
      if (opts.prefer) h.Prefer = opts.prefer;
      return fetch(S.url + "/rest/v1/" + path, {
        method: opts.method || "GET", headers: h,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        keepalive: !!opts.keepalive,
      });
    }).then(function (r) {
      if (!r.ok) throw new Error("sync " + r.status);
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  var pushed = false;
  /* the grind rides shotgun: a compact snapshot of the staging model
     joins the model document at push time, straight from its own
     ledger — no shared-key races with the behavior model */
  function grindSnap() {
    try {
      var g = JSON.parse(localStorage.getItem("mcc_grind_v1") || "null");
      if (!g) return null;
      var day = new Date().toISOString().slice(0, 10);
      return { device: g.device, E: +(g.E || 0).toFixed(1), streak: g.streak || 0,
        tasks: (g.done && g.done[day] || []).length,
        shadow: (g.shadow && g.shadow[day] || []).length,
        idle: g.idleDays || 0, seen: g.lastSeen, since: g.firstSeen,
        boost: (window.MCC_GRIND && window.MCC_GRIND.boost()) || 0,
        street: (function () { try { return (JSON.parse(localStorage.getItem("mcc_street_last") || "null") || {}).s || null; } catch (e) { return null; } })() };
    } catch (e) { return null; }
  }
  function push() {
    if (pushed) return;
    var model = local(K_MODEL);
    if (!model || !model.last) return; // nothing worth carrying
    var g = grindSnap();
    if (g) model = Object.assign({}, model, { grind: g });
    pushed = true;
    authed("device_state?on_conflict=owner", {
      method: "POST", keepalive: true,
      prefer: "resolution=merge-duplicates,return=minimal",
      body: { owner: S.uid(), model: model, persona: local(K_PERSONA) || {} },
    }).catch(function () { pushed = false; });
  }

  function pull() {
    authed("device_state?owner=eq." + S.uid() + "&select=model,persona").then(function (rows) {
      var row = rows && rows[0];
      if (!row || !row.model || !row.model.last) return;
      var mine = local(K_MODEL);
      if (!mine || (row.model.last || 0) > (mine.last || 0)) {
        keep(K_MODEL, row.model);              // the cloud copy has lived more
        if (row.persona && Object.keys(row.persona).length) keep(K_PERSONA, row.persona);
      }
    }).catch(function () {});
  }

  // signed in? pull on arrival, push on the way out
  S.token().then(function (t) {
    if (!t) return;
    pull();
    window.addEventListener("pagehide", push);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") push();
    });
  }).catch(function () {});
})();
