/* ============================================================
   McCluster — scroll engine
   Lenis smooth scroll + GSAP ScrollTrigger.
   Every cinematic sequence on the page is scroll-scrubbed:
   hero orbit, designer desk (pillars), songwriter studio (work).
   ============================================================ */

(function () {
  "use strict";

  gsap.registerPlugin(ScrollTrigger);

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Lenis smooth scroll ---------------- */
  var lenis = new Lenis({
    duration: 1.15,
    easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
    smoothWheel: true,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);

  /* ---------------- letter splitting ---------------- */
  function splitLines(rootSel) {
    var chars = [];
    document.querySelectorAll(rootSel + " .hero__line").forEach(function (line) {
      var word = line.getAttribute("data-word") || "";
      line.textContent = "";
      word.split("").forEach(function (c) {
        var s = document.createElement("span");
        s.className = "ch";
        s.textContent = c;
        line.appendChild(s);
        chars.push(s);
      });
    });
    return chars;
  }
  var heroChars = splitLines("#heroTitle");
  var finaleChars = splitLines("#finaleTitle");

  // start hidden until the preloader hands off
  gsap.set(heroChars, { yPercent: 120, opacity: 0, rotate: 6 });
  gsap.set(".hero .reveal-line > span", { yPercent: 110, opacity: 0 });

  /* ---------------- scroll-scrubbed frame sequences ---------------- */
  function pad4(n) { return String(n).padStart(4, "0"); }

  function createSequence(canvasId, fallbackId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var seq = {
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      fallbackId: fallbackId,
      frames: [],
      count: 0,
      current: 0,   // lerped position
      target: 0,    // scroll-driven target
      lastDrawn: -1,
      loadedMax: -1, // highest contiguous loaded frame index
      ready: false,
    };
    seq.drawImg = function (img) {
      if (!img || !img.complete || !img.naturalWidth) return false;
      var cw = canvas.width, ch = canvas.height;
      var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      seq.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      return true;
    };
    seq.size = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      seq.lastDrawn = -1; // force redraw
      // a resize clears the canvas — keep the poster up until the film runs
      if (!seq.ready && seq.poster) seq.drawImg(seq.poster);
    };
    seq.draw = function (i) {
      if (seq.drawImg(seq.frames[i])) seq.lastDrawn = i;
    };
    seq.fallback = function () {
      var fb = document.getElementById(fallbackId);
      if (fb) {
        fb.classList.add("is-active");
        fb.play().catch(function () {});
      }
      canvas.style.display = "none";
    };
    window.addEventListener("resize", seq.size);
    seq.size();
    return seq;
  }

  var sequences = {
    hero: createSequence("orbitCanvas", "heroFallback"),
    designer: createSequence("pillarsCanvas", "pillarsVideo"),
    editors: createSequence("svcCanvas0", null),
    street: createSequence("svcCanvas1", null),
    keynote: createSequence("loadoutCanvas", null),
    vauntlive: createSequence("cmdCanvas5", null),
    uprise: createSequence("cmdCanvas0", null),
    prim3: createSequence("cmdCanvas2", null),
    study: createSequence("cmdCanvas3", null),
    vaunt: createSequence("cmdCanvas4", null),
    whip: createSequence("cmdCanvas6", null),
    citations: createSequence("cmdCanvas7", null),
    bussalick: createSequence("cmdCanvas8", null),
  };

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /* ---------------- mouse parallax hookups ----------------
     Each slide hands its local progress to the parallax layer;
     near a film's final frame the scene starts following the cursor. */
  var PAR = window.MCC_PARALLAX;
  function parCanvas(seqKey, opts) {
    var s = sequences[seqKey];
    return s ? PAR.attach(s.canvas, opts || { depth: 15, tilt: 2.4, push: 0.06 }) : null;
  }

  // butter loop: every tick, lerp each sequence toward its scroll target
  gsap.ticker.add(function () {
    Object.keys(sequences).forEach(function (k) {
      var s = sequences[k];
      if (!s || !s.ready) return;
      s.current += (s.target - s.current) * 0.2;
      var i = Math.round(s.current);
      i = Math.max(0, Math.min(s.count - 1, i));
      // never scrub past what's decoded — hold the nearest loaded frame
      i = Math.min(i, s.loadedMax);
      if (i >= 0 && i !== s.lastDrawn) s.draw(i);
    });
  });

  function loadSequence(seq, name, count, onProgress) {
    seq.count = count;
    return new Promise(function (resolve) {
      var loaded = 0;
      var flags = new Array(count);
      for (var i = 1; i <= count; i++) {
        (function (i) {
          var img = new Image();
          img.src = "assets/frames/" + name + "_" + pad4(i) + ".jpg";
          img.onload = img.onerror = function () {
            loaded++;
            flags[i - 1] = true;
            while (seq.loadedMax + 1 < count && flags[seq.loadedMax + 1]) seq.loadedMax++;
            if (!seq.ready && seq.loadedMax >= 0) {
              seq.ready = true;
              seq.draw(0);
            }
            if (onProgress) onProgress(loaded / count);
            if (loaded === count) resolve();
          };
          seq.frames[i - 1] = img;
        })(i);
      }
    });
  }

  /* ---------------- preloader (gates on the hero sequence) ---------------- */
  var preloader = document.getElementById("preloader");
  var preCount = document.getElementById("preCount");
  var shown = { v: 0 };

  var preMarkL = document.querySelector(".preloader__piece--l");
  var preMarkR = document.querySelector(".preloader__piece--r");

  function setCount(v) {
    preCount.textContent = String(Math.round(v)).padStart(3, "0");
    // two-stage escalation: ignite at 50%, second hit near the end
    preloader.classList.toggle("is-hot", v >= 50);
    preloader.classList.toggle("is-blazing", v >= 85);
    // the mark pulls itself together as the load progresses
    var r = 1 - v / 100; // remaining distance
    if (preMarkL) {
      preMarkL.style.transform =
        "translate(" + (-64 * r) + "px," + (-44 * r) + "px) rotate(" + (-24 * r) + "deg)";
      preMarkL.style.opacity = 0.25 + 0.75 * (1 - r);
      preMarkL.style.filter = "blur(" + 5 * r + "px)";
      preMarkR.style.transform =
        "translate(" + (64 * r) + "px," + (44 * r) + "px) rotate(" + (24 * r) + "deg)";
      preMarkR.style.opacity = 0.25 + 0.75 * (1 - r);
      preMarkR.style.filter = "blur(" + 5 * r + "px)";
    }
  }
  setCount(0);

  function finishPreloader() {
    gsap.to(shown, {
      v: 100, duration: 0.5, ease: "power2.out",
      onUpdate: function () { setCount(shown.v); },
      onComplete: function () {
        preloader.classList.add("is-done");
        introReveal();
      },
    });
  }

  function introReveal() {
    var tl = gsap.timeline();
    tl.to(heroChars, {
      yPercent: 0, opacity: 1, rotate: 0,
      duration: 1.1, ease: "power4.out", stagger: 0.045,
    });
    tl.to(".hero .reveal-line > span", {
      yPercent: 0, opacity: 1, duration: 0.9, ease: "power3.out", stagger: 0.12,
    }, "-=0.7");
  }

  fetch("assets/frames/manifest.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("no manifest"); return r.json(); })
    .then(function (m) {
      // the preloader holds until the WHOLE orbit is in — rolled back to
      // the pre-perf-pass behavior: nothing opens half-loaded (2026-07-06)
      var heroGate = m.hero.count;
      var opened = false;
      loadSequence(sequences.hero, "hero", m.hero.count, function () {
        var gp = Math.min(1, (sequences.hero.loadedMax + 1) / heroGate);
        var pct = gp * 100;
        if (pct > shown.v) { shown.v = pct * 0.99; setCount(shown.v); }
        if (!opened && gp >= 1) { opened = true; openSite(); }
      });
      function openSite() {
        finishPreloader();
        // Every film shows its opening frame from the moment the site
        // opens — a canvas must never sit black while the visitor scrolls
        // faster than the connection streams.
        function loadPoster(key, name) {
          var s = sequences[key];
          if (!s || !m[name]) return;
          var img = new Image();
          img.src = "assets/frames/" + name + "_0001.jpg";
          img.onload = function () {
            if (s.ready) return;
            var cw = s.canvas.width, ch = s.canvas.height;
            var sc = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
            s.ctx.drawImage(img, (cw - img.naturalWidth * sc) / 2, (ch - img.naturalHeight * sc) / 2,
              img.naturalWidth * sc, img.naturalHeight * sc);
          };
        }
        // Each section's full film loads once the scroll gets within a few
        // screens of it, so opening the page never downloads the whole site.
        function loadGroup(specs) {
          specs.forEach(function (spec) {
            var key = spec[0], name = spec[1];
            if (m[name]) loadSequence(sequences[key], name, m[name].count);
            else sequences[key].fallback();
          });
        }
        function loadNear(sel, specs) {
          specs.forEach(function (spec) { loadPoster(spec[0], spec[1]); });
          ScrollTrigger.create({
            trigger: sel, start: "top 500%", once: true,
            onEnter: function () { loadGroup(specs); },
          });
        }
        loadNear("#loadout", [["keynote", m.studio360 ? "studio360" : "keynote"]]);
        loadNear("#pillars", [
          ["editors", "editors"],
          ["street", m.warroom ? "warroom" : "street"],
          ["designer", "designer"],
        ]);
        loadNear("#work", [
          ["uprise", "uprise"], ["citations", "citations"], ["prim3", "prim3"],
          ["study", "study"], ["vauntlive", "vauntlive"], ["vaunt", "vaunt"],
          ["bussalick", "bussalick"],
          ["whip", m.whip ? "whip" : "street"],
        ]);
        ScrollTrigger.refresh();
      }
    })
    .catch(function () {
      // no frames committed — fall back to raw videos everywhere
      Object.keys(sequences).forEach(function (k) { sequences[k].fallback(); });
      finishPreloader();
    });

  /* ---------------- hero scrub ---------------- */
  var hudDeg = document.getElementById("hudDeg");
  var parHero = parCanvas("hero");

  ScrollTrigger.create({
    trigger: "#hero",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: function (st) {
      var p = st.progress;
      sequences.hero.target = p * (sequences.hero.count - 1 || 0);
      hudDeg.textContent = String(Math.round(p * 360)).padStart(3, "0") + "°";
      PAR.set(parHero, st.isActive ? PAR.ramp(p) : 0);
    },
    onToggle: function (st) { if (!st.isActive) PAR.set(parHero, 0); },
  });

  // kinetic type: letters track apart and drift out as the orbit runs
  gsap.timeline({
    scrollTrigger: { trigger: "#hero", start: "top top", end: "55% bottom", scrub: 0.6 },
  })
    .to(heroChars, {
      letterSpacing: "0.35em",
      yPercent: -40,
      opacity: 0,
      stagger: { each: 0.02, from: "center" },
      ease: "power1.in",
    })
    .to(".hero__sub, .hero__eyebrow", { opacity: 0, yPercent: -60 }, 0)
    .to(".hud__scroll", { opacity: 0 }, 0);

  /* ---------------- the loadout: 360 studio pan, three corners ---------------- */
  (function () {
    var loPanels = gsap.utils.toArray("#loadout .command__panel");
    var loCount = document.getElementById("loCount");
    var current = 0;
    var parLoCanvas = parCanvas("keynote");
    var parLoPanels = PAR.attach(document.querySelector("#loadout .command__panels"), { depth: -7 });

    function applyLoadout(p) {
      var active = Math.min(2, Math.floor(p * 3));
      // one continuous film across the whole section — the pan never resets
      sequences.keynote.target = p * (sequences.keynote.count - 1 || 0);
      loPanels.forEach(function (el, i) { el.classList.toggle("is-active", i === active); });
      loCount.textContent = "0" + (active + 1) + " / 03";
      current = active;
      // the pan comes alive at the end of each corner's band
      var s = PAR.ramp(clamp01(p * 3 - active));
      PAR.set(parLoCanvas, s);
      PAR.set(parLoPanels, s);
    }
    applyLoadout(0);

    ScrollTrigger.create({
      trigger: "#loadout",
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: function (st) {
        applyLoadout(st.progress);
        if (!st.isActive) { PAR.set(parLoCanvas, 0); PAR.set(parLoPanels, 0); }
      },
      onToggle: function (st) {
        if (!st.isActive) { PAR.set(parLoCanvas, 0); PAR.set(parLoPanels, 0); }
      },
    });
    gsap.from("#loadout .command__head", {
      x: -70, opacity: 0, duration: 1, ease: "power3.out",
      scrollTrigger: { trigger: "#loadout", start: "top 60%" },
    });
    window.__MCC_GEAR = function () { return current; };
  })();

  /* ---------------- scroll progress bar ---------------- */
  gsap.to("#scrollProgressBar", {
    scaleX: 1,
    ease: "none",
    scrollTrigger: { trigger: document.body, start: "top top", end: "max", scrub: 0.3 },
  });

  /* ---------------- services: three slides over Antisocial ---------------- */
  var svcScenes = [
    { seq: "editors" },
    { seq: "street" },
    { seq: "designer" },
  ];
  var svcPanels = gsap.utils.toArray("#pillars .command__panel");
  var svcCount = document.getElementById("svcCount");
  var SVC_FADE = 0.05;

  function svcSceneOpacity(p, i) {
    var n = svcScenes.length;
    var a = i / n, b = (i + 1) / n;
    var oIn = i === 0 ? 1 : clamp01((p - (a - SVC_FADE)) / (2 * SVC_FADE));
    var oOut = i === n - 1 ? 1 : clamp01(((b + SVC_FADE) - p) / (2 * SVC_FADE));
    return Math.min(oIn, oOut);
  }

  var parSvcCanvases = svcScenes.map(function (sc) { return parCanvas(sc.seq); });
  var parSvcPanels = PAR.attach(document.querySelector("#pillars .command__panels"), { depth: -7 });

  function applyServices(p) {
    var n = svcScenes.length;
    var active = Math.min(n - 1, Math.floor(p * n));
    svcScenes.forEach(function (sc, i) {
      var s = sequences[sc.seq];
      var q = clamp01(p * n - i);
      s.target = q * (s.count - 1 || 0);
      s.canvas.style.opacity = svcSceneOpacity(p, i);
      PAR.set(parSvcCanvases[i], i === active ? PAR.ramp(q) : 0);
    });
    PAR.set(parSvcPanels, PAR.ramp(clamp01(p * n - active)));
    svcPanels.forEach(function (el, i) { el.classList.toggle("is-active", i === active); });
    svcCount.textContent = "0" + (active + 1) + " / 0" + n;
  }
  applyServices(0);

  ScrollTrigger.create({
    trigger: "#pillars",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: function (st) {
      applyServices(st.progress);
      if (!st.isActive) {
        parSvcCanvases.forEach(function (it) { PAR.set(it, 0); });
        PAR.set(parSvcPanels, 0);
      }
    },
    onToggle: function (st) {
      if (!st.isActive) {
        parSvcCanvases.forEach(function (it) { PAR.set(it, 0); });
        PAR.set(parSvcPanels, 0);
      }
    },
  });
  gsap.from("#pillars .command__head", {
    x: -80, opacity: 0, duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: "#pillars", start: "top 60%" },
  });

  /* ---------------- IN COMMAND mini scroll: three scenes, ~equal scroll bands,
     each scrubbed within its band and crossfaded at the boundaries ---------------- */
  // Scenes may share one sequence across consecutive bands (f0..f1 are the
  // fraction of the film each band scrubs) so a two-part project plays as
  // one continuous film with no repeated footage.
  var cmdScenes = [
    // the uprise film is equity (frames 1-101) + docket slam (frames 102-202):
    // Event Production scrubs only the booth half, Policy Change only the slam
    { seq: "uprise", f0: 0, f1: 0.4975, speed: 1 },
    { seq: "uprise", f0: 0.5025, f1: 1, speed: 1 },
    { seq: "citations", f0: 0, f1: 1, speed: 1 },  // the citations on the podium, empty church
    { seq: "prim3", f0: 0, f1: 1, speed: 1 },
    { seq: "study", f0: 0, f1: 1, speed: 1 },
    { seq: "vauntlive", f0: 0, f1: 1, speed: 1 },    // runway performance up to the sky...
    { seq: "vaunt", f0: 0, f1: 1, speed: 1.75 },     // ...into the cabin fly-through
    { seq: "bussalick", f0: 0, f1: 1, speed: 1.75 },  // Dealer Plates video: the dash — fast scrub, whole clip early
    { seq: "whip", f0: 0, f1: 1, speed: 1 },         // Whip Equipped mini-series
  ];
  // six scenes, three PROJECTS: the counter and numbering track projects
  var cmdProjects = [1, 1, 1, 2, 2, 3, 3, 4, 4];
  var cmdProjectCount = 4;
  var cmdSceneTracks = ["environmental-injustice", "environmental-injustice", "environmental-injustice", "gotwifi", "gotwifi", "vaunt", "vaunt", "dealerplates", "dealerplates"];
  var cmdPanels = gsap.utils.toArray("#work .command__panel");
  var cmdCount = document.getElementById("cmdCount");
  var CMD_FADE = 0.03; // narrower bands with six scenes need tighter crossfades
  var lastCmdActive = 0;
  var commandInView = false;    // maintained by the audio block's #work zone
  var commandAudioHook = null;  // assigned by the audio block

  // each canvas is visible across the contiguous scene bands of its sequence
  var cmdCanvasBands = {};
  var parCmdCanvases = {};
  cmdScenes.forEach(function (sc, i) {
    var id = sequences[sc.seq].canvas.id;
    if (!cmdCanvasBands[id]) cmdCanvasBands[id] = { from: i, to: i + 1 };
    else cmdCanvasBands[id].to = i + 1;
    if (!parCmdCanvases[sc.seq]) parCmdCanvases[sc.seq] = parCanvas(sc.seq);
  });
  var parCmdPanels = PAR.attach(document.querySelector("#work .command__panels"), { depth: -7 });

  function cmdCanvasOpacity(p, band) {
    var n = cmdScenes.length;
    var a = band.from / n, b = band.to / n;
    var oIn = band.from === 0 ? 1 : clamp01((p - (a - CMD_FADE)) / (2 * CMD_FADE));
    var oOut = band.to === n ? 1 : clamp01(((b + CMD_FADE) - p) / (2 * CMD_FADE));
    return Math.min(oIn, oOut);
  }

  function applyCommand(p) {
    var n = cmdScenes.length;
    var active = Math.min(n - 1, Math.floor(p * n));
    cmdScenes.forEach(function (sc, i) {
      // a later band only takes over the sequence once the scroll reaches it
      if (i > 0 && p < i / n && cmdScenes[i - 1].seq === sc.seq) return;
      var s = sequences[sc.seq];
      var q = clamp01((p * n - i) * sc.speed);
      s.target = (sc.f0 + q * (sc.f1 - sc.f0)) * (s.count - 1 || 0);
    });
    Object.keys(cmdCanvasBands).forEach(function (id) {
      document.getElementById(id).style.opacity = cmdCanvasOpacity(p, cmdCanvasBands[id]);
    });
    // near the end of the active band the scene starts tracking the cursor
    var actSc = cmdScenes[active];
    var actS = PAR.ramp(clamp01((p * n - active) * actSc.speed));
    Object.keys(parCmdCanvases).forEach(function (k) {
      PAR.set(parCmdCanvases[k], k === actSc.seq ? actS : 0);
    });
    PAR.set(parCmdPanels, actS);
    cmdPanels.forEach(function (el, i) { el.classList.toggle("is-active", i === active); });
    cmdCount.textContent = "0" + cmdProjects[active] + " / 0" + cmdProjectCount;
    if (active !== lastCmdActive) {
      lastCmdActive = active;
      if (window.MCC_TRACK) window.MCC_TRACK("work_scene", { scene: active, project: cmdProjects[active], page: "home" });
      if (commandInView && commandAudioHook) commandAudioHook(cmdSceneTracks[active]);
      // the discreet buy gate follows whichever track the scene plays
      var pay = window.PAYMENTS && window.PAYMENTS[cmdSceneTracks[active]];
      var gate = document.getElementById("gateCmd");
      if (pay && gate) {
        gate.href = pay.page;
        document.getElementById("gateCmdLabel").textContent =
          'Now playing: "' + pay.title + '" — own it';
      }
    }
  }
  applyCommand(0);

  ScrollTrigger.create({
    trigger: "#work",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: function (st) {
      applyCommand(st.progress);
      if (!st.isActive) {
        Object.keys(parCmdCanvases).forEach(function (k) { PAR.set(parCmdCanvases[k], 0); });
        PAR.set(parCmdPanels, 0);
      }
    },
    onToggle: function (st) {
      if (!st.isActive) {
        Object.keys(parCmdCanvases).forEach(function (k) { PAR.set(parCmdCanvases[k], 0); });
        PAR.set(parCmdPanels, 0);
      }
    },
  });

  gsap.from(".command__head", {
    y: 70, opacity: 0, duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: "#work", start: "top 60%" },
  });

  /* ---------------- finale ---------------- */
  gsap.set(finaleChars, { yPercent: 120, opacity: 0, rotate: 8 });
  gsap.to(finaleChars, {
    yPercent: 0, opacity: 1, rotate: 0,
    duration: 1, ease: "power4.out", stagger: 0.05,
    scrollTrigger: { trigger: "#book", start: "top 70%" },
  });
  gsap.from(".finale__actions .btn", {
    y: 40, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.12,
    scrollTrigger: { trigger: ".finale__actions", start: "top 92%" },
  });

  // magnetic buttons
  if (!prefersReduced) {
    document.querySelectorAll(".magnetic").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = "translate(" + dx * 0.25 + "px," + dy * 0.35 + "px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "";
      });
    });
  }

  /* ---------------- fallback videos: play only when visible ---------------- */
  document.querySelectorAll("video").forEach(function (v) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!v.classList.contains("is-active")) return;
        if (en.isIntersecting) v.play().catch(function () {});
        else v.pause();
      });
    }, { threshold: 0.05 }).observe(v);
  });

  /* ---------------- Here album: one track per section ----------------
     Off by default (browser autoplay policy); the header toggle is the
     user gesture that unlocks audio. Crossfades as sections change. */
  (function () {
    var toggle = document.getElementById("soundToggle");
    var tracks = {
      "runway": document.getElementById("track-runway"),
      "antisocial": document.getElementById("track-antisocial"),
      "whodidtheshoot": document.getElementById("track-whodidtheshoot"),
      "environmental-injustice": document.getElementById("track-environmental-injustice"),
      "vaunt": document.getElementById("track-vaunt"),
      "gotwifi": document.getElementById("track-gotwifi"),
      "dealerplates": document.getElementById("track-dealerplates"),
    };
    var zones = [
      { sel: "#hero", track: "whodidtheshoot" },
      { sel: "#loadout", track: "whodidtheshoot" },
      { sel: "#pillars", track: "antisocial" },
      // the command scroll picks its track per scene
      { sel: "#work", track: function () { return cmdSceneTracks[lastCmdActive]; } },
      { sel: "#book", track: "whodidtheshoot" },
    ];
    var soundOn = false;
    var currentTrack = "whodidtheshoot"; // the site opens on Who Did The Shoot
    var avail = {};

    // tracks the manifest says exist; show the toggle once there's at least one
    fetch("assets-manifest.json", { cache: "no-cache" })
      .then(function (r) { return r.json(); })
      .then(function (m) {
        avail = m.audio || {};
        if (Object.keys(avail).length) toggle.hidden = false;
      })
      .catch(function () {});

    function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }

    // iOS only lets play() succeed on elements that have already played
    // inside a user gesture; a mass unlock can drop one, so remember which
    // elements actually made it and keep retrying the rest on later taps
    var unlocked = {};

    function fadeTo(name) {
      if (soundOn && name !== currentTrack) {
        var prev = tracks[currentTrack];
        if (prev && !prev.paused) track("song_stop", { song: currentTrack, page: "home", at_seconds: Math.round(prev.currentTime) });
        if (avail[name]) track("song_start", { song: name, page: "home" });
      }
      currentTrack = name;
      if (!soundOn) return;
      Object.keys(tracks).forEach(function (k) {
        var a = tracks[k];
        if (!a) return;
        if (k === name && avail[k]) {
          var pr = a.play();
          if (pr && pr.then) pr.then(function () { unlocked[k] = true; }).catch(function () {});
          gsap.to(a, { volume: 0.85, duration: 1.2, ease: "power1.out", overwrite: "auto" });
        } else {
          gsap.to(a, {
            volume: 0, duration: 0.9, ease: "power1.out", overwrite: "auto",
            onComplete: function () { a.pause(); },
          });
        }
      });
    }

    commandAudioHook = fadeTo;

    zones.forEach(function (z) {
      ScrollTrigger.create({
        trigger: z.sel,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: function (st) {
          if (z.sel === "#work") commandInView = st.isActive;
          if (st.isActive) fadeTo(typeof z.track === "function" ? z.track() : z.track);
        },
      });
    });

    function setSound(on) {
      if (on === soundOn) return;
      soundOn = on;
      toggle.classList.toggle("is-on", soundOn);
      toggle.setAttribute("aria-pressed", String(soundOn));
      track("sound_toggle", { on: soundOn, page: "home" });
      if (soundOn) track("song_start", { song: currentTrack, page: "home" });
      else {
        var cur = tracks[currentTrack];
        if (cur && !cur.paused) track("song_stop", { song: currentTrack, page: "home", at_seconds: Math.round(cur.currentTime) });
      }
      if (soundOn) {
        unlockAll();
        fadeTo(currentTrack);
      } else {
        Object.keys(tracks).forEach(function (k) {
          var a = tracks[k];
          if (a) gsap.to(a, { volume: 0, duration: 0.5, overwrite: "auto", onComplete: function () { a.pause(); } });
        });
      }
    }

    // unlock every not-yet-unlocked element inside a user gesture: play it
    // muted-by-volume, mark it on success, pause everything but the current
    // track. Safe to call repeatedly — unlocked elements are skipped.
    function unlockAll() {
      Object.keys(tracks).forEach(function (k) {
        var a = tracks[k];
        if (!a || !avail[k] || unlocked[k]) return;
        // a late unlock of the track the visitor is already on comes in
        // audibly right away — never gate the fade on the play() promise,
        // which only settles once media data actually arrives
        var isCurrent = k === currentTrack && soundOn;
        if (!isCurrent) a.volume = 0;
        var pr = a.play();
        if (isCurrent) gsap.to(a, { volume: 0.85, duration: 1.2, ease: "power1.out", overwrite: "auto" });
        if (pr && pr.then) {
          pr.then(function () {
            unlocked[k] = true;
            if (k !== currentTrack) a.pause();
          }).catch(function () {});
        }
      });
    }

    // Sound is strictly opt-in: nothing plays until the visitor hits the
    // toggle. While sound is on, later gestures keep retrying any element
    // the unlock burst dropped (iOS can reject one of several simultaneous
    // play() calls) and restart the current track if its crossfade play()
    // was refused off-gesture — this keeps every track, Dealer Plates
    // included, crossfading reliably on iPad.
    toggle.addEventListener("click", function () { setSound(!soundOn); });

    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (!soundOn) return;
        if (e.target && e.target.closest && e.target.closest("#soundToggle")) return;
        var cur = tracks[currentTrack];
        var wasPaused = cur && avail[currentTrack] && cur.paused;
        unlockAll();
        if (wasPaused && unlocked[currentTrack]) fadeTo(currentTrack);
      }, { passive: true });
    });
  })();

  /* ---------------- interaction analytics ---------------- */
  (function () {
    function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }
    // each section counts once per visit as the visitor reaches it
    ["#hero", "#loadout", "#pillars", "#work", "#book"].forEach(function (sel) {
      ScrollTrigger.create({
        trigger: sel, start: "top 60%", once: true,
        onEnter: function () { track("section_view", { section: sel.slice(1), page: "home" }); },
      });
    });
    // CTAs, song gates, and nav clicks
    document.querySelectorAll(".head-cta, .finale__actions .btn, .song-gate, .site-foot a, a[data-cta]").forEach(function (el) {
      el.addEventListener("click", function () {
        track("cta_click", {
          label: (el.textContent || "").trim().slice(0, 60),
          href: el.getAttribute("href") || "",
          page: "home",
        });
      });
    });
  })();

  /* ---------------- brand mark: 3D spin with the scroll, flashing ---------------- */
  gsap.set(".brand__mark", { transformPerspective: 480 });
  gsap.to(".brand__mark", {
    rotationY: 1080,
    ease: "none",
    scrollTrigger: { start: 0, end: "max", scrub: 0.6 },
  });

  /* ---------------- debug handle (used by the verification harness) ---------------- */
  window.__MCC = {
    ready: function (k) { return sequences[k || "hero"].ready; },
    frameCount: function (k) { return sequences[k || "hero"].count; },
    lastDrawn: function (k) { return sequences[k || "hero"].lastDrawn; },
    target: function (k) { return sequences[k || "hero"].target; },
    loadedMax: function (k) { return sequences[k || "hero"].loadedMax; },
  };

  /* ---------------- Square gates: subscribe + paid inquiry call ---------------- */
  (function () {
    function wire(id, entry, pendingText) {
      var btn = document.getElementById(id);
      if (!btn) return;
      if (entry && entry.link) {
        btn.href = entry.link;
        btn.target = "_blank";
        btn.rel = "noopener";
      } else {
        btn.classList.add("is-pending");
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          btn.textContent = pendingText;
        });
      }
    }
    var pay = window.PAYMENTS || {};
    wire("subscribeBtn", pay.subscribe, "Subscriptions open soon");
    wire("bookCallBtn", pay.bookcall, "Booking opens soon");
    wire("bookCallStat", pay.bookcall, "Booking opens soon");
  })();

  /* ---------------- anchor links through Lenis ---------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (id.length > 1 && document.querySelector(id)) {
        e.preventDefault();
        lenis.scrollTo(id, { offset: 0, duration: 1.6 });
      }
    });
  });
})();
