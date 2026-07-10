/* ============================================================
   M-GRIND — the staging model. Interaction IS the price.

   THE TWO-MODEL PLAY:
   · M-GRIND (this file, live now): a member's worth climbs with
     app interaction and sinks with silence. Tasks, streaks,
     daily caps — the gym membership model. Every signal it
     emits rides the analytics pipe as TRAINING DATA.
   · M-WORTH (js/mworth.js, the deep model): priced on money and
     the record. When it goes fully live, the grind exhaust
     teaches it which behaviors predict real deal flow.
   Money keeps ~10× the weight by construction: the grind can
   only bend the price inside a hard ±band; labor dollars have
   no cap.

   THE DEVICE:
   Every device carries its own permanent id (mcc_device_id) and
   its own grind ledger. An account is the sum of its devices —
   the phone that shows up every day and the laptop that closes
   deals are different instruments of the same player, and the
   training data keeps them apart.

   THE GAME:
   · Up to +1% per fulfilled task, max 3 counted per day — the
     board always offers more than a day can cash, so the only
     way to eat is to come back.
   · Streak pays +0.25% per consecutive day (cap +5%).
   · Silence costs: −1% per idle day, floor −10%.
   · Net boost clamped to [−10%, +8%] and applied to the STAGED
     price only — the true book (M-Worth) is never faked.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "mcc_grind_v1";
  var DKEY = "mcc_device_id";
  var DAY = 864e5;

  function jget(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* every device is its own instrument */
  function deviceId() {
    var id = null;
    try { id = localStorage.getItem(DKEY); } catch (e) {}
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      try { localStorage.setItem(DKEY, id); } catch (e) {}
    }
    return id;
  }

  /* ---- the task board: always more on offer than a day can cash ---- */
  var TASKS = [
    { id: "floor", label: "Walk the floor — open the live market", href: "market.html#floor" },
    { id: "play", label: "Play a track — press play on any song", href: "app.html" },
    { id: "spaces", label: "Scout a room — open the Spaces floor", href: "spaces.html" },
    { id: "mpay", label: "Touch the money — open E-Up Pay", href: "market.html#pay" },
    { id: "worth", label: "Face your number — check your worth", href: "profile.html" },
    { id: "deal", label: "Move on somebody — send a deal or request", href: "market.html#build" },
  ];
  var DAILY_CAP = 3;

  /* ---- state, with the daily reckoning on load ---- */
  var st = jget(KEY, null) || {
    device: deviceId(), E: 0, streak: 0, lastSeen: null, done: {}, firstSeen: today(),
  };
  (function reckon() {
    var t = today();
    if (st.lastSeen === t) return;
    if (st.lastSeen) {
      var gap = Math.round((new Date(t) - new Date(st.lastSeen)) / DAY);
      if (gap === 1) st.streak += 1;
      else if (gap > 1) {
        st.streak = 1;
        st.E = st.E * Math.pow(0.96, gap - 1); // silence bleeds the score
        st.idleDays = (st.idleDays || 0) + (gap - 1);
      }
    } else {
      st.streak = 1;
    }
    st.lastSeen = t;
    // yesterday's board clears; only today's fulfilments count
    var keep = {}; keep[t] = st.done[t] || [];
    st.done = keep;
    jset(KEY, st);
    emit("grind_day", { streak: st.streak, E: +st.E.toFixed(1) });
  })();

  function doneToday() { return st.done[today()] || []; }

  function boost() {
    var tasks = Math.min(DAILY_CAP, doneToday().length) * 1.0;
    var streak = Math.min(5, st.streak * 0.25);
    var idle = Math.min(10, (st.idleDays || 0) * 1.0);
    var b = tasks + streak - idle;
    return Math.max(-10, Math.min(8, +b.toFixed(2)));
  }

  /* the training exhaust: every grind event leaves through analytics */
  function emit(name, props) {
    props = props || {};
    props.device = st.device;
    props.model = "grind_v2";
    var d = new Date();
    props.hour = d.getHours(); props.dow = d.getDay();
    props.page = location.pathname.split("/").pop() || "index.html";
    props.streak = st.streak; props.E = +(st.E || 0).toFixed(1);
    props.tasksToday = doneToday().length;
    props.shadowToday = (st.shadow && st.shadow[today()] || []).length;
    if (window.MCC_TRACK) window.MCC_TRACK(name, props);
  }

  var lastCredit = 0;
  function did(id) {
    var t = today();
    st.done[t] = st.done[t] || [];
    if (st.done[t].indexOf(id) !== -1) return false;
    // the wall against the console cowboy: credits land 20s apart, minimum
    if (Date.now() - lastCredit < 20000 && st.done[t].length) {
      emit("grind_throttled", { task: id });
      return false;
    }
    lastCredit = Date.now();
    st.done[t].push(id);
    st.E = Math.min(1000, st.E + 10);
    // a comeback pays down the silence one day per task — no instant absolution
    st.idleDays = Math.max(0, (st.idleDays || 0) - 1);
    jset(KEY, st);
    emit("grind_task", { task: id, today: st.done[t].length, boost: boost() });
    paintChip();
    return true;
  }

  /* ---- THE SHADOW BOARD: underlying tasks nobody is shown ----
     They pay no boost — they pay E (the training signal) and they
     paint the admin's picture of who this player really is. */
  var SHADOW = {
    dwell_60:   "stayed a full minute",
    scroll_deep:"read past 80% of a page",
    wanderer:   "walked 4+ rooms in a day",
    night_owl:  "moved between midnight and 5am",
    early_bird: "moved between 5 and 8am",
    vr_pilot:   "entered the 360 cabin",
    listener:   "played 3 different songs in a day",
    closer:     "spoke inside a deal thread",
    scholar:    "read the fine rooms (amenities, docs, markers)",
  };
  function shadowDid(id) {
    var t = today();
    st.shadow = st.shadow || {};
    st.shadow[t] = st.shadow[t] || [];
    if (st.shadow[t].indexOf(id) !== -1) return;
    st.shadow[t].push(id);
    st.E = Math.min(1000, st.E + 6);
    jset(KEY, st);
    emit("grind_shadow", { task: id });
  }
  (function armShadows() {
    var h = new Date().getHours();
    if (h >= 0 && h < 5) shadowDid("night_owl");
    if (h >= 5 && h < 8) shadowDid("early_bird");
    // rooms walked today
    var t = today();
    st.pages = st.pages || {};
    st.pages[t] = st.pages[t] || [];
    var pg = location.pathname.split("/").pop() || "index.html";
    if (st.pages[t].indexOf(pg) === -1) { st.pages[t].push(pg); jset(KEY, st); }
    if (st.pages[t].length >= 4) shadowDid("wanderer");
    if (["amenities.html", "badge-explainer.html", "psychology-markers.html", "docket-516.html"].indexOf(pg) !== -1) shadowDid("scholar");
    setTimeout(function () { shadowDid("dwell_60"); }, 60000);
    var deepFired = false;
    window.addEventListener("scroll", function () {
      if (deepFired) return;
      var max = document.documentElement.scrollHeight - innerHeight;
      if (max > 400 && window.scrollY / max > 0.8) { deepFired = true; shadowDid("scroll_deep"); }
    }, { passive: true });
  })();
  var SHADOW_MAP = {
    vr_view: "vr_pilot", vr_inline_view: "vr_pilot",
    desk_message_sent: "closer", desk_thread_open: "closer",
  };
  var songsToday = {};

  /* ---- the events already flowing become the game: intercept the pipe ---- */
  var MAP = {
    xc_floor_view: "floor", song_start: "play", spaces_view: "spaces",
    mpay_view: "mpay", mpay_you: "mpay", profile_view: "worth",
    mpay_deal_sent: "deal", mpay_request_sent: "deal", spaces_request: "deal", xc_invest_click: "deal",
  };
  var orig = window.MCC_TRACK;
  window.MCC_TRACK = function (n, p) {
    try {
      if (MAP[n]) did(MAP[n]);
      if (SHADOW_MAP[n]) shadowDid(SHADOW_MAP[n]);
      if (n === "song_start" && p && p.song) {
        songsToday[p.song] = 1;
        if (Object.keys(songsToday).length >= 3) shadowDid("listener");
      }
    } catch (e) {}
    if (orig) return orig(n, p);
  };

  /* ---- the game face: the chip and the board ---- */
  var PAGES = ["market.html", "profile.html", "pay.html", "spaces.html", "app.html", ""];
  var here = location.pathname.split("/").pop() || "";
  var chip = null;

  function paintChip() {
    if (!chip) return;
    var left = Math.max(0, DAILY_CAP - doneToday().length);
    var b = boost();
    chip.innerHTML = left > 0
      ? "&#128200; Price up today? <b>+1% per task &middot; " + left + " left</b>"
      : "&#128293; Board cleared &middot; <b>" + (b >= 0 ? "+" : "") + b + "% today</b> &middot; back tomorrow";
  }

  function openBoard() {
    var b = boost();
    var wrap = document.createElement("div");
    wrap.id = "grindBoard";
    wrap.innerHTML =
      '<div class="gr__veil"></div>' +
      '<div class="gr__sheet" role="dialog" aria-modal="true" aria-label="The grind board">' +
      '<button class="gr__x" type="button" aria-label="Close">✕</button>' +
      '<small class="gr__k">The grind &middot; device ' + st.device.slice(4, 10) + "</small>" +
      "<h2>Move your price today.</h2>" +
      '<p class="gr__sub">+1% per task, <b>' + Math.max(0, DAILY_CAP - doneToday().length) + " of " + DAILY_CAP +
      " still payable today</b> &middot; streak day " + st.streak + " (+" + Math.min(5, st.streak * 0.25).toFixed(2) +
      "%) &middot; today's move: <b class=\"" + (b >= 0 ? "gr-up" : "gr-dn") + '">' + (b >= 0 ? "+" : "") + b + "%</b></p>" +
      '<div class="gr__tasks">' + TASKS.map(function (t) {
        var done = doneToday().indexOf(t.id) !== -1;
        return '<a class="gr__task' + (done ? " is-done" : "") + '" href="' + t.href + '">' +
          "<span>" + (done ? "✓" : "○") + "</span><b>" + t.label + "</b></a>";
      }).join("") + "</div>" +
      '<p class="gr__note">The board offers more than one day can cash — consistency is the whole game. ' +
      "Silence costs 1% a day. Money moving in the Market still outweighs all of this ten to one.</p></div>";
    document.body.appendChild(wrap);
    document.body.classList.add("gr-open");
    wrap.querySelector(".gr__veil").addEventListener("click", closeBoard);
    wrap.querySelector(".gr__x").addEventListener("click", closeBoard);
    emit("grind_board_open", { boost: b });
  }
  function closeBoard() {
    var w = document.getElementById("grindBoard");
    if (w) w.remove();
    document.body.classList.remove("gr-open");
  }

  function inject() {
    if (PAGES.indexOf(here) === -1) return;
    var css = document.createElement("style");
    css.textContent =
      ".gr__chip{position:fixed;right:0.9rem;bottom:calc(var(--appbar-h,3.7rem) + env(safe-area-inset-bottom) + 1rem);z-index:150;" +
      "border:1px solid rgba(0,200,5,0.5);border-radius:100px;background:rgba(10,12,10,0.92);color:#e6efe6;" +
      "font:inherit;font-size:0.72rem;font-weight:700;letter-spacing:0.03em;padding:0.6em 1.05em;cursor:pointer;" +
      "box-shadow:0 8px 26px rgba(0,200,5,0.25);backdrop-filter:blur(8px)}" +
      ".gr__chip b{color:#00c805}" +
      ".gr__veil{position:fixed;inset:0;background:rgba(5,4,3,0.74);z-index:160}" +
      ".gr__sheet{position:fixed;left:0;right:0;bottom:0;z-index:170;max-width:32rem;margin:0 auto;background:#101211;" +
      "border:1px solid rgba(244,239,230,0.14);border-bottom:0;border-radius:22px 22px 0 0;" +
      "padding:1.2rem 1.3rem calc(1.6rem + env(safe-area-inset-bottom));max-height:88dvh;overflow-y:auto}" +
      ".gr__x{position:absolute;top:0.8rem;right:0.9rem;width:34px;height:34px;border-radius:50%;" +
      "border:1px solid rgba(244,239,230,0.25);background:rgba(10,8,7,0.6);color:#9e9890;font:inherit;cursor:pointer}" +
      ".gr__k{font-size:0.64rem;letter-spacing:0.2em;text-transform:uppercase;color:#9e9890;font-weight:800}" +
      ".gr__sheet h2{font-size:1.35rem;font-weight:800;margin-top:0.15rem;color:#f4efe6}" +
      ".gr__sub{color:#9e9890;font-size:0.82rem;line-height:1.6;margin-top:0.4rem}" +
      ".gr-up{color:#00c805}.gr-dn{color:#ff5000}" +
      ".gr__tasks{display:flex;flex-direction:column;gap:0.45rem;margin-top:0.9rem}" +
      ".gr__task{display:flex;align-items:center;gap:0.7rem;border:1px solid rgba(244,239,230,0.12);border-radius:12px;" +
      "padding:0.75rem 0.9rem;text-decoration:none;color:#f4efe6;font-size:0.86rem}" +
      ".gr__task span{color:#00c805;font-weight:800}" +
      ".gr__task.is-done{opacity:0.55;border-color:rgba(0,200,5,0.4)}" +
      ".gr__note{color:#9e9890;font-size:0.72rem;line-height:1.6;margin-top:0.9rem}";
    document.head.appendChild(css);
    chip = document.createElement("button");
    chip.className = "gr__chip";
    chip.type = "button";
    chip.addEventListener("click", openBoard);
    document.body.appendChild(chip);
    paintChip();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
  else inject();

  window.MCC_GRIND = {
    device: deviceId, boost: boost, did: did, state: function () { return st; },
    tasks: TASKS, shadow: SHADOW, openBoard: openBoard,
  };
})();
