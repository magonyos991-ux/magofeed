# -*- coding: utf-8 -*-
# Banque de cartes v2 : LA BOISSON EST L'IMAGE. Illustration vectorielle de la
# bouteille/canette au centre, fond colore par boisson, nom geant derriere.
# Memes noms de fichiers que la v1 -> n8n continue de marcher sans changement.
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
FONTS = io.open(os.path.join(SP, "sg_faces.css"), encoding="utf-8").read()

# slug, nom, origine, accroche, fond VIF de marque, accent, encre ("w"=texte blanc, "d"=texte sombre)
DRINKS = [
    ("ramune",             "RAMUNE",            "JAPON",        "Le soda à la bille de verre",                  "#2f6fc4", "#7db8e8", "w"),
    ("guarana-antarctica", "GUARANÁ\nANTARCTICA","BRÉSIL",      "Le soda préféré du Brésil depuis 1921",        "#1e8c4a", "#4ec978", "w"),
    ("calpico",            "CALPICO",           "JAPON",        "Le goût yaourt culte, né en 1919",             "#5ba3dd", "#f2e3bb", "w"),
    ("mogu-mogu",          "MOGU MOGU",         "THAÏLANDE",    "Le jus qui se mâche — nata de coco",           "#e84a8a", "#ffa94d", "w"),
    ("inca-kola",          "INCA KOLA",         "PÉROU",        "La boisson dorée qui bat le cola chez elle",   "#f2c026", "#ffd23e", "d"),
    ("milkis",             "MILKIS",            "CORÉE",        "Doux, lacté, pétillant",                       "#4a90d9", "#a8d8ff", "w"),
    ("ciao-energy",        "CIAO ENERGY",       "L'INTROUVABLE","Tout le monde en parle, personne ne la trouve","#2b230f", "#f2c94c", "w"),
    ("jarritos",           "JARRITOS",          "MEXIQUE",      "Les sodas aux vrais fruits depuis 1950",       "#e8642a", "#ff7a59", "w"),
    ("sumol",              "SUMOL",             "PORTUGAL",     "L'ananas pétillant de Lisbonne",               "#f0a71d", "#ffc24d", "d"),
    ("pocari-sweat",       "POCARI SWEAT",     "JAPON",        "La désaltérante n°1 du Japon",                 "#2456a8", "#6fc3e8", "w"),
    ("vimto",              "VIMTO",             "ANGLETERRE",   "Le fruité culte de Manchester, depuis 1908",   "#7a2d9e", "#b57de8", "w"),
    ("chupa-chups",        "CHUPA CHUPS","CORÉE",    "La sucette devenue soda",                      "#f06292", "#ff8fb3", "w"),
    ("mountain-dew",       "MOUNTAIN DEW",      "ÉTATS-UNIS",   "Le soda vert le plus culte d'Amérique",        "#3fa51e", "#c8f26a", "w"),
    ("generic",            "BOISSON\nDU JOUR",  "",             "Les boissons rares près de chez toi",          "#3a2c18", "#c69a57", "w"),
]

def soft(hexc, a):
    h = hexc.lstrip("#")
    return "rgba(%d,%d,%d,%.2f)" % (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), a)

def darker(hexc, f=0.72):
    h = hexc.lstrip("#")
    r,g,b = (int(h[i:i+2],16) for i in (0,2,4))
    return "#%02x%02x%02x" % (int(r*f), int(g*f), int(b*f))

def lighter(hexc, f=1.35):
    h = hexc.lstrip("#")
    r,g,b = (min(255,int(int(h[i:i+2],16)*f)) for i in (0,2,4))
    return "#%02x%02x%02x" % (r,g,b)

PAGE = u"""<!doctype html><html><head><meta charset="utf-8"><style>
%(fonts)s
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;
  font-family:'Space Grotesk',system-ui,sans-serif;color:%(ink)s;
  background:
    radial-gradient(90%% 70%% at 50%% 40%%, %(scLight)s, transparent 65%%),
    linear-gradient(160deg, %(sceneLight)s 0%%, %(scene)s 55%%, %(sceneDark)s 100%%)}
/* bulles festives, comme une vraie pub soda */
.bub{position:absolute;border-radius:50%%}
.ring{position:absolute;border-radius:50%%;background:transparent;border:6px solid}
/* chip du haut */
.chip{position:absolute;left:50%%;top:74px;transform:translateX(-50%%);z-index:6;
  display:inline-flex;align-items:center;border-radius:999px;padding:15px 32px;
  font-size:27px;font-weight:700;letter-spacing:.28em;color:%(scene)s;background:%(inkFull)s;
  box-shadow:0 10px 34px rgba(0,0,0,.25)}
/* accroche pub : grosse, penchee, qui claque */
.punch{position:absolute;left:60px;right:60px;top:168px;z-index:6;text-align:center;
  transform:rotate(-2.5deg);
  font-size:%(punchSize)spx;line-height:1.04;font-weight:700;letter-spacing:-.01em;
  color:%(inkFull)s;text-transform:uppercase;
  text-shadow:0 6px 0 %(punchShadow)s,0 14px 44px rgba(0,0,0,.35)}
/* halo clair derriere le produit : il se detache du fond quelle que soit sa couleur */
.halo{position:absolute;left:50%%;top:%(haloY)spx;width:820px;height:820px;transform:translate(-50%%,-50%%);z-index:3;
  background:radial-gradient(closest-side,rgba(255,255,255,.34),rgba(255,255,255,.10) 55%%,transparent 72%%)}
/* le produit, legerement penche = energie */
.bottle{position:absolute;left:50%%;top:%(bottleTop)spx;z-index:4;
  transform:translateX(-50%%) rotate(-4deg);
  width:%(bottleW)spx;height:%(bottleH)spx;filter:drop-shadow(0 44px 70px rgba(0,0,0,.45))}
.bottle svg{width:100%%;height:100%%}
/* bas de carte : NOM entierement visible, puis origine, puis marque */
.footer{position:absolute;left:0;right:0;bottom:44px;z-index:6;display:flex;flex-direction:column;
  align-items:center;gap:14px;padding:0 80px}
.name{font-size:%(nameSize)spx;line-height:.98;font-weight:700;letter-spacing:-.01em;
  color:%(inkFull)s;white-space:pre-line;text-align:center;
  text-shadow:0 4px 0 %(punchShadow)s,0 10px 36px rgba(0,0,0,.3)}
.origin{font-size:30px;font-weight:700;letter-spacing:.34em;color:%(inkSoft)s;text-align:center}
.wm{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:4px;
  font-size:26px;font-weight:700;letter-spacing:.34em;color:%(inkSoft)s}
.wm .mk{width:38px;height:38px}
.scrim{position:absolute;left:0;right:0;bottom:0;height:330px;z-index:5;pointer-events:none;
  background:linear-gradient(180deg,transparent,%(scrimCol)s 75%%)}
.vig{position:absolute;inset:0;z-index:5;pointer-events:none;
  background:radial-gradient(130%% 100%% at 50%% 40%%,transparent 64%%,rgba(0,0,0,.30))}
.grain{position:absolute;inset:-30%%;z-index:7;pointer-events:none;opacity:.05;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/></filter><rect width='100%%25' height='100%%25' filter='url(%%23n)'/></svg>")}
</style></head><body><div class="card">
%(bubbles)s
<div class="chip">BOISSON DU JOUR</div>
<div class="punch">%(fact)s</div>
<div class="halo"></div>
<div class="bottle">%(bottleSvg)s</div>
<div class="scrim"></div>
<div class="footer">
<div class="name">%(name)s</div>
<div class="origin">%(origin)s</div>
<div class="wm"><svg class="mk" viewBox="0 0 200 200"><path d="M42 158V60l58 68 58-68v98" fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="88" r="19" fill="none" stroke="currentColor" stroke-width="10"/></svg>MAGOFEED</div>
</div>
<div class="vig"></div><div class="grain"></div>
</div></body></html>"""

import sys, random
def bulles(acc, ink):
    # semis pseudo-aleatoire mais STABLE (seed fixe) de bulles et d'anneaux,
    # en evitant le centre (le produit) et la bande du bas (le nom).
    rnd=random.Random(7)
    out=[]
    cols=[("#ffffff",.30),("#ffffff",.16),(acc,.38),("#000000",.10)]
    n=0
    while n<15:
        x=rnd.randint(30,1050); y=rnd.randint(130,1050); r=rnd.randint(9,52)
        if 250<x<830 and 300<y<1080: continue     # zone produit/accroche
        col,op=cols[rnd.randint(0,3)]
        if rnd.random()<0.3:
            out.append('<div class="ring" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx;border-color:%s;opacity:%.2f"></div>'%(x,y,r*2,r*2,col,op))
        else:
            out.append('<div class="bub" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx;background:%s;opacity:%.2f"></div>'%(x,y,r*2,r*2,col,op))
        n+=1
    return "".join(out)

only = sys.argv[1:] or None
for slug, name, origin, fact, scene, acc, ink in DRINKS:
    if only and slug not in only: continue
    bp = os.path.join(SP, "bottles", "bottle-%s.svg" % slug)
    if not os.path.exists(bp):
        print("SKIP (pas de bouteille):", slug); continue
    bottle = io.open(bp, encoding="utf-8").read()
    lines = name.split("\n")
    longest = max(len(l) for l in lines)
    nameSize = 92 if longest <= 8 else (76 if longest <= 12 else 62)
    fl = len(fact)
    punchSize = 78 if fl <= 26 else (66 if fl <= 36 else 56)
    punchLines = 1 if fl <= 26 else 2
    punchH = int(punchSize * 1.06 * punchLines)
    bottleTop = 168 + punchH + 34
    bottleH = 1074 - bottleTop
    bottleW = int(bottleH * 900 / 1400)
    blanc = ink == "w"
    inkFull = "#ffffff" if blanc else "#1d1508"
    inkSoft = "rgba(255,255,255,.85)" if blanc else "rgba(29,21,8,.8)"
    page = PAGE % {
        "fonts": FONTS, "scene": scene,
        "sceneLight": lighter(scene,1.28), "sceneDark": darker(scene,.62),
        "scLight": soft(lighter(scene,1.75), .5),
        "ink": inkFull, "inkFull": inkFull, "inkSoft": inkSoft,
        "punchShadow": darker(scene,.5) if blanc else soft(lighter(scene,1.6),.9),
        "scrimCol": soft(darker(scene,.5), .55),
        "name": name, "nameSize": nameSize,
        "punchSize": punchSize, "fact": fact,
        "origin": origin, "bubbles": bulles(acc, ink),
        "bottleTop": bottleTop, "bottleH": bottleH, "bottleW": bottleW,
        "haloY": bottleTop + bottleH // 2,
        "bottleSvg": bottle,
    }
    io.open(os.path.join(SP, "card-%s.html" % slug), "w", encoding="utf-8").write(page)
    print("built card-%s.html" % slug)
