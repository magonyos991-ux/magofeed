"""Deux écrans de story (1080x1920) : « C'est quoi Magofeed ? » et « Soutenir le projet »."""
import sys
from PIL import Image, ImageDraw, ImageFont
FONTS = sys.argv[1]; OUT = sys.argv[2]
REC = '/home/user/magofeed/promo/reel-je-cherche-quelle-canette/out'
W, H = 1080, 1920
CREAM = (0xF2, 0xED, 0xE4); INK = (0x1A, 0x17, 0x14); GOLD = (0xC6, 0x9A, 0x57); MUTED = (0x6B, 0x62, 0x57); WHITE = (255, 255, 255)
APP = (42, 42, 727, 1670)
def F(name, s): return ImageFont.truetype(f'{FONTS}/{name}', s)
ANTON = lambda s: F('Anton-Regular.ttf', s); POPB = lambda s: F('Poppins-Bold.ttf', s); POPM = lambda s: F('Poppins-Medium.ttf', s)
def wrap(d, text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= maxw: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines
def para(d, x, y, text, f, maxw, fill=INK, lh=1.28):
    for ln in wrap(d, text, f, maxw):
        d.text((x, y), ln, font=f, fill=fill); y += int(f.size * lh)
    return y
def phone_piece(img, src, box, x, y, width, radius=56):
    """Pose un morceau d'écran (crop `box` de la capture 810x1752) dans un cadre arrondi."""
    piece = src.crop(box); h = int(piece.height * width / piece.width); piece = piece.resize((width, h), Image.LANCZOS)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.rounded_rectangle([x - 12, y - 12, x + width + 12, y + h + 12], radius=radius + 10, fill=INK + (255,))
    mask = Image.new('L', (width, h), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, width - 1, h - 1], radius=radius, fill=255)
    layer.paste(piece.convert('RGBA'), (x, y), mask); img.paste(layer, (0, 0), layer)
    return (x, y, width, h)
logo = Image.open('/home/user/magofeed/assets/icon-only.png').convert('RGB')

# ------------------------------------------------ écran 1 : c'est quoi
im = Image.new('RGB', (W, H), CREAM); d = ImageDraw.Draw(im)
im.paste(logo.resize((150, 150)), (80, 110))
d.text((255, 130), 'MAGOFEED', font=ANTON(84), fill=INK)
d.text((258, 222), 'app gratuite · sans pub · partout en Belgique', font=POPM(30), fill=MUTED)
y = para(d, 80, 340, "L'APP QUI TE DIT QUEL MAGASIN PRÈS DE TOI A LA BOISSON QUE TU CHERCHES.", ANTON(78), 920, lh=1.08) + 36
steps = [("Tu tapes la boisson.", "Ciao, Prime, Calypso, Ramune… 4 600 boissons dedans."),
         ("Elle te montre les magasins autour de toi qui l'ont.", "D'après les gens qui y sont passés, vérifié à moins de 500 m."),
         ("Personne l'a vue ? Tu lances une chasse.", "Les gens autour sont prévenus, celui qui la trouve gagne des points.")]
for i, (t, s) in enumerate(steps, 1):
    d.ellipse([80, y + 6, 150, y + 76], fill=INK); d.text((115, y + 41), str(i), font=ANTON(44), fill=GOLD, anchor='mm')
    yy = para(d, 180, y, t, POPB(36), 820, lh=1.22); yy = para(d, 180, yy + 2, s, POPM(29), 820, fill=MUTED, lh=1.3); y = yy + 34
src = Image.open(f'{REC}/mons/shot-03-carte-milkis.png').convert('RGB')
x0, y0, w0, h0 = APP
py = max(y + 20, 1180)
phone_piece(im, src, (x0, y0, x0 + w0, y0 + h0), W - 520 - 60, py, 520, radius=60)
d = ImageDraw.Draw(im)
para(d, 80, py + 40, "Ici : la carte pour une canette de Ciao Energy, à Mons.", POPB(30), 400, lh=1.25)
para(d, 80, py + 170, "Le pin vert, c'est un magasin où quelqu'un l'a vue en rayon.", POPM(27), 400, fill=MUTED, lh=1.3)
para(d, 80, py + 300, "Ça marche dans toute la Belgique.", POPB(30), 400, lh=1.25)
im.save(f'{OUT}/story-1-cest-quoi.png')

# ------------------------------------------------ écran 2 : soutenir
im = Image.new('RGB', (W, H), CREAM); d = ImageDraw.Draw(im)
im.paste(logo.resize((110, 110)), (80, 110)); d.text((215, 128), 'MAGOFEED', font=ANTON(60), fill=INK)
y = para(d, 80, 300, "SOUTENIR LE PROJET", ANTON(112), 920, lh=1.0) + 30
y = para(d, 80, y, "Une seule personne derrière, zéro pub, zéro budget. Deux façons d'aider.", POPM(33), 920, fill=MUTED, lh=1.35) + 40
def card(y, bg, fg, sub, k, title, big, line):
    h = 250
    d.rounded_rectangle([80, y, W - 80, y + h], radius=36, fill=bg)
    d.ellipse([120, y + 38, 192, y + 110], fill=fg); d.text((156, y + 74), k, font=ANTON(42), fill=bg, anchor='mm')
    d.text((225, y + 36), title, font=POPB(36), fill=fg); d.text((225, y + 92), big, font=ANTON(56), fill=fg); d.text((225, y + 170), line, font=POPM(28), fill=sub)
    return y + h + 28
y = card(y, INK, WHITE, (0xD9, 0xD2, 0xC5), '1', "Voir l'app et suivre", "@magofeed.app", "sur Instagram · instagram.com/magofeed.app")
y = card(y, GOLD, INK, (0x4a, 0x3a, 0x20), '2', "Un coup de pouce", "ko-fi.com/magofeed", "Même 2 €, ça compte. Merci.")
# le chemin dans l'app, avec la vraie feuille
y += 10
d.text((80, y), "Dans l'app, le bouton est là :", font=POPB(34), fill=INK); y += 64
path = [("Profil", "l'icône en bas à droite"), ("Soutenir le projet", "la ligne verte"), ("Donner un coup de main", "ça ouvre le Ko-fi")]
yy = y
for i, (t, s) in enumerate(path, 1):
    d.ellipse([80, yy + 4, 136, yy + 60], fill=GOLD); d.text((108, yy + 32), str(i), font=ANTON(34), fill=INK, anchor='mm')
    d.text((160, yy - 2), t, font=POPB(29), fill=INK); d.text((160, yy + 40), s, font=POPM(25), fill=MUTED); yy += 112
sheet = Image.open(f'{REC}/shot-03-don-feuille.png').convert('RGB')
# on repère le bouton vert dans la capture pour l'entourer
px_ = sheet.load(); gx0 = gy0 = 10**6; gx1 = gy1 = 0
for yy_ in range(900, 1700, 3):
    for xx_ in range(40, 770, 3):
        r, g, b_ = px_[xx_, yy_]
        if g > 95 and r < 60 and b_ < 110 and g - r > 50: gx0 = min(gx0, xx_); gy0 = min(gy0, yy_); gx1 = max(gx1, xx_); gy1 = max(gy1, yy_)
crop = (x0, 1000, x0 + w0, y0 + h0)
geo = phone_piece(im, sheet, crop, W - 400 - 60, y - 20, 400, radius=40)
d = ImageDraw.Draw(im)
sc = 400 / w0
bx0 = geo[0] + (gx0 - x0) * sc - 8; by0 = geo[1] + (gy0 - 1000) * sc - 8; bx1 = geo[0] + (gx1 - x0) * sc + 8; by1 = geo[1] + (gy1 - 1000) * sc + 8
d.rounded_rectangle([bx0, by0, bx1, by1], radius=18, outline=GOLD, width=6)
# flèche du texte « 3 » vers le bouton
ax, ay = 575, y + 2 * 112 + 28
d.line([(ax, ay), (bx0 - 16, (by0 + by1) / 2)], fill=GOLD, width=7)
d.polygon([(bx0 - 14, (by0 + by1) / 2), (bx0 - 44, (by0 + by1) / 2 - 18), (bx0 - 44, (by0 + by1) / 2 + 18)], fill=GOLD)
cy = H - 150
d.text((W / 2, cy - 60), "Les liens sont juste en dessous", font=POPB(32), fill=INK, anchor='mm')
d.line([(W / 2, cy - 10), (W / 2, cy + 60)], fill=INK, width=9); d.polygon([(W / 2 - 30, cy + 35), (W / 2 + 30, cy + 35), (W / 2, cy + 80)], fill=INK)
im.save(f'{OUT}/story-2-soutenir.png')
print('ok', (gx0, gy0, gx1, gy1))
