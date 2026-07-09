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

  function mount(host, opts) {
    if (!host) return;
    opts = opts || {};
    var ctx = opts.context || "door";
    host.innerHTML = "";

    var wrap = el("div", "door");

    if (opts.lede) wrap.appendChild(el("p", "door__lede", opts.lede));

    var tick = null;
    if (opts.ticker) {
      tick = el("input", "door__in");
      tick.type = "text";
      tick.placeholder = "Your ticker — 3–5 letters (optional)";
      tick.maxLength = 6;
      tick.autocapitalize = "characters";
      tick.style.textTransform = "uppercase";
      try {
        var held = localStorage.getItem("mcc_ticker_claim");
        if (held) tick.value = held;
      } catch (e) {}
      wrap.appendChild(tick);
    }

    var msg = el("p", "door__msg");

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

    var instant = el("button", "door__go", "Start instantly — no email needed");
    instant.type = "button";
    instant.addEventListener("click", function () {
      instant.textContent = "Opening your account…";
      window.MCC_AUTH.signInAnon().then(function () { finish("instant"); }).catch(function (e) {
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
      bankTicker();
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
      "Instant accounts are real accounts — attach an email later and your desk follows you to any device."));
    wrap.appendChild(msg);

    host.appendChild(wrap);
    track("door_shown", { context: ctx });
  }

  window.MCC_DOOR = { mount: mount };
})();
