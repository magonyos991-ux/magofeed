// Démo filmée de l'app : Magofeed est piloté comme un vrai utilisateur
// (recherche, carte, fiche magasin, confirmation, profil) et l'écran est
// enregistré — l'équivalent d'un screen recording sur téléphone.
//
// Usage :
//   node promo/render-demo.mjs              -> promo/out/magofeed-demo.mp4
//   node promo/render-demo.mjs --shots      -> captures PNG de chaque étape (mise au point)
//   node promo/render-demo.mjs --smooth     -> sortie 50 i/s (interpolation, ~30 min)
//   node promo/render-demo.mjs --no-music   -> sans bande-son
//
// Prérequis : npm i playwright  ·  ffmpeg dans le PATH pour le MP4.
//
// Les magasins affichés sont les VRAIES données de production (lecture seule,
// via l'API REST Firestore). Ils sont injectés dans le cache local de l'app :
// le navigateur d'un environnement d'automatisation ne peut pas ouvrir le
// canal temps réel Firestore. Aucune écriture n'est faite sur la base.

import { chromium } from 'playwright';
import { execFile, spawn, spawnSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(DIR, '..');
const OUT = path.join(DIR, 'out');
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = process.argv.includes('--shots');
const NO_MUSIC = process.argv.includes('--no-music');
// L'enregistreur capture au rythme du compositeur (~25 i/s sur cette taille).
// --smooth recalcule les images intermédiaires pour sortir en 50 i/s : c'est
// nettement plus fluide sur les défilements, mais comptez ~30 min de calcul.
const SMOOTH = process.argv.includes('--smooth');
const PORT = Number(process.env.MAGOFEED_PORT || 8099);

/* ── Réglages de la démo ─────────────────────────────────────────── */
const CENTER = { lat: 50.8500, lng: 4.3510 };        // Bruxelles, place de la Bourse
const CACHE_RADIUS_KM = 30;                          // ≥ tous les rayons demandés par l'app
const SEED_RADIUS_KM = 6;
const PSEUDO = 'Sami';
const QUERY = 'Mogu';                                // ce qu'on tape
const DRINK = 'Mogu Mogu Litchi';                    // ce qu'on choisit
const WHEN = new Date('2026-08-04T15:20:00+02:00');  // après-midi : les magasins sont ouverts
const PROJECT = 'magofeed-7f621';
const API_KEY = 'AIzaSyCjeQJcdpDJJdlqGX6Eb3MLKPCMP1YsNRM';   // clé web publique (déjà dans index.html)

// L'enregistrement de Playwright capture en pixels CSS : pour sortir en 1080p
// net, on prend une fenêtre 1080 de large et on applique un zoom CSS, ce qui
// laisse l'app se composer sur 390 px de large — un gabarit d'iPhone.
const PHONE = { width: 390, height: 844 };           // gabarit iPhone
const ZOOM = 1080 / PHONE.width;                     // 2,769
const VIEW = { width: 1080, height: Math.round(PHONE.height * ZOOM) };

/* ── Petit serveur statique ──────────────────────────────────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rq.writeHead(404); return rq.end(); }
      rq.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rq);
    });
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}

/* ── Lecture des vrais magasins (REST, lecture seule) ────────────── */
function httpGetJson(url) {
  return new Promise(res => {
    execFile('curl', ['-sS', '--max-time', '45', url], { maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
      if (err) return res(null);
      try { res(JSON.parse(out)); } catch (e) { res(null); }
    });
  });
}
function fsVal(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsVal);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fsVal(x)]));
  return null;
}
function haversineM(a, b, c, d) {
  const R = 6371000, p = Math.PI / 180;
  const x = (c - a) * p, y = (d - b) * p;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2));
}
async function loadStores() {
  const cacheFile = path.join(OUT, '.stores-cache.json');
  let docs = [];
  if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < 24 * 3600e3) {
    docs = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } else {
    const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/stores`;
    let token = '';
    for (let i = 0; i < 12; i++) {
      const d = await httpGetJson(`${base}?pageSize=300${token ? '&pageToken=' + token : ''}&key=${API_KEY}`);
      if (!d || !d.documents) break;
      for (const doc of d.documents) {
        const f = Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fsVal(v)]));
        f._id = doc.name.split('/').pop();
        docs.push(f);
      }
      token = d.nextPageToken || '';
      if (!token) break;
    }
    if (docs.length) fs.writeFileSync(cacheFile, JSON.stringify(docs));
  }
  const near = [];
  for (const r of docs) {
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
    const dist = Math.round(haversineM(CENTER.lat, CENTER.lng, r.lat, r.lng));
    if (dist > SEED_RADIUS_KM * 1000) continue;
    near.push({
      id: r._id, fbId: r._id, name: r.name || 'Magasin', brand: r.brand || '', emoji: r.emoji || '',
      lat: r.lat, lng: r.lng, type: r.type || '', hours: r.hours || null, dist,
      drinks: r.drinks || [], drinksVerified: r.drinksVerified || [],
      confirmations: r.confirmations || {}, community: !!r.community,
    });
  }
  near.sort((a, b) => a.dist - b.dist);
  return near;
}

/* ── Relais réseau (environnements où le navigateur ne sort pas) ─── */
async function installRelay(ctx) {
  const cache = path.join(OUT, '.netcache');
  fs.mkdirSync(cache, { recursive: true });
  const crypto = await import('crypto');
  const SKIP_REQ = /^(host|connection|content-length|accept-encoding|proxy-|sec-ch-|sec-fetch)/i;
  const SKIP_RES = /^(content-encoding|content-length|transfer-encoding|connection|strict-transport)/i;
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('data:')) return route.continue();
    const body = req.postDataBuffer();
    const key = crypto.createHash('sha1').update(req.method() + url + (body ? body.toString('base64') : '')).digest('hex');
    const bf = path.join(cache, key + '.body'), hf = path.join(cache, key + '.head');
    if (!fs.existsSync(bf)) {
      const args = ['-sS', '--compressed', '--max-time', '25', '-o', bf, '-D', hf];
      if (req.method() !== 'GET') args.push('-X', req.method());
      for (const [k, v] of Object.entries(req.headers())) if (!SKIP_REQ.test(k)) args.push('-H', `${k}: ${v}`);
      if (body) { const f = path.join(cache, key + '.req'); fs.writeFileSync(f, body); args.push('--data-binary', '@' + f); }
      args.push(url);
      const ok = await new Promise(r => execFile('curl', args, { encoding: 'buffer', timeout: 30000, maxBuffer: 64 * 1024 * 1024 }, e => r(!e)));
      const st = ok && fs.existsSync(hf) ? parseInt((fs.readFileSync(hf, 'utf8').trim().split(/\r?\n\r?\n/).pop().split(/\r?\n/)[0].match(/\s(\d{3})\s/) || [])[1] || '200', 10) : 599;
      if (!ok || st >= 400) { try { fs.unlinkSync(bf); } catch (e) {} return route.abort(); }
    }
    const block = (fs.existsSync(hf) ? fs.readFileSync(hf, 'utf8') : 'HTTP/1.1 200 OK').trim().split(/\r?\n\r?\n/).pop();
    const lines = block.split(/\r?\n/);
    const headers = {};
    for (const l of lines.slice(1)) {
      const i = l.indexOf(':'); if (i < 0) continue;
      const k = l.slice(0, i).trim(); if (!SKIP_RES.test(k)) headers[k] = l.slice(i + 1).trim();
    }
    headers['access-control-allow-origin'] = headers['access-control-allow-origin'] || '*';
    return route.fulfill({ status: parseInt((lines[0].match(/\s(\d{3})\s/) || [])[1] || '200', 10), headers, body: fs.readFileSync(bf) });
  });
}

/* ── Habillage : indicateur de tap, comme sur une vraie démo ─────── */
const TAP_CSS = `
  html{zoom:__ZOOM__}
  /* Sous zoom CSS, les éléments plein écran (position:fixed, inset:0, 100dvh)
     se calculent sur la fenêtre réelle (1080×2337) et non sur le gabarit
     téléphone : on leur rend leur taille, sinon la carte plein écran et la
     feuille du bas débordent largement hors de l'image. */
  #map-box.map-fullscreen,#explore-map-host{
    width:__PW__px!important;height:__PH__px!important;
    top:0!important;left:0!important;right:auto!important;bottom:auto!important}
  #__demotap{position:fixed;z-index:2147483647;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;
    pointer-events:none;opacity:0;background:rgba(26,23,20,.16);border:2px solid rgba(26,23,20,.4)}
  #__demotap.go{animation:__tapa .5s ease-out}
  @keyframes __tapa{0%{opacity:.9;transform:scale(.5)}100%{opacity:0;transform:scale(1.25)}}
`;

async function main() {
  const srv = await serve();
  const stores = await loadStores();
  console.log(`Magasins réels chargés autour de Bruxelles : ${stores.length}` + (stores[0] ? ` (le plus proche : ${stores[0].name}, ${stores[0].dist} m)` : ''));
  if (!stores.length) console.log('⚠  aucun magasin récupéré — la démo montrera une carte vide.');

  const browser = await chromium.launch({ executablePath: findChrome() });
  const ctx = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: 1, hasTouch: true,
    locale: 'fr-FR', timezoneId: 'Europe/Brussels',
    geolocation: { latitude: CENTER.lat, longitude: CENTER.lng }, permissions: ['geolocation'],
    ...(SHOTS ? {} : { recordVideo: { dir: OUT, size: VIEW } }),
  });
  // On se cale un après-midi (magasins ouverts) mais le temps doit continuer à
  // s'écouler : avec une horloge figée, le chargement de la carte ne finit jamais.
  await ctx.clock.install({ time: WHEN });
  await ctx.clock.resume();
  if (process.env.MAGOFEED_RELAY === '1') await installRelay(ctx);
  // Le canal temps réel Firestore ne passe pas depuis un navigateur piloté :
  // on coupe court plutôt que de filmer des spinners. Lecture seule, aucune écriture.
  await ctx.route('**://firestore.googleapis.com/**', r => r.abort());

  await ctx.addInitScript(({ stores, center, radiusKm, pseudo, css, zoom }) => {
    try {
      localStorage.setItem('magoob', '1');       // intro déjà vue
      localStorage.setItem('magotuto', '1');     // tutoriel déjà vu
      localStorage.setItem('magopseudo', pseudo);
      localStorage.setItem('magoNearbyCache', JSON.stringify({
        v: '0617b', lat: center.lat, lng: center.lng, radiusKm, ts: Date.now(), stores,
      }));
    } catch (e) {}
    // La carte « explorer » interroge Firestore en direct (fbQueryZone) : ce canal
    // ne passe pas depuis un navigateur piloté. On la branche sur les magasins
    // déjà chargés (les vrais, via le cache ci-dessus) plutôt que sur le vide.
    // (l'app recadre elle-même sur la zone visible, comme dans son mode dégradé)
    const zone = () => Promise.resolve(window.STORES || []);
    Object.defineProperty(window, 'fbQueryZone', { get: () => zone, set: () => {}, configurable: true });

    addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
      const d = document.createElement('div'); d.id = '__demotap'; document.body.appendChild(d);
      // les coordonnées viennent du repère de la fenêtre, le point est dans le repère zoomé
      window.__tap = (x, y) => { d.style.left = (x / zoom) + 'px'; d.style.top = (y / zoom) + 'px'; d.classList.remove('go'); void d.offsetWidth; d.classList.add('go'); };
    });
  }, { stores, center: CENTER, radiusKm: CACHE_RADIUS_KM, pseudo: PSEUDO, css: TAP_CSS.replace('__ZOOM__', String(ZOOM)).replace(/__PW__/g, String(PHONE.width)).replace(/__PH__/g, String(PHONE.height)), zoom: ZOOM });

  const page = await ctx.newPage();
  const recStart = Date.now();          // l'enregistrement démarre ici
  let step = 0;
  const shot = async name => { if (SHOTS) { await page.screenshot({ path: path.join(OUT, `demo-${String(++step).padStart(2, '0')}-${name}.png`) }); console.log('  · ' + name); } };
  const wait = ms => page.waitForTimeout(ms);

  // tap avec l'onde visuelle, sur un élément ou des coordonnées
  async function tap(target, { pause = 900 } = {}) {
    let box;
    if (typeof target === 'string') {
      const loc = page.locator(target).first();
      box = await loc.boundingBox().catch(() => null);
      if (!box) { console.log('  !! cible absente : ' + target); return false; }
    } else box = { x: target.x - 1, y: target.y - 1, width: 2, height: 2 };
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
    await page.evaluate(([x, y]) => window.__tap && window.__tap(x, y), [x, y]);
    await wait(180);
    await page.mouse.click(x, y);
    await wait(pause);
    return true;
  }
  // Sur les libellés, on clique l'élément lui-même (l'onde visuelle est juste
  // posée par-dessus) : un clic aux coordonnées peut atterrir sur un enfant.
  async function tapIn(container, txt, { exact = false, pause = 900 } = {}) {
    const loc = page.locator(container).getByText(txt, { exact }).first();
    const box = await loc.boundingBox().catch(() => null);
    if (!box) { console.log(`  !! « ${txt} » introuvable dans ${container}`); return false; }
    await page.evaluate(([x, y]) => window.__tap && window.__tap(x, y),
      [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)]);
    await wait(180);
    await loc.click({ force: true }).catch(() => {});
    await wait(pause);
    return true;
  }
  async function tapText(txt, { pause = 900 } = {}) {
    const loc = page.getByText(txt, { exact: false }).first();
    const box = await loc.boundingBox().catch(() => null);
    if (!box) { console.log('  !! texte absent : ' + txt); return false; }
    await page.evaluate(([x, y]) => window.__tap && window.__tap(x, y),
      [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)]);
    await wait(180);
    await loc.click({ force: true }).catch(() => {});
    await wait(pause);
    return true;
  }
  // glissement du doigt (carte Leaflet)
  // Défilement : animé image par image DANS la page. Chaque cran de molette
  // envoyé depuis Node coûte un aller-retour (~40 ms) et se voyait comme une
  // saccade ; ici le navigateur anime tout seul, à sa cadence d'affichage.
  async function scroll(dy, ms = 1100, at = { x: 195, y: 460 }) {
    await page.evaluate(([x, y, dy, ms]) => new Promise(done => {
      let el = document.elementFromPoint(x, y);
      while (el && el !== document.body) {
        const st = getComputedStyle(el);
        if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4) break;
        el = el.parentElement;
      }
      const box = (el && el !== document.body) ? el : (document.scrollingElement || document.documentElement);
      const from = box.scrollTop, t0 = performance.now();
      const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      (function step() {
        const t = Math.min(1, (performance.now() - t0) / ms);
        box.scrollTop = from + dy * ease(t);
        if (t < 1) requestAnimationFrame(step); else done();
      })();
    }), [at.x, at.y, dy, ms]);
  }
  // Déplacement de carte : on laisse Leaflet animer (transform CSS), là encore
  // plus fluide qu'un glissement piloté depuis Node.
  async function panMap(dx, dy, ms = 1400) {
    await page.evaluate(([dx, dy, ms]) => {
      const m = window.exploreMap || window._leafletMap;
      if (m) m.panBy([dx, dy], { animate: true, duration: ms / 1000 });
    }, [dx, dy, ms]);
    await wait(ms + 300);
  }

  /* ── Le scénario ──────────────────────────────────────────────── */
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await wait(9000);                              // chargement + position GPS
  const t0 = Date.now();                         // début réel de la démo filmée

  // 1. l'accueil
  await wait(2200); await shot('accueil');
  await scroll(360, 1200); await wait(1300); await shot('accueil-defile');
  await scroll(-360, 900); await wait(800);

  // 2. on cherche une boisson
  await tap('#t-placeholder', { pause: 1500 }); await shot('recherche');
  await page.locator('#q').click({ force: true });
  await page.locator('#q').type(QUERY, { delay: 210 });
  await wait(2000); await shot('suggestions');

  // 3. la carte des magasins qui l'ont
  await tapText(DRINK, { pause: 6500 }); await shot('carte');
  await page.evaluate(() => { try { window.exploreMap.setZoom(window.exploreMap.getZoom() - 2, { animate: true }); } catch (e) {} });
  await wait(3000); await shot('carte-large');
  await panMap(110, -80, 1600); await wait(1200); await shot('carte-pan');

  // 4. la fiche de la boisson : on la met en favori
  await tapText('voir la fiche', { pause: 3500 }); await shot('fiche');
  await tap('#res-fav', { pause: 1800 }); await shot('favori');

  // 5. on confirme le stock, puis on donne le prix vu en rayon
  await scroll(430, 1300); await wait(1400); await shot('magasins');
  await scroll(250, 900); await wait(1300); await shot('magasins-2');
  await tapIn('#store-list', 'Oui', { exact: true, pause: 2600 }); await shot('confirme');

  const priceInput = page.locator('#store-list input').first();
  if (await priceInput.count().catch(() => 0)) {
    await priceInput.click({ force: true }).catch(() => {});
    await priceInput.type('1.30', { delay: 220 }).catch(() => {});
    await wait(900); await shot('prix-saisi');
    await tapIn('#store-list', 'OK', { exact: true, pause: 2600 }); await shot('prix');
  } else console.log('  !! champ prix introuvable');

  // 6. l'itinéraire : le trajet se trace de toi jusqu'au magasin
  await tapIn('#store-list', 'Y aller', { pause: 3000 });
  // La carte passe en plein écran juste avant que l'app ne cadre le trajet ;
  // le temps qu'elle prenne sa taille, le cadrage se fait à côté. On le refait
  // une fois la carte installée — en vol plané, ça se voit bien à l'écran.
  await page.evaluate(() => {
    const m = window._leafletMap, g = window._drinkRouteLayer;
    if (!m) return;
    m.invalidateSize();
    if (!g || !window.L) return;
    let pts = [];
    g.eachLayer(ly => { if (ly.getLatLngs) pts = pts.concat(ly.getLatLngs().flat(Infinity)); });
    if (pts.length) m.flyToBounds(window.L.latLngBounds(pts).pad(0.35), { duration: 1.8 });
  });
  await wait(4500); await shot('itineraire');
  console.log('  debug route:', JSON.stringify(await page.evaluate(() => {
    const m = window._leafletMap, b = document.getElementById('drink-route-banner');
    const r = b && b.getBoundingClientRect();
    const R = sel => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; };
    return { boxes: { app: R('#app'), full: R('#map-box.map-fullscreen'), host: R('#explore-map-host'), body: R('body') },
      zoom: m && m.getZoom(), route: !!window._drinkRouteLayer,
      banner: r && { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) },
      navDist: (document.getElementById('nav-dist') || {}).innerText, vh: innerHeight };
  })));
  await wait(3500); await shot('itineraire-fin');

  const video = SHOTS ? null : page.video();
  const trim = Math.max(0, (t0 - recStart) / 1000 - 0.2);   // chargement à couper
  const dur = (Date.now() - t0) / 1000;
  await ctx.close();                                        // finalise le webm
  srv.close();
  console.log('durée du scénario : ' + Math.round(dur * 10) / 10 + ' s');

  const webm = path.join(OUT, 'magofeed-demo.webm');
  if (video) { await video.saveAs(webm); console.log('✓ ' + path.basename(webm)); }
  await browser.close().catch(() => {});
  if (SHOTS) return;

  if (!hasFfmpeg()) { console.log('⚠  ffmpeg absent : MP4 ignoré (le WebM est dans promo/out/).'); return; }
  const wav = path.join(OUT, 'magofeed-theme.wav');
  const music = !NO_MUSIC && fs.existsSync(wav);
  const audio = music
    ? ['-stream_loop', '-1', '-i', wav, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k',
       '-af', `volume=0.32,afade=t=out:st=${Math.max(0, dur - 1.2).toFixed(2)}:d=1.2`, '-shortest']
    : ['-an'];

  // 1) plein cadre, au format du téléphone
  await ff(['-y', '-ss', trim.toFixed(3), '-i', webm, ...audio, '-t', dur.toFixed(2),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart',
    path.join(OUT, 'magofeed-demo.mp4')]);
  console.log('✓ magofeed-demo.mp4');

  // 2) version 9:16 pour Reels / TikTok : écran centré sur le fond de la marque
  await ff(['-y', '-ss', trim.toFixed(3), '-i', webm, ...audio, '-t', dur.toFixed(2),
    '-vf', 'scale=-2:1920,pad=1080:1920:(ow-iw)/2:0:0x100e0c', '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart',
    path.join(OUT, 'magofeed-demo-9x16.mp4')]);
  console.log('✓ magofeed-demo-9x16.mp4');

  if (SMOOTH) {
    console.log('Interpolation vers 50 i/s… (long)');
    const INTERP = 'minterpolate=fps=50:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1';
    for (const name of ['magofeed-demo', 'magofeed-demo-9x16']) {
      const src = path.join(OUT, name + '.mp4'), tmp = path.join(OUT, name + '.50.mp4');
      await ff(['-y', '-i', src, '-filter_complex', `[0:v]${INTERP}[v]`, '-map', '[v]', '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
        '-profile:v', 'high', '-level', '4.2', '-c:a', 'copy', '-movflags', '+faststart', tmp]);
      fs.renameSync(tmp, src);
      console.log('✓ ' + name + '.mp4 (50 i/s)');
    }
  }
}

function hasFfmpeg() { return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0; }
function ff(args) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: 'ignore' });
    p.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c)));
  });
}

function findChrome() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  if (!dir) return undefined;
  const bin = path.join(root, dir, 'chrome-linux', 'chrome');
  return fs.existsSync(bin) ? bin : undefined;
}

await main();
