/* ============================================================
   Amenities — what a space or provider OFFERS. NOT badges.
   A badge (js/entities.js) is who you are on the network and
   wears the M seal. An amenity wears its own line-emblem and is
   always called an amenity. This renders amenity chips into any
   [data-amenities="id,id,..."] slot and powers amenities.html.
   Registry: data/amenities.json (one source of truth).
   ============================================================ */
(function () {
  "use strict";
  function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }

  var slots = document.querySelectorAll("[data-amenities]");
  var root = document.getElementById("amRoot");

  var CACHE = null;
  function get() {
    if (CACHE) return Promise.resolve(CACHE);
    return fetch("data/amenities.json", { cache: "no-cache" })
      .then(function (r) { return r.json(); })
      .then(function (d) { CACHE = d; return d; });
  }

  // one amenity as an emblem chip — its own glyph, never the M mark
  function chip(a, color, opts) {
    opts = opts || {};
    var el = document.createElement(opts.href ? "a" : "span");
    el.className = "amenity" + (opts.big ? " amenity--lg" : "");
    if (opts.href) el.href = opts.href;
    el.style.setProperty("--am-c", color || "#c9c2b6");
    el.title = a.name + " — " + a.short;
    el.innerHTML =
      '<span class="amenity__ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + a.icon + '"/></svg></span>' +
      "<span class=\"amenity__txt\"><b>" + escp(a.name) + "</b>" +
      (opts.big ? "<small>" + escp(a.short) + "</small>" : "") + "</span>";
    return el;
  }
  function escp(s) { var d = document.createElement("i"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  // inline slots: <div data-amenities="cyc-wall,natural-light" data-am-color="#e5383b">
  if (slots.length) {
    get().then(function (data) {
      var byId = {}; data.amenities.forEach(function (a) { byId[a.id] = a; });
      slots.forEach(function (slot) {
        var wanted = slot.getAttribute("data-amenities").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        var color = slot.getAttribute("data-am-color") || "";
        var frag = document.createDocumentFragment();
        wanted.forEach(function (id) {
          var a = byId[id]; if (!a) return;
          var c = color || (data.groups[a.group] || {}).color;
          var ch = chip(a, c, { href: "amenities.html?a=" + encodeURIComponent(id) });
          ch.addEventListener("click", function () { track("amenity_click", { amenity_id: id }); });
          frag.appendChild(ch);
        });
        slot.appendChild(frag);
      });
    }).catch(function () {});
  }

  // the explainer page: one amenity in detail, or the full legend by group
  if (root) {
    get().then(function (data) {
      var want = new URLSearchParams(location.search).get("a");
      var one = want && data.amenities.filter(function (a) { return a.id === want; })[0];
      var attest = data.attest || {};
      if (one) {
        var g = data.groups[one.group] || { label: one.group, color: "#c9c2b6" };
        document.title = one.name + " — Amenity · McCluster";
        root.innerHTML =
          '<div class="am__hero"><span class="amenity__ico amenity__ico--hero" style="--am-c:' + g.color + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + one.icon + '"/></svg></span>' +
          "<div><p class=\"bexp__section\">" + escp(g.label) + " · Amenity</p><h1>" + escp(one.name) + "</h1></div></div>" +
          '<div class="bexp__panel"><p>' + escp(one.meaning) + "</p></div>" +
          '<div class="bexp__panel"><h3>How it’s confirmed</h3><p>' + escp(attest[one.attest] || one.attest) + ".</p>" +
          '<p class="am__note">An amenity is what the space offers — not a verification badge. Verification is the M seal; ' +
          'this is the room speaking for itself. <a href="badge-explainer.html">See the badges &#8594;</a></p></div>';
        track("amenity_view", { amenity_id: one.id });
      } else {
        document.title = "Amenities — What a Space Offers · McCluster";
        root.innerHTML =
          '<div class="am__hero"><div><p class="bexp__section">The Amenities</p><h1>What A Space<br>Offers.</h1></div></div>' +
          '<div class="bexp__panel"><p>These aren’t badges. A <a href="badge-explainer.html">badge</a> is who you are on the network — ' +
          "the M seal, earned by verification. An <strong style=\"color:var(--cream)\">amenity</strong> is what a space or provider brings to the booking: " +
          "the lighting, the booth, the green room. Every amenity carries its own emblem so you can read a room at a glance.</p></div>" +
          Object.keys(data.groups).map(function (key) {
            var g = data.groups[key];
            return "<h2 class=\"bexp__section\" style=\"margin:1.8rem 0 0.5rem\">" + escp(g.label) + "</h2><div class=\"amenity-legend\" data-g=\"" + key + "\"></div>";
          }).join("");
        Object.keys(data.groups).forEach(function (key) {
          var box = root.querySelector('.amenity-legend[data-g="' + key + '"]');
          data.amenities.filter(function (a) { return a.group === key; }).forEach(function (a) {
            box.appendChild(chip(a, data.groups[key].color, { href: "amenities.html?a=" + encodeURIComponent(a.id), big: true }));
          });
        });
        track("amenity_view", { amenity_id: "legend" });
      }
    }).catch(function () {
      root.innerHTML = '<div class="am__hero"><h1>The registry is offline</h1></div>';
    });
  }

  window.MCC_AMENITIES = { get: get, chip: chip };
})();
