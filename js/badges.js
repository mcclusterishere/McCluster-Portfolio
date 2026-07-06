/* ============================================================
   Service badges — renders each panel's badge set from
   data/service-badges.json into [data-badges="<section>"] and
   sends badge_click events. Also wires service_click for the
   marked services links. Registry lives in the JSON so the
   badge explainer page reads the same source of truth.
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

  var slots = document.querySelectorAll("[data-badges]");
  if (slots.length) {
    fetch("data/service-badges.json", { cache: "no-cache" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        slots.forEach(function (slot) {
          var section = slot.getAttribute("data-badges");
          var color = (data.sections[section] || {}).color || "#e5383b";
          var frag = document.createDocumentFragment();
          data.badges.filter(function (b) { return b.section === section; }).forEach(function (b) {
            var a = document.createElement("a");
            a.className = "mbadge-chip";
            a.href = "badge-explainer.html?badge=" + encodeURIComponent(b.id);
            a.title = b.name + " — " + b.short;
            a.innerHTML =
              '<span class="mbadge" style="--badge-c:' + color + '"><img src="assets/img/m-mark.png" alt=""></span>' +
              "<small>" + b.name + "</small>";
            a.addEventListener("click", function () {
              track("badge_click", { badge_id: b.id, section: section, page: "home" });
            });
            frag.appendChild(a);
          });
          slot.appendChild(frag);
        });
      })
      .catch(function () { /* no badges beats a broken panel */ });
  }

  document.querySelectorAll("[data-service]").forEach(function (el) {
    el.addEventListener("click", function () {
      track("service_click", { service: el.getAttribute("data-service"), page: "home" });
    });
  });
})();
