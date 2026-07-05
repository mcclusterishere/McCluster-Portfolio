/* ============================================================
   Analytics — Google Analytics 4.
   Paste your Measurement ID (GA4 Admin → Data Streams, looks
   like "G-XXXXXXXXXX") into ANALYTICS_ID below. While it is
   empty, nothing loads and every event call is a silent no-op —
   no tracking, no external requests.
   ============================================================ */

window.ANALYTICS_ID = "";

window.MCC_TRACK = (function () {
  var id = window.ANALYTICS_ID;
  if (!id) return function () {};
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", id);
  return function (name, params) { gtag("event", name, params || {}); };
})();
