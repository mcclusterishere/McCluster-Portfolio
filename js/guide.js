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
    ".gd__fab{position:fixed;right:.9rem;top:calc(.7rem + env(safe-area-inset-top));z-index:236;" +
    "width:3.2rem;height:3.2rem;border-radius:50%;border:0;cursor:pointer;padding:0;" +
    "background:radial-gradient(circle at 32% 28%,#e5383b,#c1121f 55%,#7c0c15);" +
    "display:grid;place-items:center;animation:gdglow 2.4s ease-in-out infinite}" +
    ".gd__fab img{width:1.7rem;height:1.7rem;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}" +
    "@keyframes gdglow{0%,100%{box-shadow:0 4px 18px rgba(0,0,0,.5),0 0 0 0 rgba(229,56,59,.55)}" +
    "50%{box-shadow:0 4px 22px rgba(0,0,0,.5),0 0 0 9px rgba(229,56,59,0)}}" +
    "body.mp-finding .gd__fab{display:none}" +
    ".gd__nudge{position:fixed;right:4.4rem;top:calc(1.1rem + env(safe-area-inset-top));z-index:236;" +
    "max-width:12rem;background:#14100e;color:#f4efe6;border:1px solid rgba(229,56,59,.4);" +
    "border-radius:12px;padding:.55rem .75rem;font-size:.8rem;line-height:1.35;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;transform:translateX(8px);pointer-events:none;" +
    "transition:opacity .35s,transform .35s}" +
    ".gd__nudge.is-on{opacity:1;transform:translateX(0)}" +
    ".gd__nudge b{color:#e5383b}" +
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
  fab.innerHTML = '<img src="assets/img/m-mark.png" alt="Ask the Guide">';

  // the coaching nudge — a little bubble that pokes the user to tap the M
  var nudge = document.createElement("div");
  nudge.className = "gd__nudge";
  nudge.setAttribute("role", "status");
  var TIPS = [
    "New here? Tap the <b>M</b> — I'll show you around.",
    "Stuck? Ask me how to earn your first E⤴.",
    "Wanna get paid? Tap me — I'll walk you to the floor.",
    "Ask me how <b>the Trap</b> pays 5 E⤴.",
    "Curious how the plug pays for life? Tap the <b>M</b>.",
  ];
  var tipI = 0, nudgeTimer = null;
  function poke() {
    if (document.body.classList.contains("gd-open")) return;
    nudge.innerHTML = TIPS[tipI % TIPS.length];
    tipI++;
    nudge.classList.add("is-on");
    setTimeout(function () { nudge.classList.remove("is-on"); }, 5200);
  }
  function startNudges() {
    if (localStorage.getItem("mcc_guide_opened") === "1") return; // they found it — stop nagging
    setTimeout(poke, 3500);
    nudgeTimer = setInterval(poke, 22000);
  }

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
  document.body.appendChild(nudge);
  document.body.appendChild(panel);
  startNudges();

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
        bubble("I'm the Guide — I know every corner of this platform. Ask me how E⤴ works, how to run the Trap, how the plug pays, how to climb the civic ladder… or just tell me what you're trying to do.", "ai");
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
      if (!t) return { status: 0, j: { error: "you're signed out — open your account first" } };
      return fetch(S.url + "/functions/v1/the-guide", {
        method: "POST",
        headers: { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify({ say: say }),
      }).then(function (r) {
        return r.text().then(function (txt) {
          var j = null; try { j = JSON.parse(txt); } catch (e) { /* non-JSON */ }
          return { status: r.status, j: j, txt: txt };
        });
      });
    }).then(function (res) {
      wait.remove();
      var j = res.j;
      var reply;
      if (j && j.reply) {
        reply = j.reply;
      } else if (res.status === 404) {
        reply = "The Guide isn't wired up yet — the-guide function needs deploying. (404)";
      } else if (j && (j.error || j.message)) {
        reply = "The line dropped: " + (j.error || j.message) + (res.status ? " (" + res.status + ")" : "");
      } else {
        reply = "The line dropped (" + (res.status || "no response") + "). " + String(res.txt || "").slice(0, 140);
      }
      bubble(reply, "ai");
      if ((voiceOn || spoken) && j && j.reply) speak(reply);
    }).catch(function (e) {
      wait.remove();
      bubble("The line dropped — couldn't reach the Guide. " + String(e && e.message || e).slice(0, 100), "ai");
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
    nudge.classList.remove("is-on");
    if (nudgeTimer) { clearInterval(nudgeTimer); nudgeTimer = null; }
    localStorage.setItem("mcc_guide_opened", "1");
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
