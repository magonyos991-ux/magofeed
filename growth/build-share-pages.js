/* ============================================================================
   GÉNÉRATEUR DE PAGES DE PARTAGE "OÙ TROUVER X"
   ----------------------------------------------------------------------------
   Pourquoi : l'app est un site statique (GitHub Pages). Les aperçus de lien
   (la vignette qui s'affiche sur WhatsApp/TikTok/insta/Facebook) sont lus par
   des robots qui n'exécutent PAS le JavaScript et ignorent le fragment #.
   Impossible donc d'avoir un aperçu par boisson avec la seule app.
   La solution : pré-générer UNE petite page HTML par boisson, avec ses vraies
   balises Open Graph (titre + description spécifiques), qui redirige ensuite
   le visiteur humain dans l'app (index.html#drink=<id>).

   Résultat : chaque lien partagé affiche « Où trouver <Boisson> près de toi »
   avec la photo produit si elle existe, sinon l'image de marque Magofeed.

   Usage :  node growth/build-share-pages.js
   Sortie : /f/<id>.html (une par boisson)  +  /icons/og-share.jpg (défaut)
   À relancer quand le catalogue natif (tableau DRINKS d'index.html) grandit.
   Les boissons communautaires (ajoutées via Firestore) n'ont pas de page :
   l'app retombe alors proprement sur le lien #drink=<id> (aperçu générique).
============================================================================ */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE = "https://magonyos991-ux.github.io/magofeed"; // base publique stable
const OUT_DIR = path.join(ROOT, "f");
const OG_DEFAULT_REL = "icons/og-share.jpg";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function firstProductImg(d) {
  if (!d.formats) return null;
  for (const f of d.formats) if (f && f.img) return f.img;
  return null;
}

/* Carte de marque 1200×630 utilisée en image par défaut (une seule, légère). */
function defaultOgHTML() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
    #c{width:1200px;height:630px;position:relative;overflow:hidden;
       background:radial-gradient(120% 120% at 22% 18%,#2c2620 0%,#1a1714 55%,#0e0c0a 100%);color:#f6f1e9}
    .glow{position:absolute;border-radius:50%;filter:blur(2px);opacity:.9}
    .g1{width:340px;height:340px;right:-70px;top:-90px;background:radial-gradient(circle,#e67e2255,transparent 70%)}
    .g2{width:300px;height:300px;left:-60px;bottom:-90px;background:radial-gradient(circle,#c69a5744,transparent 70%)}
    .wrap{position:absolute;inset:0;padding:82px 88px;display:flex;flex-direction:column;justify-content:center}
    .brand{font-size:30px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#c69a57;margin-bottom:26px}
    h1{font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;max-width:900px}
    h1 span{color:#e6a15a}
    p{font-size:30px;color:#c9bfb2;margin-top:26px;font-weight:500}
    .pill{margin-top:40px;display:inline-flex;align-items:center;gap:12px;align-self:flex-start;
          background:#f6f1e9;color:#1a1714;font-size:24px;font-weight:800;padding:16px 26px;border-radius:999px}
    .dot{width:13px;height:13px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 5px #22c55e33}
  </style></head><body>
    <div id="c"><div class="glow g1"></div><div class="glow g2"></div>
      <div class="wrap">
        <div class="brand">Magofeed</div>
        <h1>Trouve les <span>boissons rares</span><br>près de chez toi</h1>
        <p>Sodas, ice tea, energy, jus du monde entier — repérés par la communauté.</p>
        <div class="pill"><span class="dot"></span>Voir les magasins près de toi</div>
      </div>
    </div>
  </body></html>`;
}

/* Page de partage d'une boisson : OG spécifiques + redirection dans l'app. */
function drinkPageHTML(d) {
  const id = d.id;
  const name = d.name || "cette boisson";
  const bits = [d.brand, d.cat].filter(Boolean).join(" · ");
  const title = "Où trouver " + name + " près de toi";
  const desc = (bits ? bits + " — " : "") +
    "Magofeed te montre les magasins qui l'ont en stock près de chez toi. Gratuit.";
  const prod = firstProductImg(d);
  const ogImg = prod ? prod : (BASE + "/" + OG_DEFAULT_REL);
  const target = "../index.html#drink=" + id;
  const pageUrl = BASE + "/f/" + id + ".html";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Magofeed</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Magofeed">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(pageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImg)}">
<meta name="theme-color" content="#1a1714">
<link rel="icon" href="../icons/favicon-32.png">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<style>
  html,body{height:100%;margin:0}
  body{background:#1a1714;color:#f6f1e9;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
       display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
  .card{max-width:360px}
  .brand{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#c69a57;margin-bottom:14px}
  h1{font-size:22px;font-weight:800;line-height:1.3;margin:0 0 10px}
  p{font-size:14px;color:#c9bfb2;margin:0 0 22px}
  a.btn{display:inline-block;background:#f6f1e9;color:#1a1714;text-decoration:none;font-weight:800;
        font-size:15px;padding:13px 22px;border-radius:14px}
  .spin{width:26px;height:26px;border:3px solid #ffffff33;border-top-color:#c69a57;border-radius:50%;
        margin:0 auto 18px;animation:s 1s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
</style>
</head>
<body>
  <div class="card">
    <div class="spin"></div>
    <div class="brand">Magofeed</div>
    <h1>${esc(title)}</h1>
    <p>Ouverture de la carte des magasins près de toi…</p>
    <a class="btn" href="${esc(target)}">Voir les magasins</a>
  </div>
  <script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium",
  });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const page = await ctx.newPage();

  // 1) Lire le catalogue natif depuis l'app (réseau bloqué => pas de fusion communautaire).
  await page.goto("file://" + path.join(ROOT, "index.html"), { waitUntil: "load" });
  await page.waitForTimeout(800);
  const drinks = await page.evaluate(() => (window.DRINKS || []).map(d => ({
    id: d.id, name: d.name, brand: d.brand, cat: d.cat,
    formats: (d.formats || []).map(f => ({ img: f && f.img ? f.img : null })),
  })));
  if (!drinks.length) { console.error("Aucune boisson lue depuis DRINKS — abandon."); process.exit(1); }

  // 2) Image OG de marque par défaut (une seule).
  const ogPage = await ctx.newPage();
  await ogPage.setContent(defaultOgHTML(), { waitUntil: "load" });
  const el = await ogPage.$("#c");
  const jpg = await el.screenshot({ type: "jpeg", quality: 86 });
  fs.mkdirSync(path.join(ROOT, "icons"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OG_DEFAULT_REL), jpg);
  console.log("✓ Image par défaut  ->", OG_DEFAULT_REL, "(" + Math.round(jpg.length / 1024) + " Ko)");

  // 3) Une page de partage par boisson.
  if (fs.existsSync(OUT_DIR)) {
    for (const f of fs.readdirSync(OUT_DIR)) if (/\.html$/.test(f)) fs.unlinkSync(path.join(OUT_DIR, f));
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ids = [];
  for (const d of drinks) {
    if (d.id == null) continue;
    fs.writeFileSync(path.join(OUT_DIR, d.id + ".html"), drinkPageHTML(d));
    ids.push(d.id);
  }
  // Manifeste : la liste des ids ayant une page (pour info / vérif ; l'app se
  // base de son côté sur ses ids natifs, connus du même tableau DRINKS).
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"),
    JSON.stringify({ generatedFrom: "index.html DRINKS", count: ids.length, ids }, null, 0));

  console.log("✓ Pages de partage ->", OUT_DIR + "/  (" + ids.length + " boissons)");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
