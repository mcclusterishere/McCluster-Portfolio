/* ============================================================
   "Which Side Are You On?" — the duality quiz.
   Nine common sayings, each against its opposite. Every answer
   picks a side; the result is your personal map across all nine
   dualities, each icon flipping to the side you land on.

   Consent-first, exactly like the rest of the marker layer:
   - Nothing is stored server-side. Answers live only in this
     browser (localStorage) so a retake remembers where you were.
   - GA4 (MCC_TRACK) gets interaction METADATA only: quiz_started,
     quiz_question index, quiz_completed, retake. Never the answer
     values, never a label on a person. Not a diagnosis.
   ============================================================ */
(function () {
  "use strict";

  var mount = document.getElementById("quiz");
  if (!mount) return;

  function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }
  function esc(s) { var d = document.createElement("i"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }

  function icon(id, flipped) {
    return '<svg class="psy__ic dq__ic' + (flipped ? " is-flipped" : "") +
      '" aria-hidden="true"><use href="assets/icons/markers.svg#mk-' + id + '"></use></svg>';
  }

  var KEY = "mcc_duality_v1";
  var DATA = null;
  var answers = load(KEY, {}); // { markerId: value(-2..2) }
  var idx = 0;

  fetch("data/duality-quiz.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (d) { DATA = d; boot(); })
    .catch(function () {
      mount.innerHTML = "<p class='dq__offline'>The quiz is offline for a moment. The markers below still tell the whole story.</p>";
    });

  function boot() {
    var done = DATA.questions.every(function (q) { return answers[q.id] != null; });
    if (done && Object.keys(answers).length) renderResults();
    else renderIntro();
  }

  /* ---------- intro ---------- */
  function renderIntro() {
    mount.innerHTML =
      '<div class="dq__card dq__intro">' +
        '<p class="dq__consent">' + esc(DATA.consent.banner) + "</p>" +
        '<h2 class="dq__h">' + esc(DATA.meta.title) + "</h2>" +
        '<p class="dq__lead">' + esc(DATA.meta.intro) + "</p>" +
        '<button class="btn btn--ruby dq__start" type="button" id="dqStart">' + esc(DATA.meta.cta) + " &#8594;</button>" +
      "</div>";
    document.getElementById("dqStart").addEventListener("click", function () {
      idx = 0; track("quiz_started", { quiz: "duality" }); renderQuestion();
    });
  }

  /* ---------- one question ---------- */
  function renderQuestion() {
    var q = DATA.questions[idx];
    var total = DATA.questions.length;
    var prior = answers[q.id];
    mount.innerHTML =
      '<div class="dq__card dq__q" role="group" aria-label="Question ' + (idx + 1) + ' of ' + total + '">' +
        '<div class="dq__bar"><i style="width:' + ((idx / total) * 100) + '%"></i></div>' +
        '<p class="dq__count">' + (idx + 1) + " / " + total + "</p>" +
        '<div class="dq__poles"><span class="dq__pole">' + esc(q.poleA) + "</span>" +
          '<span class="dq__vs">vs</span>' +
          '<span class="dq__pole dq__pole--b">' + esc(q.poleB) + "</span></div>" +
        '<p class="dq__prompt">' + esc(q.prompt) + "</p>" +
        '<div class="dq__opts">' +
          q.options.map(function (o) {
            var side = o.v < 0 ? " dq__opt--a" : " dq__opt--b";
            var on = prior === o.v ? " is-on" : "";
            return '<button class="dq__opt' + side + on + '" type="button" data-v="' + o.v + '">' + esc(o.label) + "</button>";
          }).join("") +
        "</div>" +
        '<div class="dq__nav">' +
          (idx > 0 ? '<button class="dq__back" type="button" id="dqBack">&#8592; Back</button>' : "<span></span>") +
          '<span class="dq__skiphint">Pick a side</span>' +
        "</div>" +
      "</div>";

    mount.querySelectorAll(".dq__opt").forEach(function (b) {
      b.addEventListener("click", function () {
        answers[q.id] = +b.getAttribute("data-v");
        store(KEY, answers);
        track("quiz_question", { quiz: "duality", q: idx + 1 }); // index only, never the value
        b.classList.add("is-on");
        setTimeout(next, 190);
      });
    });
    var back = document.getElementById("dqBack");
    if (back) back.addEventListener("click", function () { idx = Math.max(0, idx - 1); renderQuestion(); });
  }

  function next() {
    if (idx < DATA.questions.length - 1) { idx++; renderQuestion(); }
    else { track("quiz_completed", { quiz: "duality" }); renderResults(); }
  }

  /* ---------- results: your map across all nine ---------- */
  function sideOf(q) { return answers[q.id] >= 0 ? "b" : "a"; }
  function strong(q) { return Math.abs(answers[q.id]) === 2; }

  function renderResults() {
    // strongest lean drives the headline
    var lead = null, leadMag = -1, sum = 0;
    DATA.questions.forEach(function (q) {
      var v = answers[q.id] || 0; sum += v;
      if (Math.abs(v) > leadMag) { leadMag = Math.abs(v); lead = q; }
    });
    var balanced = Math.abs(sum) <= 1;
    var leadSay = lead ? (sideOf(lead) === "b" ? lead.poleB : lead.poleA) : "";

    var head =
      '<div class="dq__reshead">' +
        '<p class="dq__reskick">Your two sides</p>' +
        (balanced
          ? '<h2 class="dq__resh dq__resh--split">Right down the middle</h2><p class="dq__ressub">' + esc(DATA.results.balancedNote) + "</p>"
          : '<p class="dq__resleadin">' + esc(DATA.results.leadIn) + "</p>" +
            '<h2 class="dq__resh">' + esc(leadSay) + "</h2>" +
            '<p class="dq__ressub">' + esc(DATA.results.sub) + "</p>") +
      "</div>";

    var grid = '<div class="dq__resgrid">' + DATA.questions.map(function (q) {
      var b = sideOf(q) === "b";
      var say = b ? q.poleB : q.poleA;
      var dots = strong(q)
        ? '<span class="dq__dots"><i></i><i></i></span><span class="dq__mag">All the way</span>'
        : '<span class="dq__dots"><i></i></span><span class="dq__mag">A lean</span>';
      return '<button class="dq__res' + (b ? " is-b" : "") + '" type="button" data-id="' + q.id + '" aria-label="Flip ' + esc(say) + '">' +
        '<span class="dq__resic">' + icon(q.id, b) + "</span>" +
        '<span class="dq__ressay">' + esc(say) + "</span>" +
        '<span class="dq__resmeta">' + dots + "</span>" +
        '<span class="dq__flip">tap to flip &#8646;</span>' +
      "</button>";
    }).join("") + "</div>";

    var foot =
      '<p class="dq__footnote">' + esc(DATA.consent.footer) + "</p>" +
      '<div class="dq__actions">' +
        '<button class="btn btn--ruby" type="button" id="dqRetake">Take it again</button>' +
        '<a class="btn btn--ghost" href="#pmkGrid">See all nine markers</a>' +
        '<a class="btn btn--ghost" href="song-antisocial.html">Hear it in the bars</a>' +
      "</div>";

    mount.innerHTML = '<div class="dq__card dq__results">' + head + grid + foot + "</div>";
    track("quiz_results_view", { quiz: "duality" });

    // tap a result to flip it live — the icon mirrors, the saying swaps, pairing the whole thing
    mount.querySelectorAll(".dq__res").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        answers[id] = -(answers[id] || 1); // flip the sign, keep magnitude
        if (answers[id] === 0) answers[id] = 1;
        store(KEY, answers);
        track("quiz_result_flip", { quiz: "duality" });
        renderResults();
      });
    });

    document.getElementById("dqRetake").addEventListener("click", function () {
      answers = {}; store(KEY, answers); idx = 0;
      track("quiz_retake", { quiz: "duality" });
      renderIntro();
      mount.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
})();
