/* ══ LE SERVICE WORKER : UNE MISE A JOUR QUI ATTEND, QUI INSTALLE LE BON CODE,
   ET QUI A UN REPLI HORS LIGNE ══════════════════════════════════════════════
   Ce que l'audit a mesure (scratchpad/mesure-sw-*.mjs, 21/11) :

     1. chaque mise en ligne RECHARGEAIT l'app en pleine utilisation, 4 a 15 s
        apres l'ouverture : « coca » tape, retour a l'accueil, champ vide
        (sw.js faisait skipWaiting a l'install, index.html rechargeait sur
        controllerchange). 178 commits en 66 jours : presque a chaque ouverture ;
     2. dans les dix minutes qui suivent une mise en ligne, la version neuve
        INSTALLAIT L'ANCIEN CODE : GitHub Pages sert tout avec max-age=600 a la
        meme URL, et cache.addAll se servait dans le cache HTTP (7 fichiers sur
        8 en version A dans le cache B) ; nutrition.js et drinkart.js n'etaient
        meme pas dans APP_SHELL (hors ligne : plus de sucre, plus de dessins) ;
     3. hors ligne sans cache (apres la « recuperation automatique » qui vide
        tout), la page d'erreur du navigateur : chrome-error://, rien pour
        revenir ;
     4. le cache des vignettes Open Food Facts contenait 0 entree par
        construction (reponses opaques refusees), et les bibliotheques CDN
        (Firebase, Leaflet, Quagga : ~260 Ko compresses) etaient jetees a chaque
        deploiement avec le cache estampille.

   CE CONTROLE REJOUE LE VRAI PIPELINE : l'etape d'estampillage est LUE dans
   .github/workflows/pages.yml et executee telle quelle (avec un GITHUB_SHA
   par version), puis outils/alleger-site.mjs, puis un serveur qui imite
   GitHub Pages (max-age=600 sur tout, meme URL d'une version a l'autre).
   Quatre « deploiements » A, B, C, D, et il verrouille :

     A2  version neuve trouvee pendant qu'on tape -> AUCUN rechargement, la
         saisie reste, un toast « touche pour redemarrer » (traduit) ; puis
         visibilitychange hidden -> rechargement, caches = la neuve seule ;
         un tap sur le toast fait pareil ; « Chercher une mise a jour » aussi ;
         et si l'app passe en arriere-plan PENDANT le telechargement, la
         bascule se fait d'elle-meme des l'installation finie ;
     A3  le cache de la version neuve contient TOUS les fichiers de la coquille,
         tous en version neuve (index.html compris, lui que le cache HTTP du
         navigateur gardait en vieille version), nutrition.js et drinkart.js
         compris ; les URL portent ?v=<commit> des deux cotes ;
     A5  hors ligne sans cache : une page 503 lisible, dans la langue de l'app,
         jamais chrome-error ; une ressource absente -> erreur reseau franche ;
     A8  une <img> SANS crossorigin remplit quand meme magofeed-img-v1 ;
     A15 les bibliotheques CDN restent dans magofeed-lib-v1 d'une version a
         l'autre, et le cache d'images aussi.

   MAGO_RACINE=$PWD node outils/essai-service-worker.mjs
   ────────────────────────────────────────────────────────────────────────── */
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const { chromium, devices } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile, readdir, writeFile, mkdtemp, cp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const R = process.env.MAGO_RACINE || "/home/user/magofeed";
const M = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const etapes = [];
function verifier(nom, cond, detail) { etapes.push([nom, !!cond, detail || ""]); }

/* ── Les quatre deploiements, fabriques comme pages.yml le fait ──────────── */
const SHA = { A: "a".repeat(40), B: "b".repeat(40), C: "c".repeat(40), D: "d".repeat(40) };
const bac = await mkdtemp(join(tmpdir(), "magofeed-sw-"));
/* L'etape « Stamp service worker cache version », lue dans le workflow : si
   quelqu'un retouche le sed la-bas, c'est ce qui tourne ici. */
const yml = (await readFile(join(R, ".github/workflows/pages.yml"), "utf8")).split("\n");
let iStamp = yml.findIndex((l) => /- name: Stamp service worker cache version/.test(l));
let iRun = iStamp + 1; while (iRun < yml.length && !/^\s*run: \|/.test(yml[iRun])) iRun++;
const retrait = iRun < yml.length ? yml[iRun].match(/^(\s*)/)[1].length + 2 : 0;
const etape = [];
for (let k = iRun + 1; k < yml.length; k++) {
  const l = yml[k];
  if (l.trim() === "") { etape.push(""); continue; }
  if (l.match(/^(\s*)/)[1].length < retrait) break;
  etape.push(l.slice(retrait));
}
verifier("pages.yml : l'etape d'estampillage est trouvee", iStamp !== -1 && etape.length > 3, etape.length + " lignes");

const dirs = {};
for (const V of Object.keys(SHA)) {
  const d = join(bac, V); dirs[V] = d;
  for (const f of ["index.html", "app.css", "sw.js", "manifest.json"]) await cp(join(R, f), join(d, f));
  for (const f of ["data", "icons"]) await cp(join(R, f), join(d, f), { recursive: true });
  let erreurEtape = "";
  try { execFileSync("bash", ["-eo", "pipefail", "-c", etape.join("\n")], { cwd: d, env: { ...process.env, GITHUB_SHA: SHA[V] }, stdio: "pipe" }); }
  catch (e) { erreurEtape = String(e.stdout || "") + String(e.stderr || ""); }
  if (V === "A") verifier("pages.yml : l'etape d'estampillage passe sur ce depot", !erreurEtape, erreurEtape.slice(-200).replace(/\s+/g, " "));
  try { execFileSync("node", [join(R, "outils/alleger-site.mjs"), d], { cwd: R, stdio: "pipe" }); }
  catch (e) { verifier("alleger-site.mjs tolere les URL estampillees (" + V + ")", false, String(e.stderr || e.message).slice(0, 160)); }
  /* Un marqueur de version dans chaque fichier, pose APRES l'allegement (qui
     retire les commentaires) : c'est lui qu'on lira dans les caches. */
  for (const f of (await readdir(join(d, "data"))).filter((f) => f.endsWith(".js")))
    await writeFile(join(d, "data", f), (await readFile(join(d, "data", f), "utf8")) + "\n/*V:" + V + "*/\n");
  await writeFile(join(d, "app.css"), (await readFile(join(d, "app.css"), "utf8")) + "\n/*V:" + V + "*/\n");
  const ih = await readFile(join(d, "index.html"), "utf8");
  await writeFile(join(d, "index.html"), ih.replace("</body>", '<script>window.__V="' + V + '"</script>/*V:' + V + '*/</body>'));
}
const swA = await readFile(join(dirs.A, "sw.js"), "utf8");
const ihA = await readFile(join(dirs.A, "index.html"), "utf8");
verifier("A3 : CACHE_NAME porte le commit", /CACHE_NAME = "magofeed-a{12}"/.test(swA), (swA.match(/CACHE_NAME = "[^"]+"/) || [""])[0]);
const shellA = [...swA.matchAll(/^  "(\.\/[^"]*)",?$/gm)].map((m) => m[1]);
verifier("A3 : APP_SHELL contient nutrition.js et drinkart.js", shellA.some((u) => /data\/nutrition\.js/.test(u)) && shellA.some((u) => /data\/drinkart\.js/.test(u)), shellA.length + " entrees");
/* Les balises FIXES seulement : textes.<langue>.js est ecrit par un
   document.write a l'execution et passe par requeteFraiche dans sw.js. */
const balises = [...ihA.matchAll(/<script src="(data\/[A-Za-z0-9_.-]+\.js(?:\?[^"]*)?)"|<link rel="stylesheet" href="(app\.css[^"]*)"/g)].map((m) => m[1] || m[2]);
const nonEstamp = balises.filter((u) => !/\?v=a{12}$/.test(u));
verifier("A3 : toutes les balises data/ et app.css d'index.html portent ?v=<commit>", balises.length >= 11 && nonEstamp.length === 0, balises.length + " balises" + (nonEstamp.length ? ", sans : " + nonEstamp.join(" ") : ""));
const shellSansV = shellA.filter((u) => /(data\/|app\.css)/.test(u) && !/\?v=a{12}$/.test(u));
verifier("A3 : APP_SHELL porte les MEMES URL estampillees", shellSansV.length === 0 && balises.every((b) => shellA.indexOf("./" + b) !== -1), shellSansV.length ? "sans : " + shellSansV.join(" ") : "balises et APP_SHELL d'accord");

/* ── Le serveur « GitHub Pages » : max-age=600 sur tout, meme URL ────────── */
let VERSION = "A"; const servi = [];
const srv = createServer(async (q, s) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  try {
    const b = await readFile(join(dirs[VERSION], u));
    servi.push({ v: VERSION, u, cc: q.headers["cache-control"] || "" });
    s.writeHead(200, { "content-type": M[extname(u)] || "application/octet-stream", "cache-control": "max-age=600" });
    s.end(b);
  } catch { s.writeHead(404); s.end(""); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const URL_APP = `http://127.0.0.1:${port}/index.html`;

/* Tout hote externe (Firebase, CDN, tuiles, OFF) est coupe : un proxy ou
   rien n'ecoute, sauf pour 127.0.0.1. Pas de page.route dans le premier
   contexte, car il desactiverait le cache HTTP du navigateur — et c'est lui
   qu'on veut voir tromper l'install. Et pas le proxy de la machine : avec de
   vraies requetes externes en vol, le navigateur attend qu'elles finissent
   avant d'activer la version neuve (cycle de vie normal du service worker),
   ce qui rend les delais de ce controle imprevisibles. */
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1" } });
const erreurs = [];
async function ouvrirContexte() {
  const ctx = await nav.newContext({ ...devices["iPhone 13"], locale: "fr-BE", geolocation: { latitude: 50.8793, longitude: 4.3511 }, permissions: ["geolocation"] });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => erreurs.push(String(e.message).slice(0, 140)));
  /* En neerlandais : le toast et la page de secours doivent etre traduits. */
  await pg.addInitScript(() => { try { localStorage.setItem("magoOnboard", "1"); localStorage.setItem("magoob", "1"); localStorage.setItem("magolang", "nl"); } catch (e) {} });
  /* Un journal des workers vus par la page (updatefound, statechange), pose
     en enveloppant register() : il dit combien de workers une mise a jour a
     reellement crees et par quels etats ils sont passes. Imprime, pas
     verifie : c'est ce qu'on lit d'abord quand une bascule ne se fait pas. */
  await pg.addInitScript(() => {
    if (!navigator.serviceWorker) return;
    window.__swJournal = []; var t0 = Date.now();
    var note = function (q) { window.__swJournal.push("+" + (Date.now() - t0) + "ms " + q); };
    var reg0 = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = function () {
      var p = reg0.apply(null, arguments);
      p.then(function (r) {
        var n = 0;
        var suivre = function (w, nom) { if (!w) return; note(nom + " " + w.state); w.addEventListener("statechange", function () { note(nom + " -> " + w.state); }); };
        suivre(r.installing, "W0");
        r.addEventListener("updatefound", function () { n++; suivre(r.installing, "W" + n); });
      }).catch(function () {});
      return p;
    };
  });
  return { ctx, pg };
}
const journalSW = (pg) => pg.evaluate(() => (window.__swJournal || []).join(" | ")).catch(() => "(page partie)");
const swDemandes = (depuis, v) => servi.slice(depuis).filter((x) => x.u === "/sw.js" && x.v === v).length;
const pret = (pg) => pg.waitForFunction(() => window.DRINKS && DRINKS.length > 100 && typeof navTo === "function", undefined, { timeout: 60000 });
const etatSW = (pg) => pg.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { inst: r && r.installing ? r.installing.state : null, wait: r && r.waiting ? r.waiting.state : null, act: r && r.active ? r.active.state : null, ctrl: !!navigator.serviceWorker.controller }; });
const listeCaches = (pg) => pg.evaluate(async () => (await caches.keys()).sort());
const demanderMaj = (pg) => pg.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()).catch(() => {}));
/* La version neuve est installee ET la page l'a annoncee (_majPrete pose par
   son statechange — quelques millisecondes apres que reg.waiting existe).
   Predicat SYNCHRONE, sur _swReg que la page expose : une fonction async
   rendrait une promesse, toujours vraie pour waitForFunction, qui ne
   patienterait donc jamais (c'est arrive a ce controle : il basculait en
   arriere-plan pendant que B se telechargeait encore). */
const attendreEnAttente = (pg) => pg.waitForFunction(() => !!(window._swReg && window._swReg.waiting && window._majPrete), undefined, { timeout: 60000, polling: 300 });
const attendreInstallation = (pg) => pg.waitForFunction(() => !!(window._swReg && window._swReg.installing), undefined, { timeout: 60000, polling: 100 });
const basculerArrierePlan = (pg) => pg.evaluate(() => { Object.defineProperty(document, "visibilityState", { get: function () { return "hidden"; }, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
/* Un rechargement attendu : la promesse est posee AVANT le geste. */
const rechargement = (pg, ms) => pg.waitForEvent("load", { timeout: ms }).then(() => true, () => false);

const { ctx, pg } = await ouvrirContexte();
let loads = 0; pg.on("load", () => { loads++; });

/* ─── Version A : premiere visite, puis une seconde (page pilotee des le depart) */
await pg.goto(URL_APP, { waitUntil: "domcontentloaded" });
await pret(pg);
await pg.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 60000, polling: 200 });
await pg.waitForTimeout(1500);
await pg.reload({ waitUntil: "domcontentloaded" });
await pret(pg);
verifier("A : l'app est pilotee par le service worker, un seul cache", (await etatSW(pg)).ctrl && (await listeCaches(pg)).join() === "magofeed-" + "a".repeat(12), (await listeCaches(pg)).join());
const lireCache = (pg, nom) => pg.evaluate(async (nom) => {
  const c = await caches.open(nom); const out = {};
  for (const k of await c.keys()) {
    const r = await c.match(k); const u = k.url.replace(location.origin + "/", "./");
    if (/\.(js|css|html)(\?|$)/.test(u) || /\/$/.test(u)) { const t = await r.text(); const m = /V:([A-D])/.exec(t.slice(-40)); out[u] = m ? m[1] : "sans marqueur"; }
    else out[u] = "present";
  }
  return out;
}, nom);
const cacheA = await lireCache(pg, "magofeed-" + "a".repeat(12));
verifier("A3 : des l'install, nutrition.js et drinkart.js sont en cache", cacheA["./data/nutrition.js?v=" + "a".repeat(12)] === "A" && cacheA["./data/drinkart.js?v=" + "a".repeat(12)] === "A", Object.keys(cacheA).filter((k) => /nutrition|drinkart/.test(k)).join(" "));

/* ─── A2 : la version B arrive pendant que la personne tape ─────────────── */
await pg.evaluate(() => navTo("search"));
await pg.waitForFunction(() => { const s = document.querySelector(".screen.on"); return s && s.id === "s-search"; }, undefined, { timeout: 10000 });
await pg.type("#q", "coca", { delay: 80 });
VERSION = "B"; const nB = servi.length; const loadsAvant = loads;
await demanderMaj(pg);
let enAttente = true; try { await attendreEnAttente(pg); } catch (e) { enAttente = false; }
verifier("A2 : la version neuve s'installe et reste EN ATTENTE (pas de skipWaiting)", enAttente, JSON.stringify(await etatSW(pg)));
await pg.waitForTimeout(4000);
console.log("  info  B : sw.js demande " + swDemandes(nB, "B") + " fois · workers vus par la page : " + (await journalSW(pg)));
const pendant = await pg.evaluate(() => ({ q: document.getElementById("q").value, ecran: (document.querySelector(".screen.on") || {}).id, v: window.__V, toast: document.getElementById("toast").classList.contains("show") ? document.getElementById("toast").textContent : "" }));
verifier("A2 : 4 s apres, AUCUN rechargement : « coca » est toujours la, ecran recherche", loads === loadsAvant && pendant.q === "coca" && pendant.ecran === "s-search" && pendant.v === "A", JSON.stringify(pendant));
verifier("A2 : un toast « touche pour redemarrer », traduit (nl)", pendant.toast === "Nieuwe versie klaar · tik om opnieuw te starten", pendant.toast || "(aucun toast)");
verifier("A2 : les deux caches coexistent (A sert, B attend)", (await listeCaches(pg)).join() === ["magofeed-" + "a".repeat(12), "magofeed-" + "b".repeat(12)].join(), (await listeCaches(pg)).join());

/* ─── A3 : ce que le cache B contient reellement ──────────────────────────── */
const cacheB = await lireCache(pg, "magofeed-" + "b".repeat(12));
const shellB = [...(await readFile(join(dirs.B, "sw.js"), "utf8")).matchAll(/^  "(\.\/[^"]*)",?$/gm)].map((m) => m[1]);
const manquants = shellB.filter((u) => !(u in cacheB));
const vieux = Object.keys(cacheB).filter((k) => cacheB[k] !== "present" && cacheB[k] !== "B");
verifier("A3 : le cache B contient TOUTE la coquille (" + shellB.length + " entrees)", manquants.length === 0 && Object.keys(cacheB).length === shellB.length, manquants.length ? "manque : " + manquants.join(" ") : Object.keys(cacheB).length + " entrees");
verifier("A3 : tout y est en version B — index.html compris, malgre max-age=600", vieux.length === 0, vieux.length ? vieux.map((k) => k + "=" + cacheB[k]).join(" ") : "index.html=" + cacheB["./index.html"] + " drinks=" + cacheB["./data/drinks.js?v=" + "b".repeat(12)] + " nutrition=" + cacheB["./data/nutrition.js?v=" + "b".repeat(12)]);
const indexB = servi.slice(nB).filter((x) => x.u === "/index.html");
verifier("A3 : index.html a ete redemande AU RESEAU (cache:\"reload\" -> no-cache)", indexB.length > 0 && indexB.every((x) => /no-cache/.test(x.cc)), indexB.map((x) => x.cc || "(sans en-tete)").join(", "));

/* ─── A2 : l'app passe en arriere-plan -> la bascule, puis le rechargement ── */
const rechargeB = rechargement(pg, 15000);
await basculerArrierePlan(pg);
verifier("A2 : visibilitychange hidden -> controllerchange -> rechargement", await rechargeB, "loads=" + loads);
await pret(pg);
await pg.waitForTimeout(1500);
const apresB = await pg.evaluate(() => ({ v: window.__V, ctrl: !!navigator.serviceWorker.controller, verrou: sessionStorage.getItem("mago_sw_reloaded") }));
verifier("A2 : la page tourne en version B, pilotee, verrou anti-boucle pose", apresB.v === "B" && apresB.ctrl && apresB.verrou === "1", JSON.stringify(apresB));
verifier("A2 : l'ancien cache est parti, seul B reste", (await listeCaches(pg)).join() === "magofeed-" + "b".repeat(12), (await listeCaches(pg)).join());

/* ─── A2 : version C, et cette fois on TOUCHE le toast ───────────────────── */
VERSION = "C";
await demanderMaj(pg);
await attendreEnAttente(pg);
await pg.waitForFunction(() => document.getElementById("toast").classList.contains("show"), undefined, { timeout: 10000 });
const rechargeC = rechargement(pg, 15000);
await pg.locator("#toast").tap();
verifier("A2 : un tap sur le toast -> rechargement (le verrou de session ne bloque pas)", await rechargeC, "loads=" + loads);
await pret(pg);
await pg.waitForTimeout(1000);
verifier("A2 : la page tourne en version C, seul C reste", (await pg.evaluate(() => window.__V)) === "C" && (await listeCaches(pg)).join() === "magofeed-" + "c".repeat(12), (await listeCaches(pg)).join());

/* ─── A2 : version D par le bouton « Chercher une mise a jour » ──────────── */
VERSION = "D";
await pg.evaluate(() => { window.__toasts = []; const o = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return o.apply(this, arguments); }; });
const rechargeD = rechargement(pg, 30000);
await pg.evaluate(() => chercherMiseAJour());
verifier("A2 : « Chercher une mise a jour » -> SKIP_WAITING -> rechargement", await rechargeD, "loads=" + loads);
await pret(pg);
await pg.waitForTimeout(1000);
verifier("A2 : ... sur la NOUVELLE version (D), pas sur l'ancien worker", (await pg.evaluate(() => window.__V)) === "D" && (await listeCaches(pg)).join() === "magofeed-" + "d".repeat(12), "v=" + (await pg.evaluate(() => window.__V)) + " caches=" + (await listeCaches(pg)).join());

/* ─── A5 : hors ligne, sans cache (la « recuperation automatique » a tout vide) */
await pg.evaluate(() => caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
await ctx.setOffline(true);
let reponse = null, erreurNav = "";
try { reponse = await pg.reload({ waitUntil: "domcontentloaded", timeout: 15000 }); } catch (e) { erreurNav = String(e.message).split("\n")[0].slice(0, 100); }
await pg.waitForTimeout(500);
const secours = await pg.evaluate(() => ({ url: location.href, lang: document.documentElement.lang, texte: document.body.innerText.slice(0, 120), lien: (document.querySelector("a") || {}).textContent || "" })).catch((e) => ({ url: pg.url(), texte: "(inaccessible) " + String(e.message).slice(0, 80) }));
verifier("A5 : hors ligne sans cache -> une page 503, pas chrome-error", reponse && reponse.status() === 503 && !/^chrome-error/.test(secours.url), (reponse ? "status " + reponse.status() : erreurNav) + " · " + secours.url.slice(0, 40));
verifier("A5 : ... lisible, dans la langue de l'app (nl), avec un lien pour reessayer", secours.lang === "nl" && /Offline, en de app staat nog niet in de cache/.test(secours.texte) && secours.lien === "Opnieuw proberen", JSON.stringify(secours).slice(0, 200));
await ctx.setOffline(false);
await pg.reload({ waitUntil: "domcontentloaded" });
await pret(pg);
verifier("A5 : le reseau revient -> l'app repart, le cache se remplit", (await pg.evaluate(() => window.__V)) === "D" && (await listeCaches(pg)).indexOf("magofeed-" + "d".repeat(12)) !== -1, (await listeCaches(pg)).join());
/* Une URL que ni le cache du service worker ni le cache HTTP n'ont vue. */
await ctx.setOffline(true);
const ressource = await pg.evaluate(() => fetch("data/alias.js?v=jamais-vue").then((r) => "reponse " + r.status + " type=" + r.type, (e) => "erreur:" + e.name));
verifier("A5 : une ressource absente du cache, hors ligne -> erreur reseau franche", /^erreur:TypeError|type=error/.test(ressource), ressource);
await ctx.setOffline(false);
await ctx.close();

/* ─── A8 + A15 : vignettes et bibliotheques CDN, dans un contexte neuf ────── */
VERSION = "A";
const { ctx: ctx2, pg: pg2 } = await ouvrirContexte();
const png = await readFile(join(R, "icons/favicon-32.png"));
const IMG = "https://images.openfoodfacts.org/images/products/544/900/000/0996/front_fr.4.400.jpg";
const LIB = "https://cdnjs.cloudflare.com/ajax/libs/essai/1.0.0/essai.min.js";
let hitsImg = 0;
/* Open Food Facts repond comme en vrai : access-control-allow-origin: *. */
await ctx2.route(/images\.openfoodfacts\.org/, (r) => { if (r.request().url() === IMG) hitsImg++; r.fulfill({ status: 200, headers: { "content-type": "image/png", "access-control-allow-origin": "*" }, body: png }); });
await ctx2.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/essai\//, (r) => { r.fulfill({ status: 200, headers: { "content-type": "text/javascript", "access-control-allow-origin": "*" }, body: "window.__lib=1;" }); });
await pg2.goto(URL_APP, { waitUntil: "domcontentloaded" });
await pret(pg2);
await pg2.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 60000, polling: 200 });
await pg2.waitForTimeout(1000);
const nImg = () => pg2.evaluate(async () => (await (await caches.open("magofeed-img-v1")).keys()).map((k) => k.url));
const nLib = () => pg2.evaluate(async () => (await (await caches.open("magofeed-lib-v1")).keys()).map((k) => k.url));
const chargerImg = () => pg2.evaluate((src) => new Promise((res) => { const i = new Image(); i.onload = () => res("load"); i.onerror = () => res("error"); i.src = src; }), IMG);
const img1 = await chargerImg();
await pg2.waitForTimeout(1500);
verifier("A8 : une <img> SANS crossorigin s'affiche et remplit magofeed-img-v1", img1 === "load" && (await nImg()).indexOf(IMG) !== -1, img1 + " · " + (await nImg()).length + " entree(s)");
const avantRelecture = hitsImg;
await chargerImg();
await pg2.waitForTimeout(800);
verifier("A8 : la meme vignette est resservie du cache, sans reseau", avantRelecture === 1 && hitsImg === 1, "requetes reseau pour cette vignette : " + hitsImg);
/* Le corps est lu jusqu'au bout, comme le ferait une vraie balise <script>,
   et on verifie que la bibliotheque arrive entiere. */
const lib1 = await pg2.evaluate((u) => fetch(u).then((r) => r.text()).then((t) => /__lib/.test(t), () => false), LIB);
await pg2.waitForTimeout(800);
verifier("A15 : une bibliotheque CDN est rangee dans magofeed-lib-v1", lib1 && (await nLib()).indexOf(LIB) !== -1, (await nLib()).join(" ") || "(vide)");

/* Deploiement B : les deux caches permanents doivent survivre a la purge.
   Et cette fois l'app passe en arriere-plan PENDANT que B se telecharge
   (5 Mo de coquille : plusieurs secondes sur un mauvais reseau) : la bascule
   doit se faire d'elle-meme des l'installation finie, sans attendre une
   prochaine mise en arriere-plan. */
VERSION = "B";
await pg2.reload({ waitUntil: "domcontentloaded" });
await pret(pg2);
const nB2 = servi.length;
await demanderMaj(pg2);
await attendreInstallation(pg2);
const pendantB2 = await etatSW(pg2);
const rechargeB2 = rechargement(pg2, 30000);
await basculerArrierePlan(pg2);
verifier("A2 : arriere-plan PENDANT le telechargement de B -> bascule des l'installation finie", pendantB2.inst === "installing" && pendantB2.wait === null && (await rechargeB2), JSON.stringify(pendantB2));
console.log("  info  B (second contexte) : sw.js demande " + swDemandes(nB2, "B") + " fois");
await pret(pg2);
await pg2.waitForTimeout(1500);
const cachesApres = await listeCaches(pg2);
verifier("A15 : apres la version B, magofeed-lib-v1 et magofeed-img-v1 sont encore la, A est parti", cachesApres.join() === ["magofeed-" + "b".repeat(12), "magofeed-img-v1", "magofeed-lib-v1"].join(), cachesApres.join());
verifier("A15 : la bibliotheque et la vignette n'ont pas ete retelechargees", (await nLib()).indexOf(LIB) !== -1 && (await nImg()).indexOf(IMG) !== -1, "lib=" + (await nLib()).length + " img=" + (await nImg()).length);
await ctx2.close();

/* ─── Bilan ──────────────────────────────────────────────────────────────── */
console.log("\n  LE SERVICE WORKER : MISE A JOUR QUI ATTEND, BON CODE, REPLI HORS LIGNE\n");
let ko = 0;
for (const [nom, ok, det] of etapes) {
  if (!ok) ko++;
  console.log("   " + (ok ? "ok  " : "ECHEC") + "  " + nom.padEnd(78) + " " + det);
}
/* Les erreurs JS attendues : Firebase et les CDN sont coupes au DNS. On ne
   retient que celles qui parlent du service worker ou des caches. */
const graves = erreurs.filter((e) => /serviceWorker|caches|SKIP_WAITING|_majPrete|annoncerMaj|appliquerMaj/.test(e));
console.log("\n  erreurs JavaScript liees au service worker : " + graves.length + " (autres, reseau coupe : " + (erreurs.length - graves.length) + ")");
graves.slice(0, 4).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && graves.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.closeAllConnections(); srv.close();
await rm(bac, { recursive: true, force: true });
process.exit(ko === 0 && graves.length === 0 ? 0 : 1);
