/* ══ LA MINI-CARTE SE DEPLACE A DEUX DOIGTS, ET ELLE LE RESTE ═══════════════
   « je ne peux toujours pas glisser sur la mini carte, je dois obligatoirement
   appuyer sur le plein ecran, tu n'as toujours pas repare cela » — signale
   DEUX fois par le fondateur.

   Ce qui a ete trouve, en rejouant le geste au doigt dans un navigateur :
   deux doigts deplaçaient DEJA l'apercu. C'est le gestionnaire de pincement de
   Leaflet, qui suit le centre des deux doigts ; initLeafletMap ne l'avait
   jamais coupe, contrairement au glisser et a la molette. Trois choses le
   rendaient inutilisable, et la deuxieme explique le « toujours » :

     1. la carte ne savait pas que la main avait pris le relais — seul un
        glisser a UN doigt posait le drapeau, et Leaflet n'emet pas dragstart
        pour un pincement. Des que le deplacement vidait le cadre de ses pins,
        le recadrage automatique reprenait la vue : 3139 m de saut en arriere ;
     2. replier le plein ecran ETEIGNAIT le pincement, et rien ne le rallumait
        jamais. Apres un seul aller-retour, deux doigts ne faisaient plus rien
        du tout. Un utilisateur qui avait ouvert le plein ecran une fois avait
        une mini-carte morte pour de bon ;
     3. rien ne l'indiquait.

   Un quatrieme defaut, trouve en chemin : openDrinkInfoFromMap replie la carte
   a la main, sans repasser par la bascule, et l'apercu gardait alors les
   gestes du plein ecran — UN doigt y deplaçait la carte et la page ne
   descendait plus vers la liste des magasins, l'inverse exact de l'intention.

   CE CONTROLE EPROUVE L'ETAT, PAS LE GESTE, et c'est delibere : la livraison
   des gestes multi-touches par le pilote de navigateur s'est revelee peu
   fiable d'un conteneur a l'autre (un simple appui y echoue aussi). L'etat,
   lui, est exactement ce que le correctif decide — et c'est lui qui etait faux.

   node outils/essai-carte-doigt.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { createServer } from "node:http";
import { readFile, access } from "node:fs/promises";
import { extname, join } from "node:path";

const R = "/home/user/magofeed";
const LEAFLET = R + "/node_modules/leaflet/dist/leaflet.js";
try {
  await access(LEAFLET);
} catch {
  console.log("\n  Leaflet n'est pas installe : npm install --no-save leaflet leaflet.markercluster");
  console.log("  (le CDN est injoignable depuis ce conteneur, d'ou la copie locale)\n");
  process.exit(0);
}
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;

const M = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const LOC = {
  "/x/leaflet.js": [LEAFLET, "text/javascript"],
  "/x/cluster.js": [R + "/node_modules/leaflet.markercluster/dist/leaflet.markercluster.js", "text/javascript"],
};
const srv = createServer(async (q, s) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  if (LOC[u]) { try { const b = await readFile(LOC[u][0]); s.writeHead(200, { "content-type": LOC[u][1] }); return s.end(b); } catch { s.writeHead(404); return s.end(""); } }
  try { const b = await readFile(join(R, u)); s.writeHead(200, { "content-type": M[extname(u)] || "application/octet-stream" }); s.end(b); }
  catch { s.writeHead(404); s.end(""); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: "fr-BE" });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 200)));
/* Les tuiles et le CDN sont injoignables : on les coupe net plutot que
   d'attendre leur delai, sinon la page ne finit jamais de charger. */
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|cdnjs\.cloudflare\.com|unpkg\.com/, (r) => r.abort());
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => typeof window.initLeafletMap === "function", { timeout: 40000 });
await pg.addScriptTag({ url: "/x/leaflet.js" }).catch(() => {});
await pg.addScriptTag({ url: "/x/cluster.js" }).catch(() => {});

const etapes = await pg.evaluate(() => {
  const v = []; const ok = (n, c, d) => v.push([n, !!c, d || ""]);
  const sp = document.getElementById("splash"); if (sp) sp.remove();
  let box = document.getElementById("map-box");
  if (!box) {
    box = document.createElement("div"); box.id = "map-box";
    box.style.cssText = "position:relative;width:360px;height:208px"; document.body.appendChild(box);
  }
  box.innerHTML = '<div id="leaflet-map" style="width:100%;height:100%"></div><div id="map-full-btn">⛶</div>';
  window.initLeafletMap(50.8793, 4.3511);
  const m = window._leafletMap;
  const etat = () => ({
    tz: !!(m.touchZoom && m.touchZoom.enabled()),
    dg: !!(m.dragging && m.dragging.enabled()),
    swz: !!(m.scrollWheelZoom && m.scrollWheelZoom.enabled()),
    mz: m.getMinZoom(),
  });

  const a = etat();
  ok("apercu neuf : deux doigts possibles", a.tz, "touchZoom=" + a.tz);
  ok("apercu neuf : un doigt ne deplace pas", a.dg === false, "dragging=" + a.dg);
  ok("apercu neuf : plancher de zoom pose", a.mz === 11, "minZoom=" + a.mz);

  window.toggleDrinkMapFull();
  const b = etat();
  ok("plein ecran : tout est actif", b.dg && b.swz && b.tz, "dragging=" + b.dg + " molette=" + b.swz);
  ok("plein ecran : le plancher saute", b.mz === 0, "minZoom=" + b.mz);

  window.toggleDrinkMapFull();
  const c = etat();
  /* LE CONTROLE QUI COMPTE. Avant le correctif, touchZoom valait false ici :
     la mini-carte etait morte pour de bon des le premier aller-retour. */
  ok("APRES RETOUR : deux doigts marchent ENCORE", c.tz === true, "touchZoom=" + c.tz + " (valait false avant)");
  ok("APRES RETOUR : un doigt ne deplace toujours pas", c.dg === false, "dragging=" + c.dg);
  ok("APRES RETOUR : le plancher est revenu", c.mz === 11, "minZoom=" + c.mz);

  /* Le troisieme chemin : celui qui repliait la carte sans recouper les gestes. */
  window.toggleDrinkMapFull();
  const avant = etat();
  document.getElementById("map-box").classList.remove("map-fullscreen");
  try { window.apercuReplie(window._leafletMap); } catch (e) {}
  const d = etat();
  ok("troisieme chemin : les gestes du plein ecran sont recoupes",
    avant.dg === true && d.dg === false && d.swz === false, "dragging " + avant.dg + " -> " + d.dg + ", molette " + d.swz);
  ok("troisieme chemin : deux doigts restent possibles", d.tz === true, "touchZoom=" + d.tz);

  /* Deux doigts QUI BOUGENT sont le signal honnete : un seul doigt est un
     debut de defilement de page, pas une manipulation de carte. */
  window._mapMainUtilisateur = false;
  const hote = m.getContainer();
  const faux = (n) => {
    const t = []; for (let i = 0; i < n; i++) t.push({ clientX: 100 + i * 40, clientY: 300, identifier: i });
    const ev = new Event("touchmove", { bubbles: true }); ev.touches = t; hote.dispatchEvent(ev);
  };
  faux(1);
  ok("un doigt qui bouge n'est PAS la main sur la carte", window._mapMainUtilisateur === false, "_mapMainUtilisateur=" + window._mapMainUtilisateur);
  faux(2);
  ok("DEUX doigts qui bougent = la main sur la carte", window._mapMainUtilisateur === true, "_mapMainUtilisateur=" + window._mapMainUtilisateur);
  return v;
});

console.log("\n  LA MINI-CARTE SE DEPLACE A DEUX DOIGTS, ET ELLE LE RESTE\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(50) + " " + d); }
console.log("\n  erreurs JavaScript : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && errs.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko === 0 && errs.length === 0 ? 0 : 1);
