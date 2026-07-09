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

  /* ---------------- Lenis smooth scroll ----------------
     Tuned for CONTROL: the page must feel held, not driven. A shorter
     glide (0.85s), and on touch devices the scroll runs through Lenis
     too (syncTouch) — one pipeline for finger and film, which also
     kills the pinned-section jitter iOS gets on native momentum. A
     firmer syncTouchLerp keeps the page pinned to the finger, and a
     calmer inertia stops the coast sooner after a flick. */
  var lenis = new Lenis({
    duration: 0.85,
    easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
    smoothWheel: !prefersReduced,
    syncTouch: !prefersReduced,
    syncTouchLerp: 0.14,
    touchInertiaMultiplier: 22,
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

  function createSequence(canvasId, fallbackId, isHero) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var seq = {
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      fallbackId: fallbackId,
      isHero: !!isHero,
      frames: [],
      count: 0,
      current: 0,   // lerped position
      target: 0,    // scroll-driven target
      lastDrawn: -1,
      loadedMax: -1, // highest contiguous loaded frame index
      ready: false,
      onScreen: true, // visibility gate — offscreen films don't draw
    };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        seq.onScreen = es[0].isIntersecting;
      }, { rootMargin: "20% 0px" }).observe(canvas);
    }
    seq.drawImg = function (img) {
      if (!img || !img.complete || !img.naturalWidth) return false;
      var cw = canvas.width, ch = canvas.height;
      var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      seq.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      return true;
    };
    seq.size = function () {
      // phones don't need a 2× backing store for a full-bleed film — cap the
      // device-pixel-ratio to 1 on small screens so the canvas costs a quarter
      // of the GPU memory and each drawImage is far cheaper (smoother scrub).
      // the hero earns retina; the background films run at 1.5× — half the
      // pixels pushed per drawImage, and nobody can tell behind a scrim
      var maxDpr = window.matchMedia("(max-width: 768px)").matches ? 1 : (seq.isHero ? 2 : 1.5);
      var dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      seq.lastDrawn = -1; // force redraw
      // a resize clears the canvas — keep the poster up until the film runs
      if (!seq.ready && seq.poster) seq.drawImg(seq.poster);
    };
    seq.draw = function (i) {
      // on the half-density mobile diet some frames are deliberately absent —
      // step down to the nearest one that exists so the film never blinks
      var j = i;
      while (j > 0 && !seq.frames[j]) j--;
      if (seq.drawImg(seq.frames[j])) seq.lastDrawn = i;
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
    hero: createSequence("orbitCanvas", "heroFallback", true),
    pillarsbg: createSequence("pillarsCanvas", "pillarsVideo"),
    keynote: createSequence("loadoutCanvas", null),
    vauntlive: createSequence("cmdCanvas5", null),
    vaunt: createSequence("cmdCanvas4", null),
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

  // butter loop: every tick, lerp each sequence toward its scroll target.
  // The film must feel HELD by the scroll, not chasing it — touch tracks
  // tighter than mouse because a finger expects 1:1.
  var FILM_LERP = ("ontouchstart" in window || navigator.maxTouchPoints > 0) ? 0.42 : 0.3;
  gsap.ticker.add(function () {
    Object.keys(sequences).forEach(function (k) {
      var s = sequences[k];
      if (!s || !s.ready || !s.onScreen) return;
      s.current += (s.target - s.current) * FILM_LERP;
      var i = Math.round(s.current);
      i = Math.max(0, Math.min(s.count - 1, i));
      // never scrub past what's decoded — hold the nearest loaded frame
      i = Math.min(i, s.loadedMax);
      if (i >= 0 && i !== s.lastDrawn) s.draw(i);
    });
  });

  // THE MOBILE DIET: small screens stream every 2nd frame. The scrub's lerp
  // smooths a 10fps step exactly like a 20fps one, the draw() fallback holds
  // the nearest loaded frame, and the phone downloads half the film.
  var FRAME_STEP = window.matchMedia("(max-width: 768px)").matches ? 2 : 1;

  function loadSequence(seq, name, count, onProgress) {
    seq.count = count;
    return new Promise(function (resolve) {
      var loaded = 0;
      var flags = new Array(count);
      var wanted = 0;
      for (var w = 1; w <= count; w++) if ((w - 1) % FRAME_STEP === 0 || w === count) wanted++;
      for (var i = 1; i <= count; i++) {
        (function (i) {
          // skipped frames count as arrived instantly — the gate math holds
          if ((i - 1) % FRAME_STEP !== 0 && i !== count) {
            flags[i - 1] = true;
            while (seq.loadedMax + 1 < count && flags[seq.loadedMax + 1]) seq.loadedMax++;
            return;
          }
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
            if (onProgress) onProgress(loaded / wanted);
            if (loaded === wanted) resolve();
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
      // Open on a LEAD BATCH, not the whole orbit. The hero section is 520vh
      // tall, so the viewer physically cannot scrub past the first frames
      // instantly — by the time they scroll down, the rest of the orbit has
      // streamed in behind them. loadSequence keeps loading all frames; the
      // ticker's loadedMax clamp holds the newest decoded frame until each one
      // arrives, so the scrub never shows black. This drops the blocking load
      // from ~161 frames (~7.4 MB) to ~48 (~1.4 MB) without a half-loaded feel.
      var full = m.hero.count;
      var heroGate = Math.min(48, full);
      var opened = false;
      loadSequence(sequences.hero, "hero", full, function () {
        var ready = sequences.hero.loadedMax + 1; // contiguous frames from 0
        var gp = Math.min(1, ready / heroGate);
        var pct = gp * 100;
        if (pct > shown.v) { shown.v = pct * 0.99; setCount(shown.v); }
        if (!opened && ready >= heroGate) { opened = true; openSite(); }
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
            // the diet: films load when the section is under two screens away,
            // not five — posters cover the gap
            trigger: sel, start: "top 175%", once: true,
            onEnter: function () { loadGroup(specs); },
          });
        }
        if (document.getElementById("loadout"))
          loadNear("#loadout", [["keynote", m.studio360 ? "studio360" : "keynote"]]);
        loadNear("#pillars", [
          ["pillarsbg", "nightscroll"],
        ]);
        loadNear("#work", [
          ["vauntlive", "vauntlive"], ["vaunt", "vaunt"],
        ]);
        ScrollTrigger.refresh();
      }
    })
    .catch(function () {
      // no frames committed — fall back to raw videos everywhere
      Object.keys(sequences).forEach(function (k) { if (sequences[k]) sequences[k].fallback(); });
      finishPreloader();
    });

  /* ---------------- hero scrub ---------------- */
  var hudDeg = document.getElementById("hudDeg");
  var heroOffer = document.getElementById("heroOffer");
  var parHero = parCanvas("hero");

  ScrollTrigger.create({
    trigger: "#hero",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: function (st) {
      var p = st.progress;
      sequences.hero.target = p * (sequences.hero.count - 1 || 0);
      // the orbit is a full 360 — once the camera comes all the way around,
      // the degree readout locks on 360° and flashes, and the offer pops up.
      var done = p >= 0.94;
      hudDeg.textContent = (done ? "360" : String(Math.round(p * 360)).padStart(3, "0")) + "°";
      hudDeg.classList.toggle("is-360", done);
      if (heroOffer) heroOffer.classList.toggle("is-shown", done);
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

  /* ---------------- the loadout: 360 studio pan, three corners ----------------
     (lives on its own page when absent from this one — guard and move on) */
  (function () {
    if (!document.getElementById("loadout")) return;
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

    // the M-network snaps: stop scrolling and the pan swings all the way to the
    // nearest corner — photo, then recording, then broadcast. Scoped to this
    // section only, and eased through Lenis so it doesn't fight the smooth scroll.
    var LO_SNAP = [1 / 6, 0.5, 5 / 6]; // the centre of each corner's band
    var snapTimer = null, snapping = false;
    function scheduleSnap(st) {
      if (snapping) return;
      clearTimeout(snapTimer);
      snapTimer = setTimeout(function () {
        if (!st.isActive || snapping) return;
        var p = st.progress;
        var target = LO_SNAP.reduce(function (a, c) { return Math.abs(c - p) < Math.abs(a - p) ? c : a; });
        if (Math.abs(target - p) < 0.012) return; // already parked on a corner
        var y = st.start + target * (st.end - st.start);
        snapping = true;
        lenis.scrollTo(y, { duration: 0.55, easing: function (t) { return 1 - Math.pow(1 - t, 3); } });
        setTimeout(function () { snapping = false; }, 650);
      }, 150);
    }

    ScrollTrigger.create({
      trigger: "#loadout",
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: function (st) {
        applyLoadout(st.progress);
        if (st.isActive) scheduleSnap(st);
        else { PAR.set(parLoCanvas, 0); PAR.set(parLoPanels, 0); }
      },
      onToggle: function (st) {
        if (!st.isActive) { clearTimeout(snapTimer); snapping = false; PAR.set(parLoCanvas, 0); PAR.set(parLoPanels, 0); }
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

  /* ---------------- Antisocial explainer: one scroll-locked film (night
     descent into the house) behind the pinned copy ---------------- */
  var pillarsBg = sequences.pillarsbg;
  if (pillarsBg) {
    pillarsBg.canvas.style.opacity = 1;
    var parPillars = parCanvas("pillarsbg");
    var parPanelsPB = PAR.attach(document.querySelector("#pillars .command__panels"), { depth: -7 });
    ScrollTrigger.create({
      trigger: "#pillars",
      start: "top top",
      end: "+=140%",
      scrub: true,
      pin: "#pillars .command__sticky",
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (st) {
        pillarsBg.target = st.progress * (pillarsBg.count - 1 || 0);
        var ps = st.isActive ? PAR.ramp(st.progress) : 0;
        PAR.set(parPillars, ps);
        PAR.set(parPanelsPB, ps);
      },
      onToggle: function (st) {
        if (!st.isActive) { PAR.set(parPillars, 0); PAR.set(parPanelsPB, 0); }
      },
    });
  }

  // the fact/observation bullets hold their slide-in until the frame is actually on screen
  var antiDuo = document.querySelector(".antiabout__duo");
  if (antiDuo && "IntersectionObserver" in window) {
    var duoIO = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { antiDuo.classList.add("is-in"); duoIO.disconnect(); }
    }, { threshold: 0.35 });
    duoIO.observe(antiDuo);
  } else if (antiDuo) {
    antiDuo.classList.add("is-in");
  }

  /* ---------------- IN COMMAND mini scroll: three scenes, ~equal scroll bands,
     each scrubbed within its band and crossfaded at the boundaries ---------------- */
  // Scenes may share one sequence across consecutive bands (f0..f1 are the
  // fraction of the film each band scrubs) so a two-part project plays as
  // one continuous film with no repeated footage.
  var cmdScenes = [
    { seq: "vauntlive", f0: 0, f1: 1, speed: 1 },    // runway performance up to the sky...
    { seq: "vaunt", f0: 0, f1: 1, speed: 1.75 },     // ...into the cabin fly-through
  ];
  // two scenes, ONE project: Vaunt (the brand collab)
  var cmdProjects = [1, 1];
  var cmdProjectCount = 1;
  // the full record carries both flight legs — the runway liftoff and the
  // fly-through landing; the acoustic plays only inside the 360 look-around
  var cmdSceneTracks = ["vauntfull", "vauntfull"];
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
          'Now playing: "' + pay.title + '" · listen';
      }
    }
  }
  applyCommand(0);

  /* ---- the 360 band: between the runway performance and the fly-through,
         the real inside-the-jet film takes over. Drag in any direction to
         look around; scroll is trapped here so the film can't be skimmed
         past by accident — Skip is the one deliberate way out. ---- */
  var lockedY = 0;
  function holdScroll() { if (window.scrollY !== lockedY) window.scrollTo(0, lockedY); }
  function lockPageScroll(lock) {
    document.documentElement.classList.toggle("vr-locked", lock);
    if (lock) {
      // a hard flick outruns overflow:hidden — pin the position itself and
      // snap back on every native scroll event until Land releases it
      lockedY = window.scrollY;
      lenis.stop();
      window.addEventListener("scroll", holdScroll, { passive: true });
    } else {
      window.removeEventListener("scroll", holdScroll);
      lenis.start();
    }
  }
  var workVR = {
    el: document.getElementById("workVR"),
    viewer: null, live: false, landing: false, band: [0.40, 0.50],
  };
  function workVRSet(p) {
    if (!workVR.el || !window.VR360) return;
    // once the band is live, a flung scroll can't unlock it by momentarily
    // escaping the band — the snap-back brings it home, and Land is the exit
    var inBand = p >= workVR.band[0] && p <= workVR.band[1];
    var on = !workVR.landing && (inBand || workVR.live);
    // mount well before the band so the poster is up and the film is
    // buffered by the time the look-around takes the screen
    if (!workVR.viewer && p >= 0.12) {
      workVR.viewer = VR360.mount(document.getElementById("workVRCanvas"), {
        src: "assets/video/vaunt-360.mp4", video: true, autoplay: false,
        poster: "assets/img/vaunt-360-poster.jpg",
        // open facing McCluster in his seat (measured off the equirect frame)
        yaw: -140, pitch: -32, touchAction: "none",
        spots: [
          // pinned on the flight console between the pilots, and on the DSLR
          // standing in the aisle — both measured off the equirect frame
          { yaw: -77, pitch: -13, label: "The cockpit · fly with Vaunt", href: "https://vauntapi.flyvaunt.com/referral/nuao1K", blank: true },
          { yaw: 111, pitch: -32, label: "The camera · book photography", href: "book-photo.html" },
          { yaw: 131, pitch: -29, label: "The bag · get back to it", href: "offer.html" },
          { yaw: -140, pitch: -40, label: "McCluster · the artist", href: "profile-mccluster.html" },
          { yaw: 71, pitch: -56, label: "Zakir · the six-string", href: "profile-zakir.html" },
        ],
      });
      window.__MCC_VR = workVR; // debug/verification handle
      var compass = document.getElementById("workVRCompass");
      document.getElementById("workVRCanvas").addEventListener("pointerdown", function () {
        compass.classList.add("is-gone");
        showNPBeacon(); // dragging in silence: the beacon points at the sound
      });
      document.getElementById("workVRGyro").addEventListener("click", function () {
        workVR.viewer.enableGyro();
        this.classList.add("is-on");
        this.querySelector("span").textContent = "Motion on";
        var pointer = document.querySelector(".workvr__pointer");
        if (pointer) pointer.style.display = "none"; // the arrow's job is done
        askForSound(); // this flight has a soundtrack — offer it if it's off
        if (window.MCC_TRACK) window.MCC_TRACK("vr_gyro_on", { page: "home" });
      });
      if (window.MCC_TRACK) window.MCC_TRACK("vr_inline_view", { page: "home" });
    }
    if (on !== workVR.live) {
      workVR.live = on;
      workVR.el.classList.toggle("is-live", on);
      if (workVR.viewer) { on ? workVR.viewer.play() : workVR.viewer.pause(); }
      lockPageScroll(on);
      // inside the 360 the acoustic takes the cabin; either side of it,
      // the full record flies
      if (commandInView && commandAudioHook) {
        commandAudioHook(on ? "vaunt" : cmdSceneTracks[lastCmdActive]);
      }
    }
  }

  var workSlow = document.getElementById("workSlowHint");
  var workFly = document.getElementById("workFlyPill");
  var workST = ScrollTrigger.create({
    trigger: "#work",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: function (st) {
      applyCommand(st.progress);
      workVRSet(st.progress);
      // the last card opens on the ask for a slow hand (right where Land sets
      // you down) — but NEVER inside the cabin: a flung scroll or a toolbar
      // resize can push progress past the band while the 360 still holds the
      // lock, and the scroll-slow homie would float into the jet with you
      // brief by design: the slow-hand ask flashes past touchdown, then clears
      var pastBand = st.progress > 0.503 && st.progress < 0.64 && !workVR.live;
      if (workSlow) workSlow.classList.toggle("is-shown", pastBand);
      if (workFly) workFly.classList.toggle("is-shown", pastBand);
      if (!st.isActive) {
        Object.keys(parCmdCanvases).forEach(function (k) { PAR.set(parCmdCanvases[k], 0); });
        PAR.set(parCmdPanels, 0);
      }
    },
    onToggle: function (st) {
      if (!st.isActive) {
        Object.keys(parCmdCanvases).forEach(function (k) { PAR.set(parCmdCanvases[k], 0); });
        PAR.set(parCmdPanels, 0);
        // safety net — but not while the band holds the lock: a flung scroll
        // deactivates the trigger for one frame before the snap-back lands
        if (!workVR.live) lockPageScroll(false);
      }
    },
  });

  // one true exit that always works — the brand mark (and the Back-to-top
  // button inside the band) releases any lock and flies home
  function releaseAndGoTop() {
    workVR.landing = true;
    workVR.live = false;
    if (workVR.el) workVR.el.classList.remove("is-live");
    if (workVR.viewer) workVR.viewer.pause();
    lockPageScroll(false);
    lenis.scrollTo(0, { duration: 1.2 });
    setTimeout(function () { workVR.landing = false; }, 1600);
  }
  var brandHome = document.querySelector(".site-head .brand");
  if (brandHome) brandHome.addEventListener("click", function (e) {
    e.preventDefault();
    releaseAndGoTop();
    if (window.MCC_TRACK) window.MCC_TRACK("brand_home", { page: "home" });
  });
  var workTop = document.getElementById("workVRTop");
  if (workTop) workTop.addEventListener("click", function () {
    releaseAndGoTop();
    if (window.MCC_TRACK) window.MCC_TRACK("vr_back_to_top", { page: "home" });
  });

  // Land: the only way out while scroll is locked. Touches down right at the
  // start of the fly-through film — the jet in open air — then hands the
  // scroll back to the user; no auto-ride to the end of the section.
  var workSkip = document.getElementById("workVRSkip");
  if (workSkip) workSkip.addEventListener("click", function () {
    workVR.landing = true;
    workVR.live = false;
    if (workVR.el) workVR.el.classList.remove("is-live");
    if (workVR.viewer) workVR.viewer.pause();
    lockPageScroll(false);
    var y = workST.start + (workST.end - workST.start) * (workVR.band[1] + 0.005);
    lenis.scrollTo(y, {
      duration: 0.9,
      onComplete: function () { workVR.landing = false; },
    });
    // if the glide is interrupted before onComplete, re-arm the band anyway
    setTimeout(function () { workVR.landing = false; }, 1400);
    if (window.MCC_TRACK) window.MCC_TRACK("vr_skip", { page: "home" });
  });

  /* ---- the sound beacon: someone is dragging the 360 with the sound off.
         An orange beacon rises from the Now Playing tab — rings, an arrow,
         and TURN ON SOUND! — one tap lights the music. Shows once. ---- */
  var npBeacon = null, npBeaconShown = false;
  function killNPBeacon() {
    if (npBeacon && npBeacon.parentNode) npBeacon.parentNode.removeChild(npBeacon);
    npBeacon = null;
    var npTab = document.getElementById("appbarNP");
    if (npTab) npTab.classList.remove("is-beacon");
  }
  function showNPBeacon() {
    var tgl = document.getElementById("soundToggle");
    if (npBeaconShown || !tgl || tgl.classList.contains("is-on")) return;
    npBeaconShown = true;
    npBeacon = document.createElement("div");
    npBeacon.className = "npbeak";
    npBeacon.setAttribute("role", "button");
    npBeacon.setAttribute("aria-label", "Turn on sound");
    npBeacon.innerHTML =
      '<span class="npbeak__ring"></span><span class="npbeak__ring"></span><span class="npbeak__ring"></span>' +
      '<span class="npbeak__words">Turn on sound!</span>' +
      '<svg class="npbeak__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v13"/><path d="M6 12l6 6 6-6"/></svg>';
    npBeacon.addEventListener("click", function () {
      if (window.MCC_NP_PLAY) window.MCC_NP_PLAY();
      killNPBeacon();
      if (window.MCC_TRACK) window.MCC_TRACK("sound_beacon_tap", { page: "home" });
    });
    document.body.appendChild(npBeacon);
    var npTab = document.getElementById("appbarNP");
    if (npTab) npTab.classList.add("is-beacon"); // the level icon glows with the beacon
    if (window.MCC_TRACK) window.MCC_TRACK("sound_beacon", { page: "home" });
    setTimeout(killNPBeacon, 12000);
  }
  // the moment sound comes on from anywhere, the beacon's job is done
  window.addEventListener("mcc:nowplaying", function (e) {
    if (e.detail && e.detail.playing) killNPBeacon();
  });

  /* ---- the sound ask: Motion tapped while the site is silent. One huge
         prompt, one arrow up to the SOUND pill, one tap anywhere to fix it. ---- */
  var soundAsk = document.getElementById("soundAsk");
  var soundAskNo = document.getElementById("soundAskNo");
  var soundAskDeclined = false; // "keep it silent" is respected for the visit
  function askForSound() {
    var tgl = document.getElementById("soundToggle");
    if (!soundAsk || !tgl || soundAskDeclined || tgl.classList.contains("is-on")) return;
    soundAsk.hidden = false;
    tgl.classList.add("is-asked");
    if (window.MCC_TRACK) window.MCC_TRACK("sound_prompt", { from: "vr-motion", page: "home" });
  }
  function closeSoundAsk() {
    if (!soundAsk) return;
    soundAsk.hidden = true;
    var tgl = document.getElementById("soundToggle");
    if (tgl) tgl.classList.remove("is-asked");
  }
  if (soundAsk) {
    soundAsk.addEventListener("click", function (e) {
      if (e.target === soundAskNo) return;
      closeSoundAsk();
      var tgl = document.getElementById("soundToggle");
      if (tgl && !tgl.classList.contains("is-on")) tgl.click();
    });
    if (soundAskNo) soundAskNo.addEventListener("click", function (e) {
      e.stopPropagation();
      soundAskDeclined = true;
      closeSoundAsk();
      if (window.MCC_TRACK) window.MCC_TRACK("sound_prompt_dismiss", { page: "home" });
    });
    var soundTgl = document.getElementById("soundToggle");
    if (soundTgl) soundTgl.addEventListener("click", closeSoundAsk);
  }

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
    var floatPause = document.getElementById("floatPause");
    var tracks = {
      "runway": document.getElementById("track-runway"),
      "antisocial": document.getElementById("track-antisocial"),
      "whodidtheshoot": document.getElementById("track-whodidtheshoot"),
      "environmental-injustice": document.getElementById("track-environmental-injustice"),
      "vaunt": document.getElementById("track-vaunt"),
      "vauntfull": document.getElementById("track-vauntfull"),
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
      // if a variant isn't in the manifest (yet), fall back to the main cut
      if (!avail[name] && name === "vauntfull") name = "vaunt";
      var previous = currentTrack;
      if (soundOn && name !== currentTrack) {
        var prev = tracks[currentTrack];
        if (prev && !prev.paused) track("song_stop", { song: currentTrack, page: "home", at_seconds: Math.round(prev.currentTime) });
        if (avail[name]) track("song_start", { song: name, page: "home" });
      }
      currentTrack = name;
      announceNP();
      if (!soundOn) return;
      Object.keys(tracks).forEach(function (k) {
        var a = tracks[k];
        if (!a) return;
        if (k === name && avail[k]) {
          // the target: unmute, play, fade up
          a.muted = false;
          var pr = a.play();
          if (pr && pr.then) pr.then(function () { unlocked[k] = true; }).catch(function () {});
          gsap.to(a, { volume: 0.85, duration: 1.2, ease: "power1.out", overwrite: "auto" });
        } else if (k === previous && k !== name) {
          // only the track we're leaving gets a smooth crossfade out
          gsap.to(a, {
            volume: 0, duration: 0.9, ease: "power1.out", overwrite: "auto",
            onComplete: function () { a.pause(); a.muted = true; },
          });
        } else {
          // every other track is silenced HARD and immediately — no tween to
          // outrun, no lingering playback. This is what stops a distant track
          // (e.g. Dealer Plates) bleeding into the current section on a fast scroll.
          gsap.killTweensOf(a);
          a.pause();
          a.muted = true;
          a.volume = 0;
        }
      });
    }

    commandAudioHook = fadeTo;

    // the Now Playing tab mirrors the section's track; a tap starts the sound
    function announceNP() {
      var pay = window.PAYMENTS && window.PAYMENTS[currentTrack] || {};
      window.dispatchEvent(new CustomEvent("mcc:nowplaying", {
        detail: {
          title: pay.title || "The soundtrack",
          href: pay.page || "#np",
          playing: soundOn,
        },
      }));
    }
    window.MCC_NP_PLAY = function () { setSound(true); };
    window.MCC_NP_PAUSE = function () { setSound(false); };
    announceNP(); // the tab knows the opener before the first note

    zones.forEach(function (z) {
      if (!document.querySelector(z.sel)) return;
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
      announceNP();
      toggle.classList.toggle("is-on", soundOn);
      toggle.setAttribute("aria-pressed", String(soundOn));
      // the floating pause only shows while music is actually playing
      if (floatPause) floatPause.hidden = !soundOn;
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
        // non-current unlock elements are both muted AND volume-0 so the burst
        // that primes them for iOS can never be heard; the target unmutes below
        if (!isCurrent) { a.muted = true; a.volume = 0; }
        else a.muted = false;
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
    toggle.addEventListener("click", function () {
      toggle.classList.add("was-used"); // the come-tap-me beacon retires
      setSound(!soundOn);
    });
    // the floating pause stops the music wherever the visitor is on the page
    if (floatPause) {
      floatPause.addEventListener("click", function () {
        track("float_pause", { page: "home" });
        setSound(false);
      });
      // flash + spin the button on every scroll, so it stays impossible to miss
      var spinTimer = null;
      function spinOnScroll() {
        if (floatPause.hidden) return;
        floatPause.classList.add("float-pause--spin");
        clearTimeout(spinTimer);
        spinTimer = setTimeout(function () { floatPause.classList.remove("float-pause--spin"); }, 400);
      }
      lenis.on("scroll", spinOnScroll);
      window.addEventListener("scroll", spinOnScroll, { passive: true });
    }

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
      if (!document.querySelector(sel)) return;
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
        btn.addEventListener("click", function () {
          if (window.MCC_TRACK) window.MCC_TRACK("cta_click", { label: id === "subscribeBtn" ? "subscribe-home" : "book-call-home", page: "home" });
        });
      } else if (id === "bookCallBtn") {
        // no calendar yet: a working booking email beats a dead button
        btn.href = "mailto:matthew@mccluster.org?subject=" +
          encodeURIComponent("Book a Paid Call — McCluster") +
          "&body=" + encodeURIComponent("I'd like to book a paid discovery call. Here's what I'm looking to do:\n\n");
        btn.addEventListener("click", function () {
          if (window.MCC_TRACK) window.MCC_TRACK("cta_click", { label: "book-call-home", page: "home" });
        });
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
