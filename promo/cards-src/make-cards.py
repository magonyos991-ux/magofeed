# -*- coding: utf-8 -*-
# Banque de cartes v2 : LA BOISSON EST L'IMAGE. Illustration vectorielle de la
# bouteille/canette au centre, fond colore par boisson, nom geant derriere.
# Memes noms de fichiers que la v1 -> n8n continue de marcher sans changement.
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
FONTS = io.open(os.path.join(SP, "sg_faces.css"), encoding="utf-8").read()

# slug, nom (\n = retour ligne), origine, fait court, couleur de scene (fond), accent clair
DRINKS = [
    ("ramune",             "RAMUNE",            "JAPON",        "Le soda à la bille de verre",                  "#0d2f52", "#7db8e8"),
    ("guarana-antarctica", "GUARANÁ\nANTARCTICA","BRÉSIL",      "Le soda préféré du Brésil depuis 1921",        "#0d3d22", "#4ec978"),
    ("calpico",            "CALPICO",           "JAPON",        "Le goût yaourt culte, né en 1919",             "#3d3423", "#f2e3bb"),
    ("mogu-mogu",          "MOGU MOGU",         "THAÏLANDE",    "Le jus qui se mâche — nata de coco",           "#4a2a0e", "#ffa94d"),
    ("inca-kola",          "INCA KOLA",         "PÉROU",        "La boisson dorée qui bat le cola chez elle",   "#4a3a06", "#ffd23e"),
    ("milkis",             "MILKIS",            "CORÉE",        "Doux, lacté, pétillant",                       "#1e3a52", "#a8d8ff"),
    ("ciao-energy",        "CIAO ENERGY",       "L'INTROUVABLE","Tout le monde en parle, personne ne la trouve","#3d3006", "#f2c94c"),
    ("jarritos",           "JARRITOS",          "MEXIQUE",      "Les sodas aux vrais fruits depuis 1950",       "#4a1e10", "#ff7a59"),
    ("sumol",              "SUMOL",             "PORTUGAL",     "L'ananas pétillant de Lisbonne",               "#4a3206", "#ffc24d"),
    ("pocari-sweat",       "POCARI SWEAT",     "JAPON",        "La désaltérante n°1 du Japon",                 "#123c5c", "#6fc3e8"),
    ("vimto",              "VIMTO",             "ANGLETERRE",   "Le fruité culte de Manchester, depuis 1908",   "#2e1440", "#b57de8"),
    ("chupa-chups",        "CHUPA CHUPS","CORÉE",    "La sucette devenue soda",                      "#4a1c2e", "#ff8fb3"),
    ("generic",            "BOISSON\nDU JOUR",  "MAGOFEED",     "Les boissons rares près de chez toi",          "#2b2114", "#c69a57"),
]

def soft(hexc, a):
    h = hexc.lstrip("#")
    return "rgba(%d,%d,%d,%.2f)" % (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), a)

def lighter(hexc, f=1.35):
    h = hexc.lstrip("#")
    r,g,b = (min(255,int(int(h[i:i+2],16)*f)) for i in (0,2,4))
    return "#%02x%02x%02x" % (r,g,b)

PAGE = u"""<!doctype html><html><head><meta charset="utf-8"><style>
%(fonts)s
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;
  font-family:'Space Grotesk',system-ui,sans-serif;color:#f4f0e9;
  background:
    radial-gradient(120%% 80%% at 50%% 30%%, %(scLight)s, transparent 60%%),
    linear-gradient(168deg, %(scene)s 0%%, #100905 96%%)}
/* rayon de lumiere diagonal */
.beam{position:absolute;left:-15%%;top:-30%%;width:70%%;height:160%%;transform:rotate(18deg);
  background:linear-gradient(90deg,transparent,%(accSoft12)s,transparent)}
/* halo derriere la bouteille */
.halo{position:absolute;left:50%%;top:58%%;width:940px;height:940px;transform:translate(-50%%,-50%%);
  background:radial-gradient(closest-side,%(accSoft35)s,%(accSoft10)s 55%%,transparent 72%%)}
/* particules */
.spark{position:absolute;border-radius:50%%;background:%(accent)s}
/* chip du haut */
.chip{position:absolute;left:50%%;top:88px;transform:translateX(-50%%);z-index:6;
  display:inline-flex;align-items:center;gap:14px;border-radius:999px;padding:16px 34px;
  font-size:29px;font-weight:700;letter-spacing:.28em;color:#17110a;background:%(accent)s;
  box-shadow:0 12px 40px %(accSoft35)s}
/* nom geant ENTIEREMENT VISIBLE au-dessus de la bouteille */
.name{position:absolute;left:40px;right:40px;top:196px;z-index:6;text-align:center;
  font-size:%(nameSize)spx;line-height:.96;font-weight:700;letter-spacing:-.02em;
  color:%(accent)s;white-space:pre-line;
  text-shadow:0 0 110px %(accSoft45)s,0 8px 40px rgba(0,0,0,.5)}
/* la bouteille commence SOUS le nom, rien ne se chevauche */
.bottle{position:absolute;left:50%%;top:%(bottleTop)spx;transform:translateX(-50%%);z-index:4;
  width:%(bottleW)spx;height:%(bottleH)spx;filter:drop-shadow(0 40px 70px rgba(0,0,0,.55))}
.bottle svg{width:100%%;height:100%%}
/* bandeau bas */
.scrim{position:absolute;left:0;right:0;bottom:0;height:400px;z-index:5;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(8,5,3,.72) 62%%)}
.footer{position:absolute;left:0;right:0;bottom:46px;z-index:6;display:flex;flex-direction:column;
  align-items:center;gap:20px;padding:0 90px}
.origin{font-size:33px;font-weight:700;letter-spacing:.34em;color:%(accent)s;text-align:center}
.fact{font-size:42px;font-weight:600;line-height:1.25;color:#efe9df;text-align:center;
  text-shadow:0 4px 30px rgba(0,0,0,.6)}
.wm{display:flex;align-items:center;justify-content:center;gap:15px;margin-top:6px;
  font-size:28px;font-weight:700;letter-spacing:.34em;color:rgba(244,240,233,.8)}
.wm .mk{width:40px;height:40px}
.vig{position:absolute;inset:0;z-index:5;pointer-events:none;
  background:radial-gradient(125%% 95%% at 50%% 42%%,transparent 58%%,rgba(0,0,0,.5))}
.grain{position:absolute;inset:-30%%;z-index:7;pointer-events:none;opacity:.05;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/></filter><rect width='100%%25' height='100%%25' filter='url(%%23n)'/></svg>")}
</style></head><body><div class="card">
<div class="beam"></div><div class="halo"></div>
<div class="spark" style="left:130px;top:420px;width:10px;height:10px;opacity:.5"></div>
<div class="spark" style="left:950px;top:360px;width:14px;height:14px;opacity:.4"></div>
<div class="spark" style="left:210px;top:900px;width:8px;height:8px;opacity:.45"></div>
<div class="spark" style="left:905px;top:1010px;width:12px;height:12px;opacity:.35"></div>
<div class="spark" style="left:80px;top:700px;width:6px;height:6px;opacity:.5"></div>
<div class="spark" style="left:1000px;top:680px;width:8px;height:8px;opacity:.45"></div>
<div class="chip">BOISSON DU JOUR</div>
<div class="name">%(name)s</div>
<div class="bottle">%(bottleSvg)s</div>
<div class="scrim"></div>
<div class="footer">
<div class="origin">%(origin)s</div>
<div class="fact">%(fact)s</div>
<div class="wm"><svg class="mk" viewBox="0 0 200 200"><path d="M42 158V60l58 68 58-68v98" fill="none" stroke="#e8d9c2" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="88" r="19" fill="none" stroke="#c69a57" stroke-width="10"/></svg>MAGOFEED</div>
</div>
<div class="vig"></div><div class="grain"></div>
</div></body></html>"""

import sys
only = sys.argv[1:] or None
for slug, name, origin, fact, scene, acc in DRINKS:
    if only and slug not in only: continue
    bp = os.path.join(SP, "bottles", "bottle-%s.svg" % slug)
    if not os.path.exists(bp):
        print("SKIP (pas de bouteille):", slug); continue
    bottle = io.open(bp, encoding="utf-8").read()
    # nom sur 1 ligne = 150px ; 2 lignes = 118px ; tres long = plus petit
    lines = name.split("\n")
    longest = max(len(l) for l in lines)
    size = 138 if longest <= 8 else (104 if longest <= 12 else 86)
    nameH = int(size * len(lines) * 0.98)
    bottleTop = 196 + nameH + 26
    bottleH = 1092 - bottleTop
    bottleW = int(bottleH * 900 / 1400)
    page = PAGE % {
        "fonts": FONTS, "scene": scene, "scLight": soft(lighter(scene,1.9), .55),
        "accent": acc, "accSoft45": soft(acc,.45), "accSoft35": soft(acc,.35),
        "accSoft12": soft(acc,.12), "accSoft10": soft(acc,.10),
        "name": name, "nameSize": size, "origin": origin, "fact": fact,
        "bottleTop": bottleTop, "bottleH": bottleH, "bottleW": bottleW,
        "bottleSvg": bottle,
    }
    io.open(os.path.join(SP, "card-%s.html" % slug), "w", encoding="utf-8").write(page)
    print("built card-%s.html" % slug)
