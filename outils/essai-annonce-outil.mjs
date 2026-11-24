/* ══ L'OUTIL DE DECLARATION REFUSE AVANT D'ECRIRE ══════════════════════════
   L'ecran d'administration peut poser une annonce qui touche des centaines de
   magasins. Ce controle eprouve ce qu'il REFUSE, parce que c'est la seule
   partie qui protege vraiment :

     - une boisson alcoolisee, nommement. « Pas d'alcool, meme 0.0% » est une
       regle absolue du projet, et une collab avec une franchise de boissons
       est exactement le moment ou une reference alcoolisee se glisse dans une
       liste collee ;
     - un identifiant qui n'existe pas au catalogue ;
     - un rayon de plus de 25 km, une collab de plus de 120 jours, deux dates
       a l'envers, un centre absent, une reference de contrat absente ;
     - et il ne publie JAMAIS sans qu'un mot ait ete tape. Au niveau
       « massif » sans mot impose, le garde-fou maison part au premier appui.

   Il verifie aussi deux choses structurelles :
     - le comptage passe par le VRAI resolveur, sous une cle temporaire, et
       remet la table exactement comme elle etait. Recopier la condition
       aurait cree deux verites qui divergent au premier changement ;
     - l'outil n'ajoute AUCUN element permanent au squelette de la page.

   node outils/essai-annonce-outil.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

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

/* ZERO ELEMENT PERMANENT : on le verifie sur le squelette SERVI, avant toute
   execution de JavaScript. */
const squelette = await readFile(join(R, "index.html"), "utf8");
const etapes = [];
const srcOk = (n, c, d) => etapes.push([n, !!c, d || ""]);
srcOk("l'outil n'ajoute aucun element permanent au squelette",
  !/<div id="admin-marques"/.test(squelette),
  "l'hote est cree a la demande, devant #admin-list");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-BE",
  geolocation: { latitude: 50.8466, longitude: 4.3528 }, permissions: ["geolocation"] });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 180)));
await pg.route("**/*", (r) => r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort());
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => window.DRINKS && DRINKS.length > 100 && typeof window.renderDeclarationsMarque === "function", { timeout: 40000 });
await pg.evaluate(() => { try { document.getElementById("onboarding")?.remove(); document.getElementById("splash")?.remove(); } catch (e) {} });

const dans = await pg.evaluate(async () => {
  const v = []; const ok = (n, c, d) => v.push([n, !!c, d || ""]);
  const JOUR = 86400000;

  /* UNE BOISSON ALCOOLISEE DU CATALOGUE. Si le catalogue n'en contient
     aucune, on le DIT plutot que de laisser passer une epreuve vide. */
  const alco = (window.DRINKS || []).filter((d) => {
    try { return window.nameLooksAlcoholic(d.name, d.brand); } catch (e) { return false; }
  })[0];
  const sain = (window.DRINKS || []).filter((d) => {
    try { return !window.nameLooksAlcoholic(d.name, d.brand); } catch (e) { return true; }
  })[0];
  ok("une boisson saine existe pour les essais", !!sain, sain ? sain.name : "-");

  window.DECLARATIONS = {}; window.declIndexer();
  window._declErreur = null; window._declLuA = Date.now();
  window._marqBrouillon = {};
  window.renderDeclarationsMarque();
  const el = document.getElementById("admin-marques");
  ok("l'outil se rend dans l'ecran d'administration", !!el && el.innerHTML.length > 200,
    el ? el.innerHTML.length + " caracteres" : "absent");
  ok("et il dit l'etat de lecture de la table",
    !!el && /Table lue/.test(el.textContent), "Table lue : 0 annonce");

  const remplir = (o) => {
    const set = (id, val) => { const e = document.getElementById(id); if (e) { e.value = val; e.dispatchEvent(new Event("input", { bubbles: true })); } };
    set("marq-m", o.m == null ? "Pales" : o.m);
    set("marq-b", o.b == null ? String(sain.id) : o.b);
    set("marq-c", o.c == null ? "50.8466, 4.3528" : o.c);
    set("marq-r", o.r == null ? "8" : o.r);
    /* DES DATES QUI COUVRENT AUJOURD'HUI. Premiere version : des dates en
       dur en decembre, alors que l'essai tournait le 21 novembre — la fenetre
       n'etait pas ouverte, declarationPour rendait null, et le comptage
       annonçait « 0 magasin » sans que rien ne soit casse. */
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dans30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    set("marq-d1", o.d1 == null ? hier : o.d1);
    set("marq-d2", o.d2 == null ? dans30 : o.d2);
    set("marq-k", o.k == null ? "Essai automatique" : o.k);
    const ens = document.getElementById("marq-ens");
    if (ens) { ens.checked = !!o.ens; ens.dispatchEvent(new Event("change", { bubbles: true })); }
  };
  const compter = () => {
    const b = document.getElementById("marq-compter");
    b.onclick(); /* on appelle le gestionnaire, pas un vrai appui */
    return (document.getElementById("marq-res").textContent || "").replace(/\s+/g, " ").trim();
  };

  /* ── CE QUI DOIT ETRE REFUSE, ET NOMME ──────────────────────────────── */
  remplir({ m: "" });
  ok("sans marque : refus nomme", /nom de la marque/i.test(compter()), compter().slice(0, 70));
  remplir({ b: "" });
  ok("sans boisson : refus nomme", /identifiant de boisson/i.test(compter()), compter().slice(0, 70));
  remplir({ b: "999999999" });
  ok("identifiant inconnu : refus nomme", /n’existe pas au catalogue/.test(compter()), compter().slice(0, 70));
  /* LE CATALOGUE NE CONTIENT AUCUNE BOISSON ALCOOLISEE — c'est la regle du
     projet, et c'est tant mieux. On ne peut donc pas en coller une : on
     eprouve que l'OUTIL CONSULTE le garde-fou, en le faisant repondre oui
     pour une boisson precise. Ce qui est teste ici est le BRANCHEMENT, pas la
     detection, qui a ses propres controles ailleurs. */
  ok("le catalogue ne contient aucune boisson alcoolisee", !alco,
    alco ? "ATTENTION : " + alco.name : "aucune sur " + (window.DRINKS || []).length);
  const vraiAlco = window.nameLooksAlcoholic;
  window.nameLooksAlcoholic = function (n, b) {
    if (String(n) === String(sain.name)) return true;
    return vraiAlco(n, b);
  };
  remplir({ b: String(sain.id) });
  const rAlco = compter();
  window.nameLooksAlcoholic = vraiAlco;
  ok("boisson jugee alcoolisee : REFUS, et elle est nommee",
    /Refus/.test(rAlco) && rAlco.indexOf(sain.name) !== -1, rAlco.slice(0, 95));

  remplir({ c: "" });
  ok("sans centre : refus nomme", /centre/i.test(compter()), compter().slice(0, 70));
  remplir({ r: "300" });
  ok("rayon de 300 km : refus nomme", /25 km/.test(compter()), compter().slice(0, 70));
  remplir({ d1: "2026-12-31", d2: "2026-12-01" });
  ok("dates a l'envers : refus nomme", /après le premier/.test(compter()), compter().slice(0, 70));
  remplir({ d1: "2026-01-01", d2: "2026-12-31" });
  ok("collab de 365 jours : refus nomme", /120 jours/.test(compter()), compter().slice(0, 70));
  remplir({ k: "" });
  ok("sans reference de contrat : refus nomme", /contrat/i.test(compter()), compter().slice(0, 70));

  /* ── CE QUI DOIT PASSER, ET CE QUE LE COMPTAGE DIT ──────────────────── */
  window.STORES.length = 0;
  window.STORES.push({ id: "P1", fbId: "P1", name: "Commerce Essai Sans Type", brand: "", type: "",
    lat: 50.8470, lng: 4.3700, dist: 900, drinks: [], drinksVerified: [], confirmations: {} });
  window.STORES.push({ id: "P2", fbId: "P2", name: "Delhaize Proxy Essai", brand: "Delhaize", type: "",
    lat: 50.8471, lng: 4.3701, dist: 900, drinks: [], drinksVerified: [], confirmations: {} });
  const avantTable = JSON.stringify(window.DECLARATIONS);
  remplir({});
  const r2 = compter();
  ok("une declaration valide est comptee", /magasin/.test(r2) && !/Refus|Donne|Rayon/.test(r2), r2.slice(0, 110));
  ok("le comptage distingue independants et enseignes", /indépendant/.test(r2), r2.slice(0, 110));
  ok("il dit qu'aucun ne passera en vert", /Aucun ne passera en vert/.test(r2), "la phrase y est");
  ok("il previent que le cercle depend de l'appareil",
    /pas ceux-ci/.test(r2), "le visiteur verra ses magasins, pas ceux-ci");
  ok("l'enseigne n'est PAS comptee par defaut", / 1 magasin/.test(r2) || /^1 /.test(r2) || /1 magasin/.test(r2),
    "sansEnseignes par defaut : " + r2.slice(0, 60));
  ok("et le comptage a remis la table exactement comme elle etait",
    JSON.stringify(window.DECLARATIONS) === avantTable, "aucune cle temporaire laissee");

  /* Changer un champ ramene le bouton au comptage : on le verifie ICI, parce
     que c'est le defaut que ce controle a trouve. */
  remplir({ ens: true });
  const btnApres = document.getElementById("marq-compter");
  ok("changer un champ ramene le bouton au comptage",
    /Compter/.test(btnApres.textContent), btnApres.textContent);
  const r3 = compter();
  ok("en cochant « inclure les enseignes », les deux sont comptes", /2 magasins/.test(r3), r3.slice(0, 60));

  /* ── LA PUBLICATION DEMANDE UN MOT ──────────────────────────────────── */
  remplir({});
  compter();
  const btn = document.getElementById("marq-compter");
  ok("le bouton devient « Publier l'annonce »", /Publier/.test(btn.textContent), btn.textContent);
  /* On empeche toute ecriture reelle : on veut seulement voir le garde-fou. */
  let ecrit = 0;
  window.fbEcrireDeclaration = function () { ecrit++; return Promise.resolve(); };
  btn.onclick();
  await new Promise((r) => setTimeout(r, 150));
  const gf = document.getElementById("garde-fou");
  ok("un garde-fou s'ouvre", !!gf, gf ? "garde-fou present" : "AUCUN garde-fou");
  ok("et il exige qu'un mot soit tape", !!gf && !!gf.querySelector("#gf-mot"),
    "sans mot, le bouton Confirmer part au premier appui");
  ok("le mot demande est PUBLIER", !!gf && /PUBLIER/.test(gf.textContent), "mot impose");
  ok("il annonce le nombre de magasins", !!gf && /magasin/.test(gf.textContent), "le compte est repete");
  ok("il dit que rien ne passera en rayon",
    !!gf && /jamais « En stock »/.test(gf.textContent), "la promesse est ecrite dans le garde-fou");
  ok("rien n'a ete ecrit tant que le mot n'est pas tape", ecrit === 0, "ecritures = " + ecrit);
  try { gf.querySelector("#gf-non").click(); } catch (e) {}
  await new Promise((r) => setTimeout(r, 80));
  ok("annuler referme le garde-fou sans ecrire",
    !document.getElementById("garde-fou") && ecrit === 0, "ecritures = " + ecrit);

  /* ── UN REFUS DE LECTURE SE VOIT ────────────────────────────────────── */
  window._declErreur = "permission-denied";
  window.renderDeclarationsMarque();
  const el2 = document.getElementById("admin-marques");
  ok("un refus de lecture est affiche, pas avale",
    /Table non lue/.test(el2.textContent) && /permission-denied/.test(el2.textContent),
    "et il dit qu'aucune annonce ne s'affiche nulle part");
  window._declErreur = null;

  /* ── ARRETER GARDE LA TRACE, SUPPRIMER LA DETRUIT ───────────────────── */
  window.DECLARATIONS = { "pales-1": { marque: "Pales", boissons: [Number(sain.id)],
    lat: 50.8466, lng: 4.3528, rayonKm: 8, sansEnseignes: true,
    du: Date.now() - JOUR, au: Date.now() + JOUR, contrat: "Collab Pales courriel du 18/11", actif: true } };
  window.declIndexer();
  window.renderDeclarationsMarque();
  const el3 = document.getElementById("admin-marques");
  ok("l'annonce en cours est listee avec sa reference de contrat",
    /Pales/.test(el3.textContent) && /courriel du 18\/11/.test(el3.textContent), "la trace est lisible");
  ok("elle offre « Arreter maintenant » ET « Supprimer »",
    !!el3.querySelector("[data-arreter]") && !!el3.querySelector("[data-supprimer]"),
    "deux gestes distincts");
  el3.querySelector("[data-arreter]").onclick();
  await new Promise((r) => setTimeout(r, 150));
  const gf2 = document.getElementById("garde-fou");
  ok("arreter dit qu'aucune confirmation n'est perdue",
    !!gf2 && /Aucune confirmation n’est perdue/.test(gf2.textContent), "la phrase y est");
  ok("et que la reference de contrat reste lisible",
    !!gf2 && /référence de contrat restent lisibles/.test(gf2.textContent), "la trace survit");
  try { gf2.querySelector("#gf-non").click(); } catch (e) {}
  await new Promise((r) => setTimeout(r, 80));
  el3.querySelector("[data-supprimer]").onclick();
  await new Promise((r) => setTimeout(r, 150));
  const gf3 = document.getElementById("garde-fou");
  ok("supprimer est annonce comme definitif",
    !!gf3 && /Destruction définitive/i.test(gf3.textContent), "niveau irreversible");
  ok("et le mot a taper est SUPPRIMER", !!gf3 && /SUPPRIMER/.test(gf3.textContent), "mot impose");
  try { gf3.querySelector("#gf-non").click(); } catch (e) {}

  window.DECLARATIONS = {}; window.declIndexer(); window.STORES.length = 0;
  return v;
});

for (const e of dans) etapes.push(e);
console.log("\n  L'OUTIL DE DECLARATION REFUSE AVANT D'ECRIRE\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(56) + " " + d); }
console.log("\n  erreurs JavaScript non rattrapees : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && errs.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko === 0 && errs.length === 0 ? 0 : 1);
