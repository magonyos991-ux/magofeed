/* Service Worker Magofeed — cache l'app shell pour un chargement instantané et un mode offline basique.
   Les données Firestore, la géocodification et les tuiles de carte restent toujours en direct (jamais mises en cache). */
const CACHE_NAME = "magofeed-v3";
/* Chemins RELATIFS au scope du service worker : fonctionne aussi bien a la racine
   d'un domaine (Netlify) que dans un sous-dossier (GitHub Pages /magofeed/).
   Les chemins absolus "/index.html" pointaient hors du sous-dossier sur GitHub
   Pages -> 404 -> le service worker ne s'installait jamais. */
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(APP_SHELL); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); }));
      })
      .then(function() { return self.clients.claim(); })
  );
});

function isLiveOnly(url) {
  return url.hostname.indexOf("googleapis.com") !== -1 ||
         url.hostname.indexOf("firebaseapp.com") !== -1 ||
         url.hostname.indexOf("firebasestorage.app") !== -1 ||
         url.hostname.indexOf("nominatim.openstreetmap.org") !== -1 ||
         url.hostname.indexOf("tile.openstreetmap.org") !== -1;
}

self.addEventListener("fetch", function(event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Firestore, géocodage, tuiles carte : toujours en réseau direct, jamais interceptés
  if (isLiveOnly(url)) return;

  // Navigation (ouverture de page) : réseau d'abord, repli sur le cache si hors-ligne
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function(res) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put("./index.html", copy); });
          return res;
        })
        .catch(function() { return caches.match("./index.html"); })
    );
    return;
  }

  // Même origine (app shell, icônes) : cache d'abord, réseau en secours + rafraîchissement silencieux
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        var network = fetch(req).then(function(res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
          }
          return res;
        }).catch(function() { return cached; });
        return cached || network;
      })
    );
    return;
  }

  // Ressources CDN (polices, Leaflet, Quagga) : stale-while-revalidate
  event.respondWith(
    caches.match(req).then(function(cached) {
      var network = fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
        return res;
      }).catch(function() { return cached; });
      return cached || network;
    })
  );
});
