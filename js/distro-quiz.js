/* THE DISTRO INTERVIEW — one engine, mounted anywhere.
   Three questions before any surface asks for uploads: what you
   make, who pays you, whether statements exist. Answers persist
   (mcc_distro), auto-connect the chosen platforms, and every
   locked door on the site opens through THIS — the questions
   appear right where the member tapped, never on another page. */
(function () {
  "use strict";

  function esc(s) { var d = document.createElement("i"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function answers() { try { return JSON.parse(localStorage.getItem("mcc_distro")); } catch (e) { return null; } }
  function signedIn() { return !!(window.MCC_AUTH && window.MCC_AUTH.user && window.MCC_AUTH.user()); }

  var css = ".dq{border:1px solid rgba(201,157,69,0.5);border-radius:16px;background:rgba(20,16,14,0.92);padding:1.1rem 1.15rem;text-align:left}" +
    ".dq__k{font-size:0.58rem;letter-spacing:0.24em;text-transform:uppercase;color:#c99d45;font-weight:800;margin:0}" +
    ".dq h2{font-family:var(--display,inherit);font-weight:400;text-transform:uppercase;font-size:1.3rem;margin:0.3rem 0 0.2rem;color:#f4efe6}" +
    ".dq__n{color:rgba(244,239,230,0.6);font-size:0.82rem;line-height:1.6;margin:0 0 0.7rem}" +
    ".dq__chips{display:flex;flex-wrap:wrap;gap:0.45rem}" +
    ".dq__chip{border:1.5px solid rgba(244,239,230,0.35);border-radius:100px;background:rgba(10,8,7,0.5);color:#f4efe6;font:inherit;font-size:0.82rem;font-weight:700;padding:0.55em 1.1em;cursor:pointer}" +
    ".dq__chip.is-on{border-color:#e8c877;background:rgba(201,157,69,0.25);color:#fff}" +
    ".dq__go{display:inline-block;border:0;border-radius:12px;cursor:pointer;font:inherit;font-weight:800;font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase;padding:0.85em 1.6em;color:#fff;margin-top:0.9rem;background:linear-gradient(120deg,#7f1d1d,#e5383b)}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function mount(host, opts) {
    opts = opts || {};
    if (!host || !window.MCC_DIST) return;
    window.MCC_DIST.registry().then(function (REG) {
      var picked = { ind: null, dists: [], names: {}, statements: null, at: new Date().toISOString() };
      function panel(step, title, note, inner) {
        return '<div class="dq"><p class="dq__k">The interview · ' + step + " of 3</p>" +
          "<h2>" + title + '</h2><p class="dq__n">' + note + "</p>" + inner + "</div>";
      }
      function step1() {
        host.innerHTML = panel(1, "What do you make?", "The desk only ever asks for what your world can actually produce.",
          '<div class="dq__chips">' + (REG.industries || []).map(function (ind) {
            return '<button class="dq__chip" type="button" data-q1="' + esc(ind.id) + '">' + esc(ind.name) + "</button>";
          }).join("") + "</div>");
        host.querySelectorAll("[data-q1]").forEach(function (b) {
          b.addEventListener("click", function () { picked.ind = b.getAttribute("data-q1"); step2(); });
        });
      }
      function step2() {
        var list = (REG.distributors || []).filter(function (d) { return d.industry === picked.ind; });
        host.innerHTML = panel(2, "Who sends it out — who pays you?",
          "Tap everyone that applies. This is how the desk knows which reports exist for you and where they live.",
          '<div class="dq__chips">' + list.map(function (d) {
            return '<button class="dq__chip" type="button" data-q2="' + esc(d.id) + '" data-q2n="' + esc(d.name) + '">' + esc(d.name) + "</button>";
          }).join("") +
          '<button class="dq__chip" type="button" data-q2="__other__" data-q2n="Other">Somebody else</button>' +
          '<button class="dq__chip" type="button" data-q2="__none__" data-q2n="Nobody yet">Nobody yet</button></div>' +
          '<button class="dq__go" type="button" data-q2next>Next &#8594;</button>');
        host.querySelectorAll("[data-q2]").forEach(function (b) {
          b.addEventListener("click", function () {
            var id = b.getAttribute("data-q2");
            if (id === "__none__") { picked.dists = []; picked.names = {}; step3(); return; }
            b.classList.toggle("is-on");
            var i = picked.dists.indexOf(id);
            if (i === -1) { picked.dists.push(id); picked.names[id] = b.getAttribute("data-q2n"); }
            else picked.dists.splice(i, 1);
          });
        });
        host.querySelector("[data-q2next]").addEventListener("click", step3);
      }
      function step3() {
        host.innerHTML = panel(3, "Do you get statements?",
          "Earnings reports, royalty statements, backend CSVs — however they reach you.",
          '<div class="dq__chips">' +
          '<button class="dq__chip" type="button" data-q3="csv">Yes — CSV files / emails</button>' +
          '<button class="dq__chip" type="button" data-q3="portal">Yes — I download from a portal</button>' +
          '<button class="dq__chip" type="button" data-q3="none">Not yet</button></div>');
        host.querySelectorAll("[data-q3]").forEach(function (b) {
          b.addEventListener("click", function () { picked.statements = b.getAttribute("data-q3"); finish(); });
        });
      }
      function finish() {
        try { localStorage.setItem("mcc_distro", JSON.stringify(picked)); } catch (e) {}
        // the chosen platforms connect themselves — the desk knows you now
        if (signedIn()) {
          picked.dists.filter(function (id) { return id !== "__other__"; }).forEach(function (id) {
            var d = (REG.distributors || []).filter(function (x) { return x.id === id; })[0];
            window.MCC_DIST.connect({ distributor_id: id, distributor: (d && d.name) || picked.names[id] || id,
              industry: picked.ind, reports_url: (d && d.reports) || "" }).catch(function () {});
          });
        }
        if (window.MCC_TRACK) window.MCC_TRACK("distro_interview", { ind: picked.ind, n: picked.dists.length, st: picked.statements });
        if (opts.onDone) opts.onDone(picked);
      }
      step1();
      if (window.MCC_TRACK) window.MCC_TRACK("distro_interview_start", { from: opts.from || "" });
    });
  }

  /* my platforms, resolved: interview picks + live connections, with
     names and report doors — every surface personalizes off this */
  function mine(REG) {
    var a = answers() || {};
    var out = [];
    (a.dists || []).forEach(function (id) {
      if (id === "__other__") return;
      var d = ((REG && REG.distributors) || []).filter(function (x) { return x.id === id; })[0];
      out.push({ id: id, name: (d && d.name) || (a.names || {})[id] || id, reports: (d && d.reports) || "" });
    });
    return out;
  }

  window.MCC_DQUIZ = { mount: mount, answers: answers, mine: mine };
})();
