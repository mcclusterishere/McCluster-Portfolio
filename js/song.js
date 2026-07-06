/* ============================================================
   Song page engine — scroll-scrubbed lyric pages.
   Each .songblock pins a scene (an existing frame sequence) and
   reveals its bars as you scroll. Reads window.SONG:
   { key, audio, blocks: [{ seq }] } — lyric lines live in the HTML.
   ============================================================ */

(function () {
  "use strict";

  gsap.registerPlugin(ScrollTrigger);

  var PAR = window.MCC_PARALLAX;

  var lenis = new Lenis({ duration: 1.1, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);

  function pad4(n) { return String(n).padStart(4, "0"); }

  /* ---------- page loader: percentage + a genre animation per label ---------- */
  var pre = (function () {
    var map = {
      "environmental-injustice": { logo: "assets/img/equity-uprise-logo.webp", cls: "spre--uprise" },
      "vaunt": { logo: "assets/img/vaunt-logo.jpeg", cls: "spre--vaunt" },
      "dealerplates": { logo: "assets/img/we-logo.webp", cls: "spre--we" },
      "antisocial": { logo: "assets/img/m-mark.png", cls: "spre--antisocial" },
      "whodidtheshoot": { logo: "assets/img/m-mark.png", cls: "spre--wdts" },
      "gotwifi": { logo: "assets/img/m-mark.png", cls: "spre--wifi" },
    };
    var meta = map[window.SONG.key] || { logo: "assets/img/m-mark.png", cls: "spre--wdts" };
    var el = document.createElement("div");
    el.className = "songpre " + meta.cls;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<div class="songpre__inner">' +
      '<div class="songpre__chip"><img class="songpre__logo" src="' + meta.logo + '" alt=""></div>' +
      '<div class="songpre__count"><span class="songpre__num">000</span><span class="songpre__pct">%</span></div>' +
      "</div>";
    document.body.appendChild(el);
    var numEl = el.querySelector(".songpre__num");
    var shown = 0, target = 0, done = false, finished = false;
    var tick = setInterval(function () {
      shown += (target - shown) * 0.18;
      numEl.textContent = String(Math.round(shown)).padStart(3, "0");
      if (done && shown > 99) {
        clearInterval(tick);
        finished = true;
        numEl.textContent = "100";
        el.classList.add("is-done");
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
      }
    }, 50);
    // never trap the page: force-finish if loading stalls
    setTimeout(function () { if (!finished) { target = 100; done = true; } }, 15000);
    return {
      set: function (p) { target = Math.max(target, Math.min(99, p * 100)); },
      finish: function () { target = 100; done = true; },
    };
  })();

  /* ---------- sequences on each block ---------- */
  var seqs = [];
  function makeSeq(canvas, name) {
    var s = {
      canvas: canvas, ctx: canvas.getContext("2d"), name: name,
      frames: [], count: 0, current: 0, target: 0, lastDrawn: -1, loadedMax: -1, ready: false,
    };
    s.drawImg = function (img) {
      if (!img || !img.complete || !img.naturalWidth) return false;
      var cw = canvas.width, ch = canvas.height;
      var sc = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      s.ctx.drawImage(img, (cw - img.naturalWidth * sc) / 2, (ch - img.naturalHeight * sc) / 2,
        img.naturalWidth * sc, img.naturalHeight * sc);
      return true;
    };
    s.size = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      s.lastDrawn = -1;
      // a resize clears the canvas — keep the poster up until the film runs
      if (!s.ready && s.poster) s.drawImg(s.poster);
    };
    s.draw = function (i) {
      if (s.drawImg(s.frames[i])) s.lastDrawn = i;
    };
    window.addEventListener("resize", s.size);
    s.size();
    seqs.push(s);
    return s;
  }

  gsap.ticker.add(function () {
    seqs.forEach(function (s) {
      if (!s.ready) return;
      s.current += (s.target - s.current) * 0.2;
      var i = Math.min(Math.min(s.count - 1, Math.round(s.current)), s.loadedMax);
      if (i >= 0 && i !== s.lastDrawn) s.draw(i);
    });
  });

  function loadSeq(s, count, onProgress) {
    s.count = count;
    var flags = new Array(count);
    var loaded = 0;
    for (var i = 1; i <= count; i++) {
      (function (i) {
        var img = new Image();
        img.src = "assets/frames/" + s.name + "_" + pad4(i) + ".jpg";
        img.onload = img.onerror = function () {
          flags[i - 1] = true;
          loaded++;
          if (onProgress) onProgress(loaded / count);
          while (s.loadedMax + 1 < count && flags[s.loadedMax + 1]) s.loadedMax++;
          if (!s.ready && s.loadedMax >= 0) { s.ready = true; s.draw(0); }
        };
        s.frames[i - 1] = img;
      })(i);
    }
  }

  fetch("assets/frames/manifest.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (m) {
      var gated = false; // the page opener gates the loader
      document.querySelectorAll(".songblock").forEach(function (block, bi) {
        var name = block.getAttribute("data-seq");
        if (!name) return;
        var canvas = block.querySelector("canvas");
        if (!m[name]) { canvas.style.display = "none"; return; }
        var s = makeSeq(canvas, name);
        if (!gated) {
          // the opening film loads fully and drives the loader — rolled
          // back to the pre-perf-pass behavior (2026-07-06)
          gated = true;
          loadSeq(s, m[name].count, function () {
            var gp = Math.min(1, (s.loadedMax + 1) / m[name].count);
            pre.set(gp);
            if (gp >= 1) pre.finish();
          });
        } else {
          // every other film waits until the scroll gets near its block,
          // so opening the page never downloads the whole song — but its
          // opening frame shows immediately, so no canvas is ever black
          var pimg = new Image();
          pimg.src = "assets/frames/" + name + "_0001.jpg";
          pimg.onload = function () {
            if (!s.ready) { s.poster = pimg; s.drawImg(pimg); }
          };
          ScrollTrigger.create({
            trigger: block, start: "top 400%", once: true,
            onEnter: function () { if (!s.count) loadSeq(s, m[name].count); },
          });
        }
        var speed = parseFloat(block.getAttribute("data-speed")) || 1;
        var parC = PAR.attach(canvas, { depth: 15, tilt: 2.4, push: 0.06 });
        var parL = PAR.attach(block.querySelector(".songblock__lyrics"), { depth: -7 });
        ScrollTrigger.create({
          trigger: block,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          onUpdate: function (st) {
            var q = Math.min(1, st.progress * speed);
            s.target = q * (s.count - 1 || 0);
            // once the film runs out, the held frame starts tracking the cursor
            var ps = st.isActive ? PAR.ramp(q) : 0;
            PAR.set(parC, ps);
            PAR.set(parL, ps);
          },
        });
      });
      if (!gated) pre.finish(); // stub pages with no films
      ScrollTrigger.refresh();
    })
    .catch(function () { pre.finish(); });

  /* ---------- still-image blocks: scroll-driven drift ---------- */
  document.querySelectorAll(".songblock[data-img]").forEach(function (block) {
    var img = block.querySelector(".songblock__img");
    // no push here: the drift tween owns the image's scale
    var parC = PAR.attach(img, { depth: 12, tilt: 2 });
    var parL = PAR.attach(block.querySelector(".songblock__lyrics"), { depth: -7 });
    gsap.fromTo(img, { scale: 1.18, yPercent: -4 }, {
      scale: 1.02, yPercent: 4, ease: "none",
      scrollTrigger: {
        trigger: block, start: "top top", end: "bottom bottom", scrub: 0.4,
        onUpdate: function (st) {
          var ps = st.isActive ? PAR.ramp(st.progress) : 0;
          PAR.set(parC, ps);
          PAR.set(parL, ps);
        },
      },
    });
  });

  /* ---------- lyric bars reveal per block ---------- */
  document.querySelectorAll(".songblock").forEach(function (block) {
    var lines = block.querySelectorAll(".songblock__line");
    gsap.set(lines, { yPercent: 90, opacity: 0 });
    gsap.to(lines, {
      yPercent: 0, opacity: 1, stagger: 0.14, ease: "power3.out",
      scrollTrigger: {
        trigger: block,
        start: "top top",
        end: "60% bottom",
        scrub: 0.5,
      },
    });
  });

  /* ---------- brand mark: 3D spin with the scroll, flashing ---------- */
  gsap.set(".brand__mark", { transformPerspective: 480 });
  gsap.to(".brand__mark", {
    rotationY: 1080,
    ease: "none",
    scrollTrigger: { start: 0, end: "max", scrub: 0.6 },
  });

  /* ---------- audio ---------- */
  function track(n, p) { if (window.MCC_TRACK) window.MCC_TRACK(n, p); }

  var playBtn = document.getElementById("songPlay");
  if (window.SONG.audio) {
    var audio = new Audio(window.SONG.audio);
    audio.loop = true;
    var playing = false;

    /* ---------- karaoke: bars with data-t time codes ride the track ----------
       While the song plays, the page scrolls itself — each bar lights up on
       its cue and the films scrub along in time. A wheel or touch hands
       control back to the listener for a few seconds, then the ride resumes
       from wherever they left the scroll. */
    var karaoke = (function () {
      var nodes = document.querySelectorAll(".songblock__line[data-t]");
      if (!nodes.length) return null;
      var marks = [];
      nodes.forEach(function (el) {
        var block = el.closest(".songblock");
        var lines = block.querySelectorAll(".songblock__line");
        var idx = Array.prototype.indexOf.call(lines, el);
        marks.push({
          el: el,
          t: parseFloat(el.getAttribute("data-t")),
          block: block,
          frac: (idx + 1) / lines.length,
        });
      });
      var holdUntil = 0;
      ["wheel", "touchstart"].forEach(function (ev) {
        window.addEventListener(ev, function () { holdUntil = Date.now() + 4000; }, { passive: true });
      });
      var lit = null;
      var pos = null; // our own smoothed scroll position while driving
      function landing(m) {
        // land the block's scrub just past where this bar reveals
        // (bars stagger in across the first ~60% of a block's travel)
        var span = m.block.offsetHeight - window.innerHeight;
        return m.block.offsetTop + span * Math.min(1, m.frac * 0.6 + 0.08);
      }
      return function (t) {
        var i = -1;
        for (var j = 0; j < marks.length; j++) {
          if (t >= marks[j].t - 0.1) i = j; else break;
        }
        if (i < 0) return;
        var m = marks[i];
        if (lit !== m.el) {
          if (lit) lit.classList.remove("is-now");
          m.el.classList.add("is-now");
          lit = m.el;
        }
        if (Date.now() < holdUntil) { pos = null; return; } // listener has the wheel
        var n = marks[i + 1];
        var a = landing(m);
        var b = n ? landing(n) : a;
        var f = n ? Math.max(0, Math.min(1, (t - m.t) / (n.t - m.t))) : 0;
        var wanted = a + (b - a) * f;
        if (pos === null) pos = window.scrollY; // re-base, then glide
        pos += (wanted - pos) * 0.06;
        lenis.scrollTo(pos, { immediate: true });
      };
    })();
    if (karaoke) {
      gsap.ticker.add(function () { if (playing && !audio.paused) karaoke(audio.currentTime); });
      window.__MCC_KARAOKE = karaoke; // verification hook
    }
    playBtn.addEventListener("click", function () {
      playing = !playing;
      if (playing) {
        audio.play().catch(function () {});
        track("song_start", { song: window.SONG.key, page: "song", at_seconds: Math.round(audio.currentTime) });
      } else {
        audio.pause();
        track("song_stop", { song: window.SONG.key, page: "song", at_seconds: Math.round(audio.currentTime) });
      }
      playBtn.classList.toggle("is-on", playing);
      playBtn.querySelector("span").textContent = playing ? "Pause" : "Play the track";
    });
    // a listener who leaves mid-play still logs where the song stopped
    window.addEventListener("pagehide", function () {
      if (playing && !audio.paused) track("song_stop", { song: window.SONG.key, page: "song", at_seconds: Math.round(audio.currentTime), reason: "left_page" });
    });
  } else {
    playBtn.classList.add("is-pending");
    playBtn.querySelector("span").textContent = "Mix coming soon";
  }

  /* ---------- buy + subscribe gates ---------- */
  function wireGate(el, entry) {
    if (!el) return;
    el.addEventListener("click", function () {
      track("cta_click", { label: (el.textContent || "").trim().slice(0, 60), song: window.SONG.key, page: "song" });
    });
    if (entry && entry.link) {
      el.href = entry.link;
      el.target = "_blank";
      el.rel = "noopener";
    } else {
      el.classList.add("is-pending");
      el.addEventListener("click", function (e) {
        e.preventDefault();
        el.textContent = "Checkout link coming soon";
      });
    }
  }
  document.querySelectorAll("a[data-cta]").forEach(function (el) {
    el.addEventListener("click", function () {
      track("cta_click", { label: el.getAttribute("data-cta"), song: window.SONG.key, page: "song" });
    });
  });
  wireGate(document.getElementById("songBuy"), window.PAYMENTS[window.SONG.key]);
  wireGate(document.getElementById("songSubscribe"), window.PAYMENTS.subscribe);
})();
