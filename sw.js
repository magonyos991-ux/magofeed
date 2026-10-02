/* Service Worker Magofeed — cache l'app shell pour un chargement instantané et un mode offline basique.
   Les données Firestore, la géocodification et les tuiles de carte restent toujours en direct (jamais mises en cache). */
/* © 2026 Magofeed — Tous droits réservés. Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. Antériorité : historique Git horodaté. */
/* VERSION DU CACHE — remplacée automatiquement au déploiement par l'empreinte
   du commit (voir .github/workflows/pages.yml).

   Avant, cette ligne se changeait à la main : 14 fois en 8 jours, et deux
   commits pour réparer les oublis (« les changements de la fiche magasin
   doivent arriver »). C'est cet oubli-là qui avait imposé le mode « réseau
   d'abord » : par sécurité, l'app attendait le réseau à chaque lancement,
   même quand une copie valide dormait déjà dans le cache. Sur une mauvaise
   connexion, c'est plusieurs secondes d'écran d'attente pour rien.

   Le numéro de version n'étant plus écrit par un humain, il ne peut plus être
   oublié : chaque déploiement produit un cache neuf, l'ancien est effacé, et
   l'app peut enfin repartir du cache — c'est-à-dire s'ouvrir instantanément.

   La valeur ci-dessous n'est utilisée qu'en local (fichier non déployé). */
const CACHE_NAME = "magofeed-__BUILD_ID__";
/* Cache a part pour les vignettes produits (images.openfoodfacts.org) :
   il survit aux deploiements (une vignette ne change pas avec le code) et
   il est BORNE — au-dela de MAX_IMG entrees, les plus anciennes partent.
   Avant, ces images tombaient dans le cache attrape-tout, sans limite ni
   purge : en balade sur la carte, le stockage grossissait a vie. */
const IMG_CACHE = "magofeed-img-v1";
const MAX_IMG = 300;
/* Chemins RELATIFS au scope du service worker : fonctionne aussi bien a la racine
   d'un domaine (Netlify) que dans un sous-dossier (GitHub Pages /magofeed/).
   Les chemins absolus "/index.html" pointaient hors du sous-dossier sur GitHub
   Pages -> 404 -> le service worker ne s'installait jamais. */
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./data/drinks.js",
  "./data/enseignes.js",
  "./data/alcool.js",
  "./data/state.js",
  "./data/textes.js",
  "./data/alias.js",
  "./data/ui.js",
  "./data/i18n.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

/* Chemin de la racine de l'app ("/" ou "/magofeed/"). Sert à distinguer
   l'application des pages de partage /f/<id>.html, qui vivent dans le même
   scope mais sont des pages à part entière. */
const APP_ROOT = new URL("./", self.location).pathname;

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
        return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME && k !== IMG_CACHE; }).map(function(k) { return caches.delete(k); }));
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
         url.hostname.indexOf("routing.openstreetmap.de") !== -1;
}

self.addEventListener("fetch", function(event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Firestore, géocodage, tuiles carte : toujours en réseau direct, jamais interceptés
  if (isLiveOnly(url)) return;

  /* ── OUVERTURE DE L'APP : le cache d'abord, donc instantanée ──────────────
     Le cache porte l'empreinte du commit : il contient TOUJOURS une version
     entière et cohérente de l'app (index.html + css + data/), jamais un
     mélange. Une mise en ligne crée un cache neuf ; le service worker
     l'installe, prend la main, et index.html recharge la page (écouteur
     "controllerchange"). Personne ne reste bloqué sur une vieille version, et
     plus personne n'attend 306 Ko pour voir l'écran d'accueil.

     ATTENTION : seule la RACINE est l'app. Les pages de partage
     /f/<id>.html sont dans le même scope ; les servir depuis le cache de
     l'app renverrait l'application à la place de l'aperçu — et l'ancienne
     version écrasait carrément l'index.html mis en cache avec le contenu de
     la page de partage, ce qui cassait le mode hors-ligne dès qu'on avait
     ouvert un lien partagé. */
  if (req.mode === "navigate") {
    if (url.pathname.replace(/index\.html$/, "") === APP_ROOT) {
      event.respondWith(
        caches.match("./index.html").then(function(cached) {
          return cached || fetch(req).then(function(res) {
            if (res && res.status === 200) {
              var copy = res.clone();
              caches.open(CACHE_NAME).then(function(cache) { cache.put("./index.html", copy); });
            }
            return res;
          });
        })
      );
    }
    return; // page de partage ou autre : réseau normal, on ne s'en mêle pas
  }

  // Coquille de l'app (css, data/*.js, icônes) : cache d'abord, même logique.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        return cached || fetch(req).then(function(res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  /* ── Vignettes produits (OpenFoodFacts) : cache dedie, BORNE ──
     Utile hors ligne et en rayon (reseau faible), mais jamais sans limite :
     apres chaque ajout, on compte, et au-dela de MAX_IMG on efface les plus
     anciennes entrees. Seules les reponses saines (res.ok, non opaques) sont
     gardees — une reponse opaque est comptee avec plusieurs Mo de marge dans
     le quota du navigateur. */
  if (url.hostname === "images.openfoodfacts.org") {
    event.respondWith(
      caches.match(req).then(function(cached) {
        var network = fetch(req).then(function(res) {
          if (res && res.ok && res.type !== "opaque") {
            var copy = res.clone();
            caches.open(IMG_CACHE).then(function(cache) {
              cache.put(req, copy).then(function() {
                cache.keys().then(function(keys) {
                  if (keys.length > MAX_IMG) {
                    keys.slice(0, keys.length - MAX_IMG).forEach(function(k) { cache.delete(k); });
                  }
                });
              });
            });
          }
          return res;
        }).catch(function() { return cached; });
        return cached || network;
      })
    );
    return;
  }

  /* ── Ressources CDN (Leaflet, Quagga, Firebase SDK, polices) :
     stale-with-revalidate, mais UNIQUEMENT pour ces hotes connus. Avant,
     cette branche attrapait TOUT le reste (reponses JSON OpenFoodFacts, et
     surtout les reponses Overpass — jusqu'a 800 magasins par zone visitee) :
     cache sans limite ni expiration, qui grossissait a chaque balade sur la
     carte. Tout hote non liste part desormais en reseau direct. */
  var CDN_OK = ["cdnjs.cloudflare.com", "www.gstatic.com", "fonts.gstatic.com", "unpkg.com", "cdn.jsdelivr.net"];
  if (CDN_OK.indexOf(url.hostname) !== -1) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        var network = fetch(req).then(function(res) {
          if (res && res.ok && res.type !== "opaque") {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
          }
          return res;
        }).catch(function() { return cached; });
        return cached || network;
      })
    );
  }
  // Tout autre hote (API OpenFoodFacts, Overpass...) : reseau direct, rien en cache.
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
