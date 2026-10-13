// Filme les écrans de la VRAIE app pour le Reel « Je cherche quelle canette ensuite ? ».
// L'app est servie en local, pilotée comme un utilisateur, et l'écran est enregistré.
//
//   node enregistrer-ecrans.mjs --shots   -> captures PNG de chaque étape (mise au point)
//   node enregistrer-ecrans.mjs           -> out/ecrans.webm + out/etapes.json (timecodes + repères)
//
// Les magasins affichés sont des magasins de DÉMO aux noms génériques (« Night shop »,
// « Épicerie du coin »…) : aucun commerce réel n'est présenté comme ayant une boisson.
// Firestore est coupé (lecture et écriture) ; la chasse est simulée localement.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'http';
import path from 'path';
import fs from 'fs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(DIR, '..', '..');
const OUT = path.join(DIR, 'out');
fs.mkdirSync(OUT, { recursive: true });
const SHOTS = process.argv.includes('--shots');
const BXL = process.argv.includes('--bruxelles');
const PORT = 8123;

const CENTER = { lat: 50.8275, lng: 4.3720 };               // Flagey, Ixelles
const WHEN = new Date('2026-10-14T21:40:00+02:00');         // soir : le night shop est ouvert
const PSEUDO = 'Ilias';
const MILKIS = 11083, RAMUNE = 10074;
const CACHE_V = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/CACHE_DATA_V = "([^"]+)"/) || [])[1] || '0902a';
const now = WHEN.getTime();
const H2 = 2 * 3600e3;

const STORES = [
  { id: 'demo-night', fbId: 'demo-night', name: 'Night shop', brand: '', emoji: '', type: 'night shop',
    address: "Chaussée d'Ixelles, Bruxelles", lat: 50.82815, lng: 4.37150, hours: 'Mo-Su 10:00-02:00',
    drinks: [MILKIS, 1, 2, 3, 10], drinksVerified: [MILKIS], confirmations: { [MILKIS]: 1 },
    seenAt: { [MILKIS]: now - H2 }, confirmedAt: { [MILKIS]: now - H2 }, community: true },
  { id: 'demo-epic', fbId: 'demo-epic', name: 'Épicerie du coin', brand: '', emoji: '', type: 'épicerie',
    address: 'Rue Lesbroussart, Bruxelles', lat: 50.82900, lng: 4.37350, hours: 'Mo-Sa 08:00-20:00',
    drinks: [1, 2, 3], drinksVerified: [], confirmations: {}, seenAt: {}, confirmedAt: {}, community: true },
  { id: 'demo-asia', fbId: 'demo-asia', name: 'Supérette asiatique', brand: '', emoji: '', type: 'épicerie',
    address: 'Chaussée de Boondael, Bruxelles', lat: 50.82620, lng: 4.36900, hours: 'Mo-Su 10:00-20:00',
    drinks: [1, 3], drinksVerified: [], confirmations: {}, seenAt: {}, confirmedAt: {}, community: true },
  { id: 'demo-super', fbId: 'demo-super', name: 'Supermarché', brand: '', emoji: '', type: 'supermarché',
    address: 'Place Flagey, Bruxelles', lat: 50.83000, lng: 4.37600, hours: 'Mo-Sa 08:00-20:00',
    drinks: [1, 2, 3, 10], drinksVerified: [], confirmations: {}, seenAt: {}, confirmedAt: {}, community: true },
];
function haversineM(a, b, c, d) {
  const R = 6371000, p = Math.PI / 180, x = (c - a) * p, y = (d - b) * p;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2));
}
for (const s of STORES) s.dist = Math.round(haversineM(CENTER.lat, CENTER.lng, s.lat, s.lng));


/* ── Vrais magasins de la base (lecture seule, REST) pour la carte de Bruxelles ── */
async function loadRealStores() {
  const cacheFile = path.join(OUT, '.stores-reels.json');
  let docs = [];
  if (fs.existsSync(cacheFile)) docs = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  else {
    const base = 'https://firestore.googleapis.com/v1/projects/magofeed-7f621/databases/(default)/documents/stores';
    const key = 'AIzaSyCjeQJcdpDJJdlqGX6Eb3MLKPCMP1YsNRM';
    let token = '';
    for (let i = 0; i < 40; i++) {
      const url = `${base}?pageSize=300${token ? '&pageToken=' + token : ''}&key=${key}`;
      const d = await new Promise(res => execFile('curl', ['-sS', '--max-time', '45', url], { maxBuffer: 64 * 1024 * 1024 }, (e, out) => { try { res(e ? null : JSON.parse(out)); } catch (x) { res(null); } }));
      if (!d || !d.documents) break;
      const val = v => ('stringValue' in v) ? v.stringValue : ('integerValue' in v) ? Number(v.integerValue) : ('doubleValue' in v) ? v.doubleValue : ('booleanValue' in v) ? v.booleanValue : ('arrayValue' in v) ? (v.arrayValue.values || []).map(val) : ('mapValue' in v) ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : null;
      for (const doc of d.documents) { const f = Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, val(v)])); f._id = doc.name.split('/').pop(); docs.push(f); }
      token = d.nextPageToken || ''; if (!token) break;
    }
    if (docs.length) fs.writeFileSync(cacheFile, JSON.stringify(docs));
  }
  const near = [];
  for (const r of docs) {
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
    const dist = Math.round(haversineM(CENTER.lat, CENTER.lng, r.lat, r.lng));
    if (dist > 12000) continue;
    // on ne garde aucune boisson : la carte de la ville ne montre que des pins
    near.push({ id: r._id, fbId: r._id, name: r.name || 'Magasin', brand: r.brand || '', emoji: r.emoji || '', lat: r.lat, lng: r.lng, type: r.type || '', hours: r.hours || null, dist, drinks: [], drinksVerified: [], confirmations: {}, community: !!r.community });
  }
  near.sort((a, b) => a.dist - b.dist);
  return near.slice(0, 1400);
}

const PHONE = { width: 390, height: 844 };
const CAPTURE_W = 810;
const ZOOM = CAPTURE_W / PHONE.width;
const VIEW = { width: CAPTURE_W, height: Math.round(PHONE.height * ZOOM) };

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


/* ── Relais réseau : le navigateur piloté ne sort pas, curl (qui connaît le proxy) si ──
   Sert le SDK Firebase (CDN) et les tuiles OpenStreetMap. Firestore reste coupé. */
import { execFile } from 'child_process';
import crypto from 'crypto';
async function installRelay(ctx) {
  const cache = path.join(OUT, '.netcache');
  fs.mkdirSync(cache, { recursive: true });
  const SKIP_REQ = /^(host|connection|content-length|accept-encoding|proxy-|sec-ch-|sec-fetch)/i;
  const SKIP_RES = /^(content-encoding|content-length|transfer-encoding|connection|strict-transport)/i;
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('data:')) return route.continue();
    if (/firestore\.googleapis\.com|firebaseinstallations|fcmregistrations|identitytoolkit|securetoken|overpass/.test(url)) return route.abort();
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
    for (const l of lines.slice(1)) { const i = l.indexOf(':'); if (i < 0) continue; const k = l.slice(0, i).trim(); if (!SKIP_RES.test(k)) headers[k] = l.slice(i + 1).trim(); }
    headers['access-control-allow-origin'] = headers['access-control-allow-origin'] || '*';
    return route.fulfill({ status: parseInt((lines[0].match(/\s(\d{3})\s/) || [])[1] || '200', 10), headers, body: fs.readFileSync(bf) });
  });
}

const TAP_CSS = `
  html{zoom:__ZOOM__}
  body{min-height:__PH__px!important}
  #app{max-height:calc(__PH__px - 40px)!important}
  #map-box.map-fullscreen{position:absolute!important;inset:0!important;width:auto!important;height:auto!important}
  #__demotap{position:fixed;z-index:2147483647;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;
    pointer-events:none;opacity:0;background:rgba(26,23,20,.16);border:2px solid rgba(26,23,20,.4)}
  #__demotap.go{animation:__tapa .5s ease-out}
  @keyframes __tapa{0%{opacity:.9;transform:scale(.5)}100%{opacity:0;transform:scale(1.25)}}
`;

async function main() {
  const srv = await serve();
  const stores = BXL ? await loadRealStores() : STORES;
  if (BXL) console.log('magasins réels chargés : ' + stores.length);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: 1, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Brussels',
    geolocation: { latitude: CENTER.lat, longitude: CENTER.lng }, permissions: ['geolocation'],
    ...(SHOTS ? {} : { recordVideo: { dir: OUT, size: VIEW } }),
  });
  await ctx.clock.install({ time: WHEN });
  await ctx.clock.resume();
  await installRelay(ctx);

  await ctx.addInitScript(({ stores, center, pseudo, css, zoom, cacheV }) => {
    try {
      localStorage.setItem('magoob', '1');
      localStorage.setItem('magotuto', '1');
      localStorage.setItem('magopseudo', pseudo);
      localStorage.setItem('magoCoach', JSON.stringify({ home: 1, search: 1, scan: 1, discover: 1, profile: 1 }));
      localStorage.setItem('magoNearbyCache', JSON.stringify({ v: cacheV, lat: center.lat, lng: center.lng, radiusKm: 30, ts: Date.now(), stores }));
    } catch (e) {}
    const zone = () => Promise.resolve(window.STORES || []);
    Object.defineProperty(window, 'fbQueryZone', { get: () => zone, set: () => {}, configurable: true });
    // La chasse : le réseau est coupé, on simule la réponse du serveur (« tu es le premier »).
    const join = () => new Promise(r => setTimeout(() => r({ ok: true, chercheurs: 1, position: true }), 1000));
    Object.defineProperty(window, 'fbJoinHunt', { get: () => join, set: () => {}, configurable: true });
    const noop = () => Promise.resolve({ ok: true });
    for (const k of ['fbSyncWatch', 'fbLeaveHunt']) Object.defineProperty(window, k, { get: () => noop, set: () => {}, configurable: true });
    const nopush = () => Promise.resolve({ ok: false });
    Object.defineProperty(window, 'fbEnablePush', { get: () => nopush, set: () => {}, configurable: true });
    addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
      const d = document.createElement('div'); d.id = '__demotap'; document.body.appendChild(d);
      window.__tap = (x, y) => { d.style.left = (x / zoom) + 'px'; d.style.top = (y / zoom) + 'px'; d.classList.remove('go'); void d.offsetWidth; d.classList.add('go'); };
    });
  }, { stores, center: CENTER, pseudo: PSEUDO, css: TAP_CSS.replace('__ZOOM__', String(ZOOM)).replace(/__PH__/g, String(PHONE.height)), zoom: ZOOM, cacheV: CACHE_V });

  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const recStart = Date.now();
  const etapes = [];
  const t = () => (Date.now() - recStart) / 1000;
  const screenOn = () => page.evaluate(() => ({ screen: (document.querySelector('.screen.on') || {}).id, stores: (window.STORES || []).length, userLat: window.userLat })).catch(() => ({}));
  const mark = async (name, extra) => { const st = await screenOn(); etapes.push({ t: +t().toFixed(2), name, ...st, ...(extra || {}) }); console.log(`  ${t().toFixed(1)}s  ${name}  ${JSON.stringify(st)}`); };
  let n = 0;
  const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(OUT, `shot-${String(++n).padStart(2, '0')}-${name}.png`) }); };
  const wait = ms => page.waitForTimeout(ms);
  async function tapLoc(loc, pause = 900) {
    const box = await loc.boundingBox().catch(() => null);
    if (!box) { console.log('  !! cible absente'); return false; }
    await page.evaluate(([x, y]) => window.__tap && window.__tap(x, y), [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)]);
    await wait(180);
    await loc.click({ force: true }).catch(() => {});
    await wait(pause);
    return true;
  }
  const tap = (sel, pause) => tapLoc(page.locator(sel).first(), pause);
  const tapText = (txt, pause, exact = false) => tapLoc(page.getByText(txt, { exact }).first(), pause);
  async function scroll(dy, ms = 1100, at = { x: 195, y: 460 }) {
    await page.evaluate(([x, y, dy, ms, zoom]) => new Promise(done => {
      const scrollable = el => { const st = getComputedStyle(el); return /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4; };
      let el = document.elementFromPoint(x * zoom, y * zoom), box = null;
      while (el && el !== document.body) { if (scrollable(el)) { box = el; break; } el = el.parentElement; }
      if (!box) { const app = document.getElementById('app') || document.body; box = [...app.querySelectorAll('*')].filter(scrollable).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]; }
      if (!box) return done(false);
      const from = box.scrollTop, t0 = performance.now();
      const ease = q => q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
      (function step() { const q = Math.min(1, (performance.now() - t0) / ms); box.scrollTop = from + dy * ease(q); if (q < 1) requestAnimationFrame(step); else done(true); })();
    }), [at.x, at.y, dy, ms, ZOOM]);
  }
  // repères : position (en px de capture) des éléments nommés dans un conteneur
  async function boxes(container, labels) {
    const out = {};
    for (const l of labels) {
      const loc = page.locator(container).getByText(l, { exact: false }).first();
      const b = await loc.boundingBox().catch(() => null);
      if (b) out[l] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    }
    return out;
  }
  const textOf = async sel => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 400);

  /* ── Scénario ─────────────────────────────────────────────────── */
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await wait(9000);
  await page.evaluate(zoom => {
    const a = document.getElementById('app'); if (!a) return;
    const r = a.getBoundingClientRect();
    const st = document.createElement('style');
    st.textContent = `#explore-map-host{position:fixed!important;left:${r.left / zoom}px!important;top:${r.top / zoom}px!important;width:${r.width / zoom}px!important;height:${r.height / zoom}px!important;right:auto!important;bottom:auto!important}`;
    document.head.appendChild(st);
  }, ZOOM);
  const appBox = await page.locator('#app').boundingBox().catch(() => null);
  await mark('accueil', { appBox, texteAutour: await textOf('#home') });
  await shot('accueil'); await wait(1500);

  if (BXL) {
    await wait(1200);
    const lien = page.locator('#nearby-card').getByText('Carte', { exact: false }).first();
    if (await lien.boundingBox().catch(() => null)) await tapLoc(lien, 3500); else { await page.evaluate(() => { try { openExploreMap(); } catch (e) {} }); await wait(3500); }
    await mark('carte-bruxelles'); await shot('bxl-carte');
    await page.evaluate(() => { const m = window.exploreMap || window._leafletMap; if (m) m.flyTo([50.8466, 4.3528], 12, { duration: 3 }); }); await wait(4200); await mark('carte-bruxelles-large'); await shot('bxl-large');
    await wait(2500); await mark('fin');
    fs.writeFileSync(path.join(OUT, 'etapes-bruxelles.json'), JSON.stringify({ view: VIEW, zoom: ZOOM, phone: PHONE, etapes }, null, 1));
    await page.close(); await ctx.close(); await browser.close(); srv.close();
    if (!SHOTS) { const v = fs.readdirSync(OUT).filter(f => f.endsWith('.webm') && f !== 'ecrans.webm' && f !== 'bruxelles.webm').map(f => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]; if (v) fs.renameSync(v, path.join(OUT, 'bruxelles.webm')); }
    return;
  }

  // 1. recherche « Milkis »
  await tap('#t-placeholder', 1000); await mark('recherche-ouverte');
  await page.locator('#q').click({ force: true });
  await page.keyboard.type('Milkis', { delay: 160 });
  await wait(1200); await mark('suggestions'); await shot('suggestions');

  // 2. la carte des magasins qui l'ont
  await tapText('Milkis Original', 5200); await mark('carte-milkis', { barre: await textOf('#map-box') });
  await shot('carte-milkis'); await wait(800);

  // 3. la fiche et la liste des magasins
  await tapText('voir la fiche', 2600); await mark('fiche-milkis'); await shot('fiche-milkis');
  await scroll(430, 1200); await wait(900);
  await mark('fiche-magasins', { liste: await textOf('#store-list'), reperes: await boxes('#store-list', ['En stock', 'Y aller', 'Ouvert', 'il y a', ' m', 'Night shop']) });
  await shot('fiche-magasins'); await wait(2500);

  // 4. une boisson que personne n'a vue : la chasse
  await page.evaluate(() => { try { show('search'); } catch (e) {} }); await wait(900); await mark('retour-recherche');
  await page.locator('#q').click({ force: true });
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await page.keyboard.type('Ramune', { delay: 160 }); await wait(1000); await shot('ramune-suggestions');
  await tapText('Ramune Original', 4500); await mark('carte-ramune', { barre: await textOf('#map-box') }); await shot('carte-ramune');
  // la fiche s'ouvre par la pastille du haut (nom de la boisson)
  const pill = page.getByText('Ramune Original', { exact: true }).first();
  const pb = await pill.boundingBox().catch(() => null);
  if (pb) await page.evaluate(([x, y]) => window.__tap && window.__tap(x, y), [Math.round(pb.x + pb.width / 2), Math.round(pb.y + pb.height / 2)]);
  await wait(180);
  await page.evaluate(() => { try { openDrinkInfoFromMap(); } catch (e) { try { openDrinkZoom(); } catch (e2) {} } });
  await wait(2400); await mark('fiche-ramune'); await shot('fiche-ramune');
  // « Préviens-moi si le stock change près de moi · Activer » = l'alerte + la chasse
  let act = page.getByText('Activer', { exact: true }).first();
  let actBox = await act.boundingBox().catch(() => null);
  if (!actBox) { await scroll(260, 900); await wait(600); act = page.getByText('Activer', { exact: true }).first(); actBox = await act.boundingBox().catch(() => null); }
  await mark('bouton-chasse', { reperes: await boxes('body', ['Activer', 'Préviens-moi']) });
  await tapLoc(act, 500); await mark('chasse-lancee');
  await shot('chasse-toast-1'); await wait(1500); await shot('chasse-toast-2'); await wait(1500); await shot('chasse-toast-3'); await wait(1500);

  // 5. l'accueil et la carte de Bruxelles
  await page.evaluate(() => { try { show('home'); } catch (e) {} }); await wait(1400); await mark('retour-accueil'); await shot('accueil-2');
  const carteLien = page.locator('#nearby-card').getByText('Carte', { exact: false }).first();
  if (await carteLien.boundingBox().catch(() => null)) await tapLoc(carteLien, 3500); else { await page.evaluate(() => { try { openExploreMap(); } catch (e) {} }); await wait(3500); }
  await mark('carte-bruxelles'); await shot('carte-bruxelles');
  await page.evaluate(() => { const m = window.exploreMap || window._leafletMap; if (m) m.flyTo(m.getCenter(), Math.max(10, m.getZoom() - 3), { duration: 2.5 }); }); await wait(3500); await shot('carte-bruxelles-large');
  await wait(1500);

  await mark('fin');
  fs.writeFileSync(path.join(OUT, 'etapes.json'), JSON.stringify({ view: VIEW, zoom: ZOOM, phone: PHONE, etapes }, null, 1));
  await page.close();
  await ctx.close();
  await browser.close();
  srv.close();
  if (!SHOTS) {
    const v = fs.readdirSync(OUT).filter(f => f.endsWith('.webm') && f !== 'ecrans.webm' && f !== 'bruxelles.webm').map(f => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (v) { fs.renameSync(v, path.join(OUT, 'ecrans.webm')); console.log('vidéo : out/ecrans.webm'); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
