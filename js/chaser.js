/* CHASER WORLDS — the one identity engine, dressed.
   RISE deals the card (mcc_rise); this file turns that card into a
   world: a name, a district, a color, hero art, a home turf. It is
   universal by law — it reads whoever is holding the device and
   nothing else. No member list, no special cases: any Chaser who
   plays RISE gets their world, today and forever. */
(function () {
  "use strict";

  var META = {
    signal: { name: "The Signal Chaser", world: "The Signal District", ic: "📡", color: "#45b6ff",
      line: "You turn information into attention — the block hears about it because you said it.",
      turf: ["market.html#wire", "The Wire", "Your home turf: speak once and all of Our Street hears it."] },
    infra: { name: "The Infrastructure Chaser", world: "The Infrastructure Yard", ic: "🏗", color: "#c99d45",
      line: "You own or redesign the part everyone else depends on.",
      turf: ["distribution.html", "The Locker", "Your home turf: rails, identifiers, the plumbing money moves through."] },
    capital: { name: "The Capital Chaser", world: "The Capital Strip", ic: "💰", color: "#00c805",
      line: "You find, structure and deploy the money.",
      turf: ["market.html#yours", "Your Desk", "Your home turf: deals, splits, payouts, the tape."] },
    culture: { name: "The Culture Chaser", world: "The Culture Block", ic: "🎤", color: "#e5383b",
      line: "You turn ideas into music, images, rituals and identity.",
      turf: ["app.html", "The Music House", "Your home turf: the records, the heat, the registry."] },
    justice: { name: "The Justice Chaser", world: "The Justice Steps", ic: "⚖️", color: "#8b5cf6",
      line: "You answer unequal power with pressure, policy and receipts.",
      turf: ["civic.html", "The Street Cred Portal", "Your home turf: reputation in the open — your card, your vote, the record."] },
    access: { name: "The Access Chaser", world: "The Access Row", ic: "🗝", color: "#a3e635",
      line: "You connect people to rooms, tools and entry points.",
      turf: ["spaces.html", "The Spaces", "Your home turf: every door in the city and who it opens for."] },
    proof: { name: "The Proof Chaser", world: "The Proof Archive", ic: "🪪", color: "#2aa8a0",
      line: "You document the work, verify the claims, keep the receipts.",
      turf: ["chain.html", "The M Chain", "Your home turf: every record hashed, stamped and verifiable."] },
    command: { name: "The Command Chaser", world: "The Command Desk", ic: "🎛", color: "#ff7a00",
      line: "You coordinate people under pressure and decide when it's unclear.",
      turf: ["mymission.html", "T.R.A.P.S.", "Your home turf: 100,000 points of missions, yours to run."] },
  };

  function read() { try { return JSON.parse(localStorage.getItem("mcc_rise")); } catch (e) { return null; } }
  function paths() { var r = read(); return (r && r.arch) || []; }
  function primary() { return paths()[0] || null; }
  function meta(k) { return META[k] || null; }
  function hero(k) { return META[k] ? "assets/img/chaser-" + k + ".jpg" : null; }

  /* the world banner: one call on any surface — the district's hero art
     with its name over it. The art hides itself until the runner delivers
     the file, so the banner is honest on day one and painted on day two. */
  function banner(k, opts) {
    var m = META[k];
    if (!m) return "";
    opts = opts || {};
    return '<div class="chw" style="--chc:' + m.color + '">' +
      '<img class="chw__art" src="' + hero(k) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
      '<div class="chw__veil"></div><div class="chw__txt">' +
      "<small>" + m.ic + " your world</small><b>" + m.world + "</b>" +
      "<span>" + (opts.sub || m.line) + "</span></div></div>";
  }

  var css = ".chw{position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--chc,#c99d45);min-height:118px;display:flex;align-items:flex-end;background:#0d0a08}" +
    ".chw__art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.85}" +
    ".chw__veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,8,7,.05) 30%,rgba(10,8,7,.92));box-shadow:inset 0 0 44px rgba(0,0,0,.5)}" +
    ".chw__txt{position:relative;padding:.85rem .95rem;line-height:1.35}" +
    ".chw__txt small{display:block;font-size:.56rem;letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:var(--chc,#c99d45)}" +
    ".chw__txt b{display:block;font-family:var(--sig,inherit);text-transform:uppercase;font-size:1.15rem;letter-spacing:.02em;color:#f4efe6}" +
    ".chw__txt span{display:block;font-size:.72rem;color:rgba(244,239,230,.75);margin-top:.15rem}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  window.MCC_CHASER = { META: META, read: read, paths: paths, primary: primary, meta: meta, hero: hero, banner: banner };
})();
