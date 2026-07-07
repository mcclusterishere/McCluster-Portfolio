/* ============================================================
   Identity markers — common sayings, each with its opposite.
   Every marked phrase (<em class="psy" data-marker="id">) carries
   its icon; a tap opens a small card with the saying and a plain
   read. Tap "Flip it" and the card inverts to the opposite saying —
   the same trait, the other pole. Everything stays binary.

   No answers are stored, nothing is tied to you, and nothing here
   is a diagnosis. Registry: data/psychology-markers.json.
   ============================================================ */

(function () {
  "use strict";

  var els = document.querySelectorAll(".psy[data-marker]");
  if (!els.length) return;

  function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }
  function page() { return window.SONG ? window.SONG.key : "site"; }
  function icon(id, cls) {
    return '<svg class="' + (cls || "psy__ic") + '" aria-hidden="true"><use href="assets/icons/markers.svg#mk-' + id + '"></use></svg>';
  }

  var MAP = {};
  var CONSENT = { footer: "For curiosity, not diagnosis. Every one of these has a flip side." };

  /* ---------- the small card ---------- */
  var card = document.createElement("aside");
  card.className = "psycard";
  card.setAttribute("aria-live", "polite");
  document.body.appendChild(card);
  var openId = null, flipped = false;

  function close(reason) {
    if (!openId) return;
    track("marker_close", { marker_id: openId, page: page(), reason: reason || "tap" });
    card.classList.remove("is-open");
    openId = null;
  }

  function render() {
    var d = MAP[openId];
    if (!d) return;
    var side = flipped ? d.inverse : d;
    var otherName = flipped ? d.name : d.inverse.name;
    card.innerHTML =
      '<button class="psycard__x" type="button" aria-label="Close">&times;</button>' +
      '<p class="psycard__kicker">Identity marker · ' + (flipped ? "the flip side" : "one side") + "</p>" +
      '<div class="psycard__ichead">' + icon(d.id, "psy__ic" + (flipped ? " is-flipped" : "")) + "<h4>" + side.name + "</h4></div>" +
      "<p class='psycard__body'>" + side.short + "</p>" +
      (flipped ? "" : "<p class='psycard__body psycard__body--dim'>" + d.interpretation + "</p>") +
      (side.challenge ? "<p class='psycard__body psycard__body--dim'><b style='color:var(--ruby-hot)'>Taste the flip:</b> " + side.challenge + "</p>" : "") +
      '<button class="psycard__deep" type="button">Flip it ↔ ' + otherName + "</button>" +
      '<a class="psycard__foot" href="psychology-markers.html?marker=' + d.id + '" style="display:block;color:var(--ruby-hot)">The full pair &#8594;</a>' +
      '<p class="psycard__foot">' + CONSENT.footer + "</p>";
    card.querySelector(".psycard__x").addEventListener("click", function () { close("x"); });
    card.querySelector(".psycard__deep").addEventListener("click", function (ev) {
      ev.stopPropagation();
      flipped = !flipped;
      track("marker_flip", { marker_id: openId, to: flipped ? "inverse" : "pole", page: page() });
      render();
    });
  }

  function open(id) {
    var d = MAP[id];
    if (!d) return;
    openId = id; flipped = false;
    render();
    card.classList.add("is-open");
    track("marker_open", { marker_id: id, page: page() });
  }

  /* ---------- wire the phrases ---------- */
  fetch("data/psychology-markers.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      CONSENT = data.consent || CONSENT;
      data.markers.forEach(function (m) { MAP[m.id] = m; });
      els.forEach(function (el) {
        var id = el.getAttribute("data-marker");
        if (!MAP[id]) return;
        el.classList.add("has-ic");
        el.insertAdjacentHTML("beforeend", icon(id));
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        function go(ev) {
          ev.stopPropagation();
          if (openId === id) return close("tap");
          open(id);
        }
        el.addEventListener("click", go);
        el.addEventListener("keydown", function (ev) { if (ev.key === "Enter") go(ev); });
      });
    })
    .catch(function () { /* the phrases still read without the layer */ });

  // a tap anywhere else lets the card go
  document.addEventListener("click", function (ev) {
    if (openId && !card.contains(ev.target) && !ev.target.closest(".psy")) close("away");
  });
})();
