/* Service Worker Magofeed — cache l'app shell pour un chargement instantané et un mode offline basique.
   Les données Firestore, la géocodification et les tuiles de carte restent toujours en direct (jamais mises en cache). */
/* © 2026 Magofeed — Tous droits réservés. Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. Antériorité : historique Git horodaté. */
const CACHE_NAME = "magofeed-v11";
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
         url.hostname.indexOf("tile.openstreetmap.org") !== -1 ||
         url.hostname.indexOf("basemaps.cartocdn.com") !== -1 ||
         url.hostname.indexOf("routing.openstreetmap.de") !== -1;
}

self.addEventListener("fetch", function(event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Firestore, géocodage, tuiles carte : toujours en réseau direct, jamais interceptés
  if (isLiveOnly(url)) return;

  // Navigation (ouverture de page) : réseau d'abord, MAIS 2,5 s maximum.
  /* Avant : sans limite de temps. Sur wifi captif ou signal faible, ce fetch
     pouvait pendre 30-60 s : index.html n'etait jamais livre et l'iPhone
     affichait l'ecran de lancement de la PWA (fond #1a1714) = la "page noire".
     Maintenant : si le reseau n'a pas repondu en 2,5 s et qu'on a l'app en
     cache, on ouvre depuis le cache et le reseau continue de rafraichir. */
  if (req.mode === "navigate") {
    event.respondWith(new Promise(function(resolve) {
      var settled = false;
      var timer = setTimeout(function() {
        if (settled) return;
        caches.match("./index.html").then(function(hit) {
          if (settled || !hit) return;   // pas de cache : on laisse le reseau finir
          settled = true; resolve(hit);
        });
      }, 2500);
      fetch(req).then(function(res) {
        clearTimeout(timer);
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put("./index.html", copy); });
        if (!settled) { settled = true; resolve(res); }
      }).catch(function() {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve(caches.match("./index.html").then(function(hit) { return hit || Response.error(); }));
      });
    }));
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

/* ── Push notifications (FCM) ──
   La Cloud Function envoie un payload "notification" webpush : le navigateur
   l'affiche même sans handler, mais on gère quand même push + clic pour
   couvrir les payloads "data" et ouvrir directement la fiche de la boisson. */
self.addEventListener("push", function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  var n = data.notification || data.data || {};
  if (!n.title && !n.body) return; // payload notification natif : déjà affiché par le navigateur
  event.waitUntil(
    self.registration.showNotification(n.title || "Magofeed", {
      body: n.body || "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: n.url || (data.data && data.data.url) || "./" }
    })
  );
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) { list[i].navigate(url); return list[i].focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
