/* MCC_HEAT — the live play counter behind The Heat chart.
   Every play bumps a public counter in the cloud (track_plays via the
   bump_play RPC) unless the listener has switched their plays private —
   then the play stays on the device only, Facebook-hidden-likes style.
   Google Analytics keeps receiving the same app_play/song_start events
   it always did; this counter exists because GA can't be read back by
   the page — the chart needs a number it can ask for right now. */
(function () {
  "use strict";
  var K_PUB = "mcc_plays_v1";      // plays that also went to the public counter
  var K_HID = "mcc_plays_hid_v1";  // plays made while hidden — this device only
  var K_SET = "mcc_plays_public";  // "0" = hide my plays

  function read(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function write(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }

  /* one name per track everywhere: "Who-Did_The Shoot" → whodidtheshoot */
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

  function isPublic() { try { return localStorage.getItem(K_SET) !== "0"; } catch (e) { return true; } }
  function setPublic(on) { try { localStorage.setItem(K_SET, on ? "1" : "0"); } catch (e) {} }

  /* a stable per-device fingerprint — the server dedupes plays per
     fingerprint per hour, so a real listener still counts but a loop
     can't print the chart. Not identity, just a bucket key. */
  function fp() {
    try {
      var v = localStorage.getItem("mcc_fp");
      if (!v) {
        v = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        localStorage.setItem("mcc_fp", v);
      }
      return v;
    } catch (e) { return "anon"; }
  }

  /* song pages don't carry the full backend — the counter stands alone.
     Same public anon key as js/backend.js; RLS is the wall, not the key. */
  var FB_URL = "https://fxbkvcrfbbcmrrupdcjt.supabase.co";
  var FB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Ymt2Y3JmYmJjbXJydXBkY2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0Mjk5NzAsImV4cCI6MjA5OTAwNTk3MH0.ar1MYPC4gF9V7wn3UpTW0Q7PniGJdbBD1UmOKjNqJWU";
  function supa() { var s = window.MCC_SUPA; return s && s.url ? s : { url: FB_URL, key: FB_KEY }; }

  function bump(slug) {
    slug = norm(slug);
    if (!slug) return;
    var pub = isPublic();
    var k = pub ? K_PUB : K_HID;
    var o = read(k);
    o[slug] = (o[slug] || 0) + 1;
    write(k, o);
    if (!pub) return; // hidden plays never leave the device
    var s = supa();
    fetch(s.url + "/rest/v1/rpc/bump_play", {
      method: "POST",
      headers: { apikey: s.key, Authorization: "Bearer " + s.key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug, p_fp: fp() }),
    }).catch(function () {});
  }

  /* the whole floor's numbers: {slug: plays}. Missing table → {} and the
     chart runs on device plays alone until the counter lands. */
  function cloud() {
    var s = supa();
    return fetch(s.url + "/rest/v1/track_plays?select=slug,plays", {
      headers: { apikey: s.key, Authorization: "Bearer " + s.key },
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var o = {};
        (rows || []).forEach(function (r) { o[norm(r.slug)] = +r.plays || 0; });
        return o;
      }).catch(function () { return {}; });
  }

  /* what the chart shows: the public count plus this device's hidden plays
     (yours still count for YOU — they're just off the public record) */
  function counts() {
    return cloud().then(function (cl) {
      var pub = read(K_PUB), hid = read(K_HID), out = {};
      Object.keys(cl).forEach(function (k) { out[k] = cl[k]; });
      Object.keys(pub).forEach(function (k) { if (!out[k]) out[k] = pub[k]; else out[k] = Math.max(out[k], pub[k]); });
      Object.keys(hid).forEach(function (k) { out[k] = (out[k] || 0) + hid[k]; });
      return out;
    });
  }

  window.MCC_HEAT = { bump: bump, counts: counts, norm: norm, isPublic: isPublic, setPublic: setPublic, fp: fp };
})();
