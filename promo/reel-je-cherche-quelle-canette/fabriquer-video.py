"""Compose le Reel « Je cherche quelle canette ensuite ? » (style @prayerplaces) :
fond de rue, téléphone avec les vrais écrans de l'app, sous-titres mot à mot avec
le mot-clé en doré, bulles, coches, badges, voix off.

Usage :
  python3 fabriquer-video.py <dossier-out> <dossier-polices> [--apercu]
Entrées (dans <dossier-out>) : frames-app/, frames-bxl/, frames-rue-old/, frames-rue-shops/,
                               voix/timeline.json, voix/voix.wav
Sortie : <dossier-out>/reel-je-cherche-quelle-canette.mp4 (ou apercu.jpg avec --apercu)
"""
import os, sys, json, math, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]
FONTS = sys.argv[2]
APERCU = '--apercu' in sys.argv
W, H, FPS = 1080, 1920, 30
T = json.load(open(os.path.join(OUT, 'voix', 'timeline.json')))
B = T['beats']
b = [x['debut'] for x in B]            # b[0..9] : début de chaque beat
TOTAL = round(max(T['total'], B[-1]['fin'] + 1.2), 2)

INK = (0x1a, 0x17, 0x14)
GOLD = (0xE5, 0xA9, 0x3A)
WHITE = (255, 255, 255)
GREEN = (0x2f, 0x9e, 0x5a)

def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)
F_CAP = font('Poppins-ExtraBold.ttf', 58)
F_CAP_BIG = font('Poppins-ExtraBold.ttf', 80)
F_HUGE = font('Poppins-ExtraBold.ttf', 112)
F_SMALL = font('Poppins-SemiBold.ttf', 40)
F_BUBBLE = font('Poppins-Bold.ttf', 46)
F_PILL = font('Poppins-Bold.ttf', 44)

# ------------------------------------------------------------------ images sources
def frame_path(folder, idx):
    n = len(os.listdir(os.path.join(OUT, folder)))
    idx = max(1, min(n, int(round(idx))))
    return os.path.join(OUT, folder, f'{idx:05d}.jpg')
_cache = {}
def load(folder, idx):
    p = frame_path(folder, idx)
    if p not in _cache:
        if len(_cache) > 40: _cache.clear()
        _cache[p] = Image.open(p).convert('RGB')
    return _cache[p]

def blurred(img, radius=14, darken=0.38):
    small = img.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(radius))
    big = small.resize((W, H), Image.BILINEAR)
    return Image.blend(big, Image.new('RGB', (W, H), (0, 0, 0)), darken)

def ease(x):  # ease-out cubic
    x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3

# ------------------------------------------------------------------ mots & chunks
def words_at(bi):
    return B[bi]['mots']
def word_start(bi, needle, default=None):
    for m in words_at(bi):
        if m['w'].lower().strip(',.?:…!').startswith(needle.lower()):
            return m['t0']
    return default if default is not None else b[bi]

CHUNKS = {
    0: [["Ça", "y", "est,"], ["j'ai", "envie", "d'un", "Milkis."]],
    1: [["Bon…", "je", "la", "trouve", "où ?"]],
    2: [["En", "rue,"], ["tu", "sais", "jamais"], ["qui", "l'a."]],
    3: [["Du", "coup"], ["j'ai", "fait", "une", "appli"], ["qui", "te", "montre", "qui", "l'a,"], ["autour", "de", "toi."]],
    4: [["Et", "pas", "que"], ["les", "supermarchés."]],
    5: [["En", "stock,"], ["vue", "en", "rayon,"], ["ouvert,"], ["l'itinéraire."], ["Tout", "au", "même", "endroit."]],
    6: [["Personne", "l'a", "vue ?"], ["Chasse", "lancée,"], ["les", "gens", "autour"], ["sont", "prévenus."]],
    7: [["J'ai", "commencé"], ["par", "Bruxelles."]],
    8: [["Si", "ça", "peut", "être", "utile,"], ["lien", "dans", "ma", "bio."], ["Et", "surtout,", "dis-moi :"]],
    9: [["je", "cherche", "quelle", "canette", "ensuite ?"]],
}
GOLD_WORDS = {0: {"Milkis."}, 3: {"autour", "de", "toi."}, 4: {"pas", "que"}, 5: {"vue", "en", "rayon,"}, 6: {"Chasse"}, 9: {"quelle", "canette"}}

def caption_state(t):
    """Retourne (beat, chunk words, nb de mots visibles) pour l'instant t, ou None."""
    for bi, beat in enumerate(B):
        if beat['debut'] <= t < beat['fin'] + 0.35:
            ws = beat['mots']
            chunks = CHUNKS[bi]
            # index du mot courant
            k = 0
            for j, m in enumerate(ws):
                if t >= m['t0']: k = j
            # retrouver le chunk contenant le mot k
            pos = 0
            for ch in chunks:
                if k < pos + len(ch):
                    return bi, ch, k - pos + 1
                pos += len(ch)
            return bi, chunks[-1], len(chunks[-1])
    return None

def draw_text_outlined(d, xy, text, f, fill=WHITE, stroke=5, anchor='la'):
    d.text(xy, text, font=f, fill=fill, stroke_width=stroke, stroke_fill=(0, 0, 0), anchor=anchor)

def draw_caption(img, t, cy, big=False):
    st = caption_state(t)
    if not st: return
    bi, chunk, nvis = st
    if bi == 9: return               # la question a son propre carton
    f = F_CAP_BIG if (big or bi == 1) else F_CAP
    d = ImageDraw.Draw(img)
    words = chunk[:nvis]
    if not words: return
    # mesure
    gap = f.getlength(' ')
    widths = [f.getlength(w) for w in words]
    total = sum(widths) + gap * (len(words) - 1)
    maxw = 960
    lines = []
    if total <= maxw:
        lines = [words]
    else:  # coupe en deux lignes
        cur, curw = [], 0
        for w, ww in zip(words, widths):
            if cur and curw + gap + ww > maxw: lines.append(cur); cur, curw = [w], ww
            else: cur.append(w); curw += (gap if cur[:-1] else 0) + ww
        lines.append(cur)
    lh = int(f.size * 1.25)
    y0 = cy - lh * len(lines) // 2
    golds = GOLD_WORDS.get(bi, set())
    for li, line in enumerate(lines):
        lw = sum(f.getlength(w) for w in line) + gap * (len(line) - 1)
        x = W / 2 - lw / 2
        for w in line:
            col = GOLD if w in golds else WHITE
            draw_text_outlined(d, (x, y0 + li * lh), w, f, fill=col, stroke=6)
            x += f.getlength(w) + gap
    # fade-in léger du dernier mot : on fait simple, pas d'alpha par mot

def small_line(img, text, cy, color=GOLD):
    d = ImageDraw.Draw(img)
    draw_text_outlined(d, (W / 2, cy), text, F_SMALL, fill=color, stroke=4, anchor='mm')

def pill(img, text, cx, cy, f=F_PILL, bg=(255, 255, 255), fg=INK, pad=28, alpha=1.0):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tw = f.getlength(text); th = f.size
    x0, y0 = cx - tw / 2 - pad, cy - th / 2 - 14
    x1, y1 = cx + tw / 2 + pad, cy + th / 2 + 14
    d.rounded_rectangle([x0 + 4, y0 + 8, x1 + 4, y1 + 8], radius=40, fill=(0, 0, 0, int(90 * alpha)))
    d.rounded_rectangle([x0, y0, x1, y1], radius=40, fill=bg + (int(255 * alpha),))
    d.text((cx, cy), text, font=f, fill=fg + (int(255 * alpha),), anchor='mm')
    img.paste(layer, (0, 0), layer)
    return (x0, y0, x1, y1)

def check_dot(img, cx, cy, k=1.0, r=20):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN + (int(255 * k),))
    d.line([(cx - 9, cy), (cx - 3, cy + 7), (cx + 10, cy - 8)], fill=(255, 255, 255, int(255 * k)), width=5)
    img.paste(layer, (0, 0), layer)

def up_arrow(img, cx, cy, k=1.0):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    col = INK + (int(255 * k),)
    d.line([(cx, cy + 16), (cx, cy - 16)], fill=col, width=6)
    d.line([(cx - 12, cy - 4), (cx, cy - 17), (cx + 12, cy - 4)], fill=col, width=6)
    img.paste(layer, (0, 0), layer)

def bubble(img, text, cx, cy, tip, strike=False, extra=None):
    """Bulle blanche avec un trait vers un point (style « Ici ? »)."""
    d = ImageDraw.Draw(img)
    d.line([(cx, cy + 40), tip], fill=WHITE, width=5)
    d.ellipse([tip[0] - 9, tip[1] - 9, tip[0] + 9, tip[1] + 9], fill=WHITE, outline=INK, width=3)
    box = pill(img, text, cx, cy, f=F_BUBBLE, pad=24)
    if strike:
        d = ImageDraw.Draw(img)
        tw = F_BUBBLE.getlength(text)
        d.line([(cx - tw / 2, cy + 2), (cx + tw / 2, cy + 2)], fill=(0xb9, 0x1c, 0x1c), width=6)
    if extra:
        pill(img, extra, box[2] + 20 + F_BUBBLE.getlength(extra) / 2 + 20, cy, f=F_BUBBLE, pad=20)

# ------------------------------------------------------------------ téléphone
APP_BOX = (42, 42, 727, 1670)        # #app dans l'image 810x1752 (x, y, w, h)
PH_W, PH_H = 609, 1400              # écran affiché
PH_X, PH_Y = (W - PH_W) // 2, 430   # position écran
BEZEL = 14
_mask = Image.new('L', (PH_W, PH_H), 0)
ImageDraw.Draw(_mask).rounded_rectangle([0, 0, PH_W - 1, PH_H - 1], radius=52, fill=255)

def phone(img, src, dy=0, scale=1.0, alpha=1.0, zoom=None):
    """Pose l'écran src (image 810x1752) dans un cadre de téléphone. zoom=(cx,cy,f) agrandit autour d'un point source."""
    x, y, w, h = APP_BOX
    screen = src.crop((x, y, x + w, y + h))
    if zoom:
        zx, zy, zf = zoom
        cw, ch = w / zf, h / zf
        zx, zy = zx - x, zy - y
        cx0 = max(0, min(w - cw, zx - cw / 2)); cy0 = max(0, min(h - ch, zy - ch / 2))
        screen = screen.crop((int(cx0), int(cy0), int(cx0 + cw), int(cy0 + ch)))
    pw, ph = int(PH_W * scale), int(PH_H * scale)
    screen = screen.resize((pw, ph), Image.LANCZOS)
    px = PH_X + (PH_W - pw) // 2; py = PH_Y + dy + (PH_H - ph) // 2
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bz = int(BEZEL * scale)
    d.rounded_rectangle([px - bz - 6, py - bz + 14, px + pw + bz + 6, py + ph + bz + 26], radius=int(70 * scale), fill=(0, 0, 0, 110))
    d.rounded_rectangle([px - bz, py - bz, px + pw + bz, py + ph + bz], radius=int(66 * scale), fill=(0x15, 0x12, 0x0f, 255))
    m = _mask.resize((pw, ph)) if scale != 1.0 else _mask
    layer.paste(screen, (px, py), m)
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([px + pw / 2 - 80 * scale, py + 16 * scale, px + pw / 2 + 80 * scale, py + 58 * scale], radius=int(22 * scale), fill=(0x15, 0x12, 0x0f, 255))
    if alpha < 1.0:
        a = layer.split()[3].point(lambda v: int(v * alpha)); layer.putalpha(a)
    img.paste(layer, (0, 0), layer)
    return (px, py, pw, ph)

def src_to_screen(sx, sy, geo):
    """Coordonnées source (810x1752) -> coordonnées écran composé."""
    px, py, pw, ph = geo
    x, y, w, h = APP_BOX
    return px + (sx - x) * pw / w, py + (sy - y) * ph / h

def check_box(img, geo, box, t0, t):
    """Contour doré + coche qui apparaît (animation 0,25 s) autour d'une zone source."""
    if t < t0: return
    k = ease((t - t0) / 0.25)
    x0, y0 = src_to_screen(box[0], box[1], geo); x1, y1 = src_to_screen(box[2], box[3], geo)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    pad = 10
    d.rounded_rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], radius=16, outline=GOLD + (int(255 * k),), width=5)
    r = 22 * k
    cx, cy = x1 + pad + 8, y0 - pad - 8
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN + (int(255 * k),))
    if k > 0.6:
        d.line([(cx - 10, cy), (cx - 3, cy + 8), (cx + 11, cy - 8)], fill=(255, 255, 255, 255), width=5)
    img.paste(layer, (0, 0), layer)

# ------------------------------------------------------------------ plan de montage
# repères (indices d'image, 30 i/s) dans frames-app et frames-bxl
APP = dict(home=562, type_start=640, type_end=726, list_milkis=740, map_stable=811, fiche_header=1046,
           scroll_a=1066, scroll_b=1096, card=1100, ramune_card=1700, tap_activer=1921, toast_chasse=1966, toast_end=1996)
BXL = dict(dense=781, far=901)
# zones de la fiche (source 810x1752, état défilé)
CARD = dict(en_stock=(233, 993, 383, 1030), vu=(350, 1225, 540, 1260), ouvert=(312, 1072, 530, 1133), y_aller=(555, 1003, 695, 1068), carte=(85, 905, 725, 1405))
AUTOUR = (405, 800)   # centre du bloc « Autour de toi »

def phone_source(t):
    """Quel écran afficher à l'instant t : (dossier, index, zoom) ou None si pas de téléphone."""
    t_phone_in = b[2]
    t_phone_out = b[8]
    if t < t_phone_in or t > t_phone_out + 0.4: return None
    if t < b[3]:                                   # accueil -> recherche -> frappe
        f = APP['home'] + (t - b[2]) / (b[3] - b[2]) * (APP['type_end'] - APP['home'])
        return 'frames-app', f, None
    if t < b[4]:                                   # tap -> carte
        f = APP['list_milkis'] + 12 + (t - b[3]) * 30 * 1.25
        if f > 772: f += 30                      # on saute la seconde de « Chargement… »
        return 'frames-app', min(f, APP['map_stable'] + 180), None
    t_scroll = b[5] - 0.7
    if t < t_scroll:                               # « Autour de toi » zoomé
        f = APP['home'] - 60 + (t - b[4]) * 30
        return 'frames-app', f, (AUTOUR[0], AUTOUR[1], 1.28)
    if t < b[5]:                                   # défilement vers la fiche magasin
        f = APP['scroll_a'] + (t - t_scroll) / 0.7 * (APP['scroll_b'] - APP['scroll_a'])
        return 'frames-app', f, None
    if t < b[6]:                                   # la fiche, stable
        return 'frames-app', APP['card'] + min((t - b[5]) * 30, 140), None
    if t < b[7]:                                   # chasse : la toast « Chasse lancée » tombe sur le mot
        t_chasse = word_start(6, 'chasse', b[6] + 1.5)
        if t < t_chasse - 1.3:
            return 'frames-app', APP['ramune_card'] + (t - b[6]) * 30, None
        f = APP['toast_chasse'] + (t - t_chasse - 0.1) * 30
        return 'frames-app', min(f, APP['toast_end'] + 6), None
    # Bruxelles : dézoom
    f = BXL['dense'] + (t - b[7]) / (t_phone_out - b[7]) * (BXL['far'] - BXL['dense'])
    return 'frames-bxl', min(f, BXL['far']), None

def street_source(t):
    """Fond de rue : (dossier, index)."""
    if t < b[1]: return 'frames-rue-old', 1 + t * 30
    if t < b[8]: return 'frames-rue-shops', 1 + (t - b[1]) * 30 * (1.0 if t < b[2] else 0.5) + (0 if t < b[2] else (b[2] - b[1]) * 30)
    return 'frames-rue-old', 1 + (t - b[8]) * 30

def render(t):
    img = load(*street_source(t)).copy()
    ps = phone_source(t)
    phone_in_k = ease((t - b[2]) / 0.35)
    out_k = ease((t - b[8]) / 0.35)
    if t >= b[9]:                                  # chute : image figée, floutée
        img = blurred(load('frames-rue-old', 1 + (b[9] - b[8]) * 30), radius=10, darken=0.5)
    elif ps and t >= b[2]:
        if t < b[8]:
            img = blurred(img)
        else:
            img = Image.blend(blurred(img), img, out_k)
    if ps and t < b[9]:
        folder, idx, zoom = ps
        src = load(folder, idx)
        if t < b[2] + 0.35:
            geo = phone(img, src, scale=0.9 + 0.1 * phone_in_k, alpha=phone_in_k, zoom=zoom)
        elif t >= b[8]:
            geo = phone(img, src, dy=int(1700 * out_k), zoom=zoom)
        else:
            geo = phone(img, src, zoom=zoom)
        # coches sur la fiche
        if b[5] <= t < b[6]:
            check_box(img, geo, CARD['en_stock'], word_start(5, 'stock', b[5] + 0.3), t)
            check_box(img, geo, CARD['vu'], word_start(5, 'rayon', b[5] + 1.2), t)
            check_box(img, geo, CARD['ouvert'], word_start(5, 'ouvert', b[5] + 2.0), t)
            check_box(img, geo, CARD['y_aller'], word_start(5, "l'itin", b[5] + 2.8), t)
            if t >= word_start(5, 'tout', b[5] + 3.6):
                check_box(img, geo, CARD['carte'], word_start(5, 'tout', b[5] + 3.6), t)
        # badge Bruxelles
        if b[7] <= t < b[8]:
            k = ease((t - b[7]) / 0.3)
            box = pill(img, '      BRUXELLES · premier test', W / 2, PH_Y + 110, f=F_PILL, bg=(0x15, 0x12, 0x0f), fg=WHITE, alpha=k)
            check_dot(img, box[0] + 46, PH_Y + 110, k)
    d = ImageDraw.Draw(img)
    # ---- beat 0 : carton « Milkis. Maintenant. »
    if t < b[1]:
        t_m = word_start(0, 'milkis', b[0] + 1.6)
        if t < t_m:
            draw_caption(img, t, 880, big=True)
        else:
            k = ease((t - t_m) / 0.25)
            d2 = ImageDraw.Draw(img)
            draw_text_outlined(d2, (W / 2, 820 - int(20 * (1 - k))), 'Milkis.', F_HUGE, fill=GOLD, stroke=8, anchor='mm')
            if t > t_m + 0.35:
                draw_text_outlined(d2, (W / 2, 950), 'Maintenant.', F_CAP_BIG, fill=WHITE, stroke=6, anchor='mm')
    # ---- beat 1 : bulles
    elif t < b[2]:
        ws = words_at(1)
        t_ici = ws[1]['t0'] if len(ws) > 1 else b[1] + 0.2
        t_la = ws[2]['t0'] if len(ws) > 2 else b[1] + 0.5
        t_ou = ws[3]['t0'] if len(ws) > 3 else b[1] + 0.8
        t_non = ws[4]['t0'] + 0.15 if len(ws) > 4 else b[1] + 1.2
        if t >= t_ici: bubble(img, 'Ici ?', 300, 620, (250, 900))
        if t >= t_la: bubble(img, 'Là ?', 790, 540, (840, 800))
        if t >= t_ou: bubble(img, 'Ou ici… ?', 520, 760, (560, 1040), strike=t >= t_non, extra='…non.' if t >= t_non else None)
        draw_caption(img, t, 1240)
    # ---- beats 2..7 : sous-titres au-dessus du téléphone
    elif t < b[8]:
        draw_caption(img, t, 300)
        if b[5] <= t < b[6] and t >= word_start(5, 'rayon', b[5] + 1.2):
            small_line(img, 'vérifié à moins de 500 m', 392)
        if b[6] <= t < b[7] and t >= word_start(6, 'les', b[6] + 2.2):
            small_line(img, 'celui qui la trouve gagne des points', 392)
    # ---- beat 8 : rue, pastille lien en bio
    elif t < b[9]:
        t_lien = word_start(8, 'lien', b[8] + 1.4)
        if t >= t_lien:
            k = ease((t - t_lien) / 0.3)
            box = pill(img, 'Lien dans ma bio     ', W / 2, 700 - int(20 * (1 - k)), bg=(0xf4, 0xf2, 0xee), fg=INK, alpha=k)
            up_arrow(img, box[2] - 48, 700 - int(20 * (1 - k)), k)
            if t >= t_lien + 0.4: small_line(img, 'gratuit · sans pub', 790, color=WHITE)
        draw_caption(img, t, 1000)
    # ---- beat 9 : la question
    else:
        ws = words_at(9)
        t_je = ws[0]['t0']; t_quelle = ws[2]['t0'] if len(ws) > 2 else b[9] + 0.6; t_ens = ws[4]['t0'] if len(ws) > 4 else b[9] + 1.3
        d2 = ImageDraw.Draw(img)
        if t >= t_je: draw_text_outlined(d2, (W / 2, 760), 'JE CHERCHE', F_HUGE, fill=WHITE, stroke=8, anchor='mm')
        if t >= t_quelle:
            draw_text_outlined(d2, (W / 2, 900), 'QUELLE', F_HUGE, fill=GOLD, stroke=8, anchor='mm')
            draw_text_outlined(d2, (W / 2, 1035), 'CANETTE', F_HUGE, fill=GOLD, stroke=8, anchor='mm')
        if t >= t_ens: draw_text_outlined(d2, (W / 2, 1180), 'ENSUITE ?', F_HUGE, fill=WHITE, stroke=8, anchor='mm')
    return img

# ------------------------------------------------------------------ sortie
if APERCU:
    times = [0.6, 2.2, 3.6, 4.6, 6.0, 9.0, 11.5, 13.6, 15.0, 17.2, 19.2, 20.9, 22.4, 23.6, 25.2, 26.5, 28.2, 30.0, 32.0, TOTAL - 0.3]
    tw = 270; th = 480
    sheet = Image.new('RGB', (tw * 10, th * 2 + 40), (20, 20, 20))
    dd = ImageDraw.Draw(sheet)
    for k, t in enumerate(times):
        im = render(t).resize((tw, th))
        x = (k % 10) * tw; y = (k // 10) * (th + 20)
        sheet.paste(im, (x, y + 20)); dd.text((x + 4, y + 3), f'{t:.1f}s', fill=(255, 255, 80))
    sheet.save(os.path.join(OUT, 'apercu.jpg'), quality=85)
    print('apercu', os.path.join(OUT, 'apercu.jpg'), 'total', TOTAL)
else:
    out_mp4 = os.path.join(OUT, 'reel-je-cherche-quelle-canette.mp4')
    n = int(TOTAL * FPS)
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-i', os.path.join(OUT, 'voix', 'voix.wav'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
                           '-c:a', 'aac', '-b:a', '160k', '-t', str(TOTAL), '-movflags', '+faststart', out_mp4], stdin=subprocess.PIPE)
    for i in range(n):
        t = i / FPS
        ff.stdin.write(render(t).tobytes())
        if i % 150 == 0: print(f'  {t:5.1f} s / {TOTAL}', flush=True)
    ff.stdin.close(); ff.wait()
    print('ok', out_mp4)
