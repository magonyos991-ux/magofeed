"""Deux écrans de story (1080x1920) : « C'est quoi Magofeed ? » et « Soutenir le projet »."""
import sys
from PIL import Image, ImageDraw, ImageFont
FONTS = sys.argv[1]; OUT = sys.argv[2]
W, H = 1080, 1920
CREAM = (0xF2, 0xED, 0xE4); INK = (0x1A, 0x17, 0x14); GOLD = (0xC6, 0x9A, 0x57); MUTED = (0x6B, 0x62, 0x57); WHITE = (255, 255, 255)
def F(name, s): return ImageFont.truetype(f'{FONTS}/{name}', s)
ANTON = lambda s: F('Anton-Regular.ttf', s)
POP = lambda s: F('Poppins-SemiBold.ttf', s)
POPB = lambda s: F('Poppins-Bold.ttf', s)
POPM = lambda s: F('Poppins-Medium.ttf', s)

def wrap(d, text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= maxw: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines
def para(d, x, y, text, f, maxw, fill=INK, lh=1.28, align='left'):
    for ln in wrap(d, text, f, maxw):
        xx = x if align == 'left' else x + (maxw - d.textlength(ln, font=f)) / 2
        d.text((xx, y), ln, font=f, fill=fill); y += int(f.size * lh)
    return y

# ------------------------------------------------ écran 1 : c'est quoi
im = Image.new('RGB', (W, H), CREAM); d = ImageDraw.Draw(im)
logo = Image.open('/home/user/magofeed/assets/icon-only.png').convert('RGB').resize((150, 150))
im.paste(logo, (80, 110))
d.text((255, 130), 'MAGOFEED', font=ANTON(84), fill=INK)
d.text((258, 222), 'app gratuite · sans pub', font=POPM(30), fill=MUTED)
y = 340
y = para(d, 80, y, "L'APP QUI TE DIT QUEL MAGASIN PRÈS DE TOI A LA BOISSON QUE TU CHERCHES.", ANTON(78), 920, lh=1.08)
y += 36
steps = [("Tu tapes la boisson.", "Ciao, Prime, Calypso, Ramune… 4 600 boissons dedans."),
         ("Elle te montre les magasins autour de toi qui l'ont.", "D'après les gens qui y sont passés, vérifié à moins de 500 m."),
         ("Personne l'a vue ? Tu lances une chasse.", "Les gens autour sont prévenus, celui qui la trouve gagne des points.")]
for i, (t, s) in enumerate(steps, 1):
    d.ellipse([80, y + 6, 150, y + 76], fill=INK)
    d.text((115, y + 41), str(i), font=ANTON(44), fill=GOLD, anchor='mm')
    yy = para(d, 180, y, t, POPB(36), 820, lh=1.22)
    yy = para(d, 180, yy + 2, s, POPM(29), 820, fill=MUTED, lh=1.3)
    y = yy + 34
# téléphone en bas à droite : la carte qui répond
shot = Image.open('/home/user/magofeed/promo/reel-je-cherche-quelle-canette/out/story/story-carte-brut.png').convert('RGB')
pw = 520; ph = int(shot.height * pw / shot.width); shot = shot.resize((pw, ph), Image.LANCZOS)
px, py = W - pw - 60, max(y + 20, 1180)
frame = Image.new('RGBA', (W, H), (0, 0, 0, 0)); fd = ImageDraw.Draw(frame)
fd.rounded_rectangle([px - 14, py - 14, px + pw + 14, py + ph + 14], radius=70, fill=INK + (255,))
mask = Image.new('L', (pw, ph), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=56, fill=255)
frame.paste(shot.convert('RGBA'), (px, py), mask)
im.paste(frame, (0, 0), frame)
d = ImageDraw.Draw(im)
para(d, 80, py + 40, "Ici : la carte pour une canette de Ciao Energy.", POPB(30), 400, lh=1.25)
para(d, 80, py + 130, "Le pin vert, c'est un magasin où quelqu'un l'a vue en rayon.", POPM(27), 400, fill=MUTED, lh=1.3)
para(d, 80, py + 250, "Ça commence par Bruxelles.", POPB(30), 400, lh=1.25)
im.save(f'{OUT}/story-1-cest-quoi.png')

# ------------------------------------------------ écran 2 : soutenir
im = Image.new('RGB', (W, H), CREAM); d = ImageDraw.Draw(im)
im.paste(logo.resize((110, 110)), (80, 110))
d.text((215, 128), 'MAGOFEED', font=ANTON(60), fill=INK)
y = 320
y = para(d, 80, y, "SOUTENIR LE PROJET", ANTON(120), 920, lh=1.0)
y += 50
y = para(d, 80, y, "Magofeed, c'est une seule personne à Bruxelles, zéro pub, zéro budget. Deux façons d'aider, trente secondes chacune.", POPM(34), 920, fill=MUTED, lh=1.35)
y += 50
def card(y, bg, fg, sub, k, title, line1, line2):
    h = 330
    d.rounded_rectangle([80, y, W - 80, y + h], radius=40, fill=bg)
    d.ellipse([130, y + 50, 210, y + 130], fill=fg)
    d.text((170, y + 90), k, font=ANTON(46), fill=bg, anchor='mm')
    d.text((250, y + 52), title, font=POPB(40), fill=fg)
    d.text((250, y + 118), line1, font=ANTON(58), fill=fg)
    d.text((250, y + 200), line2, font=POPM(30), fill=sub)
    return y + h + 36
y = card(y, INK, WHITE, (0xD9, 0xD2, 0xC5), '1', "Voir l'app et suivre", "@magofeed.app", "sur Instagram · instagram.com/magofeed.app")
y = card(y, GOLD, INK, (0x4a, 0x3a, 0x20), '2', "Un coup de pouce", "ko-fi.com/magofeed", "Même 2 €, ça compte. Merci.")
# flèche vers les stickers lien
cy = H - 230
d.text((W / 2, cy - 70), "Les liens sont juste en dessous", font=POPB(34), fill=INK, anchor='mm')
d.line([(W / 2, cy - 10), (W / 2, cy + 90)], fill=INK, width=10)
d.polygon([(W / 2 - 34, cy + 60), (W / 2 + 34, cy + 60), (W / 2, cy + 110)], fill=INK)
im.save(f'{OUT}/story-2-soutenir.png')
print('ok')
