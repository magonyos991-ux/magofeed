# -*- coding: utf-8 -*-
# Carrousel Instagram « Comment trouver ta boisson » — 5 diapos 1080x1350.
# Vraies captures de l'app dans un telephone dessine, fond creme Magofeed.
import io, os, base64
SP = os.path.dirname(os.path.abspath(__file__))
FONTS = io.open(os.path.join(SP, "sg_faces.css"), encoding="utf-8").read()

def b64(name):
    return "data:image/png;base64," + base64.b64encode(open(os.path.join(SP, name), "rb").read()).decode()

CAPS = {"recherche": b64("capt-1-recherche.png"), "carte": b64("capt-2-carte.png"), "fiche": b64("capt-3-fiche.png")}

BASE = u"""<!doctype html><html><head><meta charset="utf-8"><style>
%(fonts)s
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;
  font-family:'Space Grotesk',system-ui,sans-serif;color:#17110a;
  background:
    radial-gradient(80%% 55%% at 50%% 20%%, #fbf8f2, transparent 70%%),
    linear-gradient(170deg,#f4f0e9 0%%,#e9e2d4 100%%)}
.bub{position:absolute;border-radius:50%%;background:#c69a57}
.ring{position:absolute;border-radius:50%%;border:6px solid #c69a57;background:transparent}
.chip{position:absolute;left:50%%;top:64px;transform:translateX(-50%%);z-index:6;
  display:inline-flex;align-items:center;gap:12px;border-radius:999px;padding:14px 30px;
  font-size:25px;font-weight:700;letter-spacing:.3em;color:#f4f0e9;background:#17110a}
.step{position:absolute;left:50%%;top:132px;transform:translateX(-50%%);z-index:6;
  font-size:26px;font-weight:700;letter-spacing:.34em;color:#a8895c}
.title{position:absolute;left:70px;right:70px;top:176px;z-index:6;text-align:center;
  font-size:%(titleSize)spx;line-height:1.02;font-weight:700;letter-spacing:-.015em;color:#17110a}
.sub{position:absolute;left:120px;right:120px;top:%(subTop)spx;z-index:6;text-align:center;
  font-size:33px;font-weight:500;line-height:1.4;color:#5c5142}
/* le telephone */
.phone{position:absolute;left:50%%;top:%(phoneTop)spx;transform:translateX(-50%%) rotate(%(tilt)sdeg);z-index:4;
  width:408px;background:#1a1611;border-radius:58px;padding:13px;
  box-shadow:0 50px 90px rgba(23,17,10,.35),0 12px 30px rgba(23,17,10,.18)}
.phone img{display:block;width:382px;border-radius:46px}
.phone .notch{position:absolute;left:50%%;top:26px;transform:translateX(-50%%);width:110px;height:26px;
  border-radius:999px;background:#1a1611;z-index:5}
.phone .btn{position:absolute;right:-4px;top:170px;width:4px;height:90px;border-radius:2px;background:#3a332a}
.phone .btn2{position:absolute;left:-4px;top:150px;width:4px;height:56px;border-radius:2px;background:#3a332a}
/* annotation */
.mark{position:absolute;z-index:7;border:6px solid #c69a57;border-radius:999px;
  box-shadow:0 0 0 6px rgba(198,154,87,.25),0 10px 30px rgba(23,17,10,.2)}
.swipe{position:absolute;right:70px;bottom:64px;z-index:6;display:flex;align-items:center;gap:14px;
  font-size:28px;font-weight:700;letter-spacing:.14em;color:#17110a}
.swipe svg{width:46px;height:46px}
.pager{position:absolute;left:70px;bottom:64px;z-index:6;display:flex;gap:10px;align-items:center}
.pager i{width:12px;height:12px;border-radius:50%%;background:#c9bda6}
.pager i.on{background:#17110a;width:30px;border-radius:99px}
.wm{position:absolute;left:50%%;bottom:62px;transform:translateX(-50%%);z-index:6;display:flex;align-items:center;gap:12px;
  font-size:23px;font-weight:700;letter-spacing:.3em;color:#8a7a5f}
.wm svg{width:32px;height:32px}
%(extraCss)s
</style></head><body><div class="card">
<div class="bub" style="left:90px;top:300px;width:26px;height:26px;opacity:.18"></div>
<div class="bub" style="left:960px;top:420px;width:40px;height:40px;opacity:.12"></div>
<div class="ring" style="left:120px;top:900px;width:70px;height:70px;opacity:.15"></div>
<div class="ring" style="left:920px;top:1020px;width:52px;height:52px;opacity:.2"></div>
<div class="bub" style="left:180px;top:1180px;width:18px;height:18px;opacity:.22"></div>
<div class="chip">MAGOFEED</div>
%(body)s
<div class="pager">%(pager)s</div>
%(wmHtml)s<div class="wm-off" style="display:none"><svg viewBox="0 0 200 200"><path d="M42 158V60l58 68 58-68v98" fill="none" stroke="#8a7a5f" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="88" r="19" fill="none" stroke="#c69a57" stroke-width="10"/></svg>MAGOFEED</div>
%(swipe)s
</div></body></html>"""

FLECHE = '<div class="swipe">FAIS DÉFILER<svg viewBox="0 0 24 24" fill="none" stroke="#17110a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg></div>'

def pager(n):
    return "".join('<i class="%s"></i>' % ("on" if i == n else "") for i in range(5))

def phone(cap, top, tilt=0, mark=None, w=372):
    m = ('<div class="mark" style="%s"></div>' % mark) if mark else ""
    return ('<div class="phone" style="top:%spx;width:%spx;transform:translateX(-50%%) rotate(%sdeg)">'
            '<div class="btn"></div><div class="btn2"></div>'
            '<img src="%s" style="width:%spx">%s</div>' % (top, w, tilt, CAPS[cap], w-26, m))

SLIDES = [
  # 1 — couverture
  dict(step="", titleSize=92, subTop=0, phoneTop=0, tilt=0, extraCss="""
.title{top:170px;font-size:96px}
.cover-sub{position:absolute;left:120px;right:120px;top:436px;z-index:6;text-align:center;
  font-size:36px;font-weight:600;color:#5c5142}
""",
    body=(u'<div class="title">TROUVE TA BOISSON<br>INTROUVABLE</div>'
          u'<div class="cover-sub">Le mode d’emploi en 3 étapes</div>'
          + phone("recherche", 540, -5, None, 430)),
    swipe=FLECHE, page=0),
  # 2 — etape 1
  dict(step=u"ÉTAPE 1 / 3", titleSize=78, subTop=294, phoneTop=470, tilt=0, extraCss="",
    body=(u'<div class="step">ÉTAPE 1 / 3</div>'
          u'<div class="title">CHERCHE TA BOISSON</div>'
          u'<div class="sub">Tape son nom — sodas japonais, mexicains, coréens… le catalogue mondial est déjà dedans.</div>'
          + phone("recherche", 470)),
    swipe=FLECHE, page=1),
  # 3 — etape 2
  dict(step=u"ÉTAPE 2 / 3", titleSize=78, subTop=294, phoneTop=470, tilt=0, extraCss="",
    body=(u'<div class="step">ÉTAPE 2 / 3</div>'
          u'<div class="title">LA CARTE S’OUVRE</div>'
          u'<div class="sub">Les magasins autour de toi s’affichent. Pin vert = rayon confirmé récemment.</div>'
          + phone("carte", 470, 0, "left:179px;top:354px;width:95px;height:95px")),
    swipe=FLECHE, page=2),
  # 4 — etape 3
  dict(step=u"ÉTAPE 3 / 3", titleSize=78, subTop=294, phoneTop=470, tilt=0, extraCss="",
    body=(u'<div class="step">ÉTAPE 3 / 3</div>'
          u'<div class="title">APPUIE SUR « Y ALLER »</div>'
          u'<div class="sub">L’itinéraire s’ouvre dans Maps ou Waze. Trouvée ? Confirme — tu aides le suivant.</div>'
          + phone("fiche", 470, 0, "left:31px;top:215px;width:294px;height:70px;border-radius:26px")),
    swipe=FLECHE, page=3),
  # 5 — CTA
  dict(step="", titleSize=96, subTop=0, phoneTop=0, tilt=0, extraCss="""
.title{top:330px;font-size:100px}
.cta-sub{position:absolute;left:110px;right:110px;top:600px;z-index:6;text-align:center;
  font-size:38px;font-weight:600;line-height:1.45;color:#5c5142}
.url{position:absolute;left:50%;top:830px;transform:translateX(-50%);z-index:6;
  padding:24px 42px;border-radius:999px;background:#17110a;color:#f4f0e9;
  font-size:28px;font-weight:700;letter-spacing:.02em;white-space:nowrap}
.bio{position:absolute;left:0;right:0;top:966px;z-index:6;text-align:center;
  font-size:30px;font-weight:700;letter-spacing:.22em;color:#a8895c}
.mlogo{position:absolute;left:50%;top:150px;transform:translateX(-50%);z-index:6;width:120px;height:120px}
""",
    body=(u'<svg class="mlogo" viewBox="0 0 200 200"><path d="M42 158V60l58 68 58-68v98" fill="none" stroke="#17110a" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="88" r="19" fill="none" stroke="#c69a57" stroke-width="10"/></svg>'
          u'<div class="title">GRATUIT.<br>SANS COMPTE.</div>'
          u'<div class="cta-sub">Dans ton navigateur, en cinq secondes.<br>Et chaque boisson trouvée aide le suivant à la trouver aussi.</div>'
          u'<div class="url">magonyos991-ux.github.io/magofeed</div>'
          u'<div class="bio">LE LIEN EST DANS LA BIO</div>'),
    swipe="", page=4),
]

import sys
for i, sl in enumerate(SLIDES, 1):
    wm = ('<div class="wm"><svg viewBox="0 0 200 200"><path d="M42 158V60l58 68 58-68v98" fill="none" stroke="#8a7a5f" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="88" r="19" fill="none" stroke="#c69a57" stroke-width="10"/></svg>MAGOFEED</div>') if i == 5 else ""
    page = BASE % dict(fonts=FONTS, titleSize=sl["titleSize"], subTop=sl["subTop"],
                       phoneTop=sl["phoneTop"], tilt=sl["tilt"], extraCss=sl["extraCss"],
                       body=sl["body"], swipe=sl["swipe"], pager=pager(sl["page"]), wmHtml=wm)
    io.open(os.path.join(SP, "card-tuto-%d.html" % i), "w", encoding="utf-8").write(page)
    print("built card-tuto-%d.html" % i)
