/* MCC_PUSH — the app taps YOU.
   One switch on the desk: register the worker, ask permission,
   subscribe with the platform's public key (served by push-send,
   which mints and vaults the keypair on first call), and bank the
   subscription in push_subs under the member's own account. iPhone
   rule: push only exists for the INSTALLED app — Add to Home Screen
   first, then the switch appears. */
(function () {
  "use strict";

  function b64ToBytes(b64) {
    var pad = "=".repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  window.MCC_PUSH = {
    ready: function () {
      return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    },
    state: function () {
      return window.Notification ? Notification.permission : "unsupported";
    },
    arm: function () {
      var S = window.MCC_SUPA;
      if (!window.MCC_PUSH.ready()) return Promise.resolve({ error: "unsupported" });
      if (!S || !S.token) return Promise.resolve({ error: "signed out" });
      return navigator.serviceWorker.register("sw.js").then(function () {
        return navigator.serviceWorker.ready;
      }).then(function (reg) {
        return Notification.requestPermission().then(function (perm) {
          if (perm !== "granted") throw new Error("denied");
          return fetch(S.url + "/functions/v1/push-send", {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + S.key },
            body: JSON.stringify({ action: "pubkey" }),
          }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
            if (!j || !j.pub) throw new Error("unarmed");
            return reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: b64ToBytes(j.pub),
            });
          });
        });
      }).then(function (sub) {
        return S.token().then(function (t) {
          if (!t) throw new Error("signed out");
          return fetch(S.url + "/rest/v1/push_subs", {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + t,
              Prefer: "resolution=merge-duplicates" },
            body: JSON.stringify({ endpoint: sub.endpoint, sub: sub.toJSON() }),
          }).then(function (r) {
            if (!r.ok && r.status !== 409) throw new Error("bank " + r.status);
            if (window.MCC_TRACK) window.MCC_TRACK("push_armed", {});
            return { ok: true };
          });
        });
      }).catch(function (e) {
        return { error: String((e && e.message) || e) };
      });
    },
  };
})();
