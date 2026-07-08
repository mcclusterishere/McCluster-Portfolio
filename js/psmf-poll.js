/* ============================================================
   "Please Set Me Free" — the civic poll engine.
   Every bar is a tappable policy-poll unit (data/psmf-poll.json).
   Consent-first: nothing deeper than anonymous interaction
   metadata moves until the listener opts in.

   Data rules (hard lines):
   - GA4 (MCC_TRACK) receives ONLY interaction metadata:
     song_id, lyric_id, marker_id, module, question_id, event
     names. NEVER answer values, free text, demographics,
     immigration/mood/legal answers, or location.
   - Consented answers queue locally and POST to the controlled
     backend (INTAKE_ENDPOINT, Apps Script doPost -> Sheet) as
     structured rows. No endpoint configured = device-local only.
   - Scores are policy sentiment / lived-experience signals,
     never diagnoses, never shown as labels on a person.
   ============================================================ */

(function () {
  "use strict";

  var INTAKE_ENDPOINT = ""; // Apps Script /exec URL when the Sheet backend is live

  var root = document.getElementById("pollBody");
  if (!root) return;

  function esc(s) { var d = document.createElement("i"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch (e) { return fb; } }

  /* GA4-safe telemetry: metadata only, enforced at the choke point */
  function tele(name, unit) {
    if (!window.MCC_TRACK) return;
    var p = { song_id: "please_set_me_free" };
    if (unit) {
      p.lyric_id = unit.lyric_id;
      p.marker_id = unit.marker_id;
      p.module = unit.module;
      p.question_id = "q_" + (unit.field || unit.lyric_id);
    }
    window.MCC_TRACK(name, p);
  }

  var anonId = load("mcc_anon_id", null);
  if (!anonId) { anonId = "anon_" + Math.random().toString(36).slice(2) + Date.now().toString(36); store("mcc_anon_id", anonId); }

  var consent = load("mcc_psmf_consent", null); // { research, demographics, contact }
  var deep = load("mcc_psmf_deep", false);
  var state = load("mcc_psmf_state", { issues: {}, indexes: {}, efficacy: [], trust: [], answers: {}, started: false });

  var DATA = null;
  var MK = {};

  function icon(id, cls) {
    return '<svg class="' + (cls || "psy__ic") + '" aria-hidden="true"><use href="assets/icons/markers.svg#mk-' + id + '"></use></svg>';
  }

  /* ---------- backend queue: consented rows only ---------- */
  function queueRow(unit, value, label, extraField) {
    if (!consent || !consent.research) return; // no consent, no collection
    if (unit.requires_consent === "demographics" && !consent.demographics) return;
    var q = load("mcc_psmf_queue", []);
    var row = {
      _form: "psmf-poll",
      song_id: "please_set_me_free",
      lyric_id: unit.lyric_id,
      time_start: unit.t != null ? unit.t : "",
      policy_marker_id: unit.marker_id,
      question_id: "q_" + (extraField || unit.field || unit.lyric_id),
      answer_value: value,
      answer_label: label || "",
      answer_type: unit.open ? "open" : unit.scale ? "scale" : "select",
      consent_level: (consent.research ? "research" : "") + (consent.demographics ? "+demographics" : "") + (consent.contact ? "+contact" : ""),
      anonymous_session_id: anonId,
      created_at: new Date().toISOString(),
    };
    q.push(row);
    store("mcc_psmf_queue", q);
    // civic participation feeds the ONE shared persona (participation only, never the answer)
    if (window.MCC_PERSONA) window.MCC_PERSONA.record("civic", unit.lyric_id || "psmf", 1);
    if (INTAKE_ENDPOINT) {
      fetch(INTAKE_ENDPOINT, { method: "POST", mode: "no-cors", body: JSON.stringify(row) }).catch(function () {});
    }
  }

  /* ---------- scoring ---------- */
  function applyIssues(w) { for (var k in w) state.issues[k] = (state.issues[k] || 0) + w[k]; }
  function applyIndexes(w, scale) { for (var k in w) state.indexes[k] = (state.indexes[k] || 0) + w[k] * (scale == null ? 1 : scale); }
  function topIssue() {
    var best = null;
    for (var k in state.issues) if (!best || state.issues[k] > state.issues[best]) best = k;
    return best;
  }
  function civicTrust() {
    if (!state.trust.length && !state.efficacy.length) return null;
    var parts = [];
    state.trust.forEach(function (v) { parts.push(v); });   // already normalized 0..1 (reversed where needed)
    state.efficacy.forEach(function (v) { parts.push(v / 4); });
    var sum = 0;
    parts.forEach(function (v) { sum += v; });
    return Math.round((sum / parts.length) * 100);
  }

  /* ---------- overlay plumbing (Antisocial-style card) ---------- */
  var overlay = document.createElement("div");
  overlay.className = "psyoverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  document.body.appendChild(overlay);
  function closeOverlay() { overlay.classList.remove("is-open"); document.documentElement.classList.remove("psy-locked"); }
  function openOverlay(html) {
    overlay.innerHTML = '<div class="psyoverlay__box psyoverlay__box--poll">' + html + "</div>";
    overlay.classList.add("is-open");
    document.documentElement.classList.add("psy-locked");
  }

  /* ---------- consent gate ---------- */
  function consentGate(then) {
    if (consent) return then();
    tele("consent_gate_shown");
    openOverlay(
      '<p class="psyoverlay__kicker">Before the first question</p>' +
      '<p class="psyoverlay__resp" style="text-align:left">' + esc(DATA.consent.intro) + "</p>" +
      '<div class="poll__consent">' +
      DATA.consent.choices.map(function (c) {
        return '<label><input type="checkbox" data-c="' + c.id + '"> ' + esc(c.label) + "</label>";
      }).join("") +
      "</div>" +
      '<div class="psyoverlay__opts" style="margin-top:1.2rem">' +
      '<button class="btn btn--ruby" type="button" id="pollConsentGo">Start the poll</button>' +
      '<button class="chat__chip" type="button" id="pollConsentSkip">Just let me read</button>' +
      "</div>" +
      '<p class="psyoverlay__consent">You can skip any question. Nothing sensitive is collected without the first box.</p>'
    );
    overlay.querySelector("#pollConsentGo").addEventListener("click", function () {
      consent = { research: false, demographics: false, contact: false };
      overlay.querySelectorAll("input[data-c]").forEach(function (i) { consent[i.getAttribute("data-c")] = i.checked; });
      store("mcc_psmf_consent", consent);
      tele("consent_set"); // which boxes were ticked stays out of GA4
      closeOverlay();
      then();
    });
    overlay.querySelector("#pollConsentSkip").addEventListener("click", function () {
      consent = { research: false, demographics: false, contact: false };
      store("mcc_psmf_consent", consent);
      closeOverlay();
    });
  }

  /* ---------- the poll card ---------- */
  function answered(unit) { return !!state.answers[unit.lyric_id]; }

  function saveAnswer(unit, value, label, opts) {
    opts = opts || {};
    state.answers[unit.lyric_id] = { v: value, l: label, t: Date.now() };
    if (!state.started) { state.started = true; tele("quiz_started"); }
    if (opts.issues) applyIssues(opts.issues);
    if (unit.indexes && !opts.skipUnitIndexes) applyIndexes(unit.indexes, opts.scaleFactor);
    if (opts.index) applyIndexes(opts.index);
    if (opts.efficacy != null) state.efficacy.push(opts.efficacy);
    if (opts.trustNorm != null) state.trust.push(opts.trustNorm);
    store("mcc_psmf_state", state);
    tele("answer_submitted", unit); // metadata only — never the answer
    queueRow(unit, value, label, opts.field);
    markDone(unit);
    checkModule(unit);
  }

  function markDone(unit) {
    var el = root.querySelector('[data-lyric="' + unit.lyric_id + '"]');
    if (el) el.classList.add("is-answered");
    updateProgress();
  }

  function checkModule(unit) {
    var mates = DATA.units.filter(function (u) { return u.module === unit.module && (deep || u.priority); });
    if (mates.length && mates.every(answered)) tele("module_completed", unit);
    var pool = DATA.units.filter(function (u) { return deep || u.priority; });
    if (pool.length && pool.every(answered)) { tele("quiz_completed"); showResults(); }
  }

  function afterAnswerHTML(unit) {
    return '<p class="psyoverlay__consent">' + esc(DATA.consent.after_answer) + "</p>" +
      '<div class="psyoverlay__opts" style="margin-top:1rem">' +
      '<button class="btn btn--ruby" type="button" data-act="continue">Continue the song</button>' +
      (deep ? "" : '<button class="chat__chip" type="button" data-act="deeper">Go deeper</button>') +
      '<button class="chat__chip" type="button" data-act="skip">Skip questions</button>' +
      "</div>";
  }

  function wireAfter(unit) {
    overlay.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act");
        if (act === "deeper") { deep = true; store("mcc_psmf_deep", true); renderBars(); tele("deep_mode_on"); }
        if (act === "skip") tele("questions_skipped", unit);
        closeOverlay();
      });
    });
  }

  function optionButtons(options, cls) {
    return '<div class="psyoverlay__opts poll__opts">' + options.map(function (o, i) {
      return '<button class="chat__chip" type="button" data-i="' + i + '">' + esc(o.label) + "</button>";
    }).join("") + "</div>";
  }

  function scaleButtons(sc) {
    var out = '<div class="psyoverlay__opts poll__opts">';
    for (var v = sc.min; v <= sc.max; v++) out += '<button class="chat__chip" type="button" data-v="' + v + '">' + v + "</button>";
    out += "</div><p class='poll__scalekey'>" + esc(sc.min + " = " + sc.low) + " · " + esc(sc.max + " = " + sc.high) + "</p>";
    return out;
  }

  function openText(unit, question, field, done) {
    openOverlay(
      icon(MK[unit.marker_id].icon) +
      '<p class="psyoverlay__kicker">' + esc(MK[unit.marker_id].label) + "</p>" +
      '<p class="psyoverlay__q" style="font-size:clamp(1.1rem,3vw,1.5rem)">' + esc(question) + "</p>" +
      '<input class="poll__text" type="text" maxlength="140" placeholder="In your own words…">' +
      '<div class="psyoverlay__opts" style="margin-top:1rem"><button class="btn btn--ruby" type="button" id="pollTextGo">Save</button>' +
      '<button class="chat__chip" type="button" id="pollTextSkip">Skip</button></div>' +
      '<p class="psyoverlay__consent">Free text goes only to the consented research store — never to analytics.</p>'
    );
    overlay.querySelector("#pollTextGo").addEventListener("click", function () {
      var v = overlay.querySelector(".poll__text").value.trim();
      if (v) { saveAnswer(unit, v, v, { field: field }); }
      done();
    });
    overlay.querySelector("#pollTextSkip").addEventListener("click", done);
  }

  function ask(unit) {
    tele("lyric_poll_open", unit);
    if (unit.requires_consent === "demographics" && (!consent || !consent.demographics)) {
      openOverlay(
        icon(MK[unit.marker_id].icon) +
        '<p class="psyoverlay__kicker">' + esc(MK[unit.marker_id].label) + "</p>" +
        '<p class="psyoverlay__resp">This one is optional demographic territory — it stays closed unless you opted into demographic questions on the consent card.</p>' +
        '<div class="psyoverlay__opts"><button class="btn btn--ruby" type="button" data-act="continue">Continue the song</button></div>'
      );
      wireAfter(unit);
      return;
    }
    var m = MK[unit.marker_id];
    var head =
      icon(m.icon) +
      '<p class="psyoverlay__kicker">' + esc(m.label) + "</p>" +
      '<p class="psyoverlay__resp" style="margin-bottom:0.8rem">' + esc(unit.meaning) + "</p>" +
      '<p class="psyoverlay__q" style="font-size:clamp(1.1rem,3vw,1.6rem)">' + esc(unit.question) + "</p>";

    if (unit.open) {
      openText(unit, unit.question, unit.field, function () {
        overlay.querySelector(".psyoverlay__box").innerHTML = icon(m.icon) + afterAnswerHTML(unit);
        wireAfter(unit);
      });
      return;
    }

    if (unit.scale) {
      openOverlay(head + scaleButtons(unit.scale));
      overlay.querySelectorAll("[data-v]").forEach(function (b) {
        b.addEventListener("click", function () {
          var v = +b.getAttribute("data-v");
          var span = unit.scale.max - unit.scale.min;
          var norm = (v - unit.scale.min) / span; // 0..1 where high = the "high" pole
          var o = { scaleFactor: norm };
          if (unit.issues_on_high && norm >= 0.75) o.issues = unit.issues_on_high;
          if (unit.issues_on_low && norm <= 0.25) o.issues = unit.issues_on_low;
          if (unit.trust_component) o.trustNorm = unit.field === "official_trust_score" || unit.field === "development_voice_score" ? norm : 1 - norm;
          saveAnswer(unit, String(v), String(v), o);
          var extra = unit.support_on_high && norm >= 0.75 ? '<p class="psyoverlay__resp">' + esc(DATA.support_card) + "</p>" : "";
          if (unit.followup && norm >= 0.5) return followUp(unit, extra);
          overlay.querySelector(".psyoverlay__box").innerHTML = icon(m.icon) + extra + afterAnswerHTML(unit);
          wireAfter(unit);
        });
      });
      return;
    }

    openOverlay(head + optionButtons(unit.options));
    overlay.querySelectorAll(".poll__opts [data-i]").forEach(function (b) {
      b.addEventListener("click", function () {
        var o = unit.options[+b.getAttribute("data-i")];
        var extras = { issues: o.issues, index: o.index, efficacy: o.efficacy };
        if (unit.trust_component && unit.field === "policy_life_effect") extras.trustNorm = o.value === "helps" ? 1 : o.value === "mixed" || o.value === "unsure" ? 0.5 : 0;
        if (unit.field === "way_out_belief") extras.trustNorm = o.value === "yes" ? 1 : o.value === "maybe" ? 0.5 : o.value === "not_sure" ? 0.25 : 0;
        if (o.open) {
          return openText(unit, unit.question, unit.field, function () {
            overlay.querySelector(".psyoverlay__box").innerHTML = icon(m.icon) + afterAnswerHTML(unit);
            wireAfter(unit);
          });
        }
        saveAnswer(unit, o.value, o.label, extras);
        if (unit.store_as_pre) { state[unit.store_as_pre] = o.value; store("mcc_psmf_state", state); }
        var post = "";
        if (o.support) post += '<p class="psyoverlay__resp">' + esc(DATA.support_card) + "</p>";
        if (o.route === "docket") post += '<p class="psyoverlay__resp">The monopoles have a whole case file. <a href="docket-516.html" style="color:var(--ruby-hot)">Enter the Docket 516 evidence room &#8594;</a></p>';
        if (o.branch) return branchText(unit, o.branch, post);
        if (o.branch_actions) return branchActions(unit, post);
        if (unit.sensitive_followups && consent && consent.research) return sensitiveFollowups(unit, post);
        overlay.querySelector(".psyoverlay__box").innerHTML = icon(m.icon) + post + afterAnswerHTML(unit);
        wireAfter(unit);
      });
    });
  }

  function branchText(unit, br, post) {
    openText(unit, br.question, br.field, function () {
      overlay.querySelector(".psyoverlay__box").innerHTML = icon(MK[unit.marker_id].icon) + (post || "") + afterAnswerHTML(unit);
      wireAfter(unit);
    });
  }

  function branchActions(unit, post) {
    var ACTIONS = [
      ["Read the Docket 516 explainer", "docket-516.html"],
      ["Join the fellowship", "fellowship.html"],
      ["Share this song", "song-please-set-me-free.html"],
      ["Submit your story", "mailto:matthew@mccluster.org?subject=My%20Story%20%E2%80%94%20Please%20Set%20Me%20Free"],
    ];
    openOverlay(
      icon(MK[unit.marker_id].icon) +
      '<p class="psyoverlay__kicker">One action, today</p>' +
      '<div class="psyoverlay__opts poll__opts">' +
      ACTIONS.map(function (a) { return '<a class="chat__chip" href="' + a[1] + '">' + esc(a[0]) + "</a>"; }).join("") +
      "</div>" + (post || "") + afterAnswerHTML(unit)
    );
    wireAfter(unit);
  }

  function sensitiveFollowups(unit, post) {
    var fups = unit.sensitive_followups.slice();
    function next() {
      var f = fups.shift();
      if (!f) {
        overlay.querySelector(".psyoverlay__box").innerHTML = icon(MK[unit.marker_id].icon) + (post || "") + afterAnswerHTML(unit);
        wireAfter(unit);
        return;
      }
      openOverlay(
        icon(MK[unit.marker_id].icon) +
        '<p class="psyoverlay__q" style="font-size:clamp(1rem,2.6vw,1.4rem)">' + esc(f.question) + "</p>" +
        optionButtons(f.options) +
        '<p class="psyoverlay__consent">Optional — stored only in the consented research set.</p>'
      );
      overlay.querySelectorAll(".poll__opts [data-i]").forEach(function (b) {
        b.addEventListener("click", function () {
          var o = f.options[+b.getAttribute("data-i")];
          if (o.value !== "skip") queueRow(unit, o.value, o.label, f.field);
          next();
        });
      });
    }
    next();
  }

  /* ---------- results: your signal ---------- */
  function showResults() {
    var top = topIssue();
    var route = top && DATA.routing[top];
    var trust = civicTrust();
    var box = document.getElementById("pollResults");
    if (!box) return;
    box.hidden = false;
    box.innerHTML =
      '<h2 class="songbuy__title">Your<br>Signal</h2>' +
      '<div class="bexp__panel" style="text-align:left;margin-top:1.5rem">' +
      "<h3>What your answers point to</h3>" +
      "<p>" + (route ? "Your answers suggest you are most concerned with <strong>" + esc(route.label) + "</strong>." : "Answer a few more bars and the signal sharpens.") + "</p>" +
      (trust != null ? "<p style='margin-top:0.6rem'>Your answers also suggest you care most about whether institutions listen and respond.</p>" : "") +
      "<p style='margin-top:0.6rem'><em>This is a policy sentiment signal built from your own answers — not a diagnosis, not a label.</em></p>" +
      "</div>" +
      '<div class="finale__actions" style="margin-top:1.5rem">' +
      (route ? '<a class="btn btn--ruby" href="' + route.href + '">' + esc(route.cta) + "</a>" : "") +
      '<a class="btn btn--ghost" href="fellowship.html">Join the Policy Fellowship</a>' +
      "</div>";
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- render ---------- */
  var progressEl = null;
  function updateProgress() {
    if (!progressEl) return;
    var pool = DATA.units.filter(function (u) { return deep || u.priority; });
    var done = pool.filter(answered).length;
    progressEl.textContent = done + " of " + pool.length + " answered" + (deep ? " · deep mode" : " · first listen");
  }

  function renderBars() {
    var html = "";
    DATA.modules.forEach(function (mod) {
      var units = DATA.units.filter(function (u) { return u.module === mod.id; });
      html += '<section class="poll__module"><p class="songblock__tag">' + esc(mod.name) + "</p>";
      units.forEach(function (u) {
        var open = deep || u.priority;
        html += '<p class="poll__bar' + (open ? "" : " is-locked") + (answered(u) ? " is-answered" : "") + '" data-lyric="' + u.lyric_id + '" role="button" tabindex="0">' +
          esc(u.bar) + " " + icon(MK[u.marker_id].icon, "psy__ic poll__ic") + "</p>";
      });
      html += "</section>";
    });
    root.innerHTML = html;
    updateProgress();
  }

  /* ---------- the follow box: keeps up with the song ---------- */
  var followBox = document.createElement("div");
  followBox.className = "dkt__now poll__now";
  document.body.appendChild(followBox);
  var lastFollow = null;
  function follow() {
    // scroll mode today; flips to time-sync automatically when the master + time codes land
    var bars = root.querySelectorAll(".poll__bar");
    if (!bars.length) return;
    var mid = innerHeight * 0.5;
    var best = null, bestD = Infinity;
    bars.forEach(function (b) {
      var r = b.getBoundingClientRect();
      var d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = b; }
    });
    if (!best || best === lastFollow) return;
    lastFollow = best;
    root.querySelectorAll(".poll__bar.is-now").forEach(function (b) { b.classList.remove("is-now"); });
    best.classList.add("is-now");
    var u = DATA.units.find(function (x) { return x.lyric_id === best.getAttribute("data-lyric"); });
    followBox.innerHTML = "<b>NOW:</b> " + esc(MK[u.marker_id].label) +
      '<i class="dkt__bar">&ldquo;' + esc(u.bar) + "&rdquo;</i>" +
      "<span>" + esc(u.meaning) + "</span>";
  }
  window.addEventListener("scroll", follow, { passive: true });

  /* ---------- boot ---------- */
  fetch("data/psmf-poll.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      DATA = d;
      d.markers.forEach(function (m) { MK[m.marker_id] = m; });
      progressEl = document.getElementById("pollProgress");
      renderBars();
      follow();
      tele("song_poll_view");
      var deepBtn = document.getElementById("pollDeep");
      if (deepBtn) deepBtn.addEventListener("click", function () {
        deep = !deep;
        store("mcc_psmf_deep", deep);
        deepBtn.textContent = deep ? "First-listen mode" : "Deep mode — unlock all 36";
        renderBars();
        tele(deep ? "deep_mode_on" : "deep_mode_off");
      });
      root.addEventListener("click", function (ev) {
        var bar = ev.target.closest(".poll__bar");
        if (!bar) return;
        var u = DATA.units.find(function (x) { return x.lyric_id === bar.getAttribute("data-lyric"); });
        if (!u) return;
        if (bar.classList.contains("is-locked")) { tele("locked_bar_tap", u); return; }
        consentGate(function () { ask(u); });
      });
      root.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && ev.target.classList.contains("poll__bar")) ev.target.click();
      });
    })
    .catch(function () { root.innerHTML = "<p class='finale__believe'>The poll engine is offline — the bars still speak for themselves.</p>"; });

  // a tap on the dark closes the overlay only from the consent-free screens
  overlay.addEventListener("click", function (ev) { if (ev.target === overlay) closeOverlay(); });
})();
