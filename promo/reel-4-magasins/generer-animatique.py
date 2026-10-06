"""Animatique du Reel « 4 magasins pour une canette » : les cartons posés sur des
plans fictifs, aux durées exactes du script, avec une piste de clic à 120 BPM et
le drop à 0:14. Sert à sentir le rythme avant de filmer. Ce n'est PAS le Reel.

Usage : python3 generer-animatique.py Anton-Regular.ttf promo/reel-4-magasins
Produit : animatique-NE-PAS-PUBLIER.mp4 et storyboard.jpg
"""
import os, sys, math, random, subprocess, wave, struct
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT = sys.argv[1]
KIT = sys.argv[2]
CART = os.path.join(KIT, 'cartons')
TMP = os.path.join(KIT, '_animatique_tmp')
os.makedirs(TMP, exist_ok=True)
W, H = 1080, 1920
random.seed(4)

def font(sz): return ImageFont.truetype(FONT, sz)

def label(img, text, y=1700):
    d = ImageDraw.Draw(img)
    f = font(34)
    w = f.getlength(text)
    d.rounded_rectangle([540 - w / 2 - 18, y - 8, 540 + w / 2 + 18, y + 46], radius=10, fill=(0, 0, 0, 170))
    d.text((540 - w / 2, y), text, font=f, fill=(255, 255, 255, 255))

def banner(img):
    d = ImageDraw.Draw(img)
    f = font(30)
    t = 'ANIMATIQUE · rythme et cartons · ce n\'est pas le Reel'
    w = f.getlength(t)
    d.rectangle([0, 1800, W, 1860], fill=(180, 30, 30, 255))
    d.text((540 - w / 2, 1812), t, font=f, fill=(255, 255, 255, 255))

def bg_frigo(shade=0, hand=True):
    im = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        v = 225 - shade - int(45 * abs(((y + 60) % 520) / 520 - 0.5))
        d.line([(0, y), (W, y)], fill=(v, v + 4, v + 10, 255))
    pal = [(200, 55, 55), (60, 120, 190), (230, 150, 40), (70, 160, 90), (120, 70, 150)]
    for i, x in enumerate(range(40, W, 170)):
        c = pal[(i + shade) % len(pal)]
        for row in (360, 900, 1400):
            d.rounded_rectangle([x, row, x + 120, row + 300], radius=24, fill=c + (255,))
            d.rectangle([x + 20, row + 90, x + 100, row + 190], fill=(245, 245, 245, 255))
    for x in range(0, W, 170):
        d.line([(x + 10, 0), (x + 10, H)], fill=(255, 255, 255, 60), width=6)
    if hand:
        d.ellipse([560, 1180, 900, 1700], fill=(70, 50, 40, 255))
        d.rounded_rectangle([700, 1500, 1080, 1920], radius=80, fill=(70, 50, 40, 255))
    return im

def bg_entree(shade=0):
    im = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        v = 60 + shade + int(50 * y / H)
        d.line([(0, y), (W, y)], fill=(v, v - 4, v - 8, 255))
    d.rectangle([250, 200, 830, 1400], outline=(150, 140, 130, 255), width=14)
    d.rectangle([280, 230, 800, 1370], fill=(120 + shade, 110 + shade, 100 + shade, 255))
    d.rectangle([0, 1400, W, H], fill=(85 + shade, 80 + shade, 75 + shade, 255))
    d.ellipse([380, 1500, 560, 1900], fill=(30, 30, 30, 255))
    d.ellipse([620, 1560, 800, 1920], fill=(30, 30, 30, 255))
    return im

def bg_trottoir():
    im = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        v = 75 + int(30 * y / H)
        d.line([(0, y), (W, y)], fill=(v, v - 3, v - 6, 255))
    for yy in range(0, H, 110):
        off = 60 if (yy // 110) % 2 else 0
        for xx in range(-60 + off, W, 130):
            d.rounded_rectangle([xx + 6, yy + 6, xx + 124, yy + 104], radius=10, fill=(95 + random.randint(-8, 8), 90, 85, 255))
    d.ellipse([340, 1200, 520, 1650], fill=(25, 25, 25, 255))
    d.ellipse([580, 1250, 760, 1700], fill=(25, 25, 25, 255))
    return im

def phone_frame(inner):
    """Pose un écran sur fond crème, à 88 %, comme au montage."""
    im = Image.new('RGBA', (W, H), (0xf4, 0xf2, 0xee, 255))
    sw, sh = int(W * .88), int(H * .88)
    inner = inner.resize((sw, sh))
    mask = Image.new('L', (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw, sh], radius=70, fill=255)
    im.paste(inner, ((W - sw) // 2, (H - sh) // 2), mask)
    return im

def bg_ecran1():
    inner = Image.new('RGBA', (W, H), (0xea, 0xe6, 0xdc, 255))
    d = ImageDraw.Draw(inner)
    for i in range(14):
        d.line([(0, 200 + i * 130), (W, 160 + i * 130)], fill=(255, 255, 255, 255), width=22)
    for i in range(8):
        d.line([(80 + i * 150, 0), (140 + i * 150, H)], fill=(255, 255, 255, 255), width=18)
    d.ellipse([505, 1000, 575, 1070], fill=(60, 120, 230, 255), outline=(255, 255, 255, 255), width=8)
    d.polygon([(540, 1010), (470, 880), (610, 880)], fill=(40, 140, 80, 255))
    d.ellipse([470, 800, 610, 940], fill=(40, 140, 80, 255))
    d.text((514, 835), '✓', font=font(70), fill=(255, 255, 255, 255))
    d.rounded_rectangle([40, 120, 1040, 240], radius=28, fill=(255, 255, 255, 255))
    f = font(40)
    d.text((80, 160), '1 magasin · 1 vue en rayon · voir la fiche', font=f, fill=(0x1a, 0x17, 0x14, 255))
    im = phone_frame(inner)
    label(im, 'ÉCRAN 1 : ta vraie capture de la carte ira ici', 1620)
    return im

def bg_ecran2():
    shot = Image.open(os.path.join(os.path.dirname(KIT.rstrip('/')), '..', 'screenshots', '3-magasin.png')).convert('RGBA')
    im = phone_frame(shot)
    label(im, 'ÉCRAN 2 : la fiche du magasin, « Y aller »', 1620)
    return im

def bg_preuve(dark=False):
    im = bg_frigo(10, hand=False)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([340, 560, 740, 1360], radius=60, fill=(235, 240, 250, 255), outline=(60, 110, 200, 255), width=16)
    d.rounded_rectangle([380, 760, 700, 1160], radius=20, fill=(60, 110, 200, 255))
    d.text((430, 900), 'Milkis', font=font(90), fill=(255, 255, 255, 255))
    d.ellipse([200, 1250, 900, 1920], fill=(70, 50, 40, 255))
    return im

def bg_devanture():
    im = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        v = 120 + int(30 * y / H)
        d.line([(0, y), (W, y)], fill=(v, v - 5, v - 12, 255))
    d.rectangle([0, 150, W, 420], fill=(40, 40, 45, 255))
    d.text((190, 215), 'ENSEIGNE DU MAGASIN 4', font=font(70), fill=(230, 200, 120, 255))
    d.rectangle([60, 420, 1020, 1500], fill=(170, 190, 200, 255))
    d.rounded_rectangle([390, 700, 690, 1340], radius=50, fill=(235, 240, 250, 255), outline=(60, 110, 200, 255), width=14)
    d.rounded_rectangle([420, 860, 660, 1180], radius=18, fill=(60, 110, 200, 255))
    d.text((450, 970), 'Milkis', font=font(70), fill=(255, 255, 255, 255))
    d.ellipse([300, 1300, 780, 1920], fill=(70, 50, 40, 255))
    return im

# ------------------------------------------------------------- plans
PLANS = [
    # (durée, fond, carton, étiquette)
    (2.0,  bg_frigo(0),            '01-hook-0000-0002.png',          'HOOK · frigo night shop · main qui ressort vide · clac à 1,8 s'),
    (1.0,  bg_entree(0),           '02-magasin1-0002-0003.png',      'SORTIE magasin 1 · POV hanche 0,5x'),
    (1.0,  bg_entree(25),          '03-magasin2-0003-0005.5.png',    'ENTRÉE épicerie · POV hanche'),
    (1.5,  bg_frigo(1),            '03-magasin2-0003-0005.5.png',    'FRIGO épicerie · même geste, plus vite'),
    (0.7,  bg_entree(50),          '04-magasin3-0005.5-0007.5.png',  'ENTRÉE supérette'),
    (1.3,  bg_frigo(2),            '04-magasin3-0005.5-0007.5.png',  'FRIGO supérette · un seul geste'),
    (0.4,  bg_frigo(0, False),     '05-flash-0007.5-0008.7.png',     'FLASH · porte 1'),
    (0.4,  bg_frigo(1, False),     '05-flash-0007.5-0008.7.png',     'FLASH · porte 2'),
    (0.4,  bg_frigo(2, False),     '05-flash-0007.5-0008.7.png',     'FLASH · porte 3'),
    (1.3,  bg_trottoir(),          '06-bruxelles-0008.7-0010.png',   'TROTTOIR · pieds qui s\'arrêtent net'),
    (1.5,  bg_ecran1(),            '07-magofeed-0010-0013.png',      None),
    (1.5,  bg_ecran2(),            '07-magofeed-0010-0013.png',      None),
    (1.0,  bg_entree(10),          '08-magasin4-0013-0014.png',      'ENTRÉE magasin 4 · même cadrage que les échecs'),
    (3.0,  bg_preuve(),            '09-elle-est-la-0014-0017.png',   'PREUVE · la vraie canette, étiquette face caméra · DROP'),
    (2.5,  bg_devanture(),         '10-le-prochain-0017-0019.5.png', 'DEVANTURE · canette à bout de bras, enseigne derrière'),
    (1.5,  bg_devanture(),         '11-chute-0019.5-0021.png',       None),
]
assert abs(sum(p[0] for p in PLANS) - 21.0) < 1e-6, sum(p[0] for p in PLANS)

frames = []
for i, (dur, bg, carton, lab) in enumerate(PLANS):
    im = bg.copy()
    im.alpha_composite(Image.open(os.path.join(CART, carton)).convert('RGBA'))
    if lab: label(im, lab)
    banner(im)
    path = os.path.join(TMP, f'f{i:02d}.png')
    im.convert('RGB').save(path)
    frames.append((path, dur))

with open(os.path.join(TMP, 'liste.txt'), 'w') as f:
    for path, dur in frames:
        f.write(f"file '{os.path.abspath(path)}'\nduration {dur:.3f}\n")
    f.write(f"file '{os.path.abspath(frames[-1][0])}'\n")

# ------------------------------------------------------------- audio : clic 120 BPM, montée, creux, drop à 0:14
SR = 44100
N = int(21.0 * SR)
buf = [0.0] * N

def add(t, samples, gain=1.0):
    i0 = int(t * SR)
    for j, v in enumerate(samples):
        k = i0 + j
        if 0 <= k < N: buf[k] += v * gain

def kick(level):
    out = []
    for n in range(int(0.12 * SR)):
        t = n / SR
        out.append(math.sin(2 * math.pi * (120 - 400 * t) * t) * math.exp(-t * 28) * level)
    return out

def hat(level):
    out = []
    for n in range(int(0.03 * SR)):
        t = n / SR
        out.append((random.random() * 2 - 1) * math.exp(-t * 180) * level)
    return out

def clac():
    out = []
    for n in range(int(0.09 * SR)):
        t = n / SR
        out.append((random.random() * 2 - 1) * math.exp(-t * 60) * 0.9 + math.sin(2 * math.pi * 220 * t) * math.exp(-t * 40) * 0.3)
    return out

def boom():
    out = []
    for n in range(int(0.6 * SR)):
        t = n / SR
        out.append(math.sin(2 * math.pi * (70 - 60 * t) * t) * math.exp(-t * 5) * 1.0)
    return out

BEAT = 0.5  # 120 BPM
t = 0.0
while t < 21.0:
    in_creux = 10.0 <= t < 14.0
    lvl = 0.25 if in_creux else 0.7
    add(t, kick(lvl))
    # hi-hats qui se resserrent : croches avant 5 s, doubles-croches de 5 à 10 s, rien dans le creux, doubles après le drop
    if t < 5.0:
        add(t + BEAT / 2, hat(0.35))
    elif t < 10.0:
        for q in (0.25, 0.5, 0.75):
            add(t + BEAT * q, hat(0.35 + 0.08 * (t - 5)))
    elif t >= 14.0:
        for q in (0.25, 0.5, 0.75):
            add(t + BEAT * q, hat(0.4))
    t += BEAT
for tc in (1.8, 4.9, 7.3, 7.9, 8.3, 8.7, 14.5):
    add(tc, clac(), 0.8)
add(14.0, boom(), 1.0)
peak = max(abs(v) for v in buf) or 1.0
wav_path = os.path.join(TMP, 'clic.wav')
with wave.open(wav_path, 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v / peak * 0.9)) * 32767)) for v in buf))

out_mp4 = os.path.join(KIT, 'animatique-NE-PAS-PUBLIER.mp4')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(TMP, 'liste.txt'),
                '-i', wav_path, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                '-c:a', 'aac', '-b:a', '128k', '-t', '21', '-movflags', '+faststart', out_mp4], check=True)

# ------------------------------------------------------------- storyboard (12 cases)
STORY = [
    ('0:00 à 0:02', 0, 'Hook. Frigo du night shop, la main ressort vide, clac à 1,8 s.'),
    ('0:02 à 0:03', 1, 'Sortie du magasin 1, POV hanche 0,5x.'),
    ('0:03 à 0:05,5', 3, 'Épicerie : entrée 1 s, puis frigo 1,5 s.'),
    ('0:05,5 à 0:07,5', 5, 'Supérette : entrée 0,7 s, un seul geste au frigo.'),
    ('0:07,5 à 0:08,7', 7, 'Flash : trois portes qui se referment, 0,4 s chacune.'),
    ('0:08,7 à 0:10', 9, 'Trottoir : les pieds qui s\'arrêtent net. Plus gros carton.'),
    ('0:10 à 0:11,5', 10, 'Écran 1 : la carte, pin coche verte, « 1 vue en rayon ».'),
    ('0:11,5 à 0:13', 11, 'Écran 2 : la fiche, « Y aller », « 1 min à pied ».'),
    ('0:13 à 0:14', 12, 'Entrée du magasin 4, même cadrage que les échecs.'),
    ('0:14 à 0:17', 13, 'Preuve : la canette dans la main, drop à 0:14 pile.'),
    ('0:17 à 0:19,5', 14, 'Devanture : canette à bout de bras, enseigne derrière.'),
    ('0:19,5 à 0:21', 15, 'Chute : arrêt sur image, bandeau crème, coupe sèche.'),
]
TW, TH, GAP, CAP = 330, 587, 30, 150
cols = 3
rows = math.ceil(len(STORY) / cols)
sb = Image.new('RGB', (cols * TW + (cols + 1) * GAP, 170 + rows * (TH + CAP + GAP)), (0xf4, 0xf2, 0xee))
d = ImageDraw.Draw(sb)
d.text((GAP, 40), 'STORYBOARD · 4 MAGASINS POUR UNE CANETTE · 21 s', font=font(44), fill=(0x1a, 0x17, 0x14))
d.text((GAP, 100), 'Plans fictifs. Les cartons et les durées sont les vrais.', font=font(28), fill=(0x7a, 0x6f, 0x63))
cap_font = font(26)
tc_font = font(30)
for n, (tc, fi, cap) in enumerate(STORY):
    x = GAP + (n % cols) * (TW + GAP)
    y = 170 + (n // cols) * (TH + CAP + GAP)
    th = Image.open(frames[fi][0]).convert('RGB').resize((TW, TH))
    sb.paste(th, (x, y))
    d.rectangle([x, y, x + TW, y + TH], outline=(0xd9, 0xd2, 0xc5), width=3)
    d.text((x, y + TH + 10), tc, font=tc_font, fill=(0xb8, 0x86, 0x3f))
    # césure manuelle de la légende
    words, lines, cur = cap.split(), [], ''
    for wd in words:
        if cap_font.getlength(cur + ' ' + wd) > TW: lines.append(cur); cur = wd
        else: cur = (cur + ' ' + wd).strip()
    lines.append(cur)
    for li, ln in enumerate(lines[:3]):
        d.text((x, y + TH + 50 + li * 32), ln, font=cap_font, fill=(0x1a, 0x17, 0x14))
sb.save(os.path.join(KIT, 'storyboard.jpg'), quality=88)
print('ok', out_mp4)
