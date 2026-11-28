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
/* Cache a part, PERMANENT, pour les bibliotheques servies par un CDN (SDK
   Firebase 10.12.2, Leaflet 1.9.4, markercluster, Quagga, polices) : leur
   URL porte deja un numero de version et ne change jamais d'une mise en ligne
   de Magofeed a l'autre. Elles tombaient dans le cache estampille, efface a
   chaque activation : ~260 Ko compresses a retelecharger a chaque deploiement
   (jusqu'a 21 par jour), pour des octets identiques. */
const LIB_CACHE = "magofeed-lib-v1";
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
  /* nutrition.js et drinkart.js sont charges par index.html comme les autres
     mais manquaient ici : apres une mise a jour, le cache neuf ne les avait
     pas, et hors ligne l'app perdait le sucre, les calories et les dessins
     de bouteilles (mesure : « langueTable 0, nutrition absente » apres un
     cache renouvele sans reseau). */
  "./data/nutrition.js",
  "./data/drinkart.js",
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
      /* cache:"reload" : chaque fichier est pris AU RESEAU, jamais au cache
         HTTP du navigateur. GitHub Pages sert tout avec max-age=600, a la
         meme URL d'un deploiement a l'autre : dans les dix minutes qui
         suivent une mise en ligne, addAll en mode « default » remplissait le
         cache NEUF avec les fichiers de l'ANCIENNE version (mesure : 7
         fichiers sur 8 en version A dans le cache B — exactement la boucle
         « deployer, tester sur le telephone, corriger »). Reserve a
         l'install : sur le remplissage a chaud (plus bas), ce mode
         retelechargerait a chaque trou de cache. */
      .then(function(cache) {
        return cache.addAll(APP_SHELL.map(function(u) { return new Request(u, { cache: "reload" }); }));
      })
      /* Plus de skipWaiting ici. La version neuve reste « en attente » jusqu'a
         recevoir SKIP_WAITING (ecouteur message ci-dessous), que index.html
         envoie sur un geste (toast « touche pour redemarrer ») ou quand
         l'app passe en arriere-plan. Avant, elle prenait la main des
         l'install et index.html rechargeait la page 4 a 15 s apres
         l'ouverture, en pleine saisie : recherche tapee, prix, message —
         perdus, retour a l'accueil. Au tout premier lancement il n'y a pas
         d'ancienne version : le navigateur active celle-ci sans attendre. */
  );
});

self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        /* Seul le cache estampille de l'ancienne version part : les vignettes
           et les bibliotheques CDN ne dependent pas du code de l'app. */
        return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME && k !== IMG_CACHE && k !== LIB_CACHE; }).map(function(k) { return caches.delete(k); }));
      })
      .then(function() { return self.clients.claim(); })
  );
});

/* ── Page de secours : l'app n'est ni en cache ni joignable ──
   Cas reels : reseau coupe juste apres une mise a jour (cache neuf pas
   encore rempli), ou la « recuperation automatique » d'index.html qui vide
   les caches puis recharge, dans un magasin sans reseau. Avant, la promesse
   rejetait et le navigateur affichait sa propre page « site inaccessible »
   (chrome-error://), sans rien pour revenir dans l'app. Ici : une phrase, et
   un lien qui retente.

   La langue : le service worker n'a pas acces a localStorage, mais la page
   qu'il renvoie, si. Elle lit magolang (la cle de l'app) et choisit sa
   phrase dans la petite table ci-dessous, copie de data/textes.js — la vraie
   table n'est pas disponible, puisque c'est precisement le cas ou la
   coquille de l'app n'est pas en cache. */
const TEXTES_HORS_LIGNE = {
  fr: ["Hors ligne, et l’app n’est pas encore en cache. Réessaie avec du réseau.", "Réessayer"],
  ar: ["أنت غير متصل، والتطبيق ليس في الذاكرة المؤقتة بعد. أعد المحاولة عند توفر الشبكة.", "أعد المحاولة"],
  de: ["Offline, und die App ist noch nicht im Cache. Versuch es mit Netz noch einmal.", "Erneut versuchen"],
  en: ["Offline, and the app isn’t cached yet. Try again with a connection.", "Try again"],
  es: ["Sin conexión, y la app aún no está en caché. Reintenta con red.", "Reintentar"],
  it: ["Sei offline e l’app non è ancora in cache. Riprova con la rete.", "Riprova"],
  nl: ["Offline, en de app staat nog niet in de cache. Probeer opnieuw met netwerk.", "Opnieuw proberen"],
  pl: ["Brak sieci, a aplikacja nie jest jeszcze w pamięci podręcznej. Spróbuj ponownie z siecią.", "Spróbuj ponownie"],
  pt: ["Sem rede, e a app ainda não está em cache. Tenta de novo com rede.", "Tentar de novo"],
  tr: ["Çevrimdışısın ve uygulama henüz önbellekte değil. Ağ varken yeniden dene.", "Yeniden dene"],
  zh: ["当前离线，应用尚未缓存。请在有网络时重试。", "重试"]
};
function pageHorsLigne() {
  var fr = TEXTES_HORS_LIGNE.fr;
  var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Magofeed</title></head>'
    + '<body style="margin:0;background:#fbf7f0;color:#1a1714;font:16px/1.5 system-ui,-apple-system,sans-serif">'
    + '<p id="t" style="padding:40px 24px 8px">' + fr[0] + '</p>'
    + '<p style="padding:0 24px"><a id="r" href="./" style="color:inherit;font-weight:700">' + fr[1] + '</a></p>'
    + '<script>try{var T=' + JSON.stringify(TEXTES_HORS_LIGNE) + ',l=localStorage.getItem("magolang");'
    + 'if(T[l]){document.documentElement.lang=l;if(l==="ar")document.documentElement.dir="rtl";'
    + 'document.getElementById("t").textContent=T[l][0];document.getElementById("r").textContent=T[l][1];}}catch(e){}</script>'
    + '</body></html>';
  return new Response(html, { status: 503, statusText: "Hors ligne", headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function isLiveOnly(url) {
  return url.hostname.indexOf("googleapis.com") !== -1 ||
         url.hostname.indexOf("firebaseapp.com") !== -1 ||
         url.hostname.indexOf("firebasestorage.app") !== -1 ||
         url.hostname.indexOf("nominatim.openstreetmap.org") !== -1 ||
         url.hostname.indexOf("tile.openstreetmap.org") !== -1 ||
         url.hostname.indexOf("routing.openstreetmap.de") !== -1;
}

/* Quelques fichiers de meme origine doivent IGNORER le cache HTTP du
   navigateur quand on va les chercher. Pourquoi, mesure a l'appui :

   Au deploiement, outils/alleger-site.mjs vide data/textes.js et ecrit la
   vraie table de traduction dans data/textes.<langue>.js — un fichier par
   langue, qu'index.html injecte a l'execution (assurerLangue). Ces fichiers
   ne sont PAS dans APP_SHELL : APP_SHELL ne connait que la coquille vide.
   Ils arrivent donc ici, en cache d'abord, et au premier passage par le
   fetch ci-dessous.

   Or ce fetch etait nu, donc en mode de cache « default » : il pouvait etre
   satisfait par le cache HTTP du navigateur sans toucher au reseau. Et
   GitHub Pages estampille TOUT en « cache-control: max-age=600 » (mesure en
   direct sur le site), sans empreinte dans l'URL — un nouveau deploiement
   reutilise l'URL exacte. Resultat : une requete faite dans les dix minutes
   suivant un deploiement rendait l'ANCIEN fichier, et la ligne cache.put
   ci-dessous l'ecrivait dans le cache NEUF, ou il etait resservi jusqu'au
   deploiement d'apres. Une seule requete dans cette fenetre epinglait
   l'ancienne traduction pour toute la vie du nouveau deploiement.

   « reload » force le reseau et ignore le cache HTTP. On le reserve aux
   fichiers qui changent a chaque deploiement sans changer de nom : tout le
   reste garde le benefice du cache HTTP. La reponse est ensuite rangee sous
   la requete D'ORIGINE, donc rien ne change pour la lecture. */
function requeteFraiche(req, url) {
  if (!/\/data\/textes\.[a-z-]+\.js$/.test(url.pathname)) return req;
  try { return new Request(req.url, { cache: "reload" }); } catch (e) { return req; }
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
     l'installe, attend un geste ou la mise en arrière-plan de l'app (message
     SKIP_WAITING), prend la main, et index.html recharge la page (écouteur
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
        }).catch(function() {
          /* Reseau coupe ET rien en cache (ou le cache a ete vide entre la
             premiere lecture et ici) : une page lisible plutot que l'erreur
             du navigateur. On retente le cache une fois : un autre onglet a
             pu finir de l'installer entre-temps. */
          return caches.match("./index.html").then(function(c) { return c || pageHorsLigne(); });
        })
      );
    }
    return; // page de partage ou autre : réseau normal, on ne s'en mêle pas
  }

  // Coquille de l'app (css, data/*.js, icônes) : cache d'abord, même logique.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        return cached || fetch(requeteFraiche(req, url)).then(function(res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
          }
          return res;
        });
      }).catch(function() {
        /* Hors ligne et absent du cache : une erreur reseau franche, celle
           que la page recevrait sans service worker (ses fetch ont deja
           leur catch pour ca). Avant, la promesse rejetait sans rien dire :
           meme effet, plus une erreur de console par fichier. */
        return Response.error();
      })
    );
    return;
  }

  /* ── Vignettes produits (OpenFoodFacts) : cache dedie, BORNE ──
     Utile hors ligne et en rayon (reseau faible), mais jamais sans limite :
     apres chaque ajout, on compte, et au-dela de MAX_IMG on efface les plus
     anciennes entrees. Seules les reponses saines (res.ok, non opaques) sont
     gardees — une reponse opaque est comptee avec plusieurs Mo de marge dans
     le quota du navigateur.

     POURQUOI LA REQUETE EST REFAITE EN MODE CORS. Une <img> sans attribut
     crossorigin envoie une requete no-cors ; la reponse est alors OPAQUE, et
     la condition ci-dessous la refusait a chaque fois. Mesure : 0 entree
     dans ce cache apres des dizaines de vignettes vues — le cache existait,
     il ne rangeait rien. Open Food Facts envoie access-control-allow-origin:
     *, et une reponse cors peut repondre a une requete no-cors : on demande
     donc l'image en cors, on la range sous la requete d'origine, et l'<img>
     la recoit comme avant. Si le CDN cessait d'envoyer l'en-tete, la
     requete cors echoue et on retombe sur la requete telle quelle (opaque,
     affichee, pas rangee). Une vignette deja en cache est servie sans
     retoucher au reseau : l'URL OFF porte son numero de revision, l'image
     ne change pas. */
  if (url.hostname === "images.openfoodfacts.org") {
    event.respondWith(
      caches.match(req).then(function(cached) {
        if (cached) return cached;
        var reqCors;
        try { reqCors = new Request(req.url, { mode: "cors", credentials: "omit" }); } catch (e) { reqCors = req; }
        return fetch(reqCors).catch(function() { return fetch(req); }).then(function(res) {
          if (res && res.ok && res.type !== "opaque") {
            var copy = res.clone();
            caches.open(IMG_CACHE).then(function(cache) {
              return cache.put(req, copy).then(function() { return cache.keys(); }).then(function(keys) {
                if (keys.length > MAX_IMG) {
                  keys.slice(0, keys.length - MAX_IMG).forEach(function(k) { cache.delete(k); });
                }
              });
            }).catch(function() {});
          }
          return res;
        }).catch(function() { return Response.error(); });
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
            /* Dans LIB_CACHE, qui survit aux deploiements : une bibliotheque
               versionnee dans son URL n'a aucune raison de suivre le cycle
               de vie du code de l'app. */
            caches.open(LIB_CACHE).then(function(cache) { cache.put(req, copy); });
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
/* Ou va le tap sur une notification.

   FCM ne livre JAMAIS le lien sous une cle « url ». Il l'ecrit sous
   fcmOptions.link, ou sous notification.click_action selon la route d'envoi.
   Mesure faite dans le SDK que l'app telecharge elle-meme
   (firebase-messaging.js 10.12.2, fonction propagateFcmOptions) :

       const s = t.fcmOptions?.link ?? t.notification?.click_action

   Cette fonction lisait « n.url » puis « data.data.url » : deux cles qu'aucun
   envoi ne porte -- les data du serveur valent { type, drinkId, storeId }, pas
   d'url. Tous les taps retombaient donc sur "./", l'accueil, alors que le
   serveur prend soin d'envoyer « ...#store=<id> » (notifications-push.js:570).
   La fonctionnalite etait ecrite des deux cotes ; seule cette lecture manquait.

   Si tu retouches cette liste un jour, garde les deux premieres cles : ce sont
   les seules que FCM remplit. Les deux dernieres ne sont qu'un filet pour un
   envoi fait a la main. */
function destinationDuTap(data, n) {
  return (data.fcmOptions && data.fcmOptions.link)
      || (data.notification && data.notification.click_action)
      || n.url
      || (data.data && data.data.url)
      || "./";
}

self.addEventListener("push", function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  /* IL N'Y A PAS DE CLE « webpush » DANS CE QUI ARRIVE ICI, ET C'EST VERIFIE.
     Une version de ce fichier lisait data.webpush.notification, en croyant que
     le bloc « webpush » du serveur arrivait tel quel. Il n'arrive jamais : FCM
     l'APLATIT avant la livraison. Trois sources, toutes relues :
       - le service worker officiel de Google
         (gstatic.com/firebasejs/10.12.2/firebase-messaging-sw.js) teste
         « payload.notification » au premier niveau, et le mot « webpush »
         n'apparait pas une seule fois dans tout le fichier ;
       - l'interface MessagePayloadInternal du SDK ne connait que notification,
         data, fcmOptions, from, collapse_key et fcmMessageId ;
       - la reference REST de FCM dit que webpush.notification « override » les
         champs de la notification commune : il les REMPLACE, il ne s'ajoute
         pas a cote.
     Ce qui arrive ici porte donc toujours son titre au premier niveau, et le
     bloc webpush du serveur ne sert qu'a ajouter icone, badge et lien. Ne
     remets pas cette lecture : elle a fait croire a une panne qui etait
     ailleurs (un seul jeton push par compte, vole par le dernier appareil
     ouvert — voir outils-admin.js). */
  var n = data.notification || data.data || {};

  /* NE JAMAIS SORTIR SANS RIEN AFFICHER. L'ancienne ligne etait
       if (!n.title && !n.body) return;  // deja affiche par le navigateur
     et son commentaire etait FAUX : aucun navigateur n'affiche un message
     poussé tout seul, c'est toujours le service worker qui doit le faire.
     Une poussee qui n'affiche rien est une « poussee silencieuse » : Safari
     sur iPhone et Chrome la comptent comme un abus et finissent par retirer
     l'abonnement — donc plus aucune notification, et plus rien pour le dire.
     Les onze chemins d'envoi du projet portent tous un titre non vide, donc ce
     repli ne devrait jamais s'afficher ; il existe pour qu'une charge
     inattendue ne casse pas le canal. */
  var titre = n.title || "Magofeed";
  var corps = n.body || "";
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: corps,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: destinationDuTap(data, n) }
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
