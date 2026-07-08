/* ============================================================
   MCC_STOCK — the M Stock: every member's labor, tracked like
   a ticker. The index is built from REAL platform actions —
   completed bookings, signed deals, logged performances, a live
   listing — measured against the market's pace (how many live
   providers are working the same floor). A deterministic daily
   drift (seeded from the member's own id + the date, so it never
   changes on refresh) makes the line breathe like a real market.

   Dollars are private by default: the $ toggle reveals the money
   actually recorded on the books (signed deal fees), and hides it
   again with one tap. The preference sticks per device.

   MCC_STOCK.build({ uid, requests, deals, performances, listing, marketN })
     → { series:[{d,v}], value, changePct, dollars }
   MCC_STOCK.mount(el, data) → renders ticker + sparkline + $ toggle
   ============================================================ */
(function () {
  "use strict";

  var DAYS = 30;
  var W = { done: 6, accepted: 2.5, signed: 8, locked: 3, performance: 4, live: 5 };

  /* deterministic per-user, per-day drift: hash(uid+date) → -1..1 */
  function drift(uid, dayKey) {
    var s = String(uid) + dayKey, h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return ((h % 1000) / 1000 - 0.5) * 2;
  }
  function dayKey(t) { return new Date(t).toISOString().slice(0, 10); }

  function build(inp) {
    inp = inp || {};
    var uid = inp.uid || "guest";
    var marketN = Math.max(1, inp.marketN || 1);

    /* every action lands points on its calendar day */
    var pts = {};
    function add(t, w) {
      if (!t) return;
      var k = dayKey(t);
      pts[k] = (pts[k] || 0) + w;
    }
    (inp.requests || []).forEach(function (r) {
      if (r.status === "done") add(r.created_at, W.done);
      else if (r.status === "accepted") add(r.created_at, W.accepted);
    });
    (inp.deals || []).forEach(function (d) {
      if (d.status === "signed") add(d.updated_at || d.created_at, W.signed);
      else if (d.status === "locked") add(d.updated_at || d.created_at, W.locked);
    });
    (inp.performances || []).forEach(function (p) { add(p.created_at, W.performance); });
    if (inp.listing && inp.listing.status === "live") add(inp.listing.updated_at || inp.listing.created_at, W.live);

    /* walk the last 30 days: labor compounds, quiet days cool toward par,
       and the market's size sets how hard the floor pushes back */
    var series = [];
    var v = 100;
    var now = Date.now();
    for (var i = DAYS - 1; i >= 0; i--) {
      var k = dayKey(now - i * 864e5);
      var earned = pts[k] || 0;
      var pressure = 0.35 * Math.log(marketN + 1);      // more live players, faster the floor moves
      v = v + earned - (earned ? 0 : pressure * 0.4) + drift(uid, k) * 1.4;
      v = Math.max(38, v);
      series.push({ d: k, v: +v.toFixed(2) });
    }

    var last = series[series.length - 1].v;
    var prev = series[series.length - 2] ? series[series.length - 2].v : last;
    var dollars = (inp.deals || []).reduce(function (a, d) {
      return a + (d.status === "signed" && d.terms && d.terms.fee ? +d.terms.fee : 0);
    }, 0);

    return {
      series: series,
      value: last,
      changePct: prev ? +(((last - prev) / prev) * 100).toFixed(2) : 0,
      dollars: dollars,
    };
  }

  function mount(el, data) {
    if (!el || !data) return;
    var up = data.changePct >= 0;
    var col = up ? "#2fbf71" : "#e5383b";
    var hidKey = "mcc_stock_show";
    var show = false;
    try { show = localStorage.getItem(hidKey) === "1"; } catch (e) {}

    el.innerHTML =
      '<div style="display:flex;align-items:baseline;gap:0.6rem;flex-wrap:wrap">' +
      '<b style="font-family:var(--display);font-size:1.9rem;font-weight:400">' + data.value.toFixed(2) + "</b>" +
      '<span style="color:' + col + ';font-weight:700;font-size:0.9rem">' + (up ? "▲" : "▼") + " " +
      Math.abs(data.changePct).toFixed(2) + "%</span>" +
      '<button type="button" id="mstockDollar" style="margin-left:auto;border:1px solid rgba(244,239,230,0.3);' +
      'border-radius:100px;background:none;color:var(--cream-dim);font:inherit;font-size:0.66rem;' +
      'letter-spacing:0.14em;text-transform:uppercase;padding:0.4em 1em;cursor:pointer">$</button></div>' +
      '<canvas id="mstockCv" width="600" height="120" style="width:100%;height:60px;margin-top:0.5rem"></canvas>' +
      '<p id="mstockMoney" style="min-height:1.3em;font-size:0.8rem;color:var(--cream-dim);margin-top:0.3rem"></p>' +
      '<p style="font-size:0.68rem;color:var(--cream-dim);letter-spacing:0.08em;margin-top:0.2rem">' +
      "Your labor vs the market's pace — bookings done, deals signed, shows logged move it up; the floor never sleeps.</p>";

    var cv = el.querySelector("#mstockCv");
    var cx = cv.getContext("2d");
    var s = data.series;
    var min = Infinity, max = -Infinity;
    s.forEach(function (p) { min = Math.min(min, p.v); max = Math.max(max, p.v); });
    var pad = (max - min) * 0.15 || 1;
    min -= pad; max += pad;
    function X(i) { return (i / (s.length - 1)) * (cv.width - 4) + 2; }
    function Y(v) { return cv.height - 4 - ((v - min) / (max - min)) * (cv.height - 8); }
    // the fill under the line
    cx.beginPath();
    cx.moveTo(X(0), cv.height);
    s.forEach(function (p, i) { cx.lineTo(X(i), Y(p.v)); });
    cx.lineTo(X(s.length - 1), cv.height);
    var g = cx.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, up ? "rgba(47,191,113,0.35)" : "rgba(229,56,59,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = g; cx.fill();
    // the line itself
    cx.beginPath();
    s.forEach(function (p, i) { i ? cx.lineTo(X(i), Y(p.v)) : cx.moveTo(X(i), Y(p.v)); });
    cx.strokeStyle = col; cx.lineWidth = 2.5; cx.lineJoin = "round"; cx.stroke();

    var money = el.querySelector("#mstockMoney");
    var btn = el.querySelector("#mstockDollar");
    function paintMoney() {
      money.textContent = show
        ? "On the books: $" + data.dollars.toLocaleString() + " in signed deals"
        : "Dollar amount hidden — tap $ to show it. Your call, always.";
      btn.style.color = show ? "#2fbf71" : "";
      btn.style.borderColor = show ? "#2fbf71" : "";
    }
    btn.addEventListener("click", function () {
      show = !show;
      try { localStorage.setItem(hidKey, show ? "1" : "0"); } catch (e) {}
      paintMoney();
      if (window.MCC_TRACK) window.MCC_TRACK("mstock_dollar", { show: show });
    });
    paintMoney();
  }

  window.MCC_STOCK = { build: build, mount: mount };
})();
