/* ============================================================
   VR360 — the look-around engine.
   Wraps equirectangular media (photo or video) on the inside of
   a sphere via a single fullscreen WebGL shader: every pixel
   casts a ray from the center and samples the panorama.

   Controls: drag / swipe to look (with inertia), pinch or wheel
   to zoom, optional gyroscope on phones (iOS asks permission).
   Zero dependencies, self-hosted like everything else here.

   Usage:
     VR360.mount(canvasEl, { src: "path.jpg" | "path.mp4", video: bool })
   ============================================================ */
(function () {
  "use strict";

  var VERT =
    "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FRAG =
    "precision highp float;" +
    "uniform sampler2D uTex;uniform float uYaw,uPitch,uFov,uAspect;uniform vec2 uRes;" +
    "void main(){" +
    "vec2 ndc=(gl_FragCoord.xy/uRes)*2.-1.;" +
    "float t=tan(uFov*.5);" +
    "vec3 d=normalize(vec3(ndc.x*t*uAspect,ndc.y*t,-1.));" +
    "float cp=cos(uPitch),sp=sin(uPitch);" +
    "d=vec3(d.x,d.y*cp-d.z*sp,d.y*sp+d.z*cp);" +
    "float cy=cos(uYaw),sy=sin(uYaw);" +
    "d=vec3(d.x*cy+d.z*sy,d.y,-d.x*sy+d.z*cy);" +
    "float u=atan(d.x,-d.z)/6.2831853+.5;" +
    "float v=.5-asin(clamp(d.y,-1.,1.))/3.1415927;" +
    "gl_FragColor=texture2D(uTex,vec2(u,v));}";

  function mount(canvas, opts) {
    var gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: false });
    if (!gl) return null;

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ["uYaw","uPitch","uFov","uAspect","uRes"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    var state = {
      yaw: 0, pitch: 0, fov: 75 * Math.PI / 180,
      vyaw: 0, vpitch: 0, dragging: false,
      src: null, isVideo: !!opts.video, ready: false,
      gyro: false, gyawBase: null,
    };

    var media;
    if (state.isVideo) {
      media = document.createElement("video");
      media.muted = true; media.loop = true; media.playsInline = true;
      media.setAttribute("playsinline", ""); media.crossOrigin = "anonymous";
      media.src = opts.src;
      media.addEventListener("canplay", function () { state.ready = true; media.play().catch(function(){}); });
      media.load();
    } else {
      media = new Image();
      media.crossOrigin = "anonymous";
      media.onload = function () {
        state.ready = true;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, media);
      };
      media.src = opts.src;
    }

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", size);

    /* ---- drag with inertia ---- */
    var px = 0, py = 0, pinch0 = 0, fov0 = 0;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", function (e) {
      state.dragging = true; px = e.clientX; py = e.clientY;
      state.vyaw = 0; state.vpitch = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!state.dragging) return;
      var k = state.fov / canvas.clientHeight;
      var dx = (e.clientX - px) * k, dy = (e.clientY - py) * k;
      state.yaw -= dx; state.pitch += dy;
      state.vyaw = -dx; state.vpitch = dy;
      px = e.clientX; py = e.clientY;
      clampPitch();
    });
    function end() { state.dragging = false; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      setFov(state.fov + e.deltaY * 0.002);
    }, { passive: false });
    canvas.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) {
        pinch0 = dist(e.touches); fov0 = state.fov;
      }
    }, { passive: true });
    canvas.addEventListener("touchmove", function (e) {
      if (e.touches.length === 2 && pinch0) {
        setFov(fov0 * pinch0 / dist(e.touches));
      }
    }, { passive: true });
    function dist(t) { var a = t[0], b = t[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    function setFov(f) { state.fov = Math.max(0.5, Math.min(1.9, f)); }
    function clampPitch() { state.pitch = Math.max(-1.48, Math.min(1.48, state.pitch)); }

    /* ---- gyroscope (opt-in) ---- */
    var gyroPrev = null;
    function onGyro(e) {
      if (e.alpha == null) return;
      var a = e.alpha * Math.PI / 180, b = e.beta * Math.PI / 180;
      if (gyroPrev) {
        var da = a - gyroPrev.a, db = b - gyroPrev.b;
        if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        state.yaw += da; state.pitch += db; clampPitch();
      }
      gyroPrev = { a: a, b: b };
    }
    function enableGyro() {
      function arm() { state.gyro = true; window.addEventListener("deviceorientation", onGyro); }
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission().then(function (r) { if (r === "granted") arm(); }).catch(function () {});
      } else if (window.DeviceOrientationEvent) arm();
      return true;
    }

    /* ---- hotspots: tags pinned to things in the scene ----
       spot = { yaw, pitch (degrees), label, href, from, to (seconds, optional) } */
    var spots = [];
    var spotLayer = document.createElement("div");
    spotLayer.className = "vr360-spots";
    canvas.parentNode.insertBefore(spotLayer, canvas.nextSibling);

    function setSpots(list) {
      spots = (list || []).map(function (s) {
        var el = document.createElement("a");
        el.className = "vr360-spot";
        el.href = s.href || "#";
        el.innerHTML = "<i></i><span>" + s.label + "</span>";
        el.addEventListener("click", function () {
          if (window.MCC_TRACK) window.MCC_TRACK("vr_spot_click", { label: s.label });
        });
        spotLayer.appendChild(el);
        return { cfg: s, el: el, yaw: s.yaw * Math.PI / 180, pitch: s.pitch * Math.PI / 180 };
      });
    }
    if (opts.spots) setSpots(opts.spots);

    // world direction the camera at (yaw,pitch) looks toward — same math as the shader
    function dirOf(yaw, pitch) {
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      return [-cp * Math.sin(yaw), sp, -cp * Math.cos(yaw)];
    }
    function placeSpots() {
      if (!spots.length) return;
      var t = Math.tan(state.fov / 2);
      var aspect = canvas.width / canvas.height;
      var cy = Math.cos(-state.yaw), sy = Math.sin(-state.yaw);
      var cp = Math.cos(-state.pitch), sp = Math.sin(-state.pitch);
      var now = state.isVideo ? media.currentTime : null;
      spots.forEach(function (s) {
        if (now != null && s.cfg.from != null && (now < s.cfg.from || now > (s.cfg.to || 1e9))) {
          s.el.style.display = "none"; return;
        }
        var w = dirOf(s.yaw, s.pitch);
        // rotate world into camera space: Ry(-yaw) then Rx(-pitch)
        var x1 = w[0] * cy - w[2] * sy, z1 = w[0] * sy + w[2] * cy, y1 = w[1];
        var y2 = y1 * cp + z1 * sp, z2 = -y1 * sp + z1 * cp;
        if (z2 > -0.05) { s.el.style.display = "none"; return; } // behind you
        var nx = (x1 / -z2) / (t * aspect), ny = (y2 / -z2) / t;
        if (nx < -1.15 || nx > 1.15 || ny < -1.15 || ny > 1.15) { s.el.style.display = "none"; return; }
        s.el.style.display = "";
        s.el.style.left = ((nx * 0.5 + 0.5) * 100) + "%";
        s.el.style.top = ((0.5 - ny * 0.5) * 100) + "%";
      });
    }

    /* ---- authoring: tap the scene, get its yaw/pitch/time to paste into the config ---- */
    function pick(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      var t = Math.tan(state.fov / 2), aspect = canvas.width / canvas.height;
      var nx = ((clientX - r.left) / r.width * 2 - 1) * t * aspect;
      var ny = (1 - (clientY - r.top) / r.height * 2) * t;
      var d = [nx, ny, -1];
      // rotate view ray into the world: Rx(pitch) then Ry(yaw) — the shader's order
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      var y1 = d[1] * cp - d[2] * sp, z1 = d[1] * sp + d[2] * cp, x1 = d[0];
      var cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
      var x2 = x1 * cy + z1 * sy, z2 = -x1 * sy + z1 * cy;
      var len = Math.hypot(x2, y1, z2);
      var yaw = Math.atan2(-x2 / len, -z2 / len) * 180 / Math.PI;
      var pitch = Math.asin(y1 / len) * 180 / Math.PI;
      return { yaw: +yaw.toFixed(1), pitch: +pitch.toFixed(1), t: state.isVideo ? +media.currentTime.toFixed(1) : 0 };
    }

    /* ---- render loop ---- */
    function frame() {
      size();
      if (state.ready && state.isVideo && media.readyState >= 2) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, media);
      }
      if (!state.dragging) {
        state.yaw += state.vyaw; state.pitch += state.vpitch; clampPitch();
        state.vyaw *= 0.94; state.vpitch *= 0.94;
        if (!state.gyro && !state.vyaw && !state.vpitch) state.yaw += 0.0006; // idle drift keeps it alive
      }
      gl.uniform1f(U.uYaw, state.yaw);
      gl.uniform1f(U.uPitch, state.pitch);
      gl.uniform1f(U.uFov, state.fov);
      gl.uniform1f(U.uAspect, canvas.width / canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      placeSpots();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      state: state,
      media: media,
      enableGyro: enableGyro,
      setSpots: setSpots,
      pick: pick,
      play: function () { if (state.isVideo) media.play().catch(function(){}); },
      pause: function () { if (state.isVideo) media.pause(); },
    };
  }

  window.VR360 = { mount: mount };
})();
