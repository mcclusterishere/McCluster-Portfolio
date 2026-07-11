/* MCC_TOUR — the walk of Our Street.
   The sandbox personas are gone; this is what replaced them. A real
   spotlight tour over the REAL market — no fake identity, no costume,
   just the room shown properly: Our Street, a live ticker, the pay
   door, the keypad, the desk. Each step spotlights the actual control
   and either the visitor taps it themselves or Next performs the move.

   Runs once for signed-out first visits (mcc_tour_done banks it),
   forced any time with ?tour=1 or #tour, re-launched from the
   "✦ Show me around" chip in the rail. Missing target → the card
   centers itself; the tour never leaves a blank overlay. */
(function () {
  "use strict";
  if (!document.getElementById("floor")) return; // market only

  var DONE_KEY = "mcc_tour_done";
  var box, veil, card, current = -1, alive = false;

  var css2 = document.createElement("style");
  css2.textContent = "@keyframes tourIn{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}" +
    ".tour__card{animation:tourIn .4s cubic-bezier(.2,.9,.2,1)}" +
    "@keyframes tourPulse{0%,100%{box-shadow:0 0 0 0 rgba(229,56,59,.6)}55%{box-shadow:0 0 0 12px rgba(229,56,59,0)}}" +
    ".tour__card [data-tour-next]{animation:tourPulse 1.6s ease-out infinite}" +
    "@keyframes tourBreathe{0%,100%{outline-offset:0}50%{outline-offset:6px}}" +
    ".tour__veil{outline:2px solid rgba(244,239,230,.35);animation:tourBreathe 1.8s ease-in-out infinite}" +
    "@media (prefers-reduced-motion: reduce){.tour__card,.tour__card [data-tour-next],.tour__veil{animation:none}}";
  document.head.appendChild(css2);
  var css = document.createElement("style");
  css.textContent =
    "#mccTour{position:fixed;inset:0;z-index:9000;pointer-events:none}" +
    "#mccTour .tour__veil{position:absolute;border-radius:14px;box-shadow:0 0 0 200vmax rgba(5,4,3,0.82);" +
    "transition:top 0.35s,left 0.35s,width 0.35s,height 0.35s;border:1px solid rgba(244,239,230,0.35)}" +
    "#mccTour .tour__card{position:absolute;pointer-events:auto;max-width:330px;width:calc(100vw - 2.4rem);" +
    "background:rgba(20,16,14,0.97);border:1px solid rgba(244,239,230,0.18);border-radius:16px;" +
    "padding:1.05rem 1.1rem 1.15rem;box-shadow:0 18px 50px rgba(0,0,0,0.55);transition:top 0.35s,left 0.35s}" +
    "#mccTour .tour__kick{font-family:var(--micro,monospace);font-size:0.78rem;letter-spacing:0.22em;" +
    "text-transform:uppercase;color:#c99d45;display:flex;justify-content:space-between;gap:0.6rem}" +
    "#mccTour h3{font-family:var(--display,inherit);font-weight:400;text-transform:uppercase;" +
    "font-size:1.25rem;line-height:1.05;margin:0.45rem 0 0.35rem;color:var(--cream,#f4efe6)}" +
    "#mccTour p{margin:0;color:rgba(244,239,230,0.75);font-size:0.9rem;line-height:1.55}" +
    "#mccTour .tour__acts{display:flex;gap:0.5rem;margin-top:0.85rem;align-items:center}" +
    "#mccTour .tour__next{border:0;border-radius:10px;cursor:pointer;font:inherit;font-weight:800;" +
    "letter-spacing:0.05em;text-transform:uppercase;font-size:0.9rem;padding:0.65em 1.3em;color:#fff;" +
    "background:linear-gradient(120deg,var(--ruby,#a4161a),var(--ruby-hot,#e5383b))}" +
    "#mccTour .tour__skip{background:none;border:0;cursor:pointer;font:inherit;font-size:0.84rem;" +
    "color:rgba(244,239,230,0.7);text-decoration:underline;padding:0.4em}" +
    "#mccTour .tour__img{width:calc(100% + 2.2rem);margin:-1.05rem -1.1rem 0.7rem;height:110px;" +
    "object-fit:cover;border-radius:15px 15px 0 0;display:block}" +
    "#mccTour .tour__doors{display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.7rem}" +
    "#mccTour .tour__doors a{border:1px solid rgba(244,239,230,0.22);border-radius:100px;" +
    "padding:0.42em 0.95em;font-size:0.84rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;" +
    "color:var(--cream,#f4efe6);text-decoration:none;background:rgba(244,239,230,0.05)}" +
    "#mccTour .tour__doors a:hover{border-color:rgba(229,56,59,0.7);background:rgba(229,56,59,0.12)}";
  document.head.appendChild(css);

  function q(sel) { return document.querySelector(sel); }
  function track(ev, data) { if (window.MCC_TRACK) window.MCC_TRACK(ev, data || {}); }

  /* every step: where the light lands, what the card says, and what
     Next does before the light moves on */
  var STEPS = [
    {
      target: null,
      kick: "Our Street",
      title: "Everybody trades.",
      body: "Every artist, room, and operator here runs under a ticker — moved by real work: deals kept, ratings earned, plays counted. This is the whole city on one screen.",
      img: "assets/img/floor-scene.png",
    },
    {
      target: function () { return q("#xcList .xc__row"); },
      kick: "The ticker",
      title: "Tap any name — the book opens.",
      body: "Price, chart, the order book, time & sales. Real records behind every line. Next opens the first one for you.",
      act: function () { var r = q("#xcList .xc__row"); if (r) r.click(); },
    },
    {
      target: function () { return q("#xcDPay"); },
      kick: "The green door",
      title: "E-Up Pay rides every ticker.",
      body: "Come to E-Up, get your re-up: one tap from anyone's book and the keypad opens loaded with their name. Paying somebody never takes more than that.",
      act: function () {
        var b = q("#xcDPay");
        if (b) b.click(); else if (window.MK_SHOW) window.MK_SHOW("pay");
      },
    },
    {
      target: function () { return q("#mpPad"); },
      kick: "The keypad",
      title: "Name your price.",
      body: "Punch in any number. Deposits, features, bookings, a dollar for the culture — the keypad doesn't judge.",
    },
    {
      target: function () { return q("#mpSend"); },
      kick: "Send it",
      title: "It goes out as a real deal.",
      body: "Propose, counter, lock, sign — every step on the record. Desks that carry the card rail check out by card right here; the record holds it either way.",
      act: function () { if (window.MK_SHOW) window.MK_SHOW("yours"); },
    },
    {
      target: function () { return q("#mpYou"); },
      kick: "Your desk",
      title: "This one's yours.",
      body: "Your ticker, your listing, your inbox, your payment link — the whole business. It opens with one tap, no email needed. That button right there.",
    },
    {
      target: function () { return q(".gd__fab"); },
      kick: "The glowing M",
      title: "Your guide lives up here.",
      body: "Tap the M any time, on any page — it knows Our Street, your card, and the fastest route to whatever you're trying to do. Ask it anything in plain words.",
    },
    {
      target: null,
      kick: "The record",
      title: "The whole city is open.",
      body: "Deals build your street credit. Plays move your ticker. Everything you do here becomes yours to keep — and these doors are all one tap away.",
      img: "assets/img/wire-scene.png",
      doors: [
        ["market.html#wire", "The Wire"],
        ["academy.html", "The Academy"],
        ["house.html", "The House"],
        ["spaces.html", "Spaces"],
        ["app.html", "Only Us"],
      ],
    },
  ];

  function ensureDom() {
    if (box) return;
    box = document.createElement("div");
    box.id = "mccTour";
    veil = document.createElement("div");
    veil.className = "tour__veil";
    card = document.createElement("div");
    card.className = "tour__card";
    box.appendChild(veil);
    box.appendChild(card);
    document.body.appendChild(box);
  }

  function place(step, tries) {
    tries = tries || 0;
    var t = step.target ? step.target() : null;
    var r = t ? t.getBoundingClientRect() : null;
    // a hidden target (pane mid-switch) reads 0×0 — wait for it a few
    // beats, then let the card carry the moment centered
    if (r && r.width === 0 && r.height === 0) {
      if (tries < 5) { setTimeout(function () { if (alive) place(step, tries + 1); }, 300); return; }
      r = null;
    }
    if (r && (r.bottom < 60 || r.top > innerHeight - 60) && tries < 6) {
      if (t.scrollIntoView) t.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(function () { if (alive) place(step, tries + 1); }, 380);
      return;
    }
    var pad = 8;
    if (r) {
      veil.style.border = "1px solid rgba(244,239,230,0.35)";
      veil.style.top = (r.top - pad) + "px";
      veil.style.left = (r.left - pad) + "px";
      veil.style.width = (r.width + pad * 2) + "px";
      veil.style.height = (r.height + pad * 2) + "px";
    } else {
      // no target: the veil collapses to an invisible point mid-screen
      // (its shadow still dims the room) and the card speaks alone
      veil.style.border = "0";
      veil.style.top = "50%"; veil.style.left = "50%";
      veil.style.width = "0px"; veil.style.height = "0px";
    }
    // measure the card as actually rendered (innerHTML is already set) so a
    // long step on a tall screen (iPad) can never be pushed off the viewport
    var cardH = card.offsetHeight || 210;
    var cardW = card.offsetWidth || 330;
    var below = r ? r.bottom + pad * 2 + 12 : (innerHeight / 2 - cardH / 2);
    // prefer below the spotlight; if it won't fit, go above; then hard-clamp
    var top = r ? (below + cardH < innerHeight - 12 ? below : (r.top - pad - cardH - 12)) : below;
    top = Math.max(12, Math.min(innerHeight - cardH - 12, top));
    var left = r ? r.left : (innerWidth / 2 - cardW / 2);
    left = Math.max(12, Math.min(innerWidth - cardW - 12, left));
    card.style.top = top + "px";
    card.style.left = left + "px";
  }

  function paint() {
    var s = STEPS[current];
    card.innerHTML =
      (s.img ? '<img class="tour__img" alt="" src="' + s.img + '" onerror="this.remove()">' : "") +
      '<div class="tour__kick"><span>' + s.kick + "</span><span>" + (current + 1) + " / " + STEPS.length + "</span></div>" +
      "<h3>" + s.title + "</h3><p>" + s.body + "</p>" +
      (s.doors ? '<div class="tour__doors">' + s.doors.map(function (d) {
        return '<a href="' + d[0] + '">' + d[1] + "</a>";
      }).join("") + "</div>" : "") +
      '<div class="tour__acts">' +
      '<button class="tour__next" type="button" data-tour-next>' + (current === STEPS.length - 1 ? "Walk Our Street" : "Next") + "</button>" +
      '<button class="tour__skip" type="button" data-tour-skip>Skip the tour</button></div>';
    card.querySelector("[data-tour-next]").addEventListener("click", next);
    card.querySelector("[data-tour-skip]").addEventListener("click", end);
    place(s);
  }

  function next() {
    var s = STEPS[current];
    if (s && s.act) s.act();
    current += 1;
    if (current >= STEPS.length) { end(); return; }
    track("tour_step", { step: current });
    // give the acted-on UI a beat to arrive before the light moves
    setTimeout(function () { if (alive) paint(); }, s && s.act ? 420 : 0);
  }

  function start() {
    if (alive) return;
    alive = true;
    current = 0;
    ensureDom();
    box.style.display = "";
    if (window.MK_SHOW) window.MK_SHOW("floor");
    track("tour_start", {});
    paint();
  }

  function end() {
    alive = false;
    current = -1;
    if (box) box.style.display = "none";
    try { localStorage.setItem(DONE_KEY, "1"); } catch (e) {}
    track("tour_done", {});
  }

  document.addEventListener("keydown", function (ev) {
    if (alive && ev.key === "Escape") end();
  });
  window.addEventListener("resize", function () {
    if (alive && current >= 0) place(STEPS[current]);
  });

  /* the rail chip: the walk is always one tap away */
  var rail = q(".mk__rail");
  if (rail) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mk__jump";
    chip.id = "mkTourChip";
    chip.textContent = "✦ Tour";
    chip.addEventListener("click", start);
    rail.appendChild(chip);
    // the Wire and the Academy ride the same rail — one tap off Our Street
    [["market.html#wire", "⚡ The Wire"], ["academy.html", "⛓ Academy"]].forEach(function (d) {
      var a = document.createElement("a");
      a.className = "mk__jump";
      a.href = d[0];
      a.textContent = d[1];
      rail.appendChild(a);
    });
  }

  /* first visit, signed out, standing on Our Street → the walk begins */
  var forced = /(^|[?&])tour=1/.test(location.search) || location.hash === "#tour";
  var done = false;
  try { done = !!localStorage.getItem(DONE_KEY); } catch (e) {}
  var signedIn = !!(window.MCC_AUTH && window.MCC_AUTH.user && window.MCC_AUTH.user());
  if (forced || (!done && !signedIn)) {
    // the dock walk teaches the bar first; the tour waits its turn
    var classed = false;
    try { classed = !!localStorage.getItem("mcc_dock_walk"); } catch (e) {}
    if (!forced && !classed) document.addEventListener("mcc:dockwalk-done", function () { setTimeout(start, 700); });
    else setTimeout(start, 900);
  }

  window.MCC_TOUR = { start: start, end: end };
})();
