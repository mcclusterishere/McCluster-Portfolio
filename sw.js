/* McCluster PWA service worker.
   Strategy:
   - HTML navigations: network-first (so pushed edits show up immediately),
     falling back to the cached page when offline.
   - Same-origin assets (css/js/fonts/img/frames/audio): stale-while-revalidate,
     so the first view caches them and every visit after is instant + offline,
     while a fresh copy is fetched in the background for next time.
   Bump CACHE_VERSION to force-clear old caches on a major change. */
const CACHE_VERSION = "mccluster-v3";
const OFFLINE_FALLBACK = "./offline.html";

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (c) {
      // seed the shell so a cold offline open still works
      return c.addAll(["./", "./index.html", "./offline.html", "./assets/img/m-mark.png"]).catch(function () {});
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting") self.skipWaiting();
});

/* push: the app's ear when every tab is closed. A tap opens (or
   focuses) the app at the room the message names. */
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || "Equity Uprise", {
    body: d.body || "",
    icon: "./assets/img/icon-192.png",
    badge: "./assets/img/icon-192.png",
    data: { url: d.url || "./market.html" },
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./market.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (ws) {
    for (var i = 0; i < ws.length; i++) {
      if ("focus" in ws[i]) { if (ws[i].navigate) ws[i].navigate(url); return ws[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let analytics/CDN pass through

  // HTML navigations: network-first for live updates, cache as offline fallback
  if (req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") !== -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          // best cached copy first, then the shell, then the offline page
          return hit || caches.match("./index.html").then(function (shell) {
            return shell || caches.match(OFFLINE_FALLBACK);
          });
        });
      })
    );
    return;
  }

  // assets: stale-while-revalidate
  e.respondWith(
    caches.match(req).then(function (hit) {
      var fetchPromise = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || fetchPromise;
    })
  );
});
