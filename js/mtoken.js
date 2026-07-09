/* ============================================================
   MCC_TOKEN — the M Token ledger, client side.
   Closed-loop platform credit: 1 token = $1 of platform credit,
   minted server-side when deals complete (docs/mtoken-schema.sql).
   This file only READS — the mint lives in the database trigger,
   and when Stripe Connect lands the same ledger becomes backed.
   ============================================================ */
(function () {
  "use strict";
  var S = window.MCC_SUPA;

  function authed(path) {
    return S.token().then(function (t) {
      if (!t) throw new Error("signed out");
      return fetch(S.url + "/rest/v1/" + path, {
        headers: { apikey: S.key, Authorization: "Bearer " + t },
      });
    }).then(function (r) {
      if (!r.ok) throw new Error("net " + r.status);
      return r.json();
    });
  }

  window.MCC_TOKEN = {
    ledger: function (limit) {
      return authed("mtoken_ledger?owner=eq." + S.uid() +
        "&order=created_at.desc&limit=" + (limit || 12) + "&select=delta,reason,created_at");
    },
    balance: function () {
      return authed("mtoken_ledger?owner=eq." + S.uid() + "&select=delta")
        .then(function (rows) {
          return +(rows || []).reduce(function (a, r) { return a + (+r.delta || 0); }, 0).toFixed(2);
        });
    },
    /* person-to-person: the fake bank rail. Resolves a ticker or slug to
       a listing and moves credit through the server-side transfer — the
       only pen that writes the ledger. */
    send: function (who, amt) {
      var resolve = window.MCC_FLOOR
        ? window.MCC_FLOOR.load().then(function (floor) {
            var q = String(who || "").trim().toLowerCase().replace(/^\$/, "");
            var hit = (floor.providers || []).filter(function (p) {
              return (p.slug || p.id) === q || String(p.ticker || "").toLowerCase() === q ||
                String(p.name || "").toLowerCase() === q;
            })[0];
            return hit ? (hit.slug || hit.id) : q;
          })
        : Promise.resolve(String(who || "").trim().toLowerCase().replace(/^\$/, ""));
      return resolve.then(function (slug) {
        return S.token().then(function (t) {
          return fetch(S.url + "/rest/v1/rpc/transfer_tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
            body: JSON.stringify({ to_slug: slug, amt: +amt, note: "" }),
          });
        }).then(function (r) {
          return r.json().catch(function () { return null; }).then(function (j) {
            if (!r.ok) throw new Error((j && (j.message || j.hint)) || "transfer failed");
            return j;
          });
        });
      });
    },
    bankroll: function () {
      return S.token().then(function (t) {
        return fetch(S.url + "/rest/v1/rpc/claim_beta_bankroll", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
          body: "{}",
        });
      }).then(function (r) { return r.ok ? r.json() : null; });
    },
    /* paint the wallet card into a host element (the desk's You tab) */
    card: function (host) {
      if (!host) return;
      var el = document.createElement("div");
      el.className = "mp__card";
      el.innerHTML = '<span class="mp__lblx">E-Up credit — come get your re-up</span>' +
        '<p style="font-size:2rem;font-weight:800;font-variant-numeric:tabular-nums;margin:0.2rem 0" id="mtkBal">…</p>' +
        '<div id="mtkRows"></div>' +
        '<div class="mp__linkrow" style="margin-top:0.5rem">' +
        '<input class="mp__in" id="mtkWho" type="text" placeholder="Ticker — like MCC" style="flex:1">' +
        '<input class="mp__in" id="mtkAmt" type="number" min="0.01" step="0.01" placeholder="Amount" style="max-width:7.5rem">' +
        '<button class="btn btn--ruby" id="mtkSend" type="button">Send it</button></div>' +
        '<p class="mp__msg" id="mtkMsg"></p>' +
        '<div id="mtkFaucet"></div>' +
        '<p class="mp__note">The beta rail: 1 ᴹ = $1 of platform credit, minted by real work and moved person to person ' +
        'right here — every send on the record, zero real dollars at risk. Closed loop by design; the dollar bridge ' +
        'comes later, through the front door, with counsel.</p>';
      host.appendChild(el);
      function repaint() {
        el.querySelector("#mtkRows").innerHTML = "";
        paint();
      }
      el.querySelector("#mtkSend").addEventListener("click", function () {
        var who = el.querySelector("#mtkWho").value.trim();
        var amt = +el.querySelector("#mtkAmt").value;
        var m = el.querySelector("#mtkMsg");
        if (!who || !(amt > 0)) { m.textContent = "A ticker and an amount — that's the whole form."; return; }
        m.textContent = "Sending…";
        window.MCC_TOKEN.send(who, amt).then(function () {
          m.textContent = "Sent — it's on both ledgers now.";
          el.querySelector("#mtkAmt").value = "";
          if (window.MCC_TRACK) window.MCC_TRACK("token_transfer", { amount: amt });
          repaint();
        }).catch(function (e) {
          var s = String(e && e.message || e);
          m.textContent = /transfer_tokens/.test(s) || /404/.test(s)
            ? "One paste opens transfers: docs/mtoken-transfer.sql in Supabase."
            : s;
        });
      });
      function paint() {
      Promise.all([window.MCC_TOKEN.balance(), window.MCC_TOKEN.ledger(6)])
        .then(function (r) {
          el.querySelector("#mtkBal").textContent = r[0].toFixed(2) + " ᴹ";
          var fc = el.querySelector("#mtkFaucet");
          fc.innerHTML = "";
          if (r[0] <= 0) {
            var b = document.createElement("button");
            b.className = "btn btn--ghost";
            b.type = "button";
            b.style.cssText = "width:100%;justify-content:center;margin-top:0.4rem";
            b.textContent = "Claim your beta bankroll — 1,000 ᴹ on the house";
            b.addEventListener("click", function () {
              b.textContent = "Opening the vault…";
              window.MCC_TOKEN.bankroll().then(function (got) {
                if (got && +got > 0) { if (window.MCC_TRACK) window.MCC_TRACK("beta_bankroll", {}); repaint(); }
                else { b.textContent = "The faucet needs one paste: docs/mtoken-transfer.sql"; }
              });
            });
            fc.appendChild(b);
          }
          el.querySelector("#mtkRows").innerHTML = (r[1] || []).map(function (row) {
            return '<p style="display:flex;justify-content:space-between;gap:1rem;font-size:0.78rem;' +
              'border-bottom:1px dashed rgba(244,239,230,0.12);padding:0.35em 0">' +
              '<span style="color:var(--cream-dim)">' + (row.reason || "movement") + "</span>" +
              "<b style=\"font-variant-numeric:tabular-nums;color:" + (+row.delta >= 0 ? "#00c805" : "#ff5000") + "\">" +
              (+row.delta >= 0 ? "+" : "") + (+row.delta).toFixed(2) + "</b></p>";
          }).join("") || '<p class="mp__note" style="margin:0.2rem 0 0.4rem">Nothing minted yet — complete a deal and the first tokens land here.</p>';
        })
        .catch(function (e) {
          var s = String(e && e.message || e);
          el.querySelector("#mtkBal").textContent = "0.00 ᴹ";
          el.querySelector("#mtkRows").innerHTML = '<p class="mp__note">' +
            (s.indexOf("404") !== -1 || s.indexOf("relation") !== -1 || s.indexOf("net 4") !== -1
              ? "One paste opens the vault: docs/mtoken-schema.sql in Supabase."
              : "Ledger unreachable right now.") + "</p>";
        });
      }
      paint();
    },
  };
})();
