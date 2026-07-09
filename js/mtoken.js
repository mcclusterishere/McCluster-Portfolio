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
    /* paint the wallet card into a host element (M Pay's You tab) */
    card: function (host) {
      if (!host) return;
      var el = document.createElement("div");
      el.className = "mp__card";
      el.innerHTML = '<span class="mp__lblx">M Tokens — platform credit</span>' +
        '<p style="font-size:2rem;font-weight:800;font-variant-numeric:tabular-nums;margin:0.2rem 0" id="mtkBal">…</p>' +
        '<div id="mtkRows"></div>' +
        '<p class="mp__note">1 token = $1 of platform credit — fees, promotion, bookings. Minted only by real work: ' +
        'complete a deal and the provider earns 5% back, the buyer 1%. Not a coin, not tradeable, no cash-out — ' +
        'credit that gets real backing when the card rails land.</p>';
      host.appendChild(el);
      Promise.all([window.MCC_TOKEN.balance(), window.MCC_TOKEN.ledger(6)])
        .then(function (r) {
          el.querySelector("#mtkBal").textContent = r[0].toFixed(2) + " ᴹ";
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
    },
  };
})();
