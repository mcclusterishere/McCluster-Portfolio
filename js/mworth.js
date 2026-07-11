/* ============================================================
   M-WORTH — the valuation engine, and the privacy wall.

   THE ALGORITHM (documented in docs/mworth.md):
   A person's worth is priced from four books, every signal
   decayed by age so the number is about who you ARE, not who
   you were:

     WORTH = (SEAT + LABOR + DEMAND + STAGE) × MOMENTUM

   · SEAT    — the base: a live listing, and how complete it is
               (photo, rate, headline, roles, ticker, amenities).
     $150 for the seat + up to $350 for a fully-dressed listing.
   · LABOR   — real money on the record. Deal fees weighted by
               how real they got: paid/completed 100%, signed
               60%, locked 45%, proposed 20% — each decayed with
               a 45-day half-life. This is the heaviest book.
   · DEMAND  — inbound gravity: booking requests ($40 each) and
               deals pointed AT you ($25 each), decayed.
   · STAGE   — the record of showing up: logged performances
               ($120 each), decayed slower (90-day half-life:
               a stage stays on the résumé).
   · MOMENTUM — activity in the last 7 days vs the last 30:
               a hot week multiplies up to 1.25×, a silent month
               drifts to 0.85×. Our Street never sleeps, neither
               does the number.

   THE PRIVACY WALL:
   True worth in dollars is computed ONLY from the owner's own
   rows — deals, requests, performances are unreadable for
   anyone else at the database level (RLS). So the real number
   physically cannot be computed for another person's account.
   The public floor shows M-SCORE: relative points and moves,
   never dollars. mine() → dollars + receipts. score() → points.
   ============================================================ */
(function () {
  "use strict";

  var DAY = 864e5;

  function ageDays(t) {
    var ms = Date.now() - new Date(t || Date.now()).getTime();
    return Math.max(0, ms / DAY);
  }
  function decay(amount, t, halfLife) {
    return amount * Math.exp(-ageDays(t) / (halfLife || 45));
  }

  var DEAL_W = { paid: 1.0, completed: 1.0, signed: 0.6, locked: 0.45, countered: 0.3, proposed: 0.2, draft: 0.05 };

  function completeness(listing) {
    if (!listing) return 0;
    var checks = [
      !!listing.name, !!listing.headline, !!listing.photo,
      !!(listing.roles && listing.roles.length),
      !!(listing.ticker),
      !!(listing.space && listing.space.rate) || !!(listing.terms && listing.terms.floor),
      !!(listing.space && listing.space.amenities && listing.space.amenities.length),
      !!listing.blurb || !!listing.area,
    ];
    return checks.filter(Boolean).length / checks.length;
  }

  /* the true book — only computable by the owner (RLS guards the inputs) */
  function appraise(inp) {
    var uid = inp.uid || "";
    var listing = inp.listing || null;
    var deals = inp.deals || [];
    var requests = inp.requests || [];
    var performances = inp.performances || [];

    var seat = (listing ? 150 : 0) + completeness(listing) * 350;

    var labor = 0;
    deals.forEach(function (d) {
      var fee = +((d.terms && d.terms.fee) || 0);
      var w = DEAL_W[d.status] || 0.1;
      labor += decay(fee * w, d.updated_at || d.created_at, 45);
    });

    var demand = 0;
    requests.forEach(function (r) { demand += decay(40, r.created_at, 45); });
    deals.forEach(function (d) {
      // a deal aimed at you is demand even before money moves
      if (d.to_slug && listing && d.to_slug === listing.slug) demand += decay(25, d.created_at, 45);
    });

    var stage = 0;
    performances.forEach(function (p) { stage += decay(120, p.performed_at || p.created_at, 90); });

    // v2 live-model variables: site behavior and the devices themselves.
    // Small weights on purpose — money keeps its 10× standing.
    var behavior = 0;
    if (inp.behavior) {
      behavior += Math.min(100, (inp.behavior.sessions || 0) * 2);   // showing up
      behavior += Math.min(60, (inp.behavior.depth || 0) * 20);      // how deep they read
      behavior += Math.min(45, (inp.behavior.devices || 0) * 15);    // instruments on the account
      behavior += Math.min(50, (inp.behavior.grindE || 0) * 0.05);   // staging-model score feeds the live book
    }

    // REPUTATION — the word of the people who'd know. Clients (paid
    // through a real deal) speak ~3x louder than peers; volume matters
    // on a square root so ten reviews beat one but can't drown labor.
    var rep = 0;
    if (inp.ratings && inp.ratings.length) {
      var cl = inp.ratings.filter(function (r) { return r.role === "client"; });
      var pr = inp.ratings.filter(function (r) { return r.role === "peer"; });
      function avg(a) { return a.reduce(function (x, r) { return x + r.stars; }, 0) / a.length; }
      if (cl.length) rep += (avg(cl) - 3) * 30 * Math.min(10, Math.sqrt(cl.length) * 3);
      if (pr.length) rep += (avg(pr) - 3) * 10 * Math.min(10, Math.sqrt(pr.length) * 3);
      rep = Math.max(-400, Math.min(400, rep));
    }

    // momentum: this week against this month
    var wk = 0, mo = 0;
    function bump(t) {
      var a = ageDays(t);
      if (a <= 7) wk++;
      if (a <= 30) mo++;
    }
    deals.forEach(function (d) { bump(d.updated_at || d.created_at); });
    requests.forEach(function (r) { bump(r.created_at); });
    performances.forEach(function (p) { bump(p.created_at); });
    var momentum = mo === 0 ? 0.85 : Math.min(1.25, 0.85 + (wk / mo) * 0.4 + mo * 0.01);

    var raw = seat + labor + demand + stage + behavior + rep;
    var worth = raw * momentum;

    var rows = [
      { label: "The seat — listing live & dressed", dollars: +seat.toFixed(2) },
      { label: "Labor — money on the record", dollars: +labor.toFixed(2) },
      { label: "Demand — who's knocking", dollars: +demand.toFixed(2) },
      { label: "The stage — shows logged", dollars: +stage.toFixed(2) },
    ];
    if (inp.behavior) rows.push({ label: "Behavior — sessions, depth, devices", dollars: +behavior.toFixed(2) });
    if (inp.ratings && inp.ratings.length) rows.push({ label: "The word — client & peer ratings", dollars: +rep.toFixed(2) });
    rows.push({ label: "Momentum ×" + momentum.toFixed(2), dollars: +(worth - raw).toFixed(2) });

    return { worth: +worth.toFixed(2), momentum: +momentum.toFixed(3), breakdown: rows };
  }

  /* the owner's number: gathers the private books and appraises */
  function mine() {
    if (!(window.MCC_AUTH && window.MCC_AUTH.user && window.MCC_AUTH.user())) {
      return Promise.reject(new Error("signed out"));
    }
    return window.MCC_NET.myDeals().then(function (res) {
      return Promise.all([
        window.MCC_NET.myRequests().catch(function () { return []; }),
        window.MCC_NET.myPerformances().catch(function () { return []; }),
        (res.mine && res.mine.slug && window.MCC_NET.listRatings
          ? window.MCC_NET.listRatings(res.mine.slug).catch(function () { return []; })
          : Promise.resolve([])),
      ]).then(function (r) {
        return appraise({
          uid: window.MCC_SUPA.uid(),
          listing: res.mine, deals: res.rows || [],
          requests: r[0] || [], performances: r[1] || [],
          ratings: r[2] || [],
        });
      });
    });
  }

  /* the STAGED price: the true book bent by the grind (the staging
     model). The bend is hard-capped in mgrind, so labor stays ~10×. */
  function staged() {
    return mine().then(function (w) {
      var b = (window.MCC_GRIND && window.MCC_GRIND.boost()) || 0;
      var sw = +(w.worth * (1 + b / 100)).toFixed(2);
      return {
        worth: sw, base: w.worth, boost: b, momentum: w.momentum,
        breakdown: w.breakdown.concat([{
          label: "The grind — showing up (" + (b >= 0 ? "+" : "") + b + "% today)",
          dollars: +(sw - w.worth).toFixed(2),
        }]),
      };
    });
  }

  window.MCC_WORTH = { appraise: appraise, mine: mine, staged: staged, completeness: completeness };
})();
