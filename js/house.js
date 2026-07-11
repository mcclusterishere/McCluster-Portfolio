/* MCC_HOUSE — the shelf where the house pays YOU.
   Real services priced in E-Up credit: stack the E⤴︎, pay the house,
   the house delivers the work. The shelf reads publicly; claiming
   runs through the server-side claim_house_offer — balance checked,
   stock checked, one claim per person, all in one transaction.
   MCC_HOUSE.shelf(hostEl) paints it anywhere. */
(function () {
  "use strict";
  var S = window.MCC_SUPA;

  function offers() {
    return fetch(S.url + "/rest/v1/house_offers?active=eq.true&order=price.asc&select=*", {
      headers: { apikey: S.key, Authorization: "Bearer " + S.key },
    }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  }
  /* the shelf is earned-only, so the card must show EARNED credit, not
     total balance — that's what the server actually checks. house_wallet
     returns {balance, earned} in one call. Null = signed out. */
  function wallet() {
    if (!window.MCC_AUTH || !window.MCC_AUTH.user || !window.MCC_AUTH.user()) return Promise.resolve(null);
    return S.token().then(function (t) {
      return fetch(S.url + "/rest/v1/rpc/house_wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
        body: "{}",
      });
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return null;
        return { balance: +(+j.balance || 0).toFixed(2), earned: +(+j.earned || 0).toFixed(2) };
      }).catch(function () { return null; });
  }
  function claim(id) {
    return S.token().then(function (t) {
      return fetch(S.url + "/rest/v1/rpc/claim_house_offer", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t },
        body: JSON.stringify({ offer: id }),
      });
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) throw new Error((j && (j.message || j.hint)) || "the claim bounced");
        return j;
      });
    });
  }

  function shelf(host) {
    if (!host) return;
    host.innerHTML = '<p class="mp__note">Opening the shelf…</p>';
    Promise.all([offers(), wallet()]).then(function (r) {
      var rows = r[0], w = r[1];
      var earned = w ? w.earned : null;   // the shelf pays out of earned credit only
      if (!rows.length) {
        host.innerHTML = '<p class="mp__note">The shelf is bare right now — the house restocks. (Admin: one paste, docs/house-schema.sql.)</p>';
        return;
      }
      host.innerHTML = "";
      rows.forEach(function (o) {
        var card = document.createElement("div");
        card.className = "mp__card";
        card.style.cssText = "border-color:rgba(201,157,69,0.45)";
        var left = o.stock != null ? Math.max(0, o.stock) : null;
        card.innerHTML =
          '<span class="mp__lblx" style="color:#c99d45">🏠 On the house' + (o.area ? " · " + o.area : "") + "</span>" +
          '<h3 style="font-family:var(--display);font-weight:400;text-transform:uppercase;font-size:1.25rem;line-height:1.05;margin:0.25rem 0">' + o.title + "</h3>" +
          (o.blurb ? '<p class="mp__note" style="margin:0.2rem 0 0.6rem">' + o.blurb + "</p>" : "") +
          '<p style="font-size:1.5rem;font-weight:800;font-variant-numeric:tabular-nums;margin:0 0 0.5rem">' +
          (+o.price).toFixed(0) + ' <span style="font-size:0.55em;vertical-align:0.3em">E⤴︎</span>' +
          (o.stock != null ? ' <span style="font-size:0.84rem;color:var(--cream-dim);font-weight:400">· ' + o.stock + " on the shelf</span>" : "") + "</p>" +
          '<div data-house-act></div><p class="mp__msg" data-house-msg></p>';
        var act = card.querySelector("[data-house-act]");
        var msg = card.querySelector("[data-house-msg]");
        if (earned === null) {
          act.innerHTML = '<a class="btn btn--ruby" style="width:100%;justify-content:center" href="market.html#yours">Open your account — start stacking</a>';
        } else if (earned >= +o.price) {
          var b = document.createElement("button");
          b.className = "btn btn--ruby"; b.type = "button";
          b.style.cssText = "width:100%;justify-content:center";
          b.textContent = "Claim it — pay the house " + (+o.price).toFixed(0) + " E⤴︎";
          b.addEventListener("click", function () {
            b.textContent = "Talking to the house…";
            claim(o.id).then(function () {
              if (window.MCC_TRACK) window.MCC_TRACK("house_claim", { offer: o.title, paid: +o.price });
              b.textContent = "🏠 CLAIMED — the house owes you one";
              b.disabled = true;
              msg.textContent = "It's on your record. The desk reaches out to book it — this is real.";
            }).catch(function (e) {
              b.textContent = "Claim it — pay the house " + (+o.price).toFixed(0) + " E⤴︎";
              msg.textContent = String(e && e.message || e);
            });
          });
          act.appendChild(b);
        } else {
          var short = (+o.price - earned).toFixed(0);
          act.innerHTML =
            '<p class="mp__note" style="margin:0 0 0.4rem"><b style="color:var(--cream)">You\'ve earned ' + earned.toFixed(0) +
            " E⤴︎ — " + short + " short.</b> The shelf is earned-only: stack it for real by completing deals, running " +
            '<a href="backend.html" style="color:#c99d45">the claim run</a>, or landing service pay. (Granted mission credit doesn\'t count here.)</p>' +
            '<a class="btn btn--ghost" style="width:100%;justify-content:center" href="market.html#yours">Open the desk — stack it</a>';
        }
        host.appendChild(card);
      });
    });
  }

  window.MCC_HOUSE = { shelf: shelf };
})();
