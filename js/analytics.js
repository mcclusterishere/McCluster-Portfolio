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
window.INTAKE_ENDPOINT = "";

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
