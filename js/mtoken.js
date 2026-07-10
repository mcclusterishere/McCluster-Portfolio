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
    /* the re-up: buy credit with a card — dollars to the reserve,
       the webhook mints 1:1 */
    buy: function (amt) {
      return S.token().then(function (t) {
        return fetch(S.url + "/functions/v1/buy-eup", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
          body: JSON.stringify({ amount: +amt }),
        });
      }).then(function (r) { return r.json().catch(function () { return null; }); });
    },
    redeemable: function () {
      return S.token().then(function (t) {
        return fetch(S.url + "/rest/v1/rpc/my_redeemable", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
          body: "{}",
        });
      }).then(function (r) { return r.ok ? r.json() : 0; }).catch(function () { return 0; });
    },
    /* the member's whole wallet in one call — balance, earned, what they've
       fed into the Vault, equity stake, and the Vault's size behind it */
    wallet: function () {
      return S.token().then(function (t) {
        return fetch(S.url + "/rest/v1/rpc/my_wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
          body: "{}",
        });
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    },
    /* the member's stake in the equity pool — points, pool total, share % */
    equity: function () {
      return S.token().then(function (t) {
        return fetch(S.url + "/rest/v1/rpc/my_equity", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
          body: "{}",
        });
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    },
    cashout: function (amt) {
      return S.token().then(function (t) {
        return fetch(S.url + "/rest/v1/rpc/request_cashout", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
          body: JSON.stringify({ amt: +amt }),
        });
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) throw new Error((j && (j.message || j.hint)) || "the request bounced");
          return j;
        });
      });
    },
    /* paint the wallet card into a host element (the desk's You tab) */
    card: function (host) {
      if (!host) return;
      var el = document.createElement("div");
      el.className = "mp__card";
      el.innerHTML = '<span class="mp__lblx">E-Up credit — come get your re-up</span>' +
        '<p style="font-size:2rem;font-weight:800;font-variant-numeric:tabular-nums;margin:0.2rem 0" id="mtkBal">…</p>' +
        '<div id="mtkEquity"></div>' +
        '<div id="mtkVault"></div>' +
        '<div id="mtkRows"></div>' +
        '<div class="mp__linkrow" style="margin-top:0.5rem">' +
        '<input class="mp__in" id="mtkWho" type="text" placeholder="Ticker — like MCC" style="flex:1">' +
        '<input class="mp__in" id="mtkAmt" type="number" min="0.01" step="0.01" placeholder="Amount" style="max-width:7.5rem">' +
        '<button class="btn btn--ruby" id="mtkSend" type="button">Send it</button></div>' +
        '<p class="mp__msg" id="mtkMsg"></p>' +
                '<div class="mp__linkrow" style="margin-top:0.5rem">' +
        '<input class="mp__in" id="mtkBuyAmt" type="number" min="5" max="1000" step="1" placeholder="Re-up amount" style="max-width:8rem">' +
        '<button class="btn btn--ghost" id="mtkBuy" type="button" style="flex:1">Re-up — buy E⤴\uFE0E by card</button></div>' +
        '<div id="mtkRedeem" style="margin-top:0.5rem"></div>' +
        '<p class="mp__note">The peg is sacred: 1 E⤴\uFE0E = $1 = 100 points, backed by the Equity Reserve — every purchased credit is a real ' +
        'dollar in the vault, every platform dollar feeds it. <b style="color:var(--cream)">Earned</b> credit (deals done, ' +
        'bounties won, services rendered) cashes out right here; purchased and gifted credit spends anywhere in the loop ' +
        'and stays in the loop. <a href="reserve.html" style="color:#c99d45">Watch the reserve &#8594;</a></p>' +
        '<p class="mp__note" style="margin-top:0.4rem"><b style="color:var(--cream)">How you build it, from zero:</b> nothing is handed out. Complete a deal — the worker earns 5%, the payer 1%. Run <a href="backend.html" style="color:#c99d45">the claim run</a> — owning your back end pays 25 (2,500 pts). Show up, finish what you sign, keep your books clean — the same behavior that raises your <a href="#scb" style="color:#c99d45">Street Score</a> is what mints your credit.</p>';
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
      el.querySelector("#mtkBuy").addEventListener("click", function () {
        var amt = +el.querySelector("#mtkBuyAmt").value;
        var m = el.querySelector("#mtkMsg");
        if (!(amt >= 5)) { m.textContent = "Re-ups start at $5."; return; }
        m.textContent = "Opening checkout…";
        window.MCC_TOKEN.buy(amt).then(function (j) {
          if (j && j.url) { location.href = j.url; return; }
          m.textContent = (j && j.error) || "The re-up door is still being armed — deploy buy-eup.";
        });
      });
      function paintRedeem() {
        var host = el.querySelector("#mtkRedeem");
        window.MCC_TOKEN.redeemable().then(function (can) {
          can = +can || 0;
          if (can < 5) { host.innerHTML = ""; return; }
          host.innerHTML = '<div class="mp__linkrow">' +
            '<input class="mp__in" id="mtkOutAmt" type="number" min="5" step="0.01" max="' + can + '" placeholder="Cash out $" style="max-width:8rem">' +
            '<button class="btn btn--ghost" id="mtkOut" type="button" style="flex:1">Cash out earned — ' + can.toFixed(2) + ' redeemable</button></div>';
          host.querySelector("#mtkOut").addEventListener("click", function () {
            var amt = +host.querySelector("#mtkOutAmt").value;
            var m = el.querySelector("#mtkMsg");
            if (!(amt >= 5)) { m.textContent = "Cash-outs start at 5.00."; return; }
            window.MCC_TOKEN.cashout(amt).then(function () {
              m.textContent = "Requested — the desk pays it out and the record carries it.";
              repaint();
            }).catch(function (e) { m.textContent = String(e && e.message || e); });
          });
        });
      }
      function paintEquity() {
        var eh = el.querySelector("#mtkEquity");
        if (!eh) return;
        window.MCC_TOKEN.equity().then(function (e) {
          if (!e || !(+e.pool > 0)) { eh.innerHTML = ""; return; }
          var pts = (+e.points || 0), pool = (+e.pool || 0), pct = (+e.stake_pct || 0);
          eh.innerHTML = '<p style="font-size:0.78rem;color:var(--cream-dim);margin:0.1rem 0 0.4rem;' +
            'display:flex;justify-content:space-between;gap:0.6rem">' +
            '<span>Equity stake <b style="color:#c99d45">' + pct.toFixed(3) + '%</b> of the pool</span>' +
            '<span style="color:var(--cream-dim)">' + pts.toFixed(2) + ' pts · pool ' + pool.toFixed(2) + '</span></p>';
        });
      }
      function paintVault() {
        var vh = el.querySelector("#mtkVault");
        if (!vh) return;
        window.MCC_TOKEN.wallet().then(function (w) {
          if (!w) { vh.innerHTML = ""; return; }
          var fed = (+w.contributed_to_vault || 0), res = (+w.vault_reserve || 0);
          if (res <= 0 && fed <= 0) { vh.innerHTML = ""; return; }
          vh.innerHTML = '<p style="font-size:0.78rem;color:var(--cream-dim);margin:0.1rem 0 0.4rem;' +
            'display:flex;justify-content:space-between;gap:0.6rem">' +
            '<span>Fed into <a href="reserve.html" style="color:#c99d45">the Vault</a> <b style="color:#c99d45">' + fed.toFixed(2) + ' E⤴︎</b></span>' +
            '<span style="color:var(--cream-dim)">reserve holds ' + res.toFixed(0) + '</span></p>';
        });
      }
      function paint() {
        paintRedeem();
        paintEquity();
        paintVault();
      Promise.all([window.MCC_TOKEN.balance(), window.MCC_TOKEN.ledger(6)])
        .then(function (r) {
          el.querySelector("#mtkBal").innerHTML = r[0].toFixed(2) + ' <span style="font-size:0.5em;vertical-align:0.35em">E⤴︎</span>' +
            ' <span style="font-size:0.44em;color:#c99d45;font-weight:800;vertical-align:0.5em">' + Math.round(r[0] * 100).toLocaleString() + ' pts</span>';
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
          el.querySelector("#mtkBal").innerHTML = '0.00 <span style="font-size:0.5em;vertical-align:0.35em">E⤴︎</span>';
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
