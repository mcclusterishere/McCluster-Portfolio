/* ============================================================
   MCC_STREET — the Street Score. The credit bureau for people
   the bureaus can't see, built from the paper (docs/street-score.md).

   FICO leaves billions unscoreable; the Street Score reads what
   the platform actually witnesses. Five books, weighted like the
   paper prescribes, on the familiar 300–850 dial:

     PAYMENT HISTORY  35%  — deals that reached paid/completed,
                             and how fast signed became done
                             (the rent-and-utilities analog)
     CASH FLOW        20%  — money moving in a steady cadence,
                             not one lucky month
     COMMUNITY        20%  — client & peer ratings and their
                             volume (the endorsement layer)
     BEHAVIOR         15%  — the grind: streaks, engagement,
                             shadow depth (psychometric-lite;
                             the duality quiz can plug in here)
     TENURE & SEAT    10%  — time on the platform, listing
                             fully dressed

   PRIVACY: like true worth, the Street Score is computed from
   books RLS only serves to their owner. Only you see your score.
   ============================================================ */
(function () {
  "use strict";
  var DAY = 864e5;

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function ageDays(t) { return Math.max(0, (Date.now() - new Date(t || Date.now()).getTime()) / DAY); }

  function score(inp) {
    var deals = inp.deals || [];
    var ratings = inp.ratings || [];
    var listing = inp.listing || null;
    var grind = inp.grind || {};

    /* PAYMENT HISTORY — did money promised become money moved? */
    var settled = 0, live = 0, slow = 0;
    deals.forEach(function (d) {
      if (d.status === "paid" || d.status === "completed") {
        settled++;
        // signed → completed inside 30 days reads as paying on time
        if (d.status === "completed" && ageDays(d.created_at) - ageDays(d.updated_at) > 30) slow++;
      } else if (d.status === "declined") { /* neutral — walking away is allowed */ }
      else live++;
    });
    var pay = settled === 0 ? 0.35 // no record ≠ bad record: start neutral-low
      : clamp01(settled / Math.max(1, settled + live * 0.3) - slow * 0.08 + Math.min(0.25, settled * 0.05));

    /* CASH FLOW — cadence over jackpots: how many of the last 6
       months saw money move? */
    var months = {};
    deals.forEach(function (d) {
      if (d.status !== "paid" && d.status !== "completed") return;
      var fee = +((d.terms && d.terms.fee) || 0);
      if (fee <= 0) return;
      var a = ageDays(d.updated_at || d.created_at);
      if (a <= 183) months[Math.floor(a / 30.5)] = (months[Math.floor(a / 30.5)] || 0) + fee;
    });
    var activeMonths = Object.keys(months).length;
    var volume = Object.keys(months).reduce(function (a, k) { return a + months[k]; }, 0);
    var cash = clamp01(activeMonths / 6 * 0.7 + Math.min(0.3, volume / 5000 * 0.3));

    /* COMMUNITY — the endorsements: clients ~3x peers, volume on a root */
    var cl = ratings.filter(function (r) { return r.role === "client"; });
    var pr = ratings.filter(function (r) { return r.role === "peer"; });
    function avg(a) { return a.length ? a.reduce(function (x, r) { return x + r.stars; }, 0) / a.length : 0; }
    function vol(n) { return Math.min(1, 0.4 + Math.sqrt(n) * 0.2); } // volume matters, on a root
    var community = ratings.length === 0 ? 0.3
      : clamp01(
          (cl.length ? (avg(cl) / 5) * 0.75 * vol(cl.length) : 0) +
          (pr.length ? (avg(pr) / 5) * 0.25 * vol(pr.length) : 0)
        );

    /* BEHAVIOR — the grind is the psychometric-lite layer */
    var behavior = clamp01(
      Math.min(1, (grind.E || 0) / 300) * 0.5 +
      Math.min(1, (grind.streak || 0) / 14) * 0.35 +
      Math.min(1, (grind.shadow || 0) / 5) * 0.15 -
      Math.min(0.4, (grind.idle || 0) * 0.04)
    );

    /* TENURE & SEAT */
    var tenure = 0;
    if (listing) {
      var comp = window.MCC_WORTH ? window.MCC_WORTH.completeness(listing) : 0.5;
      tenure = clamp01(Math.min(1, ageDays(listing.created_at) / 180) * 0.5 + comp * 0.5);
    }

    var books = [
      { key: "pay", label: "Payment history", w: 0.35, v: pay, tip: "Complete signed deals — money that moved is the loudest book." },
      { key: "cash", label: "Cash flow", w: 0.20, v: cash, tip: "Steady months beat one big month — keep deals landing." },
      { key: "community", label: "Community word", w: 0.20, v: community, tip: "Finished work earns client stars; they carry 3× a peer's." },
      { key: "behavior", label: "Behavior", w: 0.15, v: behavior, tip: "Show up daily — streaks and depth read as reliability." },
      { key: "tenure", label: "Tenure & seat", w: 0.10, v: tenure, tip: "Dress the listing fully and let time on the floor accrue." },
    ];
    var unit = books.reduce(function (a, b) { return a + b.w * b.v; }, 0);
    var s = Math.round(300 + 550 * clamp01(unit));

    return {
      score: s,
      band: s >= 760 ? "Excellent" : s >= 670 ? "Good" : s >= 580 ? "Building" : "Starting",
      books: books.map(function (b) { return { key: b.key, label: b.label, weight: b.w, value: +(b.v * 100).toFixed(0), tip: b.tip }; }),
      // the next move: the weakest weighted book is the coaching
      next: books.slice().sort(function (a, b) { return (a.v * a.w) - (b.v * b.w); })[0].tip,
    };
  }

  /* the owner's score: same private books as true worth, plus the grind */
  function mine() {
    if (!(window.MCC_AUTH && window.MCC_AUTH.user && window.MCC_AUTH.user())) {
      return Promise.reject(new Error("signed out"));
    }
    return window.MCC_NET.myDeals().then(function (res) {
      return ((res.mine && res.mine.slug && window.MCC_NET.listRatings)
        ? window.MCC_NET.listRatings(res.mine.slug).catch(function () { return []; })
        : Promise.resolve([])
      ).then(function (ratings) {
        var g = {};
        try {
          var st = window.MCC_GRIND ? window.MCC_GRIND.state() : {};
          var day = new Date().toISOString().slice(0, 10);
          g = { E: st.E || 0, streak: st.streak || 0, idle: st.idleDays || 0,
            shadow: (st.shadow && st.shadow[day] || []).length };
        } catch (e) {}
        var out = score({ deals: res.rows || [], ratings: ratings, listing: res.mine, grind: g });
        try { localStorage.setItem("mcc_street_last", JSON.stringify({ s: out.score, at: Date.now() })); } catch (e) {}
        return out;
      });
    });
  }

  window.MCC_STREET = { score: score, mine: mine };
})();
