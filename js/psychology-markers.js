/* ============================================================
   Psychology markers — consent-first lyric annotations.
   Every marked bar (<em class="psy" data-marker="id">) carries
   its marker icon; a tap opens a small card with the marker's
   name and a plain-English read, plus "Go deeper" — a full-screen
   reflection that pauses the song and the scroll until Continue.

   Consent rules this layer lives by:
   answers are never stored or transmitted with identity, no
   profile is built, nothing infers medical conditions or
   political beliefs. Registry: data/psychology-markers.json.
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
  var CONSENT = { banner: "", footer: "For curiosity, not diagnosis." };

  /* earned marker badges — device-local only, the listener's to wear or hide */
  function badgeStore() {
    try { return JSON.parse(localStorage.getItem("mcc_marker_badges") || "{}"); } catch (e) { return {}; }
  }
  function saveBadge(id, worn) {
    var s = badgeStore();
    s[id] = { earned_at: (s[id] && s[id].earned_at) || new Date().toISOString(), worn: !!worn };
    try { localStorage.setItem("mcc_marker_badges", JSON.stringify(s)); } catch (e) {}
  }

  /* ---------- the small card ---------- */
  var card = document.createElement("aside");
  card.className = "psycard";
  card.setAttribute("aria-live", "polite");
  document.body.appendChild(card);
  var openId = null;

  function close(reason) {
    if (!openId) return;
    track("psych_marker_close", { marker_id: openId, page: page(), reason: reason || "tap" });
    card.classList.remove("is-open");
    openId = null;
  }

  function open(id) {
    var d = MAP[id];
    if (!d) return;
    openId = id;
    card.innerHTML =
      '<button class="psycard__x" type="button" aria-label="Close">&times;</button>' +
      '<p class="psycard__kicker">Psychology marker · ' + d.id.replace(/_/g, " ") + "</p>" +
      '<div class="psycard__ichead">' + icon(d.id) + "<h4>" + d.name + "</h4></div>" +
      "<p class='psycard__body'>" + d.interpretation + "</p>" +
      '<button class="psycard__deep" type="button">Go deeper</button>' +
      '<p class="psycard__foot">' + CONSENT.footer + "</p>";
    card.classList.add("is-open");
    track("psych_marker_open", { marker_id: id, page: page() });
    card.querySelector(".psycard__x").addEventListener("click", function () { close("x"); });
    card.querySelector(".psycard__deep").addEventListener("click", function () {
      track("psych_marker_deep_click", { marker_id: id, page: page() });
      card.classList.remove("is-open");
      openId = null;
      deeper(d);
    });
  }

  /* ---------- the deeper overlay: the song and the scroll hold their breath ---------- */
  var overlay = document.createElement("div");
  overlay.className = "psyoverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  document.body.appendChild(overlay);
  var resumeAudio = false;

  function pauseWorld() {
    document.documentElement.classList.add("psy-locked");
    resumeAudio = window.__MCC_PAUSE ? window.__MCC_PAUSE() : false;
  }
  function resumeWorld() {
    document.documentElement.classList.remove("psy-locked");
    if (window.__MCC_RESUME) window.__MCC_RESUME(resumeAudio);
  }

  function deeper(d) {
    pauseWorld();
    track("psych_quiz_start", { marker_id: d.id, page: page() });
    overlay.innerHTML =
      '<div class="psyoverlay__box">' + icon(d.id) +
      '<p class="psyoverlay__kicker">' + d.name + " · go deeper</p>" +
      '<p class="psyoverlay__q">' + d.deeper.q + "</p>" +
      '<div class="psyoverlay__opts">' +
      d.deeper.opts.map(function (o, i) { return '<button class="chat__chip" data-i="' + i + '" type="button">' + o + "</button>"; }).join("") +
      "</div>" +
      '<p class="psyoverlay__consent">' + CONSENT.banner + "</p></div>";
    overlay.classList.add("is-open");
    overlay.querySelectorAll(".psyoverlay__opts .chat__chip").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.getAttribute("data-i");
        // the answer itself stays on this screen; only which option index was
        // chosen is counted, anonymously, for aggregate curiosity stats
        track("psych_quiz_answer", { marker_id: d.id, option_index: i, page: page() });
        overlay.querySelector(".psyoverlay__box").innerHTML =
          icon(d.id) +
          '<p class="psyoverlay__kicker">' + d.name + "</p>" +
          '<p class="psyoverlay__resp">' + d.deeper.resp[i] + "</p>" +
          '<p class="psyoverlay__kicker">Badge earned: ' + d.name + "</p>" +
          '<div class="psyoverlay__opts" id="psyWear">' +
          '<button class="chat__chip" data-wear="1" type="button">Wear it on my profile</button>' +
          '<button class="chat__chip" data-wear="0" type="button">Keep it hidden</button>' +
          "</div>" +
          '<button class="btn btn--ruby" type="button" id="psyContinue" style="margin-top:1rem">Continue the song</button>' +
          '<p class="psyoverlay__consent">' + CONSENT.footer + " Badges live only in this browser until you make an account.</p>";
        // finishing the quiz earns the marker badge — stored on THIS device
        // only (localStorage), worn or hidden by the listener's own choice
        overlay.querySelectorAll("#psyWear .chat__chip").forEach(function (w) {
          w.addEventListener("click", function () {
            saveBadge(d.id, w.getAttribute("data-wear") === "1");
            overlay.querySelectorAll("#psyWear .chat__chip").forEach(function (x) { x.style.opacity = x === w ? "1" : "0.35"; });
            track("psych_badge_wear", { marker_id: d.id, worn: w.getAttribute("data-wear") === "1", page: page() });
          });
        });
        overlay.querySelector("#psyContinue").addEventListener("click", function () {
          if (!badgeStore()[d.id]) saveBadge(d.id, false); // earned either way, hidden by default
          track("psych_quiz_complete", { marker_id: d.id, page: page() });
          overlay.classList.remove("is-open");
          resumeWorld();
        });
      });
    });
  }

  /* ---------- wire the bars ---------- */
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
    .catch(function () { /* the bars still sing without the layer */ });

  // a tap anywhere else lets the small card go; the scroll never stops for it
  document.addEventListener("click", function (ev) {
    if (openId && !card.contains(ev.target) && !ev.target.closest(".psy")) close("away");
  });
})();
