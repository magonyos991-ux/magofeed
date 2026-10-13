# Reel « Je cherche quelle canette ensuite ? »

Vidéo verticale de 34 s dans le style de la vidéo @prayerplaces (110 000 vues) : un déclencheur vécu, « je la trouve où ? », l'app qui répond, la fiche qui coche, la chasse, « j'ai commencé par Bruxelles », lien en bio, et la question qui fait commenter.

`out/reel-je-cherche-quelle-canette.mp4` est la vidéo finie, voix off incluse.

## Ce qu'il y a dedans, et d'où ça vient

| Élément | Source | À savoir |
|---|---|---|
| Écrans de l'app | La vraie app (`index.html`), pilotée par Playwright et filmée. | Les magasins sont des magasins de démo aux noms génériques (« Night shop », « Épicerie du coin », « Supérette asiatique », « Supermarché ») : aucun commerce réel n'est montré comme ayant une boisson. La carte de Bruxelles affiche les vrais magasins référencés dans la base (lecture seule), sans aucune boisson. Firestore est coupé pendant le tournage ; la chasse est simulée localement. |
| Voix off | Synthèse Piper, voix `fr_FR-tom` (jeu de données sous AGPL ; la voix produite est libre d'usage). | Si tu préfères ta voix, enregistre les dix phrases de `fabriquer-voix.py` dans CapCut et pose-les sur les mêmes timecodes (`out/voix/timeline.json`). |
| Images de rue | Mixkit (licence Mixkit, gratuite, usage commercial, sans attribution) : clips 3456 et 4451. | Ce n'est pas Bruxelles. Pour la version publiée, remplace-les par 10 s de ta rue le soir et 12 s d'une rue avec des devantures : mêmes noms de dossiers, puis relance le script. |
| Sous-titres, bulles, coches, badges | Générés image par image (Pillow). Police Poppins (OFL). | Le mot-clé de chaque phrase est en doré, comme dans la référence. |

Aucun chiffre d'utilisateurs, aucun témoignage, aucun magasin nommé. Les seuls textes d'écran sont ceux de l'app.

## Refabriquer

```bash
pip install pillow piper-tts faster-whisper
# police Anton/Poppins (Google Fonts, OFL) dans un dossier <polices>, voix Piper fr_FR-tom-medium.onnx
node enregistrer-ecrans.mjs              # out/ecrans.webm + out/etapes.json (écrans de l'app)
node enregistrer-ecrans.mjs --bruxelles  # out/bruxelles.webm (carte de la ville)
ffmpeg -i out/ecrans.webm -vf fps=30 -q:v 3 out/frames-app/%05d.jpg      # idem bruxelles, rue-old, rue-shops
python3 fabriquer-voix.py <fr_FR-tom-medium.onnx> out                     # out/voix/
python3 fabriquer-video.py out <polices> --apercu                         # planche de contrôle
python3 fabriquer-video.py out <polices>                                  # la vidéo
```

Le minutage du montage se règle dans `fabriquer-video.py` (repères `APP`, `BXL`, `CARD`) ; le texte de la voix dans `fabriquer-voix.py` (liste `BEATS`).
