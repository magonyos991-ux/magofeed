# Sources des cartes « Boisson du jour »

Chaque carte de `promo/cards/` est generee a partir d'une illustration
vectorielle de la bouteille (`bottles/bottle-<slug>.svg`) posee sur le
gabarit commun (`make-cards.py`). Aucune photo : tout est dessine, donc
aucun droit d'auteur a payer ni a craindre.

Regenerer (Node 18+ et Playwright requis) :

    python3 make-cards.py            # ecrit card-<slug>.html
    # puis capturer chaque HTML en 1080x1350 JPEG (voir promo/render.mjs)

Pour ajouter une boisson : dessiner `bottles/bottle-<slug>.svg` (canevas
900x1400, bouteille centree sur x=450), ajouter la ligne dans DRINKS de
make-cards.py, et ajouter le slug au MENU du workflow n8n.
