/* ============================================================
   MCC_SANDBOX — the guest door. Two whole lives, ready to wear.

   Christi and Josiah are fully-dressed sandbox residents: tickers,
   deals in every state, worth on the books. A visitor steps into
   one, gets the quick walkthrough, and lands inside the M app —
   no email, no account, nothing to lose. Leaving is one tap.
   Sandbox is a costume, not an account: it never writes to the
   cloud, and the moment a real session exists it stands down.
   ============================================================ */
(function () {
  "use strict";
  var KEY = "mcc_sandbox";
  function jget() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }

  var PEOPLE = {
    christi: {
      name: "Christi", tick: "CHRI", color: "#e5383b",
      line: "Braids & beauty · booked and busy",
      worth: 2340.50, boost: "+3.75%", streak: 6,
      deals: [
        { title: "Knotless full set — Saturday 9am", status: "paid", fee: 180 },
        { title: "Bridal party · 4 heads", status: "locked", fee: 220 },
        { title: "Color touch-up — Thursday", status: "proposed", fee: 90 },
      ],
      intro: "Christi does hair. No song splits, no studios — just clients, dates, and money on the record. The platform prices her like a stock because her books ARE the price.",
    },
    josiah: {
      name: "Josiah", tick: "JOSI", color: "#45b6ff",
      line: "Producer · beats, features, splits",
      worth: 3105.25, boost: "+5.00%", streak: 11,
      deals: [
        { title: "Feature verse — 40% split, signed", status: "signed", fee: 500 },
        { title: "Beat lease · exclusive", status: "paid", fee: 350 },
        { title: "Hook + mix — countered at 25%", status: "countered", fee: 275 },
      ],
      intro: "Josiah moves music. Features, splits, sessions — every percentage signed in the Market before anything drops. His streak is 11 days and his price shows it.",
    },
  };

  var who = jget();
  var authed = !!(window.MCC_AUTH && window.MCC_AUTH.user && window.MCC_AUTH.user());
  if (authed && who) { try { localStorage.removeItem(KEY); } catch (e) {} who = null; } // real life wins

  function css() {
    var el = document.createElement("style");
    el.textContent =
      ".sbx__tiles{display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin:0.2rem 0 0.9rem}" +
      ".sbx__tile{border:1px solid rgba(244,239,230,0.18);border-radius:16px;background:rgba(10,8,7,0.55);color:#f4efe6;" +
      "font:inherit;text-align:center;cursor:pointer;padding:1rem 0.6rem 0.9rem;transition:transform 0.12s,border-color 0.2s}" +
      ".sbx__tile:active{transform:scale(0.95)}" +
      ".sbx__tile i{display:grid;place-items:center;font-style:normal;width:52px;height:52px;margin:0 auto 0.5rem;border-radius:50%;" +
      "font-weight:800;font-size:1.05rem;border:2px solid var(--c);background:color-mix(in srgb,var(--c) 20%,transparent)}" +
      ".sbx__tile b{display:block;font-size:0.95rem;font-weight:800}" +
      ".sbx__tile small{display:block;color:#9e9890;font-size:0.68rem;margin-top:0.2rem;line-height:1.4}" +
      ".sbx__band{position:fixed;top:0;left:0;right:0;z-index:210;display:flex;align-items:center;justify-content:center;gap:0.8em;" +
      "background:linear-gradient(90deg,#3a2b04,#4d3a06);color:#ffd84f;font-size:0.72rem;font-weight:800;letter-spacing:0.06em;" +
      "padding:0.45em 1em calc(0.45em + 0px);border-bottom:1px solid rgba(255,216,79,0.4)}" +
      ".sbx__band button{background:none;border:1px solid rgba(255,216,79,0.5);border-radius:100px;color:#ffd84f;font:inherit;" +
      "font-size:0.66rem;padding:0.25em 0.9em;cursor:pointer}" +
      "body.has-sbx{padding-top:2rem}" +
      ".sbx__veil{position:fixed;inset:0;z-index:300;background:rgba(5,4,3,0.88);backdrop-filter:blur(4px);display:grid;place-items:center;padding:1.2rem}" +
      ".sbx__card{max-width:24rem;width:100%;background:#14110e;border:1px solid rgba(244,239,230,0.16);border-radius:20px;padding:1.5rem 1.4rem 1.4rem;color:#f4efe6}" +
      ".sbx__card small.k{font-size:0.64rem;letter-spacing:0.2em;text-transform:uppercase;color:#9e9890;font-weight:800}" +
      ".sbx__card h2{font-size:1.4rem;font-weight:800;margin:0.2rem 0 0.6rem}" +
      ".sbx__card p{color:#c9c3ba;font-size:0.88rem;line-height:1.65}" +
      ".sbx__deal{display:flex;justify-content:space-between;gap:0.8rem;border-top:1px dashed rgba(244,239,230,0.14);padding:0.5em 0;font-size:0.8rem}" +
      ".sbx__deal em{font-style:normal;color:#9e9890;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em}" +
      ".sbx__nav{display:flex;gap:0.6rem;margin-top:1.1rem}" +
      ".sbx__nav button{flex:1;border:0;border-radius:100px;font:inherit;font-weight:800;font-size:0.85rem;padding:0.85em;cursor:pointer}" +
      ".sbx__go{background:#00c805;color:#04130a}.sbx__skip{background:none;border:1px solid rgba(244,239,230,0.3) !important;color:#f4efe6}";
    document.head.appendChild(el);
  }

  /* ---- the walkthrough: four cards, then the app ---- */
  function walkthrough(p) {
    var steps = [
      { k: "You are, for now", h: p.name + " · $" + p.tick,
        body: "<p>" + p.intro + "</p>" +
          p.deals.map(function (d) {
            return '<div class="sbx__deal"><span>' + d.title + "</span><span><em>" + d.status + "</em> · $" + d.fee + "</span></div>";
          }).join("") +
          '<div class="sbx__deal"><b>True worth (only ' + p.name + ' sees it)</b><b>$' + p.worth.toLocaleString() + "</b></div>" },
      { k: "The floor", h: "Everybody trades.",
        body: "<p>The Market is a live exchange — every person and room runs under a ticker, moved by real work. The world sees points; only you ever see your own dollars.</p>" },
      { k: "The money", h: "M Pay is the wallet.",
        body: "<p>Name a price, pick a person, send the deal. Booking links, payment links, deal threads — the whole desk lives behind the green coin.</p>" },
      { k: "The game", h: "The price moves daily.",
        body: "<p>Watch for the green chip: tasks pay +1% each, streaks stack, silence costs. " + p.name + "'s streak is " + p.streak + " days — that's why the " + p.boost + ".</p>" },
    ];
    var i = 0;
    var veil = document.createElement("div");
    veil.className = "sbx__veil";
    function paint() {
      var st = steps[i];
      veil.innerHTML = '<div class="sbx__card"><small class="k">' + st.k + " · " + (i + 1) + "/" + steps.length + "</small>" +
        "<h2>" + st.h + "</h2>" + st.body +
        '<div class="sbx__nav">' +
        (i < steps.length - 1
          ? '<button class="sbx__skip" type="button" data-a="skip">Skip</button><button class="sbx__go" type="button" data-a="next">Next</button>'
          : '<button class="sbx__go" type="button" data-a="done">Step into the app &rarr;</button>') +
        "</div></div>";
    }
    veil.addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "next") { i++; paint(); track("sandbox_step", { step: i }); }
      else if (a === "skip" || a === "done") {
        track("sandbox_enter_app", { who: p.tick, skipped: a === "skip" });
        location.href = "market.html#pay";
      }
    });
    paint();
    document.body.appendChild(veil);
  }

  window.MCC_SANDBOX = {
    people: PEOPLE,
    active: function () { return !authed && jget(); },
    enter: function (id) {
      var p = PEOPLE[id];
      if (!p) return;
      try { localStorage.setItem(KEY, JSON.stringify({ who: id, at: Date.now() })); } catch (e) {}
      track("sandbox_enter", { who: p.tick });
      walkthrough(p);
    },
    leave: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      track("sandbox_leave", {});
      location.href = "profile.html";
    },
  };

  function boot() {
    css();
    var here = location.pathname.split("/").pop() || "index.html";
    var sb = window.MCC_SANDBOX.active();
    var p = sb && PEOPLE[sb.who];

    /* the band: you always know you're in the costume */
    if (p && here !== "index.html") {
      var band = document.createElement("div");
      band.className = "sbx__band";
      band.innerHTML = "&#129514; Sandbox &middot; you're " + p.name + " ($" + p.tick + ") " +
        '<button type="button">Leave</button>';
      band.querySelector("button").addEventListener("click", window.MCC_SANDBOX.leave);
      document.body.appendChild(band);
      document.body.classList.add("has-sbx");
    }

    /* the default door: guests first on the profile page */
    var out = document.getElementById("pfOut");
    if (out && !authed) {
      var host = document.createElement("section");
      host.className = "pf__card";
      host.innerHTML = '<h2>Walk in as a guest <span class="ta__status">the sandbox &middot; nothing to lose</span></h2>' +
        '<div class="sbx__tiles">' +
        Object.keys(PEOPLE).map(function (id) {
          var pp = PEOPLE[id];
          return '<button class="sbx__tile" type="button" data-w="' + id + '" style="--c:' + pp.color + '">' +
            "<i>" + pp.name[0] + "</i><b>" + pp.name + " · $" + pp.tick + "</b><small>" + pp.line + "</small></button>";
        }).join("") + "</div>" +
        '<p class="pf__note">Two whole lives, already set up — deals, tickers, worth. Tap one, take the tour, feel the app. Your real account is one tap below whenever you\'re ready.</p>';
      out.insertBefore(host, out.firstChild);
      host.addEventListener("click", function (e) {
        var t = e.target.closest(".sbx__tile");
        if (t) window.MCC_SANDBOX.enter(t.getAttribute("data-w"));
      });
    }

    /* the persona's room on the profile while in costume */
    if (p && out) {
      var room = document.createElement("section");
      room.className = "pf__card";
      room.innerHTML = '<h2>' + p.name + "'s room <span class=\"ta__status\">sandbox</span></h2>" +
        '<p style="font-size:2rem;font-weight:800;font-variant-numeric:tabular-nums">$' + p.worth.toLocaleString() +
        ' <small style="font-size:0.7rem;color:#9e9890">true worth · only ' + p.name + " sees this</small></p>" +
        p.deals.map(function (d) {
          return '<div class="sbx__deal"><span>' + d.title + "</span><span><em>" + d.status + "</em> · $" + d.fee + "</span></div>";
        }).join("");
      out.insertBefore(room, out.firstChild);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
