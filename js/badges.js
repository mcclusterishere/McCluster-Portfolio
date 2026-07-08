/* ============================================================
   Badges — the six M-Verified entity seals (js/entities.js).
   Renders org-type badge sets into [data-orgbadges] slots and
   wires service_click for marked services. The per-space
   "service badges" that used to live here are AMENITIES now
   (js/amenities.js) — a badge is who you are; an amenity is
   what a space offers.
   ============================================================ */

(function () {
  "use strict";

  function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }

  /* org-type badge sets: the original M-Verified entity seals, straight
     from js/entities.js — panels declare which org types they verify */
  document.querySelectorAll("[data-orgbadges]").forEach(function (slot) {
    if (!window.MCC_ENTITIES) return;
    var frag = document.createDocumentFragment();
    slot.getAttribute("data-orgbadges").split(",").forEach(function (k) {
      var e = window.MCC_ENTITIES[k.trim()];
      if (!e) return;
      var a = document.createElement("a");
      a.className = "mbadge-chip mbadge-chip--org";
      a.href = "verify.html";
      a.title = e.label + " — " + e.desc;
      a.innerHTML =
        '<span class="mbadge" style="--badge-c:' + e.color + '"><img src="assets/img/m-mark.png" alt=""></span>' +
        "<small>" + e.badge + "</small>";
      a.addEventListener("click", function () {
        track("badge_click", { badge_id: "org-" + k.trim(), section: slot.closest(".command__panel") ? "loadout" : "page", page: "home" });
      });
      frag.appendChild(a);
    });
    slot.appendChild(frag);
  });

  /* NOTE: the old per-space "service badges" (cyc wall, iso booth, lighting
     grid, …) were never really badges — they're AMENITIES now, rendered by
     js/amenities.js into [data-amenities] slots with their own line-emblems.
     Badges are the six M-Verified entity seals above and nothing else. */

  document.querySelectorAll("[data-service]").forEach(function (el) {
    el.addEventListener("click", function () {
      track("service_click", { service: el.getAttribute("data-service"), page: "home" });
    });
  });

  // the character sheet: stat bars fill when the bio takes the screen
  var stats = document.getElementById("bioStats");
  if (stats && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries, obs) {
      if (entries[0].isIntersecting) {
        stats.classList.add("is-on");
        obs.disconnect();
      }
    }, { threshold: 0.35 }).observe(stats);
  } else if (stats) {
    stats.classList.add("is-on");
  }
})();
