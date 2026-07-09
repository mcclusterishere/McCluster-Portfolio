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
    { id: "mpay", label: "Touch the money — open M Pay", href: "pay.html" },
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
    props.model = "grind_v1";
    if (window.MCC_TRACK) window.MCC_TRACK(name, props);
  }

  function did(id) {
    var t = today();
    st.done[t] = st.done[t] || [];
    if (st.done[t].indexOf(id) !== -1) return false;
    st.done[t].push(id);
    st.E = Math.min(1000, st.E + 10);
    // a comeback pays down the silence one day per task — no instant absolution
    st.idleDays = Math.max(0, (st.idleDays || 0) - 1);
    jset(KEY, st);
    emit("grind_task", { task: id, today: st.done[t].length, boost: boost() });
    paintChip();
    return true;
  }

  /* ---- the events already flowing become the game: intercept the pipe ---- */
  var MAP = {
    xc_floor_view: "floor", song_start: "play", spaces_view: "spaces",
    mpay_view: "mpay", mpay_you: "mpay", profile_view: "worth",
    mpay_deal_sent: "deal", mpay_request_sent: "deal", spaces_request: "deal", xc_invest_click: "deal",
  };
  var orig = window.MCC_TRACK;
  window.MCC_TRACK = function (n, p) {
    try { if (MAP[n]) did(MAP[n]); } catch (e) {}
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
    tasks: TASKS, openBoard: openBoard,
  };
})();
