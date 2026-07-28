# Guide de publication — Magofeed (teaser)

Pas-à-pas pour publier toi-même le teaser. Compte ~10 min la première fois.

---

## 0. Préparer le fichier vidéo (MP4)

Les réseaux veulent un **.mp4**. Deux méthodes :

**A. Enregistrement d'écran (le plus simple, garde le son)**
1. Ouvre la vidéo (`video-pub.html`, `video-tiktok-edm.html`, …) en plein écran.
2. Clique **« Activer le son »**.
3. Lance l'enregistreur d'écran **avec l'audio de l'onglet activé** :
   - iPhone : Centre de contrôle → bouton Enregistrement.
   - Android : Enregistreur d'écran (pense à activer « son interne »).
   - Mac : `⇧⌘5` → Enregistrer (coche le micro/son système).
   - Windows : `Win+G` (Xbox Game Bar) ou l'app Capture.
4. Laisse tourner un cycle complet, arrête, recadre si besoin.

**B. Rendu automatique (qualité nette, en local)**
```bash
npm i playwright && npx playwright install chromium
node promo/make-music.mjs
node promo/render.mjs --mp4     # -> promo/out/*.mp4 avec la musique
```

---

## 1. TikTok
1. App TikTok → **+** (créer) → **Importer** → choisis le MP4 (idéal : `magofeed-tiktok-edm`).
2. Ajoute un **texte d'accroche** en haut dès la 1ʳᵉ seconde (voir hooks ci-dessous).
3. Colle la **légende + hashtags** (fichier `kit-reseaux.md`).
4. Épingle un commentaire : « Dispo bientôt — dis-nous ta boisson 👇 ».
5. Publie (ou programme via l'outil créateur).

## 2. Instagram
**Reel :** + → **Reel** → importe le MP4 (9:16) → légende depuis `kit-reseaux.md` → hashtags en 1ᵉʳ commentaire → Partager.
**Story :** + → **Story** → importe `story-1080x1920.png` ou le MP4 → ajoute un **sticker compte à rebours** (« Lancement ») + sticker sondage → Publier.

## 3. Facebook
Page Magofeed → **Créer une publication** (ou **Reel**) → importe le MP4 → colle le texte FB de `kit-reseaux.md` → **Publier**. (Le WebM passe aussi sur Facebook si tu ne veux pas convertir.)

## 4. YouTube Shorts
Créer → **Importer une vidéo** → MP4 vertical → titre + description de `kit-reseaux.md` → visibilité **Public** → Publier.

---

## 5. Trois hooks à tester (version EDM)

À écrire en gros texte sur la 1ʳᵉ seconde :
1. **« POV : ta boisson est en rupture PARTOUT 😩 »**
2. **« Arrête de faire 4 magasins pour 1 bouteille. »**
3. **« L'app qui sait quel magasin a ta boisson (avant toi). »**

> Sur TikTok, publie la **même vidéo** avec ces 3 hooks différents à quelques jours d'intervalle : c'est l'accroche qu'on teste, pas la vidéo.

---

## 6. Programmer / automatiser les publications

Pour publier sur plusieurs réseaux d'un coup ou à l'avance, sans le faire à la main :

| Outil | Réseaux | Notes |
|---|---|---|
| **Meta Business Suite** (gratuit) | Facebook + Instagram | Le plus direct pour ces deux-là. Planifie Reels & Stories. |
| **Buffer** (free/payant) | IG, FB, TikTok, YouTube, X… | Simple, bon calendrier. |
| **Later** | IG, TikTok, FB, Pinterest | Fort sur le visuel/Stories. |
| **Metricool** | multi + stats | Bon rapport analytics/prix. |

**Mise en place (exemple Buffer) :**
1. Crée un compte sur l'outil.
2. **Connecte tes comptes** Magofeed (tu autorises l'accès depuis TES identifiants — cette étape t'appartient).
3. Charge le MP4 + colle la légende, choisis la date/heure.
4. Programme sur les créneaux du plan de diffusion (`kit-reseaux.md`).

> ⚠️ Ces connexions se font **avec tes propres identifiants**, côté toi. Aucun assistant ne peut poster à ta place sans que tu aies connecté explicitement l'un de ces outils à tes comptes.
