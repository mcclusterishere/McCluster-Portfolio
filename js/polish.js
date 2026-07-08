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
    location.replace(email === "matthew@mccluster.org" ? "mission.html" : "app.html");
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
      ["index.html#top", "home", "Home", '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20h12v-9.5"/>'],
      ["index.html#work", "collabs", "Collabs", '<path d="M12 3l2.2 6.2L20.5 9l-5 4 1.7 6.4L12 16l-5.2 3.4L8.5 13l-5-4 6.3.2z"/>'],
      ["#np", "nowplaying", "Now Playing", '<path class="np-bar" d="M5 10v4"/><path class="np-bar" d="M9.5 7v10"/><path class="np-bar" d="M14 9v6"/><path class="np-bar" d="M18.5 11v2"/>'],
      ["app.html", "theapp", "The App", '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>'],
      ["providers.html", "hire", "Hire", '<path d="M13 3 5 13h5l-1 8 8-11h-5z"/>'],
    ];
    var bar = document.createElement("nav");
    bar.className = "appbar";
    bar.setAttribute("aria-label", "Sections");
    bar.innerHTML = tabs.map(function (t) {
      var active = t[0].split("#")[0] === here ? " is-active" : "";
      var np = t[1] === "nowplaying" ? ' id="appbarNP"' : "";
      var span = t[1] === "nowplaying" ? '<span id="appbarNPLabel">' + t[2] + "</span>" : "<span>" + t[2] + "</span>";
      return '<a class="appbar__tab' + active + '" href="' + t[0] + '"' + np + ' data-appnav="' + t[1] + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + t[3] + "</svg>" + span + "</a>";
    }).join("");
    document.body.appendChild(bar);
    document.body.classList.add("has-appbar");
  }

  /* ---------- the Now Playing tab ----------
     Mirrors whatever the current section is playing. Pages announce with a
     `mcc:nowplaying` CustomEvent ({title, href, playing}); a tap starts the
     sound while it's off (window.MCC_NP_PLAY), then leads to the song. */
  (function () {
    var tab = document.getElementById("appbarNP");
    if (!tab) return;
    var label = document.getElementById("appbarNPLabel");
    var state = { playing: false, href: null };
    window.addEventListener("mcc:nowplaying", function (e) {
      state = e.detail || {};
      if (label && state.title) label.textContent = state.title;
      tab.classList.toggle("is-playing", !!state.playing);
      tab.setAttribute("href", state.href || "#np");
    });
    tab.addEventListener("click", function (ev) {
      if (!state.playing && window.MCC_NP_PLAY) { ev.preventDefault(); window.MCC_NP_PLAY(); }
      else if (!state.href || state.href === "#np") ev.preventDefault();
    });
  })();
})();
