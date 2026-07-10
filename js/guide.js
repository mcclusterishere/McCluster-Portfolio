/* THE GUIDE — the in-game concierge, one tap away on every floor.
   A floating ✦ opens a chat with the platform's resident assistant
   (the-guide edge function). Members type OR talk: the mic rides the
   browser's own speech engine (free, no tokens), and when you speak
   to the Guide, it speaks back. Signed-out visitors get pointed to
   the door. The thread lives in the cloud (guide_chats) and follows
   the member across every page. */
(function () {
  "use strict";
  if (!window.MCC_SUPA) return;
  var S = window.MCC_SUPA;

  var css = document.createElement("style");
  css.textContent =
    ".gd__fab{position:fixed;right:.9rem;bottom:calc(1rem + env(safe-area-inset-bottom));z-index:230;" +
    "width:3.1rem;height:3.1rem;border-radius:50%;border:1px solid rgba(244,239,230,.25);cursor:pointer;" +
    "background:radial-gradient(circle at 30% 30%,#2a1d18,#14100e);color:#f4efe6;font-size:1.3rem;" +
    "box-shadow:0 6px 22px rgba(0,0,0,.5),0 0 0 1px rgba(193,18,31,.25);display:grid;place-items:center}" +
    "body.has-appbar .gd__fab{bottom:calc(var(--appbar-h,4.5rem) + 1.2rem + env(safe-area-inset-bottom))}" +
    "body.mp-finding .gd__fab{display:none}" +
    ".gd__panel{position:fixed;right:.6rem;left:.6rem;bottom:calc(.6rem + env(safe-area-inset-bottom));z-index:235;" +
    "max-width:26rem;margin-left:auto;height:min(70dvh,34rem);display:none;flex-direction:column;overflow:hidden;" +
    "background:#120d0c;border:1px solid rgba(244,239,230,.18);border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.65)}" +
    "body.gd-open .gd__panel{display:flex}body.gd-open .gd__fab{display:none}" +
    ".gd__head{display:flex;align-items:center;gap:.6rem;padding:.75rem .9rem;border-bottom:1px solid rgba(244,239,230,.12)}" +
    ".gd__head b{font-family:var(--display);letter-spacing:.06em;font-size:1rem;color:#f4efe6}" +
    ".gd__head small{color:rgba(244,239,230,.5);font-size:.68rem}" +
    ".gd__hbtn{margin-left:auto;background:none;border:0;color:rgba(244,239,230,.7);font-size:1.05rem;cursor:pointer;padding:.2rem .35rem}" +
    ".gd__hbtn+.gd__hbtn{margin-left:0}.gd__hbtn.is-on{color:#e5383b}" +
    ".gd__body{flex:1;overflow-y:auto;padding:.8rem .9rem;display:flex;flex-direction:column;gap:.55rem}" +
    ".gd__msg{max-width:85%;padding:.55rem .75rem;border-radius:14px;font-size:.86rem;line-height:1.45;color:#f4efe6;white-space:pre-wrap}" +
    ".gd__msg--me{align-self:flex-end;background:rgba(193,18,31,.28);border:1px solid rgba(193,18,31,.35)}" +
    ".gd__msg--ai{align-self:flex-start;background:rgba(244,239,230,.07);border:1px solid rgba(244,239,230,.12)}" +
    ".gd__msg--dim{opacity:.6;font-style:italic}" +
    ".gd__foot{display:flex;gap:.45rem;padding:.6rem .7rem;border-top:1px solid rgba(244,239,230,.12)}" +
    ".gd__in{flex:1;min-width:0;background:rgba(244,239,230,.06);border:1px solid rgba(244,239,230,.16);border-radius:12px;" +
    "padding:.55rem .7rem;color:#f4efe6;font-size:max(16px,.9rem)}" +
    ".gd__btn{background:#c1121f;border:0;border-radius:12px;color:#f4efe6;font-size:1rem;padding:0 .85rem;cursor:pointer}" +
    ".gd__mic{background:rgba(244,239,230,.08);border:1px solid rgba(244,239,230,.16)}" +
    ".gd__mic.is-live{background:#c1121f;animation:gdpulse 1.1s infinite}" +
    "@keyframes gdpulse{50%{box-shadow:0 0 0 8px rgba(193,18,31,.18)}}" +
    ".gd__door{padding:1.2rem .9rem;color:rgba(244,239,230,.75);font-size:.9rem;line-height:1.5}" +
    ".gd__door a{color:#e5383b}";
  document.head.appendChild(css);

  var fab = document.createElement("button");
  fab.className = "gd__fab";
  fab.type = "button";
  fab.setAttribute("aria-label", "Talk to the Guide");
  fab.textContent = "✦";

  var panel = document.createElement("div");
  panel.className = "gd__panel";
  panel.innerHTML =
    '<div class="gd__head"><b>THE GUIDE</b><small>knows the whole floor</small>' +
    '<button type="button" class="gd__hbtn" data-gd="voice" aria-label="Voice replies">🔈</button>' +
    '<button type="button" class="gd__hbtn" data-gd="close" aria-label="Close">✕</button></div>' +
    '<div class="gd__body" data-gd="body"></div>' +
    '<div class="gd__foot"><button type="button" class="gd__btn gd__mic" data-gd="mic" aria-label="Speak">🎤</button>' +
    '<input class="gd__in" data-gd="in" type="text" placeholder="Ask about anything here…" maxlength="500">' +
    '<button type="button" class="gd__btn" data-gd="send" aria-label="Send">➤</button></div>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var body = panel.querySelector('[data-gd="body"]');
  var input = panel.querySelector('[data-gd="in"]');
  var micBtn = panel.querySelector('[data-gd="mic"]');
  var voiceBtn = panel.querySelector('[data-gd="voice"]');
  var loaded = false;
  var busy = false;
  var voiceOn = localStorage.getItem("mcc_guide_voice") === "on";
  paintVoice();

  function paintVoice() {
    voiceBtn.textContent = voiceOn ? "🔊" : "🔈";
    voiceBtn.classList.toggle("is-on", voiceOn);
  }

  function bubble(text, who, dim) {
    var d = document.createElement("div");
    d.className = "gd__msg gd__msg--" + who + (dim ? " gd__msg--dim" : "");
    d.textContent = text;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text.replace(/[✦⤴︎🏛🎤]/g, ""));
      u.lang = "en-US";
      u.rate = 1.02;
      speechSynthesis.speak(u);
    } catch (e) { /* voice is a courtesy, never a crash */ }
  }

  function restore() {
    if (loaded) return;
    loaded = true;
    var uid = S.uid();
    if (!uid) {
      body.innerHTML =
        '<div class="gd__door">The Guide talks to members. ' +
        '<a href="market.html#yours">Open your account</a> — it takes one tap — and I\'ll walk you through everything: ' +
        "the floor, the missions, M City, the civic route, all of it.</div>";
      return;
    }
    bubble("Pulling up our thread…", "ai", true);
    S.token().then(function (t) {
      return fetch(S.url + "/rest/v1/guide_chats?owner=eq." + uid + "&order=at.asc&select=role,body&limit=40", {
        headers: { apikey: S.key, Authorization: "Bearer " + t },
      }).then(function (r) { return r.ok ? r.json() : []; });
    }).then(function (rows) {
      body.innerHTML = "";
      if (!rows || !rows.length) {
        bubble("I'm the Guide — I know every corner of this platform. Ask me how E⤴ works, how to run the Gauntlet, how the plug pays, how to climb the civic ladder… or just tell me what you're trying to do.", "ai");
        return;
      }
      rows.forEach(function (m) { bubble(m.body, m.role === "guide" ? "ai" : "me"); });
    }).catch(function () {
      body.innerHTML = "";
      bubble("I'm the Guide — ask me anything about the platform.", "ai");
    });
  }

  function send(spoken) {
    var say = (input.value || "").trim();
    if (!say || busy) return;
    if (!S.uid()) { restore(); return; }
    busy = true;
    input.value = "";
    bubble(say, "me");
    var wait = bubble("…", "ai", true);
    if (window.MCC_TRACK) window.MCC_TRACK("guide_msg", { page: location.pathname.split("/").pop() || "index.html" });
    S.token().then(function (t) {
      return fetch(S.url + "/functions/v1/the-guide", {
        method: "POST",
        headers: { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify({ say: say }),
      }).then(function (r) { return r.json().catch(function () { return null; }); });
    }).then(function (j) {
      wait.remove();
      var reply = (j && j.reply) || (j && j.error ? "The line dropped: " + j.error : "The line dropped — try that again.");
      bubble(reply, "ai");
      if ((voiceOn || spoken) && j && j.reply) speak(reply);
    }).catch(function () {
      wait.remove();
      bubble("The line dropped — try that again.", "ai");
    }).then(function () { busy = false; });
  }

  /* the mic: the browser's own ears — free, and only while you hold the floor */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  if (!SR) micBtn.style.display = "none";
  function listen() {
    if (!SR) return;
    if (rec) { try { rec.stop(); } catch (e) { /* already down */ } rec = null; micBtn.classList.remove("is-live"); return; }
    rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    micBtn.classList.add("is-live");
    rec.onresult = function (ev) {
      var heard = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : "";
      if (heard) { input.value = heard; send(true); }
    };
    rec.onerror = function () { micBtn.classList.remove("is-live"); rec = null; };
    rec.onend = function () { micBtn.classList.remove("is-live"); rec = null; };
    try { rec.start(); } catch (e) { micBtn.classList.remove("is-live"); rec = null; }
  }

  fab.addEventListener("click", function () {
    document.body.classList.add("gd-open");
    restore();
    if (window.MCC_TRACK) window.MCC_TRACK("guide_open", { page: location.pathname.split("/").pop() || "index.html" });
  });
  panel.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-gd]");
    if (!t) return;
    var k = t.getAttribute("data-gd");
    if (k === "close") { document.body.classList.remove("gd-open"); if (window.speechSynthesis) speechSynthesis.cancel(); }
    if (k === "send") send(false);
    if (k === "mic") listen();
    if (k === "voice") { voiceOn = !voiceOn; localStorage.setItem("mcc_guide_voice", voiceOn ? "on" : "off"); paintVoice(); if (!voiceOn && window.speechSynthesis) speechSynthesis.cancel(); }
  });
  input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") send(false); });
})();
