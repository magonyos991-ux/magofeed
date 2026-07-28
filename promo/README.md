# Magofeed — Dossier promo / lancement

Tout le nécessaire pour teaser l'app avant sa sortie.

## Contenu

| Fichier | Rôle |
|---|---|
| `video-pub.html` | Vidéo animée **9:16** (Reels / TikTok / Stories), 6 scènes, lecture auto |
| `video-pub-16x9.html` | Vidéo animée **16:9** (YouTube / fil Facebook) |
| `bumper.html` | **Bumper 7 s** (accroche ultra-courte) |
| `posters.html` | Gabarits des **visuels fixes** (story, carré, bannière) |
| `kit-reseaux.md` | **Légendes + hashtags + plan de diffusion** prêts à coller |
| `render.mjs` | Exporte les vidéos en fichiers (WebM, ou MP4 avec `--mp4`) |
| `render-posters.mjs` | Exporte les visuels fixes en **PNG** |
| `out/` | Fichiers générés (vidéos + images) |

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
