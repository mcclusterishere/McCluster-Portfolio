/* ============================================================
   THE BLACK STAR GATE — a walkable 3D warehouse that IS a portal
   into Equity Uprise. You are the player; the content lives in the
   room. WASD / arrows / on-screen joystick to move, drag to look,
   walk into a monolith and press E (or tap) to step through into
   the real site. Three.js r128 (global THREE), procedural textures
   so it runs offline; generated murals layer in when they land.
   Exposes window.GHANA for the headless verify.
   ============================================================ */
(function () {
  "use strict";
  if (!window.THREE) { console.warn("Ghana: THREE missing"); return; }
  var THREE = window.THREE;

  // Ghana palette
  var RED = 0xce1126, GOLD = 0xfcd116, GREEN = 0x006b3f, INK = 0x0a0807;

  var GH = {
    started: false, ready: false,
    keys: {}, move: new THREE.Vector2(0, 0),
    camYaw: 0, near: null,
    kiosks: [], player: null, camera: null, scene: null, renderer: null,
  };
  window.GHANA = GH;

  /* ---------- procedural textures (offline, intentional) ---------- */
  function cv(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  function concreteTex() {
    var c = cv(256, 256), x = c.getContext("2d");
    x.fillStyle = "#2a2622"; x.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++) {
      var g = 30 + (Math.random() * 30 | 0);
      x.fillStyle = "rgba(" + g + "," + (g - 4) + "," + (g - 8) + ",0.5)";
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  function kenteTex() {
    var c = cv(128, 128), x = c.getContext("2d");
    var cols = ["#ce1126", "#fcd116", "#006b3f", "#0a0807"];
    x.fillStyle = "#0a0807"; x.fillRect(0, 0, 128, 128);
    for (var r = 0; r < 8; r++) for (var q = 0; q < 8; q++) {
      x.fillStyle = cols[(r + q) % 4];
      x.fillRect(q * 16, r * 16, 16, 16);
      if ((r + q) % 2) { x.fillStyle = cols[(r + q + 2) % 4]; x.fillRect(q * 16 + 4, r * 16 + 4, 8, 8); }
    }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  function starTex() {
    var c = cv(512, 512), x = c.getContext("2d");
    x.clearRect(0, 0, 512, 512);
    // dark ring
    x.strokeStyle = "rgba(252,209,22,0.85)"; x.lineWidth = 10;
    x.beginPath(); x.arc(256, 256, 210, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = "rgba(252,209,22,0.35)"; x.lineWidth = 3;
    x.beginPath(); x.arc(256, 256, 190, 0, Math.PI * 2); x.stroke();
    // five-point star
    x.fillStyle = "#fcd116"; x.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 62 : 150;
      var px = 256 + Math.cos(ang) * rad, py = 256 + Math.sin(ang) * rad;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath(); x.fill();
    return new THREE.CanvasTexture(c);
  }

  function labelTex(icon, title, sub) {
    var c = cv(512, 256), x = c.getContext("2d");
    x.fillStyle = "rgba(10,8,7,0.0)"; x.fillRect(0, 0, 512, 256);
    x.font = "120px system-ui, sans-serif"; x.textAlign = "center"; x.fillText(icon, 256, 120);
    x.fillStyle = "#f4efe6"; x.font = "700 52px Impact, system-ui, sans-serif";
    x.fillText(title.toUpperCase(), 256, 190);
    x.fillStyle = "#e8c877"; x.font = "600 26px system-ui, sans-serif";
    x.fillText(sub, 256, 228);
    var t = new THREE.CanvasTexture(c); return t;
  }

  /* try a generated mural; fall back to a procedural panel if it 404s */
  function muralTex(src, fallback) {
    var t = new THREE.TextureLoader().load(src, function () {}, undefined, function () {
      if (fallback) { var f = fallback(); t.image = f.image; t.needsUpdate = true; }
    });
    return t;
  }

  /* ---------- the doors: content in the room ---------- */
  var DOORS = [
    { name: "Our Street", sub: "The Market", icon: "🏪", page: "market.html", color: GREEN, x: -18, z: -14 },
    { name: "Only Us", sub: "The Music", icon: "🎧", page: "app.html", color: RED, x: 0, z: -22 },
    { name: "Whip Equipped", sub: "The Rides", icon: "🚘", page: "rides.html", color: GOLD, x: 18, z: -14 },
    { name: "Spaces", sub: "The Rooms", icon: "🏠", page: "spaces.html", color: 0x45b6ff, x: -18, z: 14 },
    { name: "The Penthouse", sub: "The Home Floor", icon: "🌇", page: "index.html", color: 0xc99d45, x: 18, z: 14 },
    { name: "Your Card", sub: "Play RISE", icon: "🃏", page: "rise.html", color: 0x8b5cf6, x: 0, z: 20 },
  ];

  var clock, tmp = new THREE.Vector3(), camPos = new THREE.Vector3();
  var ROOM = 56, HALF = ROOM / 2 - 3;

  function build() {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120d0a);
    scene.fog = new THREE.Fog(0x120d0a, 34, 88);
    GH.scene = scene;

    var camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 300);
    GH.camera = camera;

    var renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById("ghCanvas") });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    GH.renderer = renderer;

    scene.add(new THREE.HemisphereLight(0xffe8c8, 0x1a120c, 0.8));
    var amb = new THREE.AmbientLight(0xffffff, 0.25); scene.add(amb);
    // warm Edison bulbs
    [[-14, -10], [14, -10], [-14, 10], [14, 10], [0, 0]].forEach(function (p) {
      var pl = new THREE.PointLight(0xffbf73, 0.9, 46, 2); pl.position.set(p[0], 9, p[1]); scene.add(pl);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd89a })); bulb.position.copy(pl.position); scene.add(bulb);
    });

    // floor
    var floorTex = concreteTex(); floorTex.repeat.set(12, 12);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM),
      new THREE.MeshLambertMaterial({ map: floorTex, color: 0x8a8078 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    // gold Black Star medallion inlaid at center
    var star = new THREE.Mesh(new THREE.PlaneGeometry(12, 12),
      new THREE.MeshBasicMaterial({ map: starTex(), transparent: true }));
    star.rotation.x = -Math.PI / 2; star.position.y = 0.02; scene.add(star);

    // walls: concrete with a kente accent band
    var wallMat = new THREE.MeshLambertMaterial({ map: (function () { var t = concreteTex(); t.repeat.set(6, 2); return t; })(), color: 0x6f665d });
    var kente = kenteTex(); kente.repeat.set(10, 1);
    var kMat = new THREE.MeshLambertMaterial({ map: kente });
    var H = 12;
    var sides = [[0, -ROOM / 2, 0], [0, ROOM / 2, Math.PI], [-ROOM / 2, 0, Math.PI / 2], [ROOM / 2, 0, -Math.PI / 2]];
    // gate mural on the front wall, warehouse mural on the back
    var murals = { "0": "assets/img/ghana-gate.jpg", "1": "assets/img/ghana-warehouse.jpg" };
    sides.forEach(function (s, i) {
      var w = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, H), wallMat.clone());
      w.position.set(s[0], H / 2, s[1]); w.rotation.y = s[2]; scene.add(w);
      // kente band
      var band = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, 1.6), kMat.clone());
      band.position.set(s[0], 3.2, s[1]); band.rotation.y = s[2];
      band.position.x += Math.sin(s[2]) * 0.05; band.position.z += Math.cos(s[2]) * 0.05;
      scene.add(band);
      if (murals[i]) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(20, 11),
          new THREE.MeshBasicMaterial({ map: muralTex(murals[i], i === "0" ? starTex : kenteTex), transparent: true }));
        m.position.set(s[0], 7, s[1]); m.rotation.y = s[2];
        m.position.x += Math.sin(s[2]) * 0.06; m.position.z += Math.cos(s[2]) * 0.06;
        scene.add(m);
      }
    });

    // the player — a low-poly figure in the Black Star jersey
    var you = new THREE.Group();
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.5, 12),
      new THREE.MeshLambertMaterial({ color: GREEN })); torso.position.y = 1.5; you.add(torso);
    var chest = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.5, 0.4, 12),
      new THREE.MeshLambertMaterial({ color: GOLD })); chest.position.y = 2.15; you.add(chest);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16),
      new THREE.MeshLambertMaterial({ color: 0x6b4a33 })); head.position.y = 3.0; you.add(head);
    [[-0.75, 1.6], [0.75, 1.6]].forEach(function (a) {
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.3, 8),
        new THREE.MeshLambertMaterial({ color: GREEN })); arm.position.set(a[0], a[1], 0); you.add(arm);
    });
    [[-0.28, 0.5], [0.28, 0.5]].forEach(function (l) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 1.1, 8),
        new THREE.MeshLambertMaterial({ color: 0x1a1a1a })); leg.position.set(l[0], l[1], 0); you.add(leg);
    });
    // contact shadow
    var sh = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; you.add(sh);
    // name card floating above
    var card = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3),
      new THREE.MeshBasicMaterial({ map: labelTex("★", "You", "the player"), transparent: true }));
    card.position.y = 4.1; you.add(card); you._card = card;
    you.position.set(0, 0, 12); scene.add(you); GH.player = you;

    // the monoliths — the content doors
    DOORS.forEach(function (d) {
      var g = new THREE.Group(); g.position.set(d.x, 0, d.z);
      var mono = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 0.7),
        new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.5 }));
      mono.position.y = 2.6; g.add(mono);
      var ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.9, 32),
        new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring); g._ring = ring;
      var lbl = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
        new THREE.MeshBasicMaterial({ map: labelTex(d.icon, d.name, d.sub), transparent: true }));
      lbl.position.y = 6.4; g.add(lbl); g._lbl = lbl;
      scene.add(g);
      GH.kiosks.push({ def: d, group: g, ring: ring, lbl: lbl, pos: new THREE.Vector2(d.x, d.z) });
    });

    GH.ready = true;
    clock = new THREE.Clock();
  }

  /* ---------- controls ---------- */
  function bindControls() {
    addEventListener("keydown", function (e) {
      var k = e.key.toLowerCase();
      GH.keys[k] = true;
      if ((k === "e" || k === "enter") && GH.near) { go(GH.near); }
    });
    addEventListener("keyup", function (e) { GH.keys[e.key.toLowerCase()] = false; });
    addEventListener("resize", function () {
      if (!GH.renderer) return;
      GH.camera.aspect = innerWidth / innerHeight; GH.camera.updateProjectionMatrix();
      GH.renderer.setSize(innerWidth, innerHeight);
    });

    // drag-look (right side / mouse)
    var lookId = null, lastX = 0;
    function lookStart(x, id) { lookId = id; lastX = x; }
    function lookMove(x) { if (lookId === null) return; GH.camYaw -= (x - lastX) * 0.005; lastX = x; }
    function lookEnd() { lookId = null; }
    var cvEl = document.getElementById("ghCanvas");
    cvEl.addEventListener("mousedown", function (e) { lookStart(e.clientX, "m"); });
    addEventListener("mousemove", function (e) { lookMove(e.clientX); });
    addEventListener("mouseup", lookEnd);

    // touch: left half = joystick, right half = look
    var joyId = null, joyOx = 0, joyOy = 0, joyEl = document.getElementById("ghJoy"), joyKnob = document.getElementById("ghJoyKnob");
    cvEl.addEventListener("touchstart", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.clientX < innerWidth / 2 && joyId === null) {
          joyId = t.identifier; joyOx = t.clientX; joyOy = t.clientY;
          joyEl.style.left = t.clientX + "px"; joyEl.style.top = t.clientY + "px"; joyEl.style.display = "block";
        } else if (lookId === null) { lookStart(t.clientX, t.identifier); }
      }
    }, { passive: true });
    cvEl.addEventListener("touchmove", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === joyId) {
          var dx = t.clientX - joyOx, dy = t.clientY - joyOy, m = Math.min(1, Math.hypot(dx, dy) / 46);
          var a = Math.atan2(dy, dx); GH.move.set(Math.cos(a) * m, Math.sin(a) * m);
          joyKnob.style.transform = "translate(" + (Math.cos(a) * m * 34) + "px," + (Math.sin(a) * m * 34) + "px)";
        } else if (t.identifier === lookId) { lookMove(t.clientX); }
      }
    }, { passive: true });
    function touchEnd(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === joyId) { joyId = null; GH.move.set(0, 0); joyEl.style.display = "none"; joyKnob.style.transform = ""; }
        if (t.identifier === lookId) lookEnd();
      }
    }
    cvEl.addEventListener("touchend", touchEnd); cvEl.addEventListener("touchcancel", touchEnd);

    var prompt = document.getElementById("ghPrompt");
    if (prompt) prompt.addEventListener("click", function () { if (GH.near) go(GH.near); });
  }

  function go(k) {
    if (window.MCC_TRACK) window.MCC_TRACK("ghana_enter", { to: k.def.page });
    var sep = k.def.page.indexOf("?") >= 0 ? "&" : "?";
    location.href = k.def.page + sep + "from=ghana";
  }

  /* ---------- the loop ---------- */
  var vel = new THREE.Vector3();
  function step(dt) {
    if (!GH.ready) return;
    // gather move from keys + joystick (screen up = forward)
    var mx = 0, mz = 0;
    if (GH.keys["w"] || GH.keys["arrowup"]) mz -= 1;
    if (GH.keys["s"] || GH.keys["arrowdown"]) mz += 1;
    if (GH.keys["a"] || GH.keys["arrowleft"]) mx -= 1;
    if (GH.keys["d"] || GH.keys["arrowright"]) mx += 1;
    if (GH.move.lengthSq() > 0.001) { mx += GH.move.x; mz += GH.move.y; }
    // camera-relative
    var len = Math.hypot(mx, mz);
    if (len > 0.001) {
      mx /= len; mz /= len;
      var cos = Math.cos(GH.camYaw), sin = Math.sin(GH.camYaw);
      var wx = mx * cos - mz * sin, wz = mx * sin + mz * cos;
      vel.x += (wx * 12 - vel.x) * Math.min(1, dt * 10);
      vel.z += (wz * 12 - vel.z) * Math.min(1, dt * 10);
      GH.player.rotation.y = Math.atan2(wx, wz);
    } else {
      vel.x += (-vel.x) * Math.min(1, dt * 10);
      vel.z += (-vel.z) * Math.min(1, dt * 10);
    }
    var p = GH.player.position;
    p.x += vel.x * dt; p.z += vel.z * dt;
    // walls
    p.x = Math.max(-HALF, Math.min(HALF, p.x)); p.z = Math.max(-HALF, Math.min(HALF, p.z));
    // push out of monoliths + find nearest door
    GH.near = null; var bestD = 5.2;
    GH.kiosks.forEach(function (k) {
      var dx = p.x - k.pos.x, dz = p.z - k.pos.y, d = Math.hypot(dx, dz);
      if (d < 1.7 && d > 0.001) { p.x = k.pos.x + dx / d * 1.7; p.z = k.pos.y + dz / d * 1.7; }
      var pulse = 0.5 + Math.sin(Date.now() * 0.004) * 0.2; k.ring.material.opacity = pulse;
      if (k.lbl) k.lbl.rotation.y = GH.camYaw;
      if (d < bestD) { bestD = d; GH.near = d < 4.2 ? k : GH.near; }
    });
    if (GH.player._card) GH.player._card.rotation.y = GH.camYaw;
    // camera follows
    var cy = GH.camYaw;
    camPos.set(p.x - Math.sin(cy) * 9, 6.2, p.z - Math.cos(cy) * 9);
    GH.camera.position.lerp(camPos, Math.min(1, dt * 6));
    tmp.set(p.x, 2.4, p.z); GH.camera.lookAt(tmp);
    paintPrompt();
    GH.renderer.render(GH.scene, GH.camera);
  }

  var lastNear = "x";
  function paintPrompt() {
    var el = document.getElementById("ghPrompt");
    if (!el) return;
    var key = GH.near ? GH.near.def.name : "";
    if (key === lastNear) return; lastNear = key;
    if (GH.near) {
      el.innerHTML = '<b>' + GH.near.def.icon + " " + GH.near.def.name + "</b><span>Press E &middot; or tap to step through &rarr;</span>";
      el.classList.add("on");
    } else el.classList.remove("on");
  }

  function loop() {
    if (!GH.started) return;
    var dt = Math.min(0.05, clock.getDelta());
    step(dt);
    requestAnimationFrame(loop);
  }

  /* ---------- boot / intro ---------- */
  function start() {
    if (GH.started) return;
    if (!GH.ready) build();
    GH.started = true;
    bindControls();
    // dive-in: camera drops from the white sky into the follow shot
    var t0 = performance.now(), from = new THREE.Vector3(0, 46, 30);
    GH.camera.position.copy(from);
    (function dive() {
      var k = Math.min(1, (performance.now() - t0) / 1700), e = 1 - Math.pow(1 - k, 3);
      var target = new THREE.Vector3(GH.player.position.x - 0, 6.2, GH.player.position.z - 9);
      GH.camera.position.lerpVectors(from, target, e);
      GH.camera.lookAt(GH.player.position.x, 2.4, GH.player.position.z);
      GH.renderer.render(GH.scene, GH.camera);
      var ov = document.getElementById("ghDive"); if (ov) ov.style.opacity = String(1 - e);
      if (k < 1) requestAnimationFrame(dive);
      else { var o = document.getElementById("ghDive"); if (o) o.style.display = "none"; clock.getDelta(); loop(); }
    })();
    if (window.MCC_TRACK) window.MCC_TRACK("ghana_start", {});
  }
  GH.start = start;

  // headless test hooks
  GH._tick = function (dt) { if (!GH.ready) build(); step(dt || 0.05); };
  GH._warp = function (x, z) { if (!GH.ready) build(); GH.player.position.set(x, 0, z); };

  document.addEventListener("DOMContentLoaded", function () {
    // pre-build so the first frame behind the gate is ready
    try { build(); GH.renderer.render(GH.scene, GH.camera); } catch (e) { console.warn("Ghana build:", e); }
    var btn = document.getElementById("ghEnter");
    if (btn) btn.addEventListener("click", function () {
      var gate = document.getElementById("ghGate");
      if (gate) { gate.style.opacity = "0"; setTimeout(function () { gate.style.display = "none"; }, 500); }
      start();
    });
  });
})();
