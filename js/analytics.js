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

window.ANALYTICS_ID = "";
window.TRACK_ENDPOINT = "";

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
    gtag("config", gaId);
  }

  return function (name, params) {
    params = params || {};
    if (gtag) gtag("event", name, params);
    if (endpoint) {
      // fire-and-forget; sendBeacon survives page exits
      var payload = JSON.stringify({ event: name, params: params, path: location.pathname, ts: Date.now() });
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, payload);
      else fetch(endpoint, { method: "POST", body: payload, keepalive: true }).catch(function () {});
    }
  };
})();
