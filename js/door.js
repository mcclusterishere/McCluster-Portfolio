/* MCC_DOOR — one way in, mounted anywhere.
   Every sign-in on the platform is this exact component now — same
   big readable buttons, same plain words, whether it stands on the
   desk, the pay sheet, the profile page, the music house, or the
   members room. The styles live in css/style.css under .door.

   MCC_DOOR.mount(hostEl, {
     lede:    optional line above the buttons,
     ticker:  true → a "claim your ticker" input banks mcc_ticker_claim,
     context: short label for analytics ("desk" | "pay" | "profile" | …),
     onDone:  called after the account exists (default: reload the page)
   })

   No static DOM ids — everything is scoped to the mount, so any number
   of doors can stand on one page without colliding. */
(function () {
  "use strict";

  // the sandbox personas are gone — sweep the old key so nobody is
  // stuck wearing a costume that no longer exists
  try { localStorage.removeItem("mcc_sandbox"); } catch (e) {}

  function track(ev, data) { if (window.MCC_TRACK) window.MCC_TRACK(ev, data || {}); }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt) n.textContent = txt;
    return n;
  }

  (function sweepPendingAgreement() {
    try {
      var p = JSON.parse(localStorage.getItem("mcc_agree_pending") || "null");
      var S = window.MCC_SUPA;
      if (!p || !S || !window.MCC_AUTH || !window.MCC_AUTH.user || !window.MCC_AUTH.user()) return;
      S.token().then(function (t) {
        if (!t) return;
        return fetch(S.url + "/rest/v1/agreements", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t, Prefer: "return=minimal" },
          body: JSON.stringify({ owner: S.uid(), version: p.v, context: p.ctx || "email" }),
        }).then(function () { try { localStorage.removeItem("mcc_agree_pending"); } catch (e3) {} });
      }).catch(function () {});
    } catch (e) {}
  })();

  function mount(host, opts) {
    if (!host) return;
    opts = opts || {};
    var ctx = opts.context || "door";
    host.innerHTML = "";

    var wrap = el("div", "door");

    if (opts.lede) wrap.appendChild(el("p", "door__lede", opts.lede));

    /* no ghosts on this floor: every account walks in with a NAME and a
       TICKER, and the ticker files onto the market the moment the door
       opens — pending review, but real, and it belongs to this session */
    var nameIn = el("input", "door__in");
    nameIn.type = "text";
    nameIn.placeholder = "Your name — how the floor knows you";
    nameIn.autocomplete = "name";
    try {
      var heldName = JSON.parse(localStorage.getItem("mcc_onboard") || "{}").name;
      if (heldName) nameIn.value = heldName;
    } catch (e) {}
    wrap.appendChild(nameIn);

    var tick = null;
    if (opts.ticker !== false) {
      tick = el("input", "door__in");
      tick.type = "text";
      tick.placeholder = "Your ticker — 3–5 letters, like MCC";
      tick.maxLength = 6;
      tick.autocapitalize = "characters";
      tick.style.textTransform = "uppercase";
      try {
        var held = localStorage.getItem("mcc_ticker_claim");
        if (held) tick.value = held;
      } catch (e) {}
      wrap.appendChild(tick);
    }

    /* joining IS signing: the Association's Member Agreement, one box,
       recorded with version + time the moment the account opens */
    var AGREE_V = "v1-2026-07";
    var agreeRow = el("label", null);
    agreeRow.style.cssText = "display:flex;gap:0.6rem;align-items:flex-start;cursor:pointer;" +
      "color:rgba(244,239,230,0.7);font-size:0.8rem;line-height:1.5";
    var agreeBox = el("input", null);
    agreeBox.type = "checkbox";
    agreeBox.style.cssText = "flex:none;width:1.15rem;height:1.15rem;margin-top:0.1rem;accent-color:#e5383b";
    var agreeTxt = el("span", null);
    agreeTxt.innerHTML = 'I\u2019m joining M Network Association and signing ' +
      '<a href="agreement.html" target="_blank" rel="noopener" style="color:var(--ruby-hot,#e5383b)">the Member Agreement</a>.';
    agreeRow.appendChild(agreeBox);
    agreeRow.appendChild(agreeTxt);
    wrap.appendChild(agreeRow);

    function recordAgreement(context) {
      try {
        var S = window.MCC_SUPA;
        if (!S || !S.token) return;
        S.token().then(function (t) {
          if (!t) return;
          return fetch(S.url + "/rest/v1/agreements", {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t, Prefer: "return=minimal" },
            body: JSON.stringify({ owner: S.uid(), version: AGREE_V, context: context || ctx }),
          });
        }).catch(function () {});
      } catch (e) {}
    }

    var msg = el("p", "door__msg");

    function tickerVal() {
      return tick ? tick.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    }
    function bank() {
      var t = tickerVal();
      try {
        if (t) localStorage.setItem("mcc_ticker_claim", t);
        var ob = {};
        try { ob = JSON.parse(localStorage.getItem("mcc_onboard") || "{}") || {}; } catch (e2) {}
        if (nameIn.value.trim()) ob.name = nameIn.value.trim();
        localStorage.setItem("mcc_onboard", JSON.stringify(ob));
      } catch (e) {}
    }
    function finish(how) {
      bank();
      track("door_open", { how: how, context: ctx });
      if (opts.onDone) opts.onDone(); else location.reload();
    }

    var instant = el("button", "door__go", "Start instantly — no email needed");
    instant.type = "button";
    instant.addEventListener("click", function () {
      var nm = nameIn.value.trim();
      var tk = tickerVal();
      if (!nm) { msg.textContent = "Your name first — the floor doesn't trade with ghosts."; nameIn.focus(); return; }
      if (tick && !tk) { msg.textContent = "Pick your ticker — 3–5 letters, it's yours."; tick.focus(); return; }
      if (!agreeBox.checked) { msg.textContent = "The Association runs on the Agreement — one box, then you're in."; return; }
      instant.textContent = "Opening your account…";
      window.MCC_AUTH.signInAnon().then(function () {
        recordAgreement(ctx);
        // the ticker hits the market NOW: the listing files under this
        // account (pending review), and the session stays on this device
        if (window.MCC_NET && window.MCC_NET.saveListing) {
          instant.textContent = "Filing your ticker on the floor…";
          return window.MCC_NET.saveListing({ name: nm, ticker: tk || null, roles: [] })
            .catch(function () {}); // the desk prefill catches anything the file misses
        }
      }).then(function () { finish("instant"); }).catch(function (e) {
        instant.textContent = "Start instantly — no email needed";
        msg.textContent = String((e && e.message) || e);
      });
    });
    wrap.appendChild(instant);

    wrap.appendChild(el("p", "door__or", "or use your email"));

    var row = el("div", "door__row");
    var em = el("input", "door__in");
    em.type = "email";
    em.placeholder = "you@email.com";
    em.autocomplete = "email";
    var go = el("button", "door__alt", "Email me a sign-in link");
    go.type = "button";
    go.addEventListener("click", function () {
      var v = em.value.trim();
      if (!v) { msg.textContent = "Drop your email first."; em.focus(); return; }
      if (!agreeBox.checked) { msg.textContent = "The Association runs on the Agreement — one box, then the link sends."; return; }
      try { localStorage.setItem("mcc_agree_pending", JSON.stringify({ v: "v1-2026-07", ctx: ctx, at: Date.now() })); } catch (e2) {}
      bank();
      msg.textContent = "Sending the link…";
      window.MCC_AUTH.signIn(v).then(function () {
        track("door_key_sent", { context: ctx });
        msg.textContent = "Check your email — one tap on the link signs you in right here.";
      }).catch(function (e) { msg.textContent = String((e && e.message) || e); });
    });
    row.appendChild(em);
    row.appendChild(go);
    wrap.appendChild(row);

    wrap.appendChild(el("p", "door__fine",
      "Instant accounts are real accounts: your name and ticker file onto the floor (pending review), " +
      "this device stays signed in so you can come right back, and attaching an email later carries it anywhere."));
    wrap.appendChild(msg);

    host.appendChild(wrap);
    track("door_shown", { context: ctx });
  }

  window.MCC_DOOR = { mount: mount };
})();
