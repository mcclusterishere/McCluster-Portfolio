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
       no Safari bars cutting the game or Our Street. iOS reads these
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
      ["rides.html", "we", "WE", '<img class="appbar__m" src="assets/img/we-mark.png" alt="">'],
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

  /* ---------- THE MORPHING DOCK: five mini-apps sharing one bar ----------
     The grammar (the dock walk below teaches it, once, gated):
       1 tap  — LOOK: a peek card explains what lives there; nothing moves
       2 taps — OPEN: the bar morphs into that wing's own menu, no nav
               (on a morphed slot, 2 taps GO there; on the open wing,
                2 taps bring the main bar back)
       3 taps — THROUGH: straight to the wing's front page
     Travel only ever happens on 2-taps-on-a-slot, 3 taps, or the peek
     card's own button — a single tap never navigates. */
  (function () {
    var dock = document.querySelector(".appbar");
    if (!dock) return;
    function ic(g) { return '<span class="dk-ic" aria-hidden="true">' + g + "</span>"; }
    var WINGS = {
      we: { home: "rides.html", label: "WE", slots: [
        ["rides.html#meter", "🧮", "Meter"], ["rides.html#drivers", "🚗", "Drivers"],
        ["welcome.html?as=driver", "🪙", "Drive"], ["market.html#pay", "💸", "Pay"]] },
      music: { home: "app.html", label: "Only Us", slots: [
        ["mccluster.html", "🌇", "Penthouse"], ["index.html", "🎬", "Front door"],
        ["song-dealer-plates.html", "🎞", "The Series"], ["distribution.html", "🎛", "Distribute"]] },
      market: { home: "market.html", label: "Market", slots: [
        ["market.html#pay", "💸", "Pay"], ["market.html#yours", "🏦", "Your desk"],
        ["market.html#wire", "💬", "The Wire"], ["shelf.html", "🥇", "Gold Shelf"]] },
      spaces: { home: "spaces.html", label: "Spaces", slots: [
        ["list-your-space.html", "📋", "List yours"], ["ourworld.html", "🗺", "The Game"],
        ["amenities.html", "🛋", "Amenities"], ["hire.html", "🎥", "Hire"]] },
      profile: { home: "profile.html", label: "Profile", slots: [
        ["rise.html", "🃏", "Your card"], ["mymission.html", "🎯", "Missions"],
        ["civic.html", "🪪", "Street cred"], ["index.html", "🚪", "Front door"]] },
    };
    /* THE METER LAW + the geo desks — ONE source, shared by the rides
       page and the meter tool the dock pops on any page */
    window.WE_LAW = {
      meter: function (miles, minutes) {
        var raw = 1.0 + 0.97 * miles + 0.32 * minutes;
        var trip = Math.max(7, raw);
        var fare = trip + 3.2;
        var total = fare * 1.10;
        return { trip: trip, floored: raw < 7, fare: fare, raise: total - fare,
          total: total, eup: Math.round(total * 0.67) };
      },
    };
    window.WE_GEO = {
      suggest: function (q, near) {
        var u = "https://photon.komoot.io/api/?limit=4&q=" + encodeURIComponent(q) +
          (near ? "&lat=" + near.lat + "&lon=" + near.lon : "&lat=41.1792&lon=-73.1894");
        return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          return ((j && j.features) || []).map(function (f) {
            var p = f.properties || {};
            var line1 = [p.housenumber, p.street].filter(Boolean).join(" ") || p.name || "";
            var label = [line1, p.city || p.town || p.village, p.state].filter(Boolean).join(", ");
            return { label: label || p.name || q, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
          });
        }).catch(function () { return []; });
      },
      find: function (q, near) {
        return window.WE_GEO.suggest(q, near).then(function (hits) {
          if (hits[0]) return hits[0];
          // the old desk answers when the new one is quiet
          return fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q), {
            headers: { Accept: "application/json" } })
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (j) { return j && j[0] ? { label: j[0].display_name, lat: +j[0].lat, lon: +j[0].lon } : null; })
            .catch(function () { return null; });
        });
      },
      route: function (a, b) {
        return fetch("https://router.project-osrm.org/route/v1/driving/" + a.lon + "," + a.lat + ";" + b.lon + "," + b.lat +
          "?overview=full&geometries=geojson")
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            var r0 = j && j.routes && j.routes[0];
            return r0 ? { miles: r0.distance / 1609.344, minutes: r0.duration / 60, geo: r0.geometry } : null;
          });
      },
    };

    /* what each door IS — the peek card reads from here */
    var PREVIEWS = {
      "rides.html": ["🚘", "Whip Equipped", "The WE tab: a real map, your live dot, drivers pinned, upfront pricing on the standard meter — the house takes a dime on the dollar, not a third."],
      "rides.html#meter": ["🧮", "The meter", "Type where to, see one upfront price before any wheels move — the industry model plus the 10%."],
      "rides.html#drivers": ["🚗", "Drivers on the road", "Real members carrying the Rides lane — on the list and pinned on the street. Book in one pop."],
      "welcome.html?as=driver": ["🪙", "Drive & earn", "Get Whip Equipped: the walk-in pre-picks the Rides lane. The meter names it, you keep all of it."],
      "app.html": ["🎧", "Only Us", "The music house: the heat chart, the registry, the series — and the sound follows you room to room."],
      "mccluster.html": ["🌇", "The Penthouse", "McCluster's own floor — the films, the record, the live $MCC tape. What a built-out page looks like."],
      "index.html": ["🎬", "The front door", "The cinematic opener — the spinning, scrolling face of the whole house."],
      "song-dealer-plates.html": ["🎞", "The Series", "Whip Equipped, season one: dealer plates, two mixes, one ride."],
      "distribution.html": ["🎛", "Distribution", "The locker: the identifiers your work pays through, seals, earnings."],
      "market.html": ["🏪", "Our Street", "The floor: every member a ticker, every deal on the record, the Wire running through it."],
      "market.html#pay": ["💸", "The pay desk", "Punch a number, tap a phone, the deal goes on the record. Card or E⤴ — one price."],
      "market.html#yours": ["🏦", "Your desk", "Your listing, wallet, deals and payouts — the private side of your ticker."],
      "market.html#wire": ["💬", "The Wire", "One feed for all of Our Street — drops, reactions, receipts."],
      "shelf.html": ["🥇", "The Gold Shelf", "What gold is FOR: burn granted E⤴ with the house on reach, polish and partner deals."],
      "spaces.html": ["🏠", "Spaces", "Rooms, studios and stages you can actually book — the city's inventory."],
      "list-your-space.html": ["📋", "List your space", "Put your room on the map and let it earn — the walk-in takes minutes."],
      "ourworld.html": ["🗺", "The Game", "Uprise Nation: your place on the real map — drive out and see it."],
      "amenities.html": ["🛋", "Amenities", "What rides with every space — the standard of the house."],
      "hire.html": ["🎥", "Hire the desk", "Photo, video, web — THE OFFER on every package, priced straight."],
      "profile.html": ["🪪", "Your profile", "Your E⤴ Card, big — face, name, colors, credit — and the mirror to edit it."],
      "rise.html": ["🃏", "Your card", "WHAT MAKES YOU RISE? Two minutes; it deals your card and shapes the whole house to you."],
      "mymission.html": ["🎯", "Your missions", "T.R.A.P.S. — Take Risk And Prosper. Your walk, your points, your next move."],
      "civic.html": ["🪪", "Street Cred Portal", "Your street credit score, verified accounts, the E⤴ Card behind it all."],
    };
    var HOME_BAR = dock.innerHTML;
    var wingOn = null, taps = 0, tapKey = null, timer = null, practice = false;
    function emit(n, d) { try { document.dispatchEvent(new CustomEvent(n, { detail: d || {} })); } catch (e) {} }
    function veilOn() { document.documentElement.classList.add("pt-out"); }
    function veilOff() { document.documentElement.classList.remove("pt-out"); }
    function sail(dest, wait) {
      // the actual departure — practice mode reports instead of leaving
      unpeek();
      if (practice) { veilOff(); emit("mcc:dock-goes", { href: dest }); return; }
      var url = null;
      try { url = new URL(dest, location.href); } catch (e) {}
      if (url && url.pathname === location.pathname && url.search === location.search && url.hash) {
        veilOff(); revert(); location.hash = url.hash; return;
      }
      veilOn();
      setTimeout(function () { location.href = dest; }, wait);
    }

    /* THE PEEK: one tap looks — a card explains the door, travel waits */
    var peekEl = null, peekAway = null;
    function unpeek() {
      if (peekAway) { document.removeEventListener("pointerdown", peekAway, true); peekAway = null; }
      if (peekEl && peekEl.parentNode) peekEl.parentNode.removeChild(peekEl);
      peekEl = null;
    }
    /* THE TOOLS: for the load-bearing slots, the pop IS the room's
       working part — the meter quotes, the road lists, the keypad
       loads — used right here, no travel. Light by law: one aspect,
       the most central one, never the whole page. */
    function wesc(s) { var d = document.createElement("i"); d.textContent = s == null ? "" : s; return d.innerHTML; }
    var WIDGETS = {
      "rides.html#meter": function (box) {
        box.innerHTML = '<input class="dk-w__in" data-w-from type="text" placeholder="Pickup — address" autocomplete="off">' +
          '<input class="dk-w__in" data-w-to type="text" placeholder="Where to?" autocomplete="off">' +
          '<button class="dk-peek__go" data-w-run type="button" style="width:100%;margin-top:0.55rem">See the price &#8594;</button>' +
          '<p class="dk-w__out" data-w-out></p>';
        var run = box.querySelector("[data-w-run]");
        run.addEventListener("click", function () {
          var f = box.querySelector("[data-w-from]").value.trim();
          var t = box.querySelector("[data-w-to]").value.trim();
          var out = box.querySelector("[data-w-out]");
          if (!f || !t) { out.textContent = "Both ends of the ride."; return; }
          run.disabled = true; out.textContent = "Running the meter…";
          Promise.all([window.WE_GEO.find(f), window.WE_GEO.find(t)]).then(function (p) {
            if (!p[0] || !p[1]) throw 0;
            return window.WE_GEO.route(p[0], p[1]);
          }).then(function (leg) {
            if (!leg) throw 0;
            var m = window.WE_LAW.meter(leg.miles, leg.minutes);
            out.innerHTML = '<b style="color:#ff5c2e;font-size:1.35em">$' + m.total.toFixed(2) + "</b> upfront &middot; " +
              '<b style="color:#e8c877">' + m.eup.toLocaleString() + " E⤴</b> &middot; " +
              leg.miles.toFixed(1) + " mi &middot; " + Math.round(leg.minutes) + " min";
          }).catch(function () { out.textContent = "Couldn't place that ride — add a city or zip."; })
            .then(function () { run.disabled = false; });
        });
      },
      "rides.html#drivers": function (box) {
        box.innerHTML = '<p class="dk-w__out">Checking the road…</p>';
        var S = window.MCC_SUPA;
        var liveP = S ? fetch(S.url + "/rest/v1/rpc/drivers_on_road", { method: "POST",
          headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + S.key }, body: "{}" })
          .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }) : Promise.resolve([]);
        var floorP = window.MCC_FLOOR ? window.MCC_FLOOR.load().catch(function () { return { providers: [] }; }) : Promise.resolve({ providers: [] });
        Promise.all([liveP, floorP]).then(function (rr) {
          var live = rr[0] || [], liveSlugs = {};
          live.forEach(function (d) { liveSlugs[d.slug] = 1; });
          var base = (rr[1].providers || []).filter(function (p) {
            return (p.roles || []).some(function (r) { return /rid|driv/i.test(String(r)); }) && !liveSlugs[p.slug || p.id];
          });
          var all = live.map(function (d) { return { name: d.name, area: d.area, slug: d.slug, live: true }; })
            .concat(base.map(function (p) { return { name: p.name, area: p.area, slug: p.slug || p.id, live: false }; }));
          box.innerHTML = all.length ? all.map(function (d) {
            return '<div class="dk-w__row">' + (d.live ? '<span style="color:#00c805">●</span>' : "") +
              "<b>" + wesc(d.name) + "</b><small>" + wesc(d.area || "") + (d.live ? " · live now" : "") + "</small>" +
              '<a href="market.html?to=' + encodeURIComponent(d.slug) + '">Book &#8594;</a></div>';
          }).join("") : '<p class="dk-w__out">No drivers on the road yet — <a href="welcome.html?as=driver" style="color:#ff5c2e">be the first</a>.</p>';
        });
      },
      "market.html#pay": function (box) {
        box.innerHTML = '<input class="dk-w__in" data-w-tick type="text" placeholder="Who — ticker or name (e.g. MCC)" autocomplete="off">' +
          '<a class="dk-peek__go" data-w-pay href="market.html#pay" style="display:block;text-align:center;margin-top:0.55rem;text-decoration:none">Open the desk loaded &#8594;</a>' +
          '<p class="dk-w__out">Name them here, land on the keypad with their desk loaded.</p>';
        box.querySelector("[data-w-tick]").addEventListener("input", function () {
          var t = this.value.trim().replace(/^\$/, "");
          box.querySelector("[data-w-pay]").setAttribute("href", t ? "market.html?to=" + encodeURIComponent(t) : "market.html#pay");
        });
      },
    };
    function popTool(dest) {
      unpeek();
      var m = PREVIEWS[dest] || ["✦", dest.replace(/[#?].*$/, ""), ""];
      peekEl = document.createElement("div");
      peekEl.className = "dk-peek";
      peekEl.setAttribute("data-for", dest);
      peekEl.innerHTML = '<div class="dk-peek__card">' +
        '<div class="dk-peek__top"><span class="dk-peek__ic">' + m[0] + "</span><div style=\"flex:1\"><b>" + m[1] + "</b></div>" +
        '<a class="dk-peek__full" data-pk-go="' + dest + '" href="' + dest + '">Full page &#8594;</a></div>' +
        '<div class="dk-w" data-w-box></div></div>';
      document.body.appendChild(peekEl);
      WIDGETS[dest](peekEl.querySelector("[data-w-box]"));
      peekEl.addEventListener("click", function (e) {
        var go = e.target.closest("[data-pk-go]");
        if (go) { e.preventDefault(); sail(go.getAttribute("data-pk-go"), 460); }
      });
      peekAway = function (e) {
        if (e.target.closest && (e.target.closest(".dk-peek") || e.target.closest(".appbar"))) return;
        unpeek();
      };
      setTimeout(function () { if (peekAway) document.addEventListener("pointerdown", peekAway, true); }, 0);
      emit("mcc:dock-peek", { dest: dest, tool: true });
    }
    /* a slot pops its tool up — and the same taps pop it back down */
    function toggleSlot(dest) {
      if (peekEl && peekEl.getAttribute("data-for") === dest) { unpeek(); return; }
      if (WIDGETS[dest]) popTool(dest); else peek(dest, null);
    }
    function peek(dest, wingKey) {
      unpeek();
      var m = PREVIEWS[dest] || ["✦", dest.replace(/[#?].*$/, ""), ""];
      peekEl = document.createElement("div");
      peekEl.className = "dk-peek";
      peekEl.setAttribute("data-for", dest);
      var acts = "";
      if (wingKey) acts += '<button class="dk-peek__alt" type="button" data-pk-menu="' + wingKey + '">Open the menu</button>';
      if (dest === "app.html" && (window.MCC_RADIO || window.MCC_NP_PLAY)) {
        acts += '<button class="dk-peek__alt" type="button" data-pk-sound>&#9199;&#xFE0E; Sound</button>';
      }
      acts += '<button class="dk-peek__go" type="button" data-pk-go="' + dest + '">Take me there &#8594;</button>';
      peekEl.innerHTML = '<div class="dk-peek__card">' +
        '<div class="dk-peek__top"><span class="dk-peek__ic">' + m[0] + "</span>" +
        "<div><b>" + m[1] + "</b><small>" + m[2] + "</small></div></div>" +
        '<div class="dk-peek__acts">' + acts + "</div></div>";
      document.body.appendChild(peekEl);
      peekEl.addEventListener("click", function (e) {
        var go = e.target.closest("[data-pk-go]");
        if (go) { sail(go.getAttribute("data-pk-go"), 460); return; }
        var mn = e.target.closest("[data-pk-menu]");
        if (mn) { var k = mn.getAttribute("data-pk-menu"); unpeek(); if (wingOn !== k) morph(k); return; }
        if (e.target.closest("[data-pk-sound]")) {
          if (window.MCC_RADIO) window.MCC_RADIO.toggle();
          else if (window.MCC_NP_PLAY) window.MCC_NP_PLAY();
        }
      });
      // a tap anywhere off the card and off the bar puts it away
      peekAway = function (e) {
        if (e.target.closest && (e.target.closest(".dk-peek") || e.target.closest(".appbar"))) return;
        unpeek();
      };
      setTimeout(function () { if (peekAway) document.addEventListener("pointerdown", peekAway, true); }, 0);
      emit("mcc:dock-peek", { dest: dest });
    }
    var ORDER = ["we", "music", "market", "spaces", "profile"];
    function morph(key) {
      var w = WINGS[key];
      if (!w || wingOn === key) return;
      veilOff();
      unpeek();
      wingOn = key;
      dock.classList.add("appbar--morph");
      /* THE ANCHOR LAW: the tab you double-tapped never moves and never
         changes — it stays exactly where it was, exactly as it looks;
         only the OTHER four slots rearrange into the wing's menu */
      var tmp = document.createElement("div");
      tmp.innerHTML = HOME_BAR;
      var anchor = tmp.querySelector('[data-appnav="' + key + '"]');
      if (anchor) { anchor.classList.add("appbar__tab--wing", "is-active"); }
      var slotHtml = w.slots.map(function (s) {
        return '<a class="appbar__tab appbar__tab--slot" href="' + s[0] + '" data-dock="' + s[0] + '">' +
          ic(s[1]) + "<span>" + s[2] + "</span></a>";
      });
      var idx = ORDER.indexOf(key), cells = [], si = 0;
      for (var i = 0; i < ORDER.length; i++) {
        if (i === idx) cells.push(anchor ? anchor.outerHTML : "");
        else cells.push(slotHtml[si++]);
      }
      dock.innerHTML = cells.join("");
      emit("mcc:dock-morph", { wing: key });
    }
    function revert() {
      if (!wingOn) return;
      unpeek();
      wingOn = null;
      dock.classList.remove("appbar--morph");
      dock.innerHTML = HOME_BAR;
      emit("mcc:dock-revert", {});
    }
    dock.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[data-dock],a[data-appnav]");
      if (!a || !dock.contains(a)) return;
      e.preventDefault();
      var slot = a.getAttribute("data-dock");
      var key = a.getAttribute("data-appnav");
      var id = slot || key;
      var w = key ? WINGS[key] : null;
      if (id !== tapKey) { taps = 0; tapKey = id; }
      taps += 1;
      clearTimeout(timer);
      if (taps === 1) {
        // one tap only ever LOOKS — a peek, or a slot's working tool,
        // rises in place; nothing travels
        timer = setTimeout(function () {
          taps = 0;
          if (w) {
            if (peekEl && peekEl.getAttribute("data-for") === w.home) unpeek();
            else peek(w.home, key);
          } else toggleSlot(slot);
        }, 300);
      } else if (taps === 2) {
        timer = setTimeout(function () {
          taps = 0;
          if (w) { if (wingOn === key) revert(); else morph(key); }
          else toggleSlot(slot); // slots pop up and pop down — no travel
        }, 300);
      } else {
        taps = 0;
        sail(w ? w.home : slot, 460); // three taps: all the way through
      }
    });
    window.addEventListener("pageshow", function () { taps = 0; tapKey = null; unpeek(); });
    window.MCC_DOCK = { morph: morph, revert: revert, peek: peek, wing: function () { return wingOn; } };

    /* ---------- THE DOCK WALK: learn the bar, then the doors open ----------
       First boot on any device, the site waits behind this one lesson.
       Money doors never wait: direct deal/page deep links and the pay
       pages skip class — a buyer mid-payment is a guest, not a student. */
    var WALK_KEY = "mcc_dock_walk";
    var here2 = location.pathname.split("/").pop() || "index.html";
    var walked = false;
    try { walked = !!localStorage.getItem(WALK_KEY); } catch (e) {}
    var guest = /[?&](to|who|tour|deal)=/.test(location.search) ||
      { "pay.html": 1, "agreement.html": 1, "claim.html": 1, "page.html": 1,
        "provider.html": 1, "offline.html": 1 }[here2] === 1;
    if (walked || guest) return;
    practice = true;
    var ov = document.createElement("div");
    ov.className = "dockwalk";
    ov.innerHTML = '<div class="dockwalk__card"><p class="dockwalk__k">✦ Lesson one — the bar</p>' +
      '<h3 id="dwT"></h3><p id="dwB"></p><div class="dockwalk__dots" id="dwD"></div>' +
      '<button class="dockwalk__btn" id="dwBtn" type="button"></button></div>';
    document.body.appendChild(ov);
    var STEPS = [
      { t: "One bar runs the whole world.", b: "Every tab down there is its own mini-app. Thirty seconds to learn the grammar, then every door opens.", btn: "Show me" },
      { t: "Tap WE once.", b: "One tap only LOOKS — a peek card tells you what lives there. Nothing moves until you say so.", ev: "mcc:dock-peek" },
      { t: "Now double-tap WE.", b: "Two taps OPEN the wing — the bar becomes WE's own menu, and you never left this page.", ev: "mcc:dock-morph" },
      { t: "Tap any slot once.", b: "Its working part pops up RIGHT HERE — the meter quotes, the road lists — and you use it without ever leaving the page. Tap again, it pops down.", ev: "mcc:dock-peek" },
      { t: "Double-tap WE again.", b: "The main bar comes right back. The tab you opened never moved — only the others made room.", ev: "mcc:dock-revert" },
      { t: "That's the whole grammar.", b: "1 tap looks (a slot pops its tool) · 2 taps open a wing · 3 taps carry you all the way through. The cards' buttons travel too.", btn: "I got it — open the doors" },
    ];
    var dwBtn = ov.querySelector("#dwBtn"), dwT = ov.querySelector("#dwT"), dwB = ov.querySelector("#dwB"), dwD = ov.querySelector("#dwD");
    var at = -1;
    function classDone() {
      practice = false;
      try { localStorage.setItem(WALK_KEY, "1"); } catch (e) {}
      revert();
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      emit("mcc:dockwalk-done", {});
      if (window.MCC_TRACK) window.MCC_TRACK("dockwalk_done", {});
    }
    function lesson(i) {
      at = i;
      if (i >= STEPS.length) { classDone(); return; }
      var s = STEPS[i];
      dwT.textContent = s.t;
      dwB.textContent = s.b;
      dwD.innerHTML = STEPS.map(function (_, j) { return '<i class="' + (j <= i ? "is-lit" : "") + '"></i>'; }).join("");
      if (s.btn) { dwBtn.style.display = ""; dwBtn.textContent = s.btn; return; }
      dwBtn.style.display = "none";
      document.addEventListener(s.ev, function h() {
        document.removeEventListener(s.ev, h);
        lesson(at + 1);
      });
    }
    dwBtn.addEventListener("click", function () { lesson(at + 1); });
    if (window.MCC_TRACK) window.MCC_TRACK("dockwalk_start", {});
    lesson(0);
  })();

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

    /* the tab itself now speaks the dock grammar like every other tab —
       one tap peeks, and the ⏯ Sound button on the peek card is the
       transport (MCC_RADIO.toggle / MCC_NP_PLAY ride there) */
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
    "offline.html": 1, "mission.html": 1, "mccluster.html": 1, "rides.html": 1, "walkthrough-qt6kv-2847.html": 1 };
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
  if (cart.kind === "rise") {
    // a dealt card silences the rise breadcrumb forever
    try {
      var rz9 = JSON.parse(localStorage.getItem("mcc_rise") || "null");
      if (rz9 && rz9.arch) { localStorage.removeItem("mcc_cart"); return; }
    } catch (e9) {}
  }
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
