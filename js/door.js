/* MCC_DOOR — one way in, mounted anywhere.
   Every "get an account" moment on the platform used to point somewhere
   else (profile.html, a sandbox persona, a device-only locker). This is
   the replacement: a small inline door that opens a REAL account right
   where the person is standing — instant with no email (Supabase
   anonymous auth, a true auth.uid), or the magic-link email for people
   who want their key back on any device. Mount it in a desk, a pay
   sheet, a claim page; the page decides what happens after with onDone.

   MCC_DOOR.mount(hostEl, {
     lede:    optional line above the buttons,
     ticker:  true → a "claim your ticker" input banks mcc_ticker_claim,
     context: short label for analytics ("desk" | "pay" | "onboard" | "claim"),
     onDone:  called after the account exists (default: reload the page)
   })

   No static DOM ids — everything is scoped to the mount, so any number
   of doors can stand on one page without colliding. */
(function () {
  "use strict";

  // the sandbox personas are gone — sweep the old key so nobody is
  // stuck wearing a costume that no longer exists
  try { localStorage.removeItem("mcc_sandbox"); } catch (e) {}

  var IN_CSS = "width:100%;background:rgba(10,8,7,0.7);border:1px solid rgba(244,239,230,0.22);" +
    "border-radius:10px;color:var(--cream,#f4efe6);font:inherit;padding:0.72em 1em;margin:0";

  function track(ev, data) { if (window.MCC_TRACK) window.MCC_TRACK(ev, data || {}); }

  function mount(host, opts) {
    if (!host) return;
    opts = opts || {};
    var ctx = opts.context || "door";
    host.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "door";
    wrap.style.cssText = "display:flex;flex-direction:column;gap:0.6rem;width:100%;max-width:430px";

    if (opts.lede) {
      var lede = document.createElement("p");
      lede.style.cssText = "margin:0;color:rgba(244,239,230,0.72);font-size:0.88rem;line-height:1.5";
      lede.textContent = opts.lede;
      wrap.appendChild(lede);
    }

    var tick = null;
    if (opts.ticker) {
      tick = document.createElement("input");
      tick.type = "text";
      tick.placeholder = "Claim your ticker — 3–5 letters (optional)";
      tick.maxLength = 6;
      tick.autocapitalize = "characters";
      tick.style.cssText = IN_CSS + ";text-transform:uppercase;letter-spacing:0.08em";
      try {
        var held = localStorage.getItem("mcc_ticker_claim");
        if (held) tick.value = held;
      } catch (e) {}
      wrap.appendChild(tick);
    }

    var msg = document.createElement("p");
    msg.style.cssText = "margin:0;min-height:1.2em;color:rgba(244,239,230,0.8);font-size:0.84rem";

    function bankTicker() {
      if (!tick) return;
      var v = tick.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      try {
        if (v) localStorage.setItem("mcc_ticker_claim", v);
      } catch (e) {}
    }
    function finish(how) {
      bankTicker();
      track("door_open", { how: how, context: ctx });
      if (opts.onDone) opts.onDone(); else location.reload();
    }

    var instant = document.createElement("button");
    instant.type = "button";
    instant.className = "btn btn--ruby";
    instant.style.cssText = "width:100%;justify-content:center";
    instant.textContent = "Start instantly — no email needed";
    instant.addEventListener("click", function () {
      instant.textContent = "Opening your account…";
      window.MCC_AUTH.signInAnon().then(function () { finish("instant"); }).catch(function (e) {
        instant.textContent = "Start instantly — no email needed";
        msg.textContent = String((e && e.message) || e);
      });
    });
    wrap.appendChild(instant);

    var or = document.createElement("p");
    or.style.cssText = "margin:0;text-align:center;color:rgba(244,239,230,0.4);font-size:0.78rem;letter-spacing:0.14em";
    or.textContent = "— or —";
    wrap.appendChild(or);

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:0.5rem;flex-wrap:wrap";
    var em = document.createElement("input");
    em.type = "email";
    em.placeholder = "you@email.com";
    em.autocomplete = "email";
    em.style.cssText = IN_CSS + ";flex:1;min-width:170px;width:auto";
    var go = document.createElement("button");
    go.type = "button";
    go.className = "btn btn--ghost";
    go.textContent = "Email me the key";
    go.addEventListener("click", function () {
      var v = em.value.trim();
      if (!v) { msg.textContent = "Drop your email first."; em.focus(); return; }
      bankTicker();
      msg.textContent = "Sending the key…";
      window.MCC_AUTH.signIn(v).then(function () {
        track("door_key_sent", { context: ctx });
        msg.textContent = "Check your email — the link signs you in right here.";
      }).catch(function (e) { msg.textContent = String((e && e.message) || e); });
    });
    row.appendChild(em);
    row.appendChild(go);
    wrap.appendChild(row);

    var fine = document.createElement("p");
    fine.style.cssText = "margin:0;color:rgba(244,239,230,0.45);font-size:0.76rem;line-height:1.5";
    fine.textContent = "Instant accounts are real accounts — attach an email later and your desk follows you to any device.";
    wrap.appendChild(fine);
    wrap.appendChild(msg);

    host.appendChild(wrap);
    track("door_shown", { context: ctx });
  }

  window.MCC_DOOR = { mount: mount };
})();
