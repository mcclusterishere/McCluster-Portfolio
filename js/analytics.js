/* ============================================================
   Analytics — the one wrapper every page calls.
   Two optional destinations, both dormant until configured:

   1. ANALYTICS_ID — Google Analytics 4 Measurement ID
      (GA4 Admin → Data Streams, looks like "G-XXXXXXXXXX").
   2. TRACK_ENDPOINT — the future first-party collector on the
      McCluster Control Room backend (an HTTPS URL that accepts
      a JSON POST). Events go over as anonymous, consented,
      aggregate signals — no identifiers, no profiles.

   While both are empty, MCC_TRACK is a silent no-op: no
   tracking, no external requests. No secrets belong in this
   file — endpoints only, keys live server-side.
   ============================================================ */

window.ANALYTICS_ID = "G-38KDY01Z2V";
window.TRACK_ENDPOINT = "";

/* Ad platforms — dormant until the IDs are pasted in.
   META_PIXEL_ID: Meta Events Manager → your pixel → the 15-16 digit ID.
   GADS_ID / GADS_LABEL: Google Ads → Tools → Conversions → your
   "Booked call" action → tag setup ("AW-XXXXXXXXX" + label).
   The win we count: a booked call. MCC_CONVERT fires it everywhere. */
window.ADS = {
  META_PIXEL_ID: "",
  GADS_ID: "",
  GADS_LABEL: "",
};

/* Lead intake — the Apps Script web app URL (ends in /exec) that appends
   rows to the leads Sheet. While empty, every lead button keeps its plain
   mailto behavior; paste the URL and the on-page form takes over. */
window.INTAKE_ENDPOINT = "https://script.google.com/macros/s/AKfycby9Z086Bx-lEfTr6NnOyx3kTzdPpnEshJS7HX-XbmaEPQ2xhMe6mk2GAUzLIheAIR7bBA/exec";

/* PWA: register the service worker so the site is installable and loads
   instant/offline after the first visit. Registered from here because this
   file loads on every page, giving the worker site-wide scope. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
}

window.MCC_TRACK = (function () {
  var gaId = window.ANALYTICS_ID;
  var endpoint = window.TRACK_ENDPOINT;
  if (!gaId && !endpoint) return function () {};

  var gtag = null;
  if (gaId) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + gaId;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    gtag = function () { window.dataLayer.push(arguments); };
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", gaId, { anonymize_ip: true });
  }

  /* ---- ad pixels: load only when an ID is configured ---- */
  var ads = window.ADS || {};
  if (ads.META_PIXEL_ID) {
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", ads.META_PIXEL_ID);
    window.fbq("track", "PageView");
  }
  if (ads.GADS_ID && gtag) gtag("config", ads.GADS_ID);

  /* The one win that counts: a booked call. Fires GA4 + Google Ads + Meta. */
  window.MCC_CONVERT = function (label) {
    if (gtag) {
      gtag("event", "book_call", { label: label || "" });
      if (ads.GADS_ID && ads.GADS_LABEL) gtag("event", "conversion", { send_to: ads.GADS_ID + "/" + ads.GADS_LABEL });
    }
    if (window.fbq) window.fbq("track", "Schedule", { content_name: label || "book_call" });
  };

  return function (name, params) {
    params = params || {};
    if (gtag) gtag("event", name, params);
    // any booking CTA anywhere on the site counts as the conversion
    if (name === "cta_click" && /book-call|offer-claim/.test(params.label || "")) window.MCC_CONVERT(params.label);
    if (endpoint) {
      // fire-and-forget; sendBeacon survives page exits
      var payload = JSON.stringify({ event: name, params: params, path: location.pathname, ts: Date.now() });
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, payload);
      else fetch(endpoint, { method: "POST", body: payload, keepalive: true }).catch(function () {});
    }
  };
})();

/* ============================================================
   MCC_MODEL — the algorithm that follows the user.
   Every signal on the site already flows through MCC_TRACK, so
   the model wraps it once and learns from everything: plays,
   quiz answers, VR drags, CTA taps, deals, packets. It lives
   entirely in THIS browser (localStorage, same rule as the
   persona engine) — the site adapts on-device, nothing about
   the person leaves their phone.

   The model keeps a decaying interest score across six domains
   and answers two questions for any surface that asks:
     MCC_MODEL.profile() → { top, ranked, stage, visits }
     MCC_MODEL.suggest() → { label, sub, href, why } next-best-action
   ============================================================ */
window.MCC_MODEL = (function () {
  "use strict";
  var KEY = "mcc_model_v1";
  var HALF_LIFE_DAYS = 14; // interests cool off; the model stays current

  /* what an event means: first match wins, weight = how loud the signal is */
  var MAP = [
    [/offer|claim|tier|quote|lead|wantsite|book.?call|billing/i, "client", 3],
    [/collab|deal|packet|talent|onboard|provider|listing/i, "artist", 3],
    [/member|donat|tithe|residual|uprise|fellowship/i, "org", 3],
    [/docket|psmf|civic|marker|duality|persona|quiz/i, "civic", 2],
    [/vr|gyro|360|motion|beacon|land|slow|install/i, "experience", 2],
    [/song|play|np|audio|catalogue|sound|lyric|subscribe|app_/i, "music", 1],
  ];
  var PAGES = { // where a domain's next step lives
    music: ["app.html", "Back to the music", "Your rotation is waiting in the app"],
    experience: ["vr-vaunt.html", "Step back inside the jet", "The 360 cabin, pins and all"],
    client: ["offer.html", "The offer is still open", "2 of 3 spots left · the weekly system"],
    artist: ["collab.html", "Open the Collab Room", "Propositions, splits, signatures"],
    civic: ["docket-516.html", "Back to the record", "The public record, explained"],
    org: ["members.html", "Join the organization", "Boards · programs · the donor circle"],
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  var S = load() || { doms: {}, events: 0, visits: 0, last: 0, day: "" };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* time decay: every new day shrinks old interest toward the half-life */
  (function tick() {
    var today = new Date().toISOString().slice(0, 10);
    if (S.day !== today) {
      var days = S.last ? Math.min(60, (Date.now() - S.last) / 864e5) : 0;
      var k = Math.pow(0.5, days / HALF_LIFE_DAYS);
      Object.keys(S.doms).forEach(function (d) { S.doms[d] = +(S.doms[d] * k).toFixed(3); });
      S.day = today; S.visits++;
      save();
    }
  })();

  function observe(name, params) {
    var line = name + " " + JSON.stringify(params || {});
    for (var i = 0; i < MAP.length; i++) {
      if (MAP[i][0].test(line)) {
        var d = MAP[i][1];
        S.doms[d] = +((S.doms[d] || 0) + MAP[i][2]).toFixed(3);
        break;
      }
    }
    S.events++; S.last = Date.now();
    save();
  }

  function profile() {
    var ranked = Object.keys(S.doms).map(function (d) { return [d, S.doms[d]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    return {
      top: ranked.length ? ranked[0][0] : null,
      ranked: ranked,
      stage: S.events < 6 ? "new" : S.events < 25 ? "warming" : "locked",
      visits: S.visits, events: S.events,
    };
  }

  function suggest() {
    var p = profile();
    if (!p.top || p.stage === "new") {
      return { label: "Start with the sound", sub: "The catalogue · every record on the page", href: "app.html", why: "new" };
    }
    var here = location.pathname.split("/").pop() || "index.html";
    var pick = p.top, i = 0;
    while (PAGES[pick] && PAGES[pick][0] === here && i < p.ranked.length - 1) {
      i++; pick = p.ranked[i][0]; // never point at the room they're standing in
    }
    var g = PAGES[pick] || PAGES.music;
    return { label: g[1], sub: g[2], href: g[0], why: pick + ":" + p.stage };
  }

  /* the wrap: everything MCC_TRACK hears, the model learns */
  var orig = window.MCC_TRACK;
  window.MCC_TRACK = function (name, params) {
    try { observe(name, params); } catch (e) {}
    return orig(name, params);
  };

  return { profile: profile, suggest: suggest, observe: observe,
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} } };
})();
