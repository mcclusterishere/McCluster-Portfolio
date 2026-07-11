/* ============================================================
   Polish — the craft layer. Custom cinematic cursor + film-cut
   page transitions. Dependency-free, degrades gracefully, and
   never touches touch devices or reduced-motion users.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- the sideways pin: the page scrolls ONE way ----------
     Third layer under the CSS seal: iOS Safari has a history of panning
     the document past root overflow rules when anything overflows. If
     the window ever drifts off x=0, it snaps back the same frame. ---------- */
  (function () {
    var pin = function () {
      if (window.scrollX) window.scrollTo(0, window.scrollY);
    };
    window.addEventListener("scroll", pin, { passive: true });
    window.addEventListener("pageshow", pin);
    pin();
  })();

  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- native feel: the page never zooms ----------
     Android obeys the viewport meta; iOS Safari ignores user-scalable
     on purpose, so the gesture events get swallowed here. Double-tap
     zoom dies with a short-window second-tap preventDefault — except
     on real controls, where the tap must land. The meta is also
     patched at runtime so any future page missing the canonical
     viewport still gets sealed. ---------- */
  (function () {
    var mv = document.querySelector('meta[name="viewport"]');
    if (mv && mv.content.indexOf("maximum-scale") === -1) {
      mv.content += ", maximum-scale=1, user-scalable=no";
    }
    /* the real native feel: every page is installable. "Add to Home
       Screen" from ANY page launches the app with zero browser chrome —
       no Safari bars cutting the game or the floor. iOS reads these
       tags from whatever page the visitor is standing on, so they ride
       everywhere. */
    function headTag(html) {
      var t = document.createElement("template");
      t.innerHTML = html;
      document.head.appendChild(t.content.firstChild);
    }
    if (!document.querySelector('link[rel="manifest"]')) {
      headTag('<link rel="manifest" href="manifest.webmanifest">');
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      headTag('<meta name="apple-mobile-web-app-capable" content="yes">');
      headTag('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">');
      headTag('<meta name="apple-mobile-web-app-title" content="McCluster">');
    }
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      headTag('<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">');
    }
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
    });
    var lastTap = 0;
    var CONTROLS = "a,button,input,select,textarea,summary,label,[role=button],[data-k],[data-act]";
    document.addEventListener("touchend", function (e) {
      var now = Date.now();
      if (now - lastTap < 300 && !(e.target.closest && e.target.closest(CONTROLS))) {
        e.preventDefault(); // the second tap of a double-tap zoom, on dead space
      }
      lastTap = now;
    }, { passive: false });
  })();

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
    if (["mission.html", "talent.html", "market.html#providers", "app.html"].indexOf(here) !== -1) return;
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
    // the signer lands exactly where the link caught them — the copy on
    // every door promises "signs you in right here", so here is where
    // they stay (token stripped). The admin still goes to Mission Control.
    location.replace(email === "matthew@mccluster.org" ? "mission.html"
      : here + location.search);
  })();

  /* ---------- the intake rail: no ask lost to an inbox ----------
     Every mailto link on every page used to throw the visitor into
     their email app — and the ask vanished from the platform's view.
     Now the tap opens a small sheet, the ask files into the intake
     table tagged with a KIND parsed from the subject line, and the
     back end can answer algorithmically. The email app stays one tap
     away as the fallback; if the cloud is dark the mailto proceeds
     untouched. Self-contained keys: this file loads before backend.js. */
  (function intakeRail() {
    var SB_URL = "https://fxbkvcrfbbcmrrupdcjt.supabase.co";
    var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Ymt2Y3JmYmJjbXJydXBkY2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0Mjk5NzAsImV4cCI6MjA5OTAwNTk3MH0.ar1MYPC4gF9V7wn3UpTW0Q7PniGJdbBD1UmOKjNqJWU";

    function kindOf(subject) {
      var s = (subject || "").toLowerCase();
      if (/fellowship/.test(s)) return "fellowship";
      if (/heal|notify/.test(s)) return "notify";
      if (/web/.test(s)) return "quote-web";
      if (/photo|shoot|gallery/.test(s)) return "quote-photo";
      if (/video/.test(s)) return "quote-video";
      if (/record|studio/.test(s)) return "quote-recording";
      if (/residual|giv|donor|member/.test(s)) return "giving";
      if (/onboard/.test(s)) return "onboard-question";
      if (/space|venue|stage/.test(s)) return "space";
      if (/quote|build|project|inquiry|premium/.test(s)) return "quote";
      return "general";
    }

    var sheet = null;
    function openSheet(subject, bodyPrefill) {
      var kind = kindOf(subject);
      if (!sheet) {
        sheet = document.createElement("div");
        sheet.id = "mccIntake";
        sheet.innerHTML =
          '<style>#mccIntake{position:fixed;inset:0;z-index:9500;display:flex;align-items:flex-end;justify-content:center;' +
          'background:rgba(5,4,3,0.78);backdrop-filter:blur(3px)}' +
          '#mccIntake .itk{width:100%;max-width:30rem;background:#141110;border:1px solid rgba(244,239,230,0.16);' +
          'border-bottom:0;border-radius:22px 22px 0 0;padding:1.2rem 1.2rem calc(1.5rem + env(safe-area-inset-bottom))}' +
          '#mccIntake h3{font-family:var(--display,inherit);text-transform:uppercase;font-weight:400;' +
          'font-size:1.3rem;margin:0 0 0.2rem;color:var(--cream,#f4efe6)}' +
          '#mccIntake .itk__sub{margin:0 0 0.8rem;color:rgba(244,239,230,0.6);font-size:0.9rem;line-height:1.5}' +
          '#mccIntake .itk__in{width:100%;background:rgba(10,8,7,0.75);border:1px solid rgba(244,239,230,0.3);' +
          'border-radius:12px;color:var(--cream,#f4efe6);font:inherit;font-size:max(16px,1rem);padding:0.8em 1em;margin:0 0 0.55rem}' +
          '#mccIntake textarea.itk__in{min-height:5.2em;resize:vertical}' +
          '#mccIntake .itk__go{display:block;width:100%;border:0;border-radius:12px;cursor:pointer;font:inherit;font-weight:800;' +
          'font-size:0.95rem;letter-spacing:0.05em;text-transform:uppercase;padding:1em;color:#fff;' +
          'background:linear-gradient(120deg,var(--ruby,#a4161a),var(--ruby-hot,#e5383b))}' +
          '#mccIntake .itk__alt{display:block;width:100%;background:none;border:0;color:rgba(244,239,230,0.7);' +
          'font:inherit;font-size:0.9rem;text-decoration:underline;cursor:pointer;padding:0.7em;text-align:center}' +
          '#mccIntake .itk__msg{margin:0.4rem 0 0;min-height:1.2em;color:var(--cream,#f4efe6);font-size:0.9rem;text-align:center}</style>' +
          '<div class="itk" role="dialog" aria-modal="true">' +
          '<h3>Say the word.</h3>' +
          '<p class="itk__sub" data-itk-sub></p>' +
          '<input class="itk__in" data-itk-name type="text" placeholder="Your name" autocomplete="name">' +
          '<input class="itk__in" data-itk-contact type="text" placeholder="Email or phone — where the answer lands" autocomplete="email">' +
          '<textarea class="itk__in" data-itk-body placeholder="What you need, in your words"></textarea>' +
          '<button class="itk__go" type="button" data-itk-send>Send it — straight to the desk</button>' +
          '<button class="itk__alt" type="button" data-itk-mail>or open your email app instead</button>' +
          '<p class="itk__msg" data-itk-msg></p></div>';
        document.body.appendChild(sheet);
        sheet.addEventListener("click", function (ev) { if (ev.target === sheet) sheet.style.display = "none"; });
      }
      sheet.style.display = "flex";
      var box = sheet.querySelector(".itk");
      box.querySelector("[data-itk-sub]").textContent = (subject || "Whatever it is") +
        " — it files straight onto the platform, on the record, answered from the desk.";
      box.querySelector("[data-itk-body]").value = bodyPrefill || "";
      box.querySelector("[data-itk-msg]").textContent = "";
      var send = box.querySelector("[data-itk-send]");
      var mail = box.querySelector("[data-itk-mail]");
      send.onclick = function () {
        var nm = box.querySelector("[data-itk-name]").value.trim();
        var ct = box.querySelector("[data-itk-contact]").value.trim();
        var bd = box.querySelector("[data-itk-body]").value.trim();
        var msg = box.querySelector("[data-itk-msg]");
        if (!ct) { msg.textContent = "A way to reach you — that's the one thing it needs."; return; }
        send.textContent = "Sending…";
        var uid = null;
        try {
          var s = JSON.parse(localStorage.getItem("mccdb_session") || "null");
          if (s && s.access_token) uid = JSON.parse(atob(s.access_token.split(".")[1])).sub || null;
        } catch (e) {}
        fetch(SB_URL + "/rest/v1/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SB_KEY, Prefer: "return=minimal" },
          body: JSON.stringify({ kind: kind, name: nm, contact: ct, body: bd + (subject ? "\n[" + subject + "]" : ""),
            page: location.pathname.split("/").pop() || "index.html", uid: uid }),
        }).then(function (r) {
          if (!r.ok) throw new Error("net");
          if (window.MCC_TRACK) window.MCC_TRACK("intake_filed", { kind: kind });
          box.querySelector("[data-itk-msg]").textContent = "On the record — the desk answers from here.";
          send.textContent = "✓ Sent";
          setTimeout(function () { sheet.style.display = "none"; send.textContent = "Send it — straight to the desk"; }, 1600);
        }).catch(function () {
          send.textContent = "Send it — straight to the desk";
          box.querySelector("[data-itk-msg]").textContent = "The rail hiccuped — use the email door below.";
        });
      };
      mail.onclick = function () {
        location.href = "mailto:matthew@mccluster.org?subject=" + encodeURIComponent(subject || "From the site");
        sheet.style.display = "none";
      };
    }

    document.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="mailto:matthew@mccluster.org"]') : null;
      if (!a) return;
      ev.preventDefault();
      var href = a.getAttribute("href");
      var subject = "", body = "";
      try {
        var q = href.split("?")[1] || "";
        q.split("&").forEach(function (kv) {
          var p = kv.split("=");
          if (p[0] === "subject") subject = decodeURIComponent(p[1] || "");
          if (p[0] === "body") body = decodeURIComponent(p[1] || "");
        });
      } catch (e) {}
      openSheet(subject, body);
    });
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
      ["ourworld.html", "afuera", "AFUERA", '<img class="appbar__m" src="assets/img/eu-favicon.png" alt="">'],
      ["app.html", "music", "Only Us", '<path class="np-bar" d="M5 10v4"/><path class="np-bar" d="M9.5 7v10"/><path class="np-bar" d="M14 9v6"/><path class="np-bar" d="M18.5 11v2"/>'],
      ["market.html", "market", "Market", '<path d="m3 7 3-4h12l3 4"/><path d="M3 7h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/><path d="M10 20v-4h4v4"/>'],
      ["spaces.html", "spaces", "Spaces", '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21v-6h4v6"/><path d="M9 10h.01M15 10h.01"/>'],
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

  /* ---------- the command door: the workstation is never far ----------
     One floating chip on every page: members land in THEIR Mission
     Control; the desk's own email lands in the full command room. */
  (function () {
    var here = location.pathname.split("/").pop() || "index.html";
    if (here === "mission.html" || here === "mymission.html" || here === "index.html") return;
    var email = "";
    try { email = (JSON.parse(localStorage.getItem("mccdb_session") || "null") || {}).access_token ? (window.MCC_SUPA && window.MCC_SUPA.email && window.MCC_SUPA.email()) || "" : ""; } catch (e) {}
    var c = document.createElement("a");
    c.href = email === "matthew@mccluster.org" ? "mission.html" : "mymission.html";
    c.setAttribute("aria-label", "Your command room");
    c.style.cssText = "position:fixed;right:0.9rem;bottom:calc(5.4rem + env(safe-area-inset-bottom));z-index:60;" +
      "display:flex;align-items:center;gap:0.35rem;background:rgba(12,9,8,0.88);backdrop-filter:blur(8px);" +
      "border:1px solid rgba(201,157,69,0.55);border-radius:100px;padding:0.5rem 0.9rem;text-decoration:none;" +
      "color:#c99d45;font-size:0.78rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;" +
      "box-shadow:0 6px 22px rgba(0,0,0,0.45)";
    c.innerHTML = "&#9670; Command";
    document.body.appendChild(c);
  })();

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
    crumb.innerHTML = "&#8249; The Music";
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
    var APPS = ["mission.html", "talent.html", "market.html#providers", "app.html", "collab.html", "packet.html", "offline.html"];

    /* the signal dot: the appbar tab nearest the model's pick carries a
       quiet pulse — a pointer, not a shout */
    try {
      var s0 = window.MCC_MODEL.suggest();
      var TAB = { "app.html": "music", "market.html": "market", "providers.html": "market", "talent.html": "market", "collab.html": "market", "welcome.html": "market", "spaces.html": "spaces", "list-your-space.html": "spaces" };
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
          // the browser wants a fresh gesture — the very next tap
          // anywhere on the page is it, so the music never really stops
          announceRadio(st, false);
          if (label) label.textContent = "\u25B8 " + (st.title || "Resume");
          var wake = function (ev) {
            // tapping the Music tab keeps its own meaning
            if (ev.target && ev.target.closest && ev.target.closest("#appbarNP")) return;
            document.removeEventListener("pointerdown", wake, true);
            radio.play().then(function () { announceRadio(st, true); rsave(); }).catch(function () {});
          };
          document.addEventListener("pointerdown", wake, true);
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

/* THE VELVET ROPE — the E⤴ Card is the key to the whole house.
   Everything past the front-facing landing pages (the ones ads land
   on) requires a card: no card, you're walked straight into RISE,
   and RISE hands you back to wherever you were headed. A signed-in
   session walks through — the account carries the imprint, and the
   desk restores the card from it, so a member on a NEW device is
   never asked to play RISE twice. */
(function () {
  var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var OPEN = { "index.html": 1, "rise.html": 1, "page.html": 1, "equity-uprise.html": 1,
    "heal-the-3.html": 1, "hire.html": 1, "vaunt.html": 1, "vr-vaunt.html": 1, "motm.html": 1,
    "agreement.html": 1, "brand.html": 1, "ip.html": 1, "resume.html": 1, "role.html": 1,
    "docket-516.html": 1, "dekalb.html": 1, "deluxe-516r.html": 1, "grind-paper.html": 1,
    "scb-paper.html": 1, "pitch-freedom.html": 1, "fellowship.html": 1, "psychology-markers.html": 1,
    "badge-explainer.html": 1, "space-revent.html": 1, "ecosystem.html": 1, "house.html": 1,
    "offline.html": 1, "mission.html": 1, "mccluster.html": 1, "walkthrough-qt6kv-2847.html": 1 };
  if (OPEN[here] || here.indexOf("song-") === 0) return;
  try {
    var card = JSON.parse(localStorage.getItem("mcc_rise") || "null");
    if (card && card.arch) return;
  } catch (e) {}
  try {
    var s = JSON.parse(localStorage.getItem("mccdb_session") || "null");
    var seg = s && s.access_token && s.access_token.split(".")[1];
    if (seg) {
      var pay = JSON.parse(atob(seg.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - seg.length % 4) % 4)));
      // any live sign-in passes: the account is the card's home now
      if (pay.sub && (!pay.exp || pay.exp * 1000 > Date.now())) return;
    }
  } catch (e2) {}
  try { sessionStorage.setItem("mcc_rope_next", here + location.search + location.hash); } catch (e3) {}
  location.replace("rise.html");
})();

/* THE CLOSER — abandoned moves don't die, they knock. Any flow that
   starts drops a breadcrumb (mcc_cart); finishing clears it. A visitor
   carrying one sees a single resume bar on every page until they finish,
   dismiss it (per session), or it goes stale at 48 hours. */
(function () {
  var cart = null;
  try { cart = JSON.parse(localStorage.getItem("mcc_cart") || "null"); } catch (e) {}
  if (!cart || !cart.at || !cart.href || Date.now() - cart.at > 48 * 3600 * 1000) return;
  try { if (sessionStorage.getItem("mcc_cart_hush")) return; } catch (e2) {}
  var here = location.pathname.split("/").pop() || "index.html";
  if (here === String(cart.href).split(/[?#]/)[0]) return;   // already back in the flow
  function paint() {
    var bar = document.createElement("div");
    bar.className = "closer-bar";
    var a = document.createElement("a");
    a.href = cart.href;
    a.textContent = "↺ " + (cart.label || "You left something mid-move") + " — pick it back up →";
    var x = document.createElement("button");
    x.type = "button"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "✕";
    x.addEventListener("click", function () {
      try { sessionStorage.setItem("mcc_cart_hush", "1"); } catch (e3) {}
      bar.remove();
      if (window.MCC_TRACK) window.MCC_TRACK("closer_hush", { kind: cart.kind });
    });
    bar.appendChild(a); bar.appendChild(x);
    document.body.appendChild(bar);
    if (window.MCC_TRACK) window.MCC_TRACK("closer_shown", { kind: cart.kind });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();
