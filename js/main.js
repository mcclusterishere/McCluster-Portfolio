/* ============================================================
   McCluster — scroll engine
   Lenis smooth scroll + GSAP ScrollTrigger + canvas orbit scrub
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

  /* ---------------- orbit frame sequence ---------------- */
  var canvas = document.getElementById("orbitCanvas");
  var ctx = canvas.getContext("2d");
  var frames = [];        // HTMLImageElement[]
  var frameCount = 0;
  var current = 0;        // lerped position
  var target = 0;         // scroll-driven target
  var lastDrawn = -1;
  var seqReady = false;

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    lastDrawn = -1; // force redraw
  }
  window.addEventListener("resize", sizeCanvas);

  function drawFrame(i) {
    var img = frames[i];
    if (!img || !img.complete || !img.naturalWidth) return;
    var cw = canvas.width, ch = canvas.height;
    var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    var w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    lastDrawn = i;
  }

  // butter loop: lerp toward the scroll target every tick
  gsap.ticker.add(function () {
    if (!seqReady) return;
    current += (target - current) * 0.14;
    var i = Math.max(0, Math.min(frameCount - 1, Math.round(current)));
    if (i !== lastDrawn) drawFrame(i);
  });

  /* ---------------- preloader ---------------- */
  var preloader = document.getElementById("preloader");
  var preCount = document.getElementById("preCount");
  var shown = { v: 0 };

  function setCount(v) {
    preCount.textContent = String(Math.round(v)).padStart(3, "0");
  }

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

  function loadSequence() {
    return fetch("assets/frames/manifest.json")
      .then(function (r) { if (!r.ok) throw new Error("no manifest"); return r.json(); })
      .then(function (m) {
        frameCount = m.count;
        var loaded = 0;
        return new Promise(function (resolve) {
          function pad(n) { return String(n).padStart(4, "0"); }
          for (var i = 1; i <= frameCount; i++) {
            (function (i) {
              var img = new Image();
              img.src = "assets/frames/hero_" + pad(i) + ".jpg";
              img.onload = img.onerror = function () {
                loaded++;
                var pct = (loaded / frameCount) * 100;
                if (pct > shown.v) { shown.v = pct * 0.99; setCount(shown.v); }
                if (loaded === frameCount) resolve();
              };
              frames[i - 1] = img;
            })(i);
          }
        });
      });
  }

  sizeCanvas();
  loadSequence()
    .then(function () {
      seqReady = true;
      drawFrame(0);
      finishPreloader();
    })
    .catch(function () {
      // frames not committed yet — fall back to the raw video if present
      var fb = document.getElementById("heroFallback");
      fb.classList.add("is-active");
      fb.play().catch(function () {});
      canvas.style.display = "none";
      finishPreloader();
    });

  /* ---------------- hero scrub ---------------- */
  var hudDeg = document.getElementById("hudDeg");

  ScrollTrigger.create({
    trigger: "#hero",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: function (st) {
      var p = st.progress;
      target = p * (frameCount - 1 || 0);
      hudDeg.textContent = String(Math.round(p * 360)).padStart(3, "0") + "°";
    },
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

  /* ---------------- scroll progress bar ---------------- */
  gsap.to("#scrollProgressBar", {
    scaleX: 1,
    ease: "none",
    scrollTrigger: { trigger: document.body, start: "top top", end: "max", scrub: 0.3 },
  });

  /* ---------------- marquee (velocity-reactive) ---------------- */
  var track = document.getElementById("marqueeTrack");
  // duplicate content for a seamless loop
  track.innerHTML += track.innerHTML + track.innerHTML;
  var mx = 0;
  gsap.ticker.add(function () {
    var vel = prefersReduced ? 0 : lenis.velocity || 0;
    mx -= 0.6 + Math.min(Math.abs(vel) * 0.05, 3);
    var w = track.scrollWidth / 3;
    if (-mx >= w) mx += w;
    track.style.transform = "translateX(" + mx + "px)";
  });

  /* ---------------- stats count-up ---------------- */
  document.querySelectorAll(".stat__num").forEach(function (el, idx) {
    var end = parseInt(el.getAttribute("data-count"), 10);
    var obj = { v: 0 };
    gsap.to(obj, {
      v: end, duration: 1.4, ease: "power2.out", delay: idx * 0.18,
      scrollTrigger: { trigger: el, start: "top 85%" },
      onUpdate: function () { el.textContent = String(Math.round(obj.v)).padStart(2, "0"); },
    });
  });
  (function () {
    var big = document.querySelector(".stat__bignum");
    var obj = { v: 0 };
    gsap.to(obj, {
      v: parseInt(big.getAttribute("data-count"), 10),
      duration: 1.6, ease: "power2.out",
      scrollTrigger: { trigger: big, start: "top 90%" },
      onUpdate: function () { big.textContent = String(Math.round(obj.v)); },
    });
  })();

  gsap.utils.toArray(".stat").forEach(function (el, i) {
    gsap.from(el, {
      y: 60, opacity: 0, duration: 0.9, ease: "power3.out", delay: i * 0.12,
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });

  /* ---------------- pillars: reveal one at a time ---------------- */
  var pillars = gsap.utils.toArray(".pillar");
  ScrollTrigger.create({
    trigger: "#pillars",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: function (st) {
      var seg = Math.min(2, Math.floor(st.progress * 3));
      pillars.forEach(function (p, i) {
        p.classList.toggle("is-active", i <= seg);
      });
    },
  });
  gsap.from(".pillars__head", {
    x: -80, opacity: 0, duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: "#pillars", start: "top 60%" },
  });

  /* ---------------- work cards ---------------- */
  gsap.utils.toArray(".card").forEach(function (card, i) {
    gsap.from(card, {
      y: 90, opacity: 0, duration: 1, ease: "power3.out", delay: i * 0.1,
      scrollTrigger: { trigger: card, start: "top 92%" },
    });
    if (prefersReduced) return;
    card.addEventListener("mousemove", function (e) {
      var r = card.getBoundingClientRect();
      var rx = ((e.clientY - r.top) / r.height - 0.5) * -6;
      var ry = ((e.clientX - r.left) / r.width - 0.5) * 8;
      card.style.transform =
        "perspective(800px) rotateX(" + rx + "deg) rotateY(" + ry + "deg) translateY(-10px)";
    });
    card.addEventListener("mouseleave", function () {
      card.style.transform = "";
    });
  });
  gsap.from(".work__head", {
    y: 70, opacity: 0, duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: "#work", start: "top 70%" },
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

  /* ---------------- bg videos: play only when on screen ---------------- */
  document.querySelectorAll(".bg-video").forEach(function (v) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) v.play().catch(function () {});
        else v.pause();
      });
    }, { threshold: 0.05 }).observe(v);
  });

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
