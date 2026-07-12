/* THE LOBBY — the open-ended door.
   You type what you're here to do; the concierge sorts you onto the right
   floor(s) and stamps an E⤴ access card for each. Claude (the-guide edge
   function) warms the greeting when it's deployed; until then a deterministic
   keyword router does the sorting so the door always works. Every floor gets
   ONE short intro, remembered forever after (mcc_floor_seen). */
(function () {
  "use strict";

  /* ---- the building ---------------------------------------------------- */
  var FLOORS = [
    {
      id: "trading", name: "The Trading Floor", tag: "Buy · sell · get paid",
      href: "market.html", icon: "M3 7l3-4h12l3 4M3 7h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v7h14v-7M10 20v-4h4v4",
      blurb: "Real money on the record. Close a deal, hire a vendor, get paid by card, or back somebody you believe in.",
      intro: ["Every deal closes on the record — nobody's word against yours.", "Card checkout on real rails, tracked on your own desk.", "Buyers, sellers, and vendors all work one floor."],
      keys: ["buy", "sell", "trade", "deal", "pay", "paid", "money", "hire", "vendor", "shop", "invest", "market", "donate", "support", "fund", "cash", "sale", "purchase", "order", "checkout", "commission", "book", "gig", "client", "get paid"]
    },
    {
      id: "penthouse", name: "The Penthouse", tag: "Your own profile",
      href: "profile.html", icon: "M12 3 3 10v11h6v-6h6v6h6V10zM12 3v0",
      blurb: "See what a page here becomes — films, music, a live ticker, the receipts. Then claim your own and get found.",
      intro: ["Everything on the front door is one member's profile.", "Claim a ticker, build your room, get M-Verified.", "It's your storefront on Our Street — findable, tradeable, yours."],
      keys: ["profile", "page", "my own", "mine", "ticker", "portfolio", "showcase", "get found", "verified", "brand", "website", "site", "myself", "artist", "musician", "creator", "influencer", "personal", "identity", "represent"]
    },
    {
      id: "bureau", name: "The Bureau", tag: "Your street credit",
      href: "civic.html", icon: "M3 21h18M4 18h16M6 18v-7M10 18v-7M14 18v-7M18 18v-7M3 11 12 4l9 7",
      blurb: "Your street credit — a 0–1000 reputation score built from six unforgeable pillars. Earned in the open, kept by you.",
      intro: ["A credit bureau for the people the bureaus can't see.", "Six pillars: capital, craft, reach, community, consistency, co-sign.", "Your record — shown only to who you choose."],
      keys: ["credit", "score", "reputation", "file", "bureau", "street cred", "rating", "standing", "record", "trust", "cred", "clout", "prove", "loan", "borrow", "history"]
    },
    {
      id: "garage", name: "The Garage", tag: "WE — the rides",
      href: "rides.html", icon: "M5 17h14M5 17l1.5-5h11L19 17M5 17v2M19 17v2M7.5 14h9M8 12l-1-3h10l-1 3",
      blurb: "WE — how the block moves. Rides on the record, run by the movement.",
      intro: ["WE is how the movement rolls.", "Rides on the record, drivers on the floor.", "Roll with it, or drive with it."],
      keys: ["ride", "drive", "car", "transport", "we", "driver", "wheels", "road", "pickup", "lift", "trip", "commute"]
    },
    {
      id: "workshop", name: "The Workshop", tag: "The engine — build & earn",
      href: "reading-room.html", icon: "M14 6l3 3-8 8-3 1 1-3zM3 21h18M6 14l-3 3M17 3l4 4-3 3-4-4z",
      blurb: "The engine room. Learn how the machine works, run a mission, and earn your first E⤴ — the platform's own credit.",
      intro: ["This is where the platform is built and explained.", "Run T.R.A.P.S. and earn up to 1,000 E⤴.", "Read the papers, learn the machine, then go build."],
      keys: ["build", "make", "create", "engine", "learn", "how", "work", "works", "mission", "earn", "traps", "teach", "understand", "start", "begin", "new", "help", "explain", "read", "papers", "study", "confused", "lost", "what is", "curious", "explore", "look"]
    }
  ];
  var FLOOR = {}; FLOORS.forEach(function (f) { FLOOR[f.id] = f; });

  function track(name, params) { if (window.MCC_TRACK) window.MCC_TRACK(name, params || {}); }

  /* ---- the router: score floors against what they typed ---------------- */
  function route(text) {
    var t = " " + String(text || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ") + " ";
    var scored = FLOORS.map(function (f) {
      var s = 0;
      f.keys.forEach(function (k) { if (t.indexOf(" " + k + " ") >= 0 || t.indexOf(k) >= 0) s += k.indexOf(" ") >= 0 ? 3 : 2; });
      return { f: f, s: s };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    var hits = scored.filter(function (x) { return x.s > 0; });
    if (!hits.length) return { floors: FLOORS.slice(), sure: false };
    var top = hits[0].s;
    var strong = hits.filter(function (x) { return x.s >= Math.max(2, top * 0.6); });
    return { floors: strong.map(function (x) { return x.f; }), sure: strong.length <= 2 };
  }

  /* the concierge's own words — works with zero backend, warms up with one */
  function greeting(text, res) {
    var f = res.floors[0];
    if (!res.sure && res.floors.length >= 4) {
      return "Say more and I'll aim you dead-on — but here's the whole building. Most people start on the Trading Floor or the Workshop.";
    }
    if (res.floors.length === 1) {
      return "Got it. That's " + f.name + " — " + f.tag.toLowerCase() + ". I stamped your access card. Tap in whenever you're ready.";
    }
    var names = res.floors.map(function (x) { return x.name; });
    var last = names.pop();
    return "Sounds like you want a couple of floors: " + names.join(", ") + " and " + last +
      ". Cards are stamped for each — start wherever pulls you.";
  }

  /* ---- E⤴ access cards: stamped, remembered ---------------------------- */
  function cards() { try { return JSON.parse(localStorage.getItem("mcc_eu_cards") || "[]"); } catch (e) { return []; } }
  function stamp(ids) {
    var have = cards(), added = false;
    ids.forEach(function (id) { if (have.indexOf(id) < 0) { have.push(id); added = true; } });
    try { localStorage.setItem("mcc_eu_cards", JSON.stringify(have)); } catch (e) {}
    if (added) track("lobby_card_stamped", { floors: ids.join(",") });
    return have;
  }
  function seen(id) { try { return (JSON.parse(localStorage.getItem("mcc_floor_seen") || "[]")).indexOf(id) >= 0; } catch (e) { return false; } }
  function markSeen(id) {
    try {
      var s = JSON.parse(localStorage.getItem("mcc_floor_seen") || "[]");
      if (s.indexOf(id) < 0) { s.push(id); localStorage.setItem("mcc_floor_seen", JSON.stringify(s)); }
    } catch (e) {}
  }

  /* ---- DOM ------------------------------------------------------------- */
  function el(tag, cls, html) { var d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
  function esc(x) { var d = document.createElement("i"); d.textContent = x == null ? "" : x; return d.innerHTML; }

  var input = document.getElementById("lbAsk");
  var sendBtn = document.getElementById("lbSend");
  var replyWrap = document.getElementById("lbReply");
  var claudeLine = document.getElementById("lbClaude");
  var grid = document.getElementById("lbFloors");
  var wallet = document.getElementById("lbWallet");
  if (!input || !grid) return;

  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + p + '"/></svg>'; }

  function floorCard(f, hot) {
    var open = !seen(f.id); // first meeting → intro already unfolded
    var c = el("article", "lbfl" + (hot ? " lbfl--hot" : ""));
    c.setAttribute("data-floor", f.id);
    c.innerHTML =
      '<div class="lbfl__top">' +
      '<span class="lbfl__ic" aria-hidden="true">' + svg(f.icon) + "</span>" +
      '<div><b class="lbfl__name">' + esc(f.name) + "</b><span class=\"lbfl__tag\">" + esc(f.tag) + "</span></div>" +
      (hot ? '<span class="lbfl__card" title="Access card stamped">E&#10548;</span>' : "") + "</div>" +
      '<p class="lbfl__blurb">' + esc(f.blurb) + "</p>" +
      '<div class="lbfl__intro" ' + (open ? "" : 'hidden') + '><span class="lbfl__ik">30-second look</span><ul>' +
      f.intro.map(function (li) { return "<li>" + esc(li) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="lbfl__acts">' +
      '<button type="button" class="lbfl__peek" data-peek>' + (open ? "Hide the look" : "What's on this floor?") + "</button>" +
      '<a class="lbfl__go" href="' + f.href + '" data-go>Take me up &#8594;</a></div>';

    c.querySelector("[data-peek]").addEventListener("click", function () {
      var box = c.querySelector(".lbfl__intro"), btn = c.querySelector("[data-peek]");
      var hidden = box.hasAttribute("hidden");
      if (hidden) { box.removeAttribute("hidden"); btn.textContent = "Hide the look"; markSeen(f.id); }
      else { box.setAttribute("hidden", ""); btn.textContent = "What's on this floor?"; }
    });
    c.querySelector("[data-go]").addEventListener("click", function () {
      markSeen(f.id); stamp([f.id]); track("lobby_enter_floor", { floor: f.id });
    });
    return c;
  }

  function paintWallet() {
    var have = cards();
    if (!have.length) { wallet.hidden = true; return; }
    wallet.hidden = false;
    wallet.querySelector("[data-cards]").innerHTML = have.map(function (id) {
      var f = FLOOR[id]; if (!f) return "";
      return '<a class="lbcard" href="' + f.href + '"><span class="lbcard__eu">E&#10548;</span>' +
        '<span class="lbcard__nm">' + esc(f.name.replace(/^The /, "")) + "</span></a>";
    }).join("");
  }

  function renderFloors(res) {
    var hotIds = res.floors.map(function (f) { return f.id; });
    stamp(hotIds);
    // hot floors first, then the rest of the building
    var order = res.floors.concat(FLOORS.filter(function (f) { return hotIds.indexOf(f.id) < 0; }));
    grid.innerHTML = "";
    order.forEach(function (f) { grid.appendChild(floorCard(f, hotIds.indexOf(f.id) >= 0)); });
    paintWallet();
    grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Claude, when he's home: enrich the greeting with the real edge function.
     Deterministic cards are already on screen — this only softens the words. */
  function warmWithGuide(say) {
    var S = window.MCC_SUPA;
    if (!S || !S.url || !S.token || !S.uid || !S.uid()) return;
    S.token().then(function (t) {
      if (!t) return null;
      return fetch(S.url + "/functions/v1/the-guide", {
        method: "POST",
        headers: { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify({ say: say, ctx: { page: "lobby.html", intent: "route-at-the-door" } })
      }).then(function (r) { return r.ok ? r.json() : null; });
    }).then(function (j) {
      if (j && j.reply) { claudeLine.textContent = j.reply; track("lobby_guide_warmed", {}); }
    }).catch(function () { /* the templated line stands */ });
  }

  function answer(text) {
    var say = String(text || "").trim();
    if (!say) { input.focus(); return; }
    track("lobby_ask", { len: say.length });
    var res = route(say);
    claudeLine.textContent = greeting(say, res);
    replyWrap.hidden = false;
    renderFloors(res);
    warmWithGuide(say);
  }

  sendBtn.addEventListener("click", function () { answer(input.value); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey || !ev.shiftKey)) { ev.preventDefault(); answer(input.value); }
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-chip]"), function (chip) {
    chip.addEventListener("click", function () {
      input.value = chip.getAttribute("data-chip");
      answer(input.value);
    });
  });

  // returning visitors already carry cards — show the wallet on load
  paintWallet();
  track("lobby_view", { returning: cards().length ? 1 : 0 });
})();
