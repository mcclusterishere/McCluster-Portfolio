/* ============================================================
   Polish — the craft layer. Custom cinematic cursor + film-cut
   page transitions. Dependency-free, degrades gracefully, and
   never touches touch devices or reduced-motion users.
   ============================================================ */
(function () {
  "use strict";
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
})();
