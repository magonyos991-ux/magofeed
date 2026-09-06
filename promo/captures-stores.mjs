/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   CAPTURES D'ECRAN POUR L'APP STORE ET GOOGLE PLAY
   ----------------------------------------------------------------------------
   Produit les captures exigees par les deux magasins, aux dimensions EXACTES,
   sans jamais agrandir une image : chaque taille est rendue dans sa propre
   fenetre, au bon rapport, puis photographiee telle quelle. Un agrandissement
   se verrait — les magasins refusent les captures floues.

     Google Play (telephone)   1080 x 1920   = 360 x 640 CSS en x3
     App Store  (iPhone 6.7")  1290 x 2796   = 430 x 932 CSS en x3

   HONNETETE DES CAPTURES. Les magasins de demonstration sont explicitement
   fictifs et servent uniquement a montrer la mise en page ; aucune capture ne
   pretend qu'une boisson est disponible quelque part. L'ecran de scan est pris
   AVANT l'allumage de la camera : plutot qu'un faux rayon de supermarche, on
   montre l'ecran d'accueil reel du scanner, avec ses vraies instructions.

   RESEAU. Le conteneur n'a pas d'acces direct : le SDK Firebase, Leaflet et
   Quagga sont servis depuis un cache disque, les tuiles de carte passent par
   curl. Firestore et l'authentification sont coupes net — l'app doit savoir
   s'afficher sans eux, et si elle ne le sait pas, la capture le montrera.

   Lancer :  node promo/captures-stores.mjs
   ============================================================================ */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { execFileSync } from 'child_process';

const CACHE = '/tmp/claude-0/-home-user-magofeed/a4554d7d-14ce-523f-8a9e-0a25d074053d/scratchpad';
const ROOT  = '/home/user/magofeed';
const SORTIE = ROOT + '/promo/stores/';

/* Les deux formats demandes. Le facteur 3 est celui des telephones recents :
   on rend en CSS a la taille logique et le pixel final tombe juste. */
const FORMATS = [
  { cle: 'play',    largeur: 360, hauteur: 640, echelle: 3, attendu: '1080x1920' },
  { cle: 'appstore', largeur: 430, hauteur: 932, echelle: 3, attendu: '1290x2796' }
];

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
               '.json':'application/json', '.webmanifest':'application/manifest+json' };

const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8182, r));

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});

const rapport = [];

for (const fmt of FORMATS) {
  const ctx = await nav.newContext({
    viewport: { width: fmt.largeur, height: fmt.hauteur },
    deviceScaleFactor: fmt.echelle,
    isMobile: true, hasTouch: true,
    permissions: ['geolocation'],
    geolocation: { latitude: 50.8466, longitude: 4.3528 },
    locale: 'fr-BE', timezoneId: 'Europe/Brussels'
  });

  /* SDK Firebase depuis le cache disque */
  await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/*', r => {
    const n = r.request().url().split('/').pop(); const f = CACHE + '/fbsdk/' + n;
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f, 'utf8') });
  });
  /* Leaflet, son cluster et Quagga depuis le cache disque */
  await ctx.route('**/cdnjs.cloudflare.com/**', r => {
    const n = r.request().url().split('/').pop(); const f = CACHE + '/leaflet/' + n;
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    /* Les icones par defaut de Leaflet sont des PNG : servies en texte, elles
       arrivaient cassees et la carte se couvrait de petits carres gris. */
    const png = n.endsWith('.png');
    r.fulfill({ status: 200,
      contentType: png ? 'image/png' : n.endsWith('.css') ? 'text/css' : 'text/javascript',
      body: png ? fs.readFileSync(f) : fs.readFileSync(f, 'utf8') });
  });
  /* Tuiles OpenStreetMap : curl a le proxy, pas Chromium. Cache disque partage
     entre les deux formats, donc telechargees une seule fois. */
  await ctx.route('**/tile.openstreetmap.org/**', r => {
    const u = new URL(r.request().url());
    const f = CACHE + '/tiles/' + u.pathname.replace(/[^a-z0-9]/gi, '_') + '.png';
    try {
      if (!fs.existsSync(f)) execFileSync('curl', ['-s','-o',f,'-A','Magofeed/1.0 (+https://github.com/magonyos991-ux/magofeed)','https://tile.openstreetmap.org' + u.pathname], { timeout: 20000 });
      r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(f) });
    } catch (e) { r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }); }
  });
  /* Coupes net : la capture doit montrer l'app telle qu'elle s'affiche sans eux. */
  for (const h of ['identitytoolkit.googleapis.com','firestore.googleapis.com',
                   'firebaseinstallations.googleapis.com','fcmregistrations.googleapis.com',
                   'images.openfoodfacts.org','world.openfoodfacts.org'])
    await ctx.route('**/' + h + '/**', r => r.abort('failed'));
  await ctx.route('**/nominatim.openstreetmap.org/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"address":{"road":"Chaussée d\'Ixelles","city":"Bruxelles"}}' }));

  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message).slice(0, 140)));

  /* On saute l'accueil du premier lancement et les bulles d'aide : elles
     recouvrent l'ecran et n'ont rien a faire sur une capture de magasin. */
  await page.addInitScript(() => {
    localStorage.setItem('magoob', '1');
    localStorage.setItem('magopseudo', 'Explorateur');
    localStorage.setItem('magotuto', '1');
    localStorage.setItem('magoCoach', JSON.stringify({ home:1, search:1, scan:1, discover:1, profile:1, results:1, storedetail:1 }));
    localStorage.setItem('magoFeedbackDone', '1');
    localStorage.setItem('magoFeedbackAsked', '1');
    try { Object.defineProperty(navigator, 'serviceWorker', { get: () => ({ register: () => new Promise(() => {}), ready: new Promise(() => {}), addEventListener() {}, controller: null }) }); } catch (e) {}
  });

  await page.goto('http://localhost:8182/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  /* Magasins de demonstration, ouvertement fictifs. */
  const info = await page.evaluate(() => {
    userLat = 50.8466; userLng = 4.3528;
    const md = (window.DRINKS || []).find(d => /mountain/i.test(d.name || ''));
    const dId = md ? md.id : (window.DRINKS && DRINKS[0] && DRINKS[0].id);
    const noms = [['Night Shop Agora','night shop',50.8477,4.3550],
                  ['Delhaize City','supermarché',50.8452,4.3492],
                  ['Épicerie du Centre','épicerie exotique',50.8443,4.3560],
                  ['Carrefour Express','supermarché',50.8488,4.3515],
                  ['Asia Market','épicerie asiatique',50.8459,4.3585]];
    window.STORES = STORES = noms.map((n, i) => ({
      id:'d'+i, fbId:'d'+i, name:n[0], type:n[1], lat:n[2], lng:n[3], brand:'',
      drinks:[dId,1,2,3], drinksVerified: i<3 ? [dId] : [],
      confirmations:{ [dId]: i<3 ? 3 : 0, 1:2, 2:2, 3:2 },
      seenAt:{ [dId]: Date.now() - 86400000*(i+1) },
      certified: i === 0
    }));
    STORES.forEach(s => { s.dist = Math.round(haversine(userLat, userLng, s.lat, s.lng)); });
    window.fbQueryZone = function () { return Promise.resolve(window.STORES.slice()); };
    try { renderNearby(); } catch (e) {}
    return { boisson: md ? md.name : '?', dId };
  });

  /* Bulles d'aide et toasts : on les retire juste avant chaque declic. */
  const netto = async () => { await page.evaluate(() => {
    ['tuto-overlay','coach-bulle','mago-toast'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    document.querySelectorAll('.coach-tip,.coach-bubble,[id^=coach],.toast').forEach(e => e.remove());
  }); };

  const prendre = async (nom) => {
    await netto();
    const p = SORTIE + fmt.cle + '-' + nom + '.png';
    await page.screenshot({ path: p });
    rapport.push({ fichier: path.basename(p) });
  };

  // 1 — Accueil
  await page.evaluate(() => { show('home'); });
  await page.waitForTimeout(1200); await prendre('1-accueil');

  // 2 — Recherche avec une requete tapee
  await page.evaluate(() => { show('search'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const q = document.getElementById('q'); q.value = 'mountain dew';
    q.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(1200); await prendre('2-recherche');

  // 3 — La carte des magasins
  await page.evaluate(() => { const md = (window.DRINKS || []).find(d => /mountain/i.test(d.name || '')); pick(md || DRINKS[0]); });
  await page.waitForTimeout(6000);
  /* CADRAGE. Au zoom 15 les cinq magasins tombaient tous dans un seul badge
     « 5 » : la capture montrait un pin unique au milieu de Bruxelles, ce qui
     ne dit rien de ce que fait l'app. On cadre sur les magasins eux-memes,
     avec une marge, pour que chaque pin se detache. */
  await page.evaluate(() => { try { exploreMap.setView([50.8464, 4.3538], 16); } catch (e) {} });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { exploreLoadStores(true); } catch (e) {} });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    try {
      const pts = (window.STORES || []).map(s => [s.lat, s.lng]);
      if (pts.length) exploreMap.fitBounds(L.latLngBounds(pts).pad(0.35), { animate: false });
    } catch (e) {}
  });
  await page.waitForTimeout(2500); await prendre('3-carte');

  // 4 — La fiche d'un magasin
  await page.evaluate(() => { openStoreDetail('d0'); });
  await page.waitForTimeout(2200); await prendre('4-fiche-magasin');

  // 5 — Le scanner, AVANT l'allumage de la camera
  await page.evaluate(() => { show('scan'); });
  await page.waitForTimeout(1500); await prendre('5-scan');

  rapport.push({ format: fmt.cle, attendu: fmt.attendu, boisson: info.boisson,
                 erreursPage: erreurs.slice(0, 4) });
  await ctx.close();
}

await nav.close(); srv.close();
console.log(JSON.stringify(rapport, null, 1));
