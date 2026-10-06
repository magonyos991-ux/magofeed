"""Génère les cartons texte du Reel « 4 magasins pour une canette » (PNG transparents
1080x1920 pour CapCut) et les textes du carrousel plan B (1080x1350).

Règles appliquées (dossier de tournage, section 2 et erreur 3) :
- police Anton, blanc gras à contour noir, ombre douce ;
- zone sûre Reel : texte entre y=270 et y=1250, jamais dans les 120 px de droite ;
- deux lignes maximum, trois pour le carton plein cadre et la promesse ;
- la chute seule sur bandeau crème #f4f2ee, texte noir #1a1714.
"""
import os, sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(os.path.join(OUT, 'cartons'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'carrousel'), exist_ok=True)

WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)
INK = (0x1a, 0x17, 0x14, 255)
CREAM = (0xf4, 0xf2, 0xee, 255)


def fit_font(lines, max_size, max_w, min_size=80):
    size = max_size
    while size > min_size:
        f = ImageFont.truetype(FONT, size)
        if max(f.getlength(l) for l in lines) <= max_w:
            return f, size
        size -= 4
    return ImageFont.truetype(FONT, min_size), min_size


def draw_block(img, lines, cx, cy, max_size, max_w, fill=WHITE, stroke=BLACK, shadow=True, gap=0.10, sw=None):
    """Dessine un bloc de lignes centrées en (cx, cy). Retourne (y_haut, y_bas, taille)."""
    f, size = fit_font(lines, max_size, max_w)
    sw = max(6, size // 16) if sw is None else sw
    lh = int(size * 1.02)
    total = lh * len(lines) + int(lh * gap) * (len(lines) - 1)
    y0 = cy - total // 2
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    y = y0
    for l in lines:
        w = f.getlength(l)
        x = int(cx - w / 2)
        d.text((x, y), l, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke, anchor='la')
        y += lh + int(lh * gap)
    if shadow:
        sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        y = y0
        for l in lines:
            w = f.getlength(l)
            x = int(cx - w / 2)
            sd.text((x + 6, y + 10), l, font=f, fill=(0, 0, 0, 170), stroke_width=sw, stroke_fill=(0, 0, 0, 170), anchor='la')
            y += lh + int(lh * gap)
        sh = sh.filter(ImageFilter.GaussianBlur(14))
        img.alpha_composite(sh)
    img.alpha_composite(layer)
    return y0, y0 + total, size


def bbox_opaque(img, thresh=40):
    a = img.split()[-1].point(lambda v: 255 if v > thresh else 0)
    return a.getbbox()


# ---------------------------------------------------------------- Reel 1080x1920
W, H = 1080, 1920
CX = 505          # centre décalé : on évite la colonne d'icônes à droite (120 px)
MAXW = 850        # texte entre x=80 et x=930 ; contour + ombre restent sous x=960
report = []

CARTONS = [
    ('00-couverture-titre',        ['4 magasins', 'pour une', 'canette.'],        760, 170),
    ('01-hook-0000-0002',          ['4 magasins', 'pour une', 'canette.'],        600, 170),
    ('02-magasin1-0002-0003',      ['Magasin 1.', 'Rien.'],                       560, 215),
    ('03-magasin2-0003-0005.5',    ['Magasin 2.', 'Rien.'],                       560, 215),
    ('04-magasin3-0005.5-0007.5',  ['Magasin 3.', 'Toujours rien.'],              560, 215),
    ('05-flash-0007.5-0008.7',     ['Rien.', 'Rien.', 'Rien.'],                   640, 215),
    ('06-bruxelles-0008.7-0010',   ['Bruxelles.', '3 magasins.', '0 Milkis.'],    760, 260),
    ('06b-bruxelles-guarana',      ['Bruxelles.', '3 magasins.', '0 Guaraná.'],   760, 260),
    ('07-magofeed-0010-0013',      ['Magofeed dit :', 'magasin 4.'],              760, 215),
    ('08-magasin4-0013-0014',      ['Magasin 4.'],                                560, 215),
    ('09-elle-est-la-0014-0017',   ['Elle est là.'],                              560, 215),
    ('10-le-prochain-0017-0019.5', ['Le prochain', 'qui la cherche :', '1 magasin.'], 600, 190),
]

for name, lines, cy, mx in CARTONS:
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    y0, y1, size = draw_block(img, lines, CX, cy, mx, MAXW)
    img.save(os.path.join(OUT, 'cartons', name + '.png'))
    bb = bbox_opaque(img)
    report.append({'fichier': name, 'taille_police': size, 'bbox': bb,
                   'ok_zone_sure': bb[1] >= 270 and bb[3] <= 1250 and bb[2] <= 960})

# La chute : voile sombre 40 %, bandeau crème, texte noir.
img = Image.new('RGBA', (W, H), (0, 0, 0, 102))  # 40 % de noir
d = ImageDraw.Draw(img)
lines = ['Et toi, laquelle', 'tu trouves jamais ?']
f, size = fit_font(lines, 170, 960)
lh = int(size * 1.02)
total = lh * 2 + int(lh * 0.10)
band_h = total + 120
band_cy = 840
d.rectangle([0, band_cy - band_h // 2, W, band_cy + band_h // 2], fill=CREAM)
draw_block(img, lines, 540, band_cy, 170, 960, fill=INK, stroke=INK, shadow=False, sw=0)
img.save(os.path.join(OUT, 'cartons', '11-chute-0019.5-0021.png'))
report.append({'fichier': '11-chute-0019.5-0021', 'taille_police': size,
               'bbox': (0, band_cy - band_h // 2, W, band_cy + band_h // 2),
               'ok_zone_sure': band_cy - band_h // 2 >= 270 and band_cy + band_h // 2 <= 1250})

# Guide des zones sûres : à poser sur la timeline pour vérifier, puis à SUPPRIMER.
g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(g)
red = (220, 40, 40, 90)
gd.rectangle([0, 0, W, 270], fill=red)           # haut : nom du compte
gd.rectangle([0, 1250, W, H], fill=red)          # bas : légende + son
gd.rectangle([960, 0, W, 1250], fill=red)        # droite : colonne des boutons
gd.rectangle([0, 240, W, 1680], outline=(0xe5, 0xa9, 0x3a, 255), width=6)  # rectangle 3:4 de la grille
fg = ImageFont.truetype(FONT, 54)
gd.text((60, 1300), 'GUIDE ZONES SÛRES', font=fg, fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=BLACK)
gd.text((60, 1370), 'À SUPPRIMER AVANT EXPORT', font=fg, fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=BLACK)
gd.text((60, 1440), 'rouge = recouvert par Instagram', font=ImageFont.truetype(FONT, 40), fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=BLACK)
gd.text((60, 1500), 'cadre doré = ce que montre la grille du profil', font=ImageFont.truetype(FONT, 40), fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=BLACK)
g.save(os.path.join(OUT, 'cartons', 'GUIDE-zones-sures-NE-PAS-EXPORTER.png'))

# ---------------------------------------------------------------- Carrousel 1080x1350
CW, CH = 1080, 1350
CCX, CMAXW = 540, 960
CARR = [
    ('image-1', [(['4 magasins', 'pour une canette.'], 675, 200)]),
    ('image-2', [(['Rien.'], 225, 150), (['Rien.'], 675, 150), (['Rien.'], 1125, 150)]),
    ('image-3', [(['Magofeed dit :', 'magasin 4.'], 1060, 150)]),
    ('image-4', [(['Elle est là.'], 270, 170), (['Le prochain', 'qui la cherche :', '1 magasin.'], 1040, 120)]),
    ('image-5', [(['Et toi, laquelle', 'tu trouves jamais ?'], 560, 170), (['Canette + quartier,', 'en commentaire.'], 1090, 110)]),
]
for name, blocks in CARR:
    img = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    for lines, cy, mx in blocks:
        draw_block(img, lines, CCX, cy, mx, CMAXW)
    img.save(os.path.join(OUT, 'carrousel', name + '-texte.png'))
    report.append({'fichier': 'carrousel/' + name, 'bbox': bbox_opaque(img)})

print(json.dumps(report, ensure_ascii=False, indent=1))
