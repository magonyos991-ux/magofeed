# Reel « 4 magasins pour une canette » : le kit

Tout ce qui se fabrique sans caméra est ici. Le reste (filmer, enregistrer l'écran, choisir le son, publier), c'est le dossier de tournage qui le dit, plan par plan.

| Fichier | À quoi ça sert |
|---|---|
| `dossier-tournage.md` | Le dossier complet en 9 parties : hooks, script, texte à l'écran, légende, hashtags, son, plan B, erreurs, protocole commentaires. |
| `tournage.html` | La même chose en page pour le téléphone, avec cases à cocher, chronomètre des 60 minutes et boutons « Copier ». Publiée aussi comme artefact Claude. |
| `cartons/*.png` | Les 11 textes à l'écran, prêts à poser en superposition dans CapCut (1080x1920, fond transparent, police Anton, zones sûres Instagram respectées). Le nom du fichier porte le timecode. `06b` est la variante Guaraná. `00-couverture-titre` sert uniquement à la couverture. `GUIDE-zones-sures-NE-PAS-EXPORTER` se pose pour vérifier, puis se supprime. |
| `carrousel/*.png` | Les textes des 5 images du plan B (1080x1350, transparents), à poser sur tes photos dans Canva. |
| `montage.csv` | La timeline du montage : ordre, début, fin, durée, rush à utiliser, carton à poser. S'ouvre dans Numbers, Excel ou Google Sheets (séparateur point-virgule). |
| `textes-a-copier.txt` | Légende, hashtags, commentaire épinglé, DM, story, relances, six réponses types, réponses d'exploitation, phrases pour le comptoir. |
| `suivi-commentaires.xlsx` | Le tableau de l'étude de marché : une ligne par personne qui cite une canette (onglet Réponses), et le bilan automatique (canettes et quartiers les plus cités, chasses lancées, retours à faire). |

## Poser un carton dans CapCut

1. Superposition, puis Ajouter une superposition, puis choisir le PNG.
2. L'étirer pour qu'il couvre toute l'image (il fait déjà 1080x1920, il tombe juste).
3. Caler son début et sa fin sur le plan, selon `montage.csv`.
4. Un seul carton par magasin, affiché toute la durée du bloc.

## Règle qui ne bouge pas

Aucun chiffre d'utilisateurs, aucun faux témoignage, aucun magasin nommé comme ayant la canette sans que tu l'aies vue toi-même le jour du tournage.

## Regénérer les fichiers

```bash
pip install pillow openpyxl
# police Anton (licence OFL) : https://fonts.google.com/specimen/Anton
python3 promo/reel-4-magasins/generer-cartons.py /chemin/vers/Anton-Regular.ttf promo/reel-4-magasins
python3 promo/reel-4-magasins/generer-suivi.py promo/reel-4-magasins/suivi-commentaires.xlsx
```
