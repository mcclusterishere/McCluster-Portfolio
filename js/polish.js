/* ============================================================
   Polish — the craft layer. Custom cinematic cursor + film-cut
   page transitions. Dependency-free, degrades gracefully, and
   never touches touch devices or reduced-motion users.
   ============================================================ */
(function () {
  "use strict";
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- magic-link catcher, site-wide ----------
     Supabase falls back to the Site URL when a redirect isn't
     allow-listed, so a sign-in link can land on ANY page. This
     runs everywhere polish.js does: it banks the session in the
     same store backend.js uses, then routes the signer to their
     room — the admin to Mission Control, everyone else to the
     app. Pages that run their own auth (mission/talent/members/
     app) are left to handle it themselves. */
  (function catchMagicAnywhere() {
    if (location.hash.indexOf("access_token=") === -1) return;
    var here = location.pathname.split("/").pop() || "index.html";
    if (["mission.html", "talent.html", "members.html", "app.html"].indexOf(here) !== -1) return;
    var q = {};
    location.hash.slice(1).split("&").forEach(function (kv) {
      var p = kv.split("="); q[p[0]] = decodeURIComponent(p[1] || "");
    });
    if (!q.access_token) return;
    try {
      localStorage.setItem("mccdb_session", JSON.stringify({
        access_token: q.access_token, refresh_token: q.refresh_token || "",
      }));
    } catch (e) { return; }
    var email = "";
    try { email = JSON.parse(atob(q.access_token.split(".")[1])).email || ""; } catch (e) {}
    // a link that lands on the profile page stays there — the signer asked
    // for their room, so the room is where they arrive (admin included)
    location.replace(here === "profile.html" ? "profile.html"
      : email === "matthew@mccluster.org" ? "mission.html" : "app.html");
  })();

  /* ---------- one-tap install: skip the app store ----------
     Chrome/Edge/Android fire beforeinstallprompt — we bank it and
     any [data-getapp] tap opens the real install sheet. iOS never
     fires it, so those taps get a two-step Add-to-Home-Screen coach.
     Installed (standalone) visitors never see the ask. */
  (function () {
    var standalone = window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) { document.documentElement.classList.add("is-installed"); return; }
    var deferred = null;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
    });
    var iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    function coach() {
      var ov = document.getElementById("getappCoach");
      if (!ov) {
        ov = document.createElement("div");
        ov.className = "getapp-coach";
        ov.id = "getappCoach";
        ov.setAttribute("role", "dialog");
        ov.innerHTML =
          '<div class="getapp-coach__card">' +
          '<img src="assets/img/icon-192.png" alt="McCluster app icon">' +
          "<b>Two taps and it's yours</b>" +
          (iOS
            ? '<p><span>1</span> Tap the <b>Share</b> button <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><rect x="5" y="10" width="14" height="11" rx="2"/></svg> at the bottom of Safari</p>' +
              '<p><span>2</span> Tap <b>Add to Home Screen</b> — right here:</p>' +
              '<span class="getapp-coach__shot"><img src="assets/img/ios-add-home.png" alt="The Safari menu with Add to Home Screen highlighted"><i aria-hidden="true"></i></span>'
            : '<p><span>1</span> Open your browser menu (&#8942;)</p>' +
              '<p><span>2</span> Tap <b>Install app</b> or <b>Add to Home Screen</b></p>') +
          '<p class="getapp-coach__note">No app store. No wait. It lands on your phone like any app — and it works offline.</p>' +
          '<button type="button">Got it</button></div>';
        ov.addEventListener("click", function () { ov.classList.remove("is-on"); });
        document.body.appendChild(ov);
      }
      requestAnimationFrame(function () { ov.classList.add("is-on"); });
    }
    window.MCC_INSTALL = function () {
      if (window.MCC_TRACK) window.MCC_TRACK("install_tap", { page: location.pathname.split("/").pop() || "index" });
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.then(function (c) {
          if (c && c.outcome === "accepted") document.documentElement.classList.add("is-installed");
          deferred = null;
        });
      } else coach();
    };
    window.addEventListener("appinstalled", function () {
      document.documentElement.classList.add("is-installed");
      if (window.MCC_TRACK) window.MCC_TRACK("install_done", {});
    });
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-getapp]");
      if (b) { e.preventDefault(); window.MCC_INSTALL(); }
    });
  })();

  /* ---------- custom cursor: a lagging ring + a precise dot ---------- */
  if (fine && !reduce) {
    var ring = document.createElement("div");
    var dot = document.createElement("div");
    ring.className = "cur-ring";
    dot.className = "cur-dot";
    ring.setAttribute("aria-hidden", "true");
    dot.setAttribute("aria-hidden", "true");
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    document.documentElement.classList.add("has-cursor");

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;
    window.addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
    }, { passive: true });

    (function loop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
      requestAnimationFrame(loop);
    })();

    var HOT = "a,button,input,textarea,select,summary,label,[role=button],.btn,.magnetic,.song-gate,.command__link";
    document.addEventListener("pointerover", function (e) {
      if (e.target.closest && e.target.closest(HOT)) document.documentElement.classList.add("cur-hot");
    });
    document.addEventListener("pointerout", function (e) {
      if (e.target.closest && e.target.closest(HOT)) document.documentElement.classList.remove("cur-hot");
    });
    window.addEventListener("pointerdown", function () { document.documentElement.classList.add("cur-down"); });
    window.addEventListener("pointerup", function () { document.documentElement.classList.remove("cur-down"); });
    document.addEventListener("mouseleave", function () { document.documentElement.classList.add("cur-gone"); });
    document.addEventListener("mouseenter", function () { document.documentElement.classList.remove("cur-gone"); });
  }

  /* ---------- film-cut page transitions (cover-out on internal nav) ---------- */
  if (!reduce) {
    var veil = document.createElement("div");
    veil.className = "pt-veil";
    veil.setAttribute("aria-hidden", "true");
    document.body.appendChild(veil);

    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      if (a.target === "_blank" || a.hasAttribute("download") || a.hasAttribute("data-noveil")) return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (_) { return; }
      if (url.origin !== location.origin) return;
      // same page (in-page hash / same path) → let the browser handle it
      if (url.pathname === location.pathname && url.search === location.search) return;
      e.preventDefault();
      document.documentElement.classList.add("pt-out");
      var go = function () { location.href = a.href; };
      setTimeout(go, 480);
    });

    // if the page is restored from the back/forward cache, clear any veil state
    window.addEventListener("pageshow", function () {
      document.documentElement.classList.remove("pt-out");
    });
  }

  /* ---------- the app bar, everywhere ----------
     The home page ships its own; every other page gets the same bar
     injected here so the whole site handles like one app. */
  if (!document.querySelector(".appbar")) {
    var here = location.pathname.split("/").pop() || "index.html";
    var tabs = [
      ["index.html#top", "home", "M", '<img class="appbar__m" src="assets/img/m-mark.png" alt="">'],
      ["app.html", "music", "Music", '<path class="np-bar" d="M5 10v4"/><path class="np-bar" d="M9.5 7v10"/><path class="np-bar" d="M14 9v6"/><path class="np-bar" d="M18.5 11v2"/>'],
      ["market.html", "market", "Market", '<path d="m3 7 3-4h12l3 4"/><path d="M3 7h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/><path d="M10 20v-4h4v4"/>'],
      ["profile.html", "profile", "Profile", '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'],
    ];
    var bar = document.createElement("nav");
    bar.className = "appbar";
    bar.setAttribute("aria-label", "Sections");
    bar.innerHTML = tabs.map(function (t) {
      var active = t[0].split("#")[0] === here ? " is-active" : "";
      var np = t[1] === "music" ? ' id="appbarNP"' : "";
      var span = t[1] === "music" ? '<span id="appbarNPLabel">' + t[2] + "</span>" : "<span>" + t[2] + "</span>";
      var icon = t[3].indexOf("<img") === 0 ? t[3] : '<svg viewBox="0 0 24 24" aria-hidden="true">' + t[3] + "</svg>";
      return '<a class="appbar__tab' + active + '" href="' + t[0] + '"' + np + ' data-appnav="' + t[1] + '">' +
        icon + span + "</a>";
    }).join("");
    document.body.appendChild(bar);
    document.body.classList.add("has-appbar");
  }

  /* ---------- the way back: every room has a door out ----------
     A floating back button on every page but home — real history when
     there is one, the front door when there isn't. ---------- */
  (function () {
    var here = location.pathname.split("/").pop() || "index.html";
    if (here === "index.html") return;
    var b = document.createElement("a");
    b.className = "wayback";
    b.href = "index.html";
    b.setAttribute("aria-label", "Go back");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    b.addEventListener("click", function (ev) {
      var sameSite = document.referrer && document.referrer.indexOf(location.origin) === 0;
      if (history.length > 1 && sameSite) { ev.preventDefault(); history.back(); }
      // otherwise the default carries them to the front door
    });
    document.body.appendChild(b);
  })();

  /* ---------- the app trail: pages opened FROM the app keep the thread ----------
     Any link carrying ?from=app gets a floating "‹ The App" chip so deep
     pages (song worlds, the 360) never strand the visitor. ---------- */
  (function () {
    if (new URLSearchParams(location.search).get("from") !== "app") return;
    var crumb = document.createElement("a");
    crumb.className = "app-crumb";
    crumb.href = "app.html";
    crumb.innerHTML = "&#8249; The App";
    document.body.appendChild(crumb);
  })();

  /* ---------- the autopilot: the model works the door ----------
     Exit intent (desktop, mouse breaks for the top of the window):
     ONE goal-aware, fatigue-aware parting card, in the voice this
     visitor answers to. Hard rules: warm visitors only, once per
     72 hours, never on the app/console pages, never pointing at the
     room they're already in, one tap anywhere dismisses. ---------- */
  (function autopilot() {
    if (!window.MCC_MODEL) return;
    var here = location.pathname.split("/").pop() || "index.html";
    var APPS = ["mission.html", "talent.html", "members.html", "app.html", "collab.html", "packet.html", "offline.html"];

    /* the signal dot: the appbar tab nearest the model's pick carries a
       quiet pulse — a pointer, not a shout */
    try {
      var s0 = window.MCC_MODEL.suggest();
      var TAB = { "app.html": "music", "market.html": "market", "providers.html": "market", "talent.html": "market", "collab.html": "market", "onboard.html": "market" };
      var wing = TAB[s0.href];
      if (wing) {
        var tab = document.querySelector('.appbar__tab[data-appnav="' + wing + '"]');
        if (tab && !tab.classList.contains("is-active")) tab.classList.add("has-signal");
      }
    } catch (e) {}

    if (APPS.indexOf(here) !== -1) return;
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return; // phones leave through the appbar, not the top edge
    var last = 0;
    try { last = +localStorage.getItem("mcc_exit_at") || 0; } catch (e) {}
    if (Date.now() - last < 72 * 3600 * 1000) return;

    var armed = false, fired = false;
    setTimeout(function () { armed = true; }, 12000); // they get 12s of peace first

    var VOICE = {
      scarcity: "Before you go — 2 of 3 spots are still open.",
      mission: "Before you go — the movement runs on people like you.",
      proof: "Before you go — this is where the deals get signed.",
      belonging: "Before you go — take the sound with you.",
    };

    document.addEventListener("mouseout", function (e) {
      if (fired || !armed || e.relatedTarget || e.clientY > 24) return;
      var m = window.MCC_MODEL;
      var p = m.profile();
      if (p.stage === "new") return; // strangers get a clean exit
      var s = m.suggest();
      if (!s || s.href === here) return;
      fired = true;
      try { localStorage.setItem("mcc_exit_at", String(Date.now())); } catch (err) {}
      m.shown(s.dom);

      var ov = document.createElement("div");
      ov.className = "exitov";
      ov.setAttribute("role", "dialog");
      ov.innerHTML =
        '<div class="exitov__card">' +
        '<p class="exitov__voice">' + VOICE[m.persuade()] + "</p>" +
        "<h3>" + s.label + "</h3>" +
        "<p class=\"exitov__sub\">" + (s.sub || "") + "</p>" +
        '<div class="exitov__acts">' +
        '<a class="btn btn--ruby" href="' + s.href + '">Take me there</a>' +
        '<button class="btn btn--ghost" type="button">Keep browsing</button>' +
        "</div></div>";
      ov.addEventListener("click", function (ev) {
        var a = ev.target.closest("a");
        if (a && window.MCC_TRACK) window.MCC_TRACK("foryou_tap", { dom: s.dom, why: "exit:" + s.why });
        else if (!ev.target.closest(".exitov__card") || ev.target.closest("button")) ov.remove();
      });
      document.body.appendChild(ov);
      if (window.MCC_TRACK) window.MCC_TRACK("exit_intent", { dom: s.dom, voice: m.persuade() });
    });
  })();

  /* ---------- the Music tab: the sound follows you ----------
     The center tab IS the transport. Its equalizer dances with whatever
     is playing; a tap pauses it, a tap resumes it, and with nothing
     loaded it opens the Music app. MCC_RADIO carries app-started audio
     across every page — position saved, resumed on arrival (one tap if
     the browser demands a fresh gesture). ---------- */
  (function () {
    var tab = document.getElementById("appbarNP");
    if (!tab) return;
    var here = location.pathname.split("/").pop() || "index.html";
    var label = document.getElementById("appbarNPLabel");
    var state = { playing: false, href: null, title: null };
    window.addEventListener("mcc:nowplaying", function (e) {
      state = e.detail || {};
      if (label) label.textContent = state.title || "Music";
      tab.classList.toggle("is-playing", !!state.playing);
    });

    /* the radio: app-started audio rides along on every page but the app
       itself (the app's own player is the source of truth there) */
    var RKEY = "mcc_radio_v1";
    var radio = null;
    function rsave(extra) {
      if (!radio) return;
      try {
        var st = JSON.parse(localStorage.getItem(RKEY)) || {};
        st.pos = radio.currentTime; st.playing = !radio.paused; st.at = Date.now();
        if (extra) Object.keys(extra).forEach(function (k) { st[k] = extra[k]; });
        localStorage.setItem(RKEY, JSON.stringify(st));
      } catch (e) {}
    }
    function announceRadio(st, playing) {
      window.dispatchEvent(new CustomEvent("mcc:nowplaying", {
        detail: { title: st.title, href: "app.html", playing: playing, radio: true },
      }));
    }
    if (here !== "app.html") {
      var st = null;
      try { st = JSON.parse(localStorage.getItem(RKEY)); } catch (e) {}
      if (st && st.src && st.playing && Date.now() - (st.at || 0) < 6 * 3600 * 1000) {
        radio = new Audio(st.src);
        radio.preload = "auto";
        try { radio.currentTime = st.pos || 0; } catch (e) {}
        radio.addEventListener("loadedmetadata", function () {
          try { if (Math.abs(radio.currentTime - (st.pos || 0)) > 2) radio.currentTime = st.pos || 0; } catch (e) {}
        });
        var tick = 0;
        radio.addEventListener("timeupdate", function () {
          if (++tick % 8 === 0) rsave();
        });
        window.addEventListener("pagehide", function () { rsave(); });
        radio.addEventListener("ended", function () {
          try { localStorage.removeItem(RKEY); } catch (e) {}
          announceRadio(st, false);
        });
        radio.play().then(function () {
          announceRadio(st, true);
        }).catch(function () {
          // the browser wants a fresh gesture — the tab offers it
          announceRadio(st, false);
          if (label) label.textContent = "\u25B8 " + (st.title || "Resume");
        });
        window.MCC_RADIO = {
          playing: function () { return !radio.paused; },
          toggle: function () {
            if (radio.paused) radio.play().then(function () { announceRadio(st, true); rsave(); }).catch(function () {});
            else { radio.pause(); announceRadio(st, false); rsave(); }
          },
        };
        // a page starting its OWN sound takes the aux cord — the radio yields
        window.addEventListener("mcc:nowplaying", function (e) {
          if (e.detail && e.detail.playing && !e.detail.radio && !radio.paused) {
            radio.pause(); rsave();
          }
        });
      }
    }

    tab.addEventListener("click", function (ev) {
      if (here === "app.html") return; // the app opens its own player sheet
      // radio riding: one tap pauses it; tapped again, the door opens and
      // the app picks the track up right where it paused
      if (window.MCC_RADIO && window.MCC_RADIO.playing()) { ev.preventDefault(); window.MCC_RADIO.toggle(); return; }
      // page sound off: the first tap turns it on; playing, the tap is the door
      if (!state.playing && window.MCC_NP_PLAY) { ev.preventDefault(); window.MCC_NP_PLAY(); return; }
      // playing → default nav: the Music app, sound in hand
    });
  })();
})();
