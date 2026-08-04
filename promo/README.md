# Magofeed — Dossier promo / lancement

Tout le nécessaire pour teaser l'app avant sa sortie.

## Contenu

| Fichier | Rôle |
|---|---|
| `video-pub.html` | Vidéo animée **9:16** (Reels / TikTok / Stories), 6 scènes, lecture auto |
| `video-pub-16x9.html` | Vidéo animée **16:9** (YouTube / fil Facebook) |
| `bumper.html` | **Bumper 7 s** (accroche ultra-courte) |
| `video-tiktok-edm.html` | Variante **TikTok EDM** (~19 s, visuels synchronisés au beat) |
| `video-hook-8s.html` | Version **hook-first 8 s** (accroche dès l'image 1, sous-titres intégrés — pensée rétention) |
| `GUIDE-PUBLICATION.md` | **Pas-à-pas** pour publier + outils d'auto-post |
| `posters.html` | Gabarits des **visuels fixes** (story, carré, bannière) |
| `kit-reseaux.md` | **Légendes + hashtags + plan de diffusion** prêts à coller |
| `audio-engine.js` | **Bande-son générée** (Web Audio API) inline dans chaque vidéo HTML |
| `make-music.mjs` | Génère la musique en fichier **`.wav`** (montage / muxing MP4) |
| `render.mjs` | Exporte les vidéos en fichiers (WebM, ou MP4 **avec son** via `--mp4`) |
| `render-demo.mjs` | **Démo filmée de la vraie app** : l'app est pilotée puis l'écran enregistré |
| `render-posters.mjs` | Exporte les visuels fixes en **PNG** |
| `out/` | Fichiers générés (vidéos + images + `magofeed-theme.wav`) |

## Son 🔊

Chaque vidéo HTML embarque une **bande-son générée** (nappe chaude + arpège + « pings » radar
synchronisés aux scènes + carillon final), sans fichier externe. À l'ouverture, clique
**« Activer le son »** (les navigateurs bloquent l'autoplay audio).

Deux façons d'obtenir une vidéo **avec le son** :

1. **Capture d'écran de l'onglet** (avec l'audio de l'onglet activé) → le MP4 contient la musique.
2. **En local** : `node promo/make-music.mjs` puis `node promo/render.mjs --mp4`
   → la musique (`out/magofeed-theme.wav`) est automatiquement muxée dans le MP4 (ffmpeg requis).

Tu peux aussi importer `out/magofeed-theme.wav` directement dans ton logiciel de montage.

## Démo filmée de l'app 📱

`render-demo.mjs` ne fabrique pas d'animation : il **ouvre la vraie app**, la pilote
comme un utilisateur (accueil → recherche « Mogu » → carte des magasins → fiche →
confirmation d'un stock) et enregistre l'écran. C'est l'équivalent d'un screen
recording de téléphone, en 1080 × 2336.

```bash
node promo/render-demo.mjs           # -> out/magofeed-demo.mp4 + out/magofeed-demo-9x16.mp4
node promo/render-demo.mjs --shots   # captures PNG de chaque étape (pour régler le scénario)
node promo/render-demo.mjs --no-music # sans bande-son
```

Ce qu'il faut savoir :

- **Les magasins sont les vrais** : ils sont lus dans Firestore par l'API REST
  (lecture seule) et déposés dans le cache local de l'app. Aucune écriture n'est
  faite sur la base — la confirmation de stock filmée ne part donc pas en prod.
- La démo est calée sur **Bruxelles** (place de la Bourse) un après-midi, pour que
  les magasins soient ouverts. Change `CENTER`, `WHEN`, `QUERY` et `DRINK` en haut
  du fichier pour filmer une autre ville ou une autre boisson.
- Le compteur de points du profil reste à zéro : il vient du serveur, injoignable
  depuis un navigateur piloté. C'est pour ça que la démo s'arrête à la confirmation.
- Sur une machine sans sortie réseau directe pour le navigateur, `MAGOFEED_RELAY=1`
  fait passer les requêtes (fonds de carte, photos produits) par `curl`.

## Générer les fichiers

Prérequis : Node 18+, puis :

```bash
npm i playwright
npx playwright install chromium      # en local uniquement
```

Puis :

```bash
node promo/render-posters.mjs        # -> out/*.png
node promo/render.mjs                # -> out/*.webm
node promo/render.mjs --mp4          # -> out/*.webm + out/*.mp4 (ffmpeg requis)
```

> **WebM vs MP4** — WebM passe sur Facebook / YouTube / web. Pour Instagram & TikTok,
> fournis un **MP4 H.264** : lance `node promo/render.mjs --mp4` avec un `ffmpeg`
> complet installé (ex. `brew install ffmpeg`), ou convertis à la main :
> `ffmpeg -i out/magofeed-9x16.webm -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart out/magofeed-9x16.mp4`

## Poster

1. Choisis le format (9:16 vertical partout, 16:9 pour YouTube/FB desktop).
2. Récupère le **MP4** dans `out/` (ou le WebM si le réseau l'accepte).
3. Colle la légende depuis `kit-reseaux.md`, ajoute les hashtags, publie.
4. Teaser = pré-lancement : CTA « active la 🔔 / suis la page », pas de lien privé en bio.
