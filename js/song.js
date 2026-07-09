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

  /* ---------- every song's loading screen teaches its own mindfulness exercise ---------- */
  function zenCue(key) {
    var Z = {
      "antisocial": {
        anim: '<span class="zenbox" aria-hidden="true"><i></i></span>',
        title: "Box Breathing",
        msg: "Follow the dot around the square. Breathe in for 4 counts as it climbs, hold for 4 across the top, breathe out for 4 coming down, hold for 4 along the bottom. Four even sides, a calm square drawn around a racing mind. It's what people use before the biggest moments of their lives.",
      },
      "whodidtheshoot": {
        anim: '<span class="zendots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>',
        title: "5 · 4 · 3 · 2 · 1 Grounding",
        msg: "Each dot is one of your senses. While this loads, look up and name five things you can see, four you can feel, three you can hear, two you can smell, one you can taste. It walks your mind out of the scroll and back into the room you're actually standing in.",
      },
      "gotwifi": {
        anim: '<span class="zen478" aria-hidden="true"></span>',
        title: "The 4 · 7 · 8 Breath",
        msg: "Breathe in through your nose for 4 counts while the circle grows. Hold for 7 while it stays full. Let it out slow through your mouth for 8 as it empties. That long exhale is the off switch for a racing mind. Three rounds feels like a reboot.",
      },
      "vaunt": {
        anim: '<span class="zeneven" aria-hidden="true"></span>',
        title: "Even Breathing",
        msg: "Match the circle. In for 5 counts as it fills, out for 5 as it settles. No holds, no forcing, just smooth and level. A minute of this steadies your heartbeat the way a metronome steadies a song.",
      },
      "environmental-injustice": {
        anim: '<span class="zensweep" aria-hidden="true"><i></i></span>',
        title: "The Body Scan",
        msg: "Follow the light down. Start at your forehead and let it soften. Unclench your jaw. Drop your shoulders away from your ears. Loosen your hands. Wherever the light finds something tight, breathe into it once and let it go.",
      },
      "dealerplates": {
        anim: '<span class="zenrings" aria-hidden="true"><i></i></span>',
        title: "The Release",
        msg: "Watch the rings let go of the center, then do it yourself. Squeeze your shoulders up to your ears, hold for 3, and drop them. Make two fists, hold for 3, and let your hands fall open. Tension you put down on purpose stays down.",
      },
    };
    var z = Z[key] || {
      anim: '<span class="zencue__orb" aria-hidden="true"></span>',
      title: "The Physiological Sigh",
      msg: "Two quick breaths in through your nose, one long, slow breath out through your mouth. The double inhale opens your lungs all the way, and the long exhale tells your heart to slow down. Two rounds and the weight comes off your shoulders.",
    };
    return '<div class="zencue">' + z.anim +
      '<p class="zencue__title">' + z.title + "</p>" +
      '<p class="zencue__msg">' + z.msg + "</p></div>";
  }

  /* ---------- page loader: percentage + a genre animation per label ---------- */
  var pre = (function () {
    var map = {
      "environmental-injustice": { logo: "assets/img/equity-uprise-logo.webp", cls: "spre--uprise" },
      "vaunt": { logo: "assets/img/vaunt-logo.webp", cls: "spre--vaunt" },
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
      zenCue(window.SONG.key) +
      "</div>";
    document.body.appendChild(el);
    var numEl = el.querySelector(".songpre__num");
    var shown = 0, target = 0, done = false, finished = false;
    var tick = setInterval(function () {
      shown += (target - shown) * 0.18;
      numEl.textContent = String(Math.round(shown)).padStart(3, "0");
      // two-stage escalation: ignite at 50%, second hit near the end
      el.classList.toggle("is-hot", shown >= 50);
      el.classList.toggle("is-blazing", shown >= 85);
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
          // advance the contiguous high-water mark BEFORE reporting progress —
          // reporting first meant the 100% condition was computed against a
          // stale loadedMax and the loader always sat at 99 until the failsafe
          while (s.loadedMax + 1 < count && flags[s.loadedMax + 1]) s.loadedMax++;
          if (!s.ready && s.loadedMax >= 0) { s.ready = true; s.draw(0); }
          if (onProgress) onProgress(loaded / count);
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
            // the diet: films load under two screens out, posters cover the gap
            trigger: block, start: "top 175%", once: true,
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

    /* ---------- the music-video card: real footage rides the master ----------
       A .songblock__video element is the film itself, muted — the master
       track carries the sound. While the song plays, the video holds the
       song's clock (within drift tolerance); when the footage runs out,
       it freezes on its last frame and the film sequences take over. */
    var mv = document.querySelector(".songblock__video");
    if (mv) {
      mv.muted = true; mv.playsInline = true; mv.preload = "auto";
      gsap.ticker.add(function () {
        if (!mv.duration) return;
        var end = mv.duration - 0.05;
        if (playing && !audio.paused) {
          var t = Math.min(audio.currentTime, end);
          if (Math.abs(mv.currentTime - t) > 0.3) mv.currentTime = t; // re-clock on drift
          if (audio.currentTime < end) { if (mv.paused) mv.play().catch(function () {}); }
          else if (!mv.paused) mv.pause(); // footage over: hold the last frame
        } else if (!mv.paused) {
          mv.pause();
        }
      });
    }
    // the Now Playing tab mirrors this page's song; a tap presses play
    function announceNP() {
      var title = (document.querySelector(".songhero__title") || {}).textContent || window.SONG.key;
      window.dispatchEvent(new CustomEvent("mcc:nowplaying", {
        detail: { title: title.trim(), href: "#np", playing: playing },
      }));
    }
    window.MCC_NP_PLAY = function () { if (!playing) playBtn.click(); };
    window.MCC_NP_PAUSE = function () { if (playing) playBtn.click(); };
    announceNP();

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
      announceNP();
    });
    // a listener who leaves mid-play still logs where the song stopped
    window.addEventListener("pagehide", function () {
      if (playing && !audio.paused) track("song_stop", { song: window.SONG.key, page: "song", at_seconds: Math.round(audio.currentTime), reason: "left_page" });
    });
    // the deeper overlay (psychology markers) freezes the ride, then hands it back
    window.__MCC_PAUSE = function () {
      lenis.stop();
      var wasPlaying = playing && !audio.paused;
      if (wasPlaying) audio.pause();
      return wasPlaying;
    };
    window.__MCC_RESUME = function (resumeAudio) {
      lenis.start();
      if (resumeAudio && playing) audio.play().catch(function () {});
    };
  } else {
    playBtn.classList.add("is-pending");
    playBtn.querySelector("span").textContent = "Mix coming soon";
    window.__MCC_PAUSE = function () { lenis.stop(); return false; };
    window.__MCC_RESUME = function () { lenis.start(); };
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
      // suggested-contribution register: one link for the cause,
      // the amount is a suggestion and the giver sets their own
      if (entry.label) el.textContent = entry.label;
      else if (entry.suggest) el.textContent = (el.textContent || "").trim() + " \u00b7 suggested " + entry.suggest;
      // one clear beat before Square: what you get, where it goes
      if (/square\.link\/u\/MBVeuzoo/.test(entry.link)) {
        el.addEventListener("click", function (e) {
          if (el.dataset.confirmed) { delete el.dataset.confirmed; return; }
          e.preventDefault();
          var ov = document.createElement("div");
          ov.className = "getapp-coach is-on";
          ov.setAttribute("role", "dialog");
          ov.innerHTML =
            '<div class="getapp-coach__card">' +
            '<b>Heading to the register</b>' +
            '<p>You\u2019re going to the nonprofit\u2019s Square page' + (entry.suggest ? " \u2014 suggested " + entry.suggest + ", give what\u2019s fair" : " \u2014 give what\u2019s fair") + ".</p>" +
            '<p class="getapp-coach__note">The track is yours as a thank-you, and every dollar funds Equity Uprise programming. Square handles the payment; we never see your card.</p>' +
            '<button type="button" data-go="1">Continue to Square \u2197</button> ' +
            '<button type="button" style="background:none;border:1px solid rgba(244,239,230,0.3);color:var(--cream-dim)">Stay here</button></div>';
          ov.addEventListener("click", function (ev) {
            var go = ev.target.closest("[data-go]");
            if (go) {
              el.dataset.confirmed = "1";
              window.open(entry.link, "_blank", "noopener");
              track("cta_click", { label: "donate_confirmed", song: window.SONG.key, page: "song" });
            }
            ov.remove();
          });
          document.body.appendChild(ov);
        });
      }
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
