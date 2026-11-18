/* ══ LA CARTE SURVIT AUX RAPPELS EN RETARD ═════════════════════════════════
   Le controle avant mise en ligne echouait une fois sur trois, sur une erreur
   qui n'avait rien d'aleatoire :

     TypeError: Cannot read properties of undefined (reading '_leaflet_pos')
        at e.invalidateSize (leaflet.min.js)
        at index.html  (le setTimeout de 320 ms de initLeafletMap)

   initLeafletMap arme deux rappels differes — 320 ms pour invalidateSize()
   puis le cadrage, 360 ms pour l'etalement des pins — parce que la carte est
   construite pendant que l'ecran est encore masque et que sa taille vaut zero.
   Si l'ecran change AVANT la fin de ces delais, et c'est l'affaire d'un doigt
   (ouvrir une boisson puis une autre : renderMap fait map.remove() et remet
   window._leafletMap a null), le rappel touche une carte demontee. Leaflet
   leve, l'erreur n'est RATTRAPEE PAR PERSONNE, et elle emporte au passage le
   cadrage ecrit juste apres dans le meme rappel.

   Trois autres rappels differes portaient le meme defaut, dont deux ou la
   verification etait posee AVANT le delai au lieu de dedans — ce qui ne
   verifie rien : renderMap (320 ms) et le selecteur de magasin (180 ms, deux
   chemins), et le selecteur est justement remis a null a la fermeture.

   CE CONTROLE EPROUVE L'ETAT, PAS LE HASARD : on demonte la carte a la main,
   on laisse les rappels arriver, et on exige zero erreur non rattrapee. Une
   course reproduite une fois sur six ne se prouve pas en la relançant.

   node outils/essai-carte-demontee.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { createHash } from "node:crypto";

const R = "/home/user/magofeed";
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const M = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer(async (q, s) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  try { const b = await readFile(join(R, u)); s.writeHead(200, { "content-type": M[extname(u)] || "application/octet-stream" }); s.end(b); }
  catch { s.writeHead(404); s.end(""); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-BE",
  geolocation: { latitude: 50.8793, longitude: 4.3511 }, permissions: ["geolocation"] });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 200)));
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com/, (r) => r.abort());
/* LE CDN EST INTERMITTENT DEPUIS CE CONTENEUR : mesure, 4 chargements sur 6.
   Un controle qui ne tombe en panne qu'une fois sur trois ne prouve rien.
   On ne peut pas pour autant servir la copie de node_modules : l'application
   epingle l'empreinte du fichier (integrity=) et le navigateur REFUSE
   d'executer autre chose — et c'est tant mieux, ce garde-fou protege le jeton
   Firebase, la position et la camera d'un CDN detourne.
   Alors on sert les VRAIS octets : au premier passage on les demande au CDN,
   on verifie leur empreinte contre celle epinglee dans index.html, et on les
   garde. Les fois suivantes le controle ne depend plus du reseau — et cette
   premiere comparaison vaut par elle-meme : elle dit si l'empreinte epinglee
   correspond encore a ce que cdnjs sert vraiment. */
const CACHE = R + "/node_modules/.cache-magofeed";
const PAGE = await readFile(R + "/index.html", "utf8");
/* Toutes les paires « <var>.src = "<url>" ... <var>.integrity = "<sri>" »
   de la page : on ne devine ni le nom de la variable ni l'URL. */
const PINS = [];
{
  const re = /(\w+)\.src\s*=\s*"(https:\/\/[^"]+\.js)"\s*;?\s*\1\.integrity\s*=\s*"([^"]+)"/g;
  let m; while ((m = re.exec(PAGE))) PINS.push({ url: m[2], sri: m[3] });
}
/* Les copies de node_modules, quand leur empreinte est CELLE qui est
   epinglee : aucun reseau, et le navigateur les accepte. */
const COPIES = [R + "/node_modules/leaflet/dist/leaflet.js",
                R + "/node_modules/leaflet/dist/leaflet-src.js",
                R + "/node_modules/leaflet.markercluster/dist/leaflet.markercluster.js"];
const sha512 = (b) => "sha512-" + createHash("sha512").update(b).digest("base64");
const servi = {};
await mkdir(CACHE, { recursive: true }).catch(() => {});
await pg.route(/cdnjs\.cloudflare\.com|unpkg\.com/, async (r) => {
  const u = r.request().url();
  /* Les feuilles de style ne jouent aucun role ici : une page vide suffit, et
     le style n'est pas epingle de la meme facon. */
  if (/\.css(\?|$)/i.test(u)) { try { return await r.fulfill({ status: 200, contentType: "text/css", body: "" }); } catch { return r.abort(); } }
  const pin = PINS.find((p) => p.url === u);
  if (!pin) return r.abort();
  const nom = join(CACHE, u.split("/").pop());
  let corps = null;
  try { const b = await readFile(nom); if (sha512(b) === pin.sri) corps = b; } catch {}
  if (!corps) for (const c of COPIES) {
    try { const b = await readFile(c); if (sha512(b) === pin.sri) { corps = b; servi[u] = "copie npm, empreinte conforme"; break; } } catch {}
  }
  if (!corps) {
    try {
      const rep = await r.fetch();
      const b = Buffer.from(await rep.body());
      servi[u] = sha512(b) === pin.sri ? "telecharge, empreinte conforme" : "TELECHARGE MAIS EMPREINTE DIFFERENTE";
      if (sha512(b) === pin.sri) { corps = b; await writeFile(nom, b).catch(() => {}); }
    } catch (e) { servi[u] = "CDN injoignable : " + String(e.message).slice(0, 60); }
  } else servi[u] = "copie locale verifiee";
  if (!corps) return r.abort();
  return r.fulfill({ status: 200, contentType: "text/javascript", body: corps });
});
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => typeof window.carteEncoreLa === "function" && window.DRINKS && DRINKS.length > 100, { timeout: 40000 });

const etapes = [];
const ok = (n, c, d) => etapes.push([n, !!c, d || ""]);

/* Leaflet est charge PARESSEUSEMENT par l'application : tant qu'aucune carte
   n'est demandee, window.L n'existe pas. On le demande explicitement. */
const charge = await pg.evaluate(() => new Promise((res) => {
  if (window.L) return res("deja");
  if (typeof window.ensureLeaflet !== "function") return res("pas d'ensureLeaflet");
  let fini = false;
  const t = setTimeout(() => { if (!fini) { fini = true; res("delai depasse"); } }, 20000);
  try { window.ensureLeaflet(() => { if (!fini) { fini = true; clearTimeout(t); res("charge"); } },
                             () => { if (!fini) { fini = true; clearTimeout(t); res("echec du chargeur"); } }); }
  catch (e) { fini = true; clearTimeout(t); res("exception " + e.message); }
}));
ok("Leaflet se charge a la demande", await pg.evaluate(() => !!window.L), charge + " " + JSON.stringify(servi));

/* Le regroupement de marqueurs a son propre chargeur, et c'est LUI qui decide
   si initLeafletMap arme ses rappels differes. */
const grappe = await pg.evaluate(() => new Promise((res) => {
  if (typeof window.ensureCluster !== "function") return res("pas d'ensureCluster");
  const t = setTimeout(() => res("delai depasse"), 20000);
  try { window.ensureCluster(() => { clearTimeout(t); res(window.L && window.L.markerClusterGroup ? "charge" : "rappele sans regroupement"); }); }
  catch (e) { clearTimeout(t); res("exception " + e.message); }
}));
ok("le regroupement de marqueurs se charge",
  await pg.evaluate(() => !!(window.L && window.L.markerClusterGroup)), grappe + " " + JSON.stringify(servi));

/* ── 1. LE GARDE-FOU LUI-MEME ─────────────────────────────────────────── */
const g = await pg.evaluate(() => {
  const v = {};
  v.rien = window.carteEncoreLa(null);
  v.vide = window.carteEncoreLa({});
  if (!window.L) return Object.assign(v, { pasDeLeaflet: true });
  const d = document.createElement("div");
  d.style.cssText = "width:300px;height:200px"; document.body.appendChild(d);
  const m = window.L.map(d, { zoomControl: false, fadeAnimation: false }).setView([50.88, 4.35], 13);
  v.vivante = window.carteEncoreLa(m);
  v.detachee = (d.remove(), window.carteEncoreLa(m));
  document.body.appendChild(d);
  v.remiseEnPage = window.carteEncoreLa(m);
  v.autreEnCours = window.carteEncoreLa(m, { _mapPane: 1 });   // une autre a pris la place
  m.remove(); d.remove();
  v.retiree = window.carteEncoreLa(m);
  return v;
});
ok("null n'est pas une carte", g.rien === false, "carteEncoreLa(null)=" + g.rien);
ok("un objet nu n'est pas une carte", g.vide === false, "pas de _mapPane");
if (g.pasDeLeaflet) {
  ok("Leaflet charge", false, "non servi : " + JSON.stringify(servi));
} else {
  ok("une carte vivante est reconnue", g.vivante === true, "vivante=" + g.vivante);
  ok("un conteneur sorti de la page : non", g.detachee === false, "detachee=" + g.detachee);
  ok("remise en page : de nouveau oui", g.remiseEnPage === true, "remiseEnPage=" + g.remiseEnPage);
  ok("remplacee par une autre carte : non", g.autreEnCours === false, "autreEnCours=" + g.autreEnCours);
  ok("apres remove() : non", g.retiree === false, "retiree=" + g.retiree);
}

/* ── 2. LA COURSE, REPRODUITE A COUP SUR ──────────────────────────────
   Il a fallu trois essais pour la tenir, et les deux premiers PASSAIENT sans
   le correctif — c'est-a-dire qu'ils ne prouvaient rien. Ce qu'il faut
   reunir, mesure point par point :

     1. une carte construite par renderMap dans une boite REELLEMENT affichee,
        pour que Leaflet memorise une taille (360x208). Fabriquee a la main
        dans une boite masquee, elle memorise 0x0 ;
     2. map.remove() puis window._leafletMap=null — ce que fait navTo en
        revenant a un onglet racine, et renderMap en ouvrant une autre
        boisson ;
     3. l'ecran MASQUE avant la fin des 320 ms. C'est la que tout se joue :
        invalidateSize compare la taille memorisee (360x208) a la taille
        actuelle (0x0). Tant que les deux sont egales, Leaflet s'arrete avant
        d'avoir besoin du panneau — et le controle passe meme sans correctif.
        L'ecart le fait continuer jusqu'a _getMapPanePos, et remove() a
        justement supprime ce panneau.

   Verifie dans les deux sens : sans le correctif, une erreur non rattrapee ;
   avec, aucune. */
const avant = errs.length;
const course = await pg.evaluate(async () => {
  const d = DRINKS.find((x) => x.name === "Coca-Cola Original") || DRINKS[0];
  window.pick(d);
  await new Promise((r) => setTimeout(r, 1500));
  /* Dans un navigateur pilote, pick ne declenche pas toujours renderMap (il
     depend d'une mise en page qui n'arrive pas toujours) : on l'appelle, et
     c'est lui qui arme les deux rappels differes. */
  if (!window._leafletMap) { try { window.renderMap(); } catch (e) {} }
  const m = window._leafletMap;
  if (!m) return { construite: false };
  const bx = document.getElementById("map-box");
  const taille = bx ? bx.clientWidth + "x" + bx.clientHeight : "absente";
  const memorisee = m._size ? m._size.x + "x" + m._size.y : "?";
  const regroupe = !!window._leafletCluster;
  try { m.remove(); } catch (e) {}
  window._leafletMap = null;
  navTo("home");                                   // l'ecran est masque
  await new Promise((r) => setTimeout(r, 900));    // les deux rappels sont passes
  return { construite: true, taille, memorisee, regroupe,
           masquee: bx ? bx.clientWidth + "x" + bx.clientHeight : "absente",
           mortePourDeBon: window.carteEncoreLa(m) === false };
});
const nouvelles = errs.slice(avant);
ok("une carte a bien ete construite, et affichee", course.construite === true && course.memorisee !== "0x0",
  "boite " + course.taille + ", taille memorisee " + course.memorisee);
ok("les rappels differes ont bien ete armes", course.regroupe === true,
  "_leafletCluster=" + course.regroupe + " (sans lui, initLeafletMap saute le bloc)");
ok("l'ecran est bien masque quand ils arrivent", course.masquee === "0x0",
  "boite masquee : " + course.masquee + " (si elle garde sa taille, rien n'est eprouve)");
ok("une fois retiree, le garde-fou la refuse", course.mortePourDeBon === true, "carteEncoreLa=false");
ok("les deux rappels differes n'ont rien leve",
  nouvelles.filter((e) => /_leaflet_pos|invalidateSize|undefined/i.test(e)).length === 0,
  nouvelles.length ? nouvelles[0] : "aucune erreur");

/* ── 3. LE SELECTEUR DE MAGASIN, MEME CHEMIN ──────────────────────────── */
const avant2 = errs.length;
const sel = await pg.evaluate(async () => {
  if (typeof window.ensurePickerMap !== "function") return { absent: true };
  let rappele = false;
  window.ensurePickerMap(function () { rappele = true; });
  await new Promise((r) => setTimeout(r, 60));
  try { if (window._pickerMap) { window._pickerMap.remove(); } } catch (e) {}
  window._pickerMap = null;
  await new Promise((r) => setTimeout(r, 500));
  return { rappele };
});
ok("le selecteur de magasin existe", !sel.absent, sel.absent ? "ensurePickerMap introuvable" : "ensurePickerMap");
ok("ferme pendant le delai : le selecteur ne leve rien",
  errs.slice(avant2).length === 0, errs.slice(avant2)[0] || "aucune erreur");

/* ── 4. UN RAPPEL EN RETARD NE REPOSE PAS UNE SECONDE CARTE ───────────
   Deuxieme defaut de la meme famille, trouve en mesurant le controle avant
   mise en ligne : deux chargements sur quatre finissaient sur

     Uncaught Error: Map container is already initialized.

   renderMap branche le meme rappel sur le onload du script de regroupement,
   sur son onerror ET sur un delai de garde de six secondes. Il est protege
   contre lui-meme, pas contre celui de la boisson PRECEDENTE : ouvrir une
   boisson puis une autre, et le premier rappel arrive sur le conteneur de la
   seconde, qui porte deja une carte. Leaflet refuse, a juste titre.
   Ici on ne simule rien : on rappelle initLeafletMap, exactement comme ce
   rappel en retard le fait. */
const avant3 = errs.length;
const deuxFois = await pg.evaluate(async () => {
  let box = document.getElementById("map-box");
  if (!box) { box = document.createElement("div"); box.id = "map-box";
    box.style.cssText = "position:relative;width:360px;height:208px"; document.body.appendChild(box); }
  box.style.display = ""; box.innerHTML = '<div id="leaflet-map" style="width:100%;height:100%"></div>';
  window.curSel = DRINKS.find((x) => x.name === "Coca-Cola Original") || DRINKS[0];
  window._leafletMap = null;
  window.initLeafletMap(50.8793, 4.3511);
  const premiere = window._leafletMap;
  const marque = !!document.getElementById("leaflet-map")._leaflet_id;
  /* Sans le garde-fou, Leaflet leve ICI, et l'exception traverserait tout le
     controle. On la retient pour la RAPPORTER proprement. */
  let leve = "";
  try { window.initLeafletMap(50.8793, 4.3511); } catch (e) { leve = String(e && e.message).slice(0, 120); }
  const memeCarte = leve === "" && window._leafletMap === premiere;
  /* Et le cas ou la reference est perdue : un conteneur marque sans carte
     vivante doit se laisser REPOSER, sinon la fiche n'a plus jamais de carte. */
  window._leafletMap = null;
  try { window.initLeafletMap(50.8793, 4.3511); } catch (e) { if (!leve) leve = String(e && e.message).slice(0, 120); }
  const reposee = !!window._leafletMap && window._leafletMap !== premiere;
  try { if (window._leafletMap) window._leafletMap.remove(); } catch (e) {}
  window._leafletMap = null;
  await new Promise((r) => setTimeout(r, 700));
  return { construite: !!premiere, marque, memeCarte, reposee, leve };
});
ok("une premiere carte est posee", deuxFois.construite === true, "et le conteneur est marque : " + deuxFois.marque);
ok("le rappel en retard ne pose PAS de seconde carte", deuxFois.memeCarte === true,
  deuxFois.leve ? "LEVE : " + deuxFois.leve : "la carte en place est restee la meme");
ok("rien n'a ete leve", errs.slice(avant3).filter((e) => /already initialized/i.test(e)).length === 0,
  errs.slice(avant3)[0] || "aucune erreur");
ok("reference perdue : la carte peut etre REPOSEE", deuxFois.reposee === true,
  "sinon la fiche resterait sans carte pour de bon");

console.log("\n  LA CARTE SURVIT AUX RAPPELS EN RETARD\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(52) + " " + d); }
console.log("\n  erreurs JavaScript non rattrapees : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && errs.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko === 0 && errs.length === 0 ? 0 : 1);
