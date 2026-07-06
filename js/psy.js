/* ============================================================
   The psychology layer — lyric annotations that quiz you softly.
   Marked phrases (<em class="psy" data-psy="key">) shimmer inside
   the bars; a tap opens a small fixed card with the concept, a
   two-sentence explainer, and a one-tap self-check. The card never
   captures the scroll — the film keeps riding underneath.
   Content comes from window.PSY_MAP set by the page.
   ============================================================ */

(function () {
  "use strict";
  var MAP = window.PSY_MAP || {};
  if (!Object.keys(MAP).length) return;

  function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }

  var card = document.createElement("aside");
  card.className = "psycard";
  card.setAttribute("aria-live", "polite");
  document.body.appendChild(card);
  var openKey = null;

  function close() {
    card.classList.remove("is-open");
    openKey = null;
  }

  function open(key) {
    var d = MAP[key];
    if (!d) return;
    openKey = key;
    card.innerHTML =
      '<button class="psycard__x" type="button" aria-label="Close">&times;</button>' +
      '<p class="psycard__kicker">The psychology · ' + d.field + "</p>" +
      "<h4>" + d.title + "</h4>" +
      "<p class='psycard__body'>" + d.text + "</p>" +
      '<div class="psycard__quiz"><p>' + d.q + "</p><div class='psycard__opts'>" +
      d.opts.map(function (o, i) { return '<button class="chat__chip" data-i="' + i + '" type="button">' + o + "</button>"; }).join("") +
      "</div></div>" +
      '<p class="psycard__foot">For curiosity, not diagnosis.</p>';
    card.classList.add("is-open");
    track("psy_open", { concept: key, page: window.SONG ? window.SONG.key : "site" });
    card.querySelector(".psycard__x").addEventListener("click", close);
    card.querySelectorAll(".psycard__opts .chat__chip").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.getAttribute("data-i");
        card.querySelector(".psycard__quiz").innerHTML =
          '<p class="psycard__resp">' + d.resp[i] + "</p>";
        track("psy_quiz", { concept: key, answer: d.opts[i], page: window.SONG ? window.SONG.key : "site" });
      });
    });
  }

  document.querySelectorAll(".psy").forEach(function (el) {
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    function go(ev) {
      ev.stopPropagation();
      var k = el.getAttribute("data-psy");
      if (openKey === k) return close();
      open(k);
    }
    el.addEventListener("click", go);
    el.addEventListener("keydown", function (ev) { if (ev.key === "Enter") go(ev); });
  });

  // a tap anywhere else lets the card go; the scroll never stops either way
  document.addEventListener("click", function (ev) {
    if (openKey && !card.contains(ev.target) && !ev.target.closest(".psy")) close();
  });
})();
