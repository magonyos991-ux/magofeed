/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   ESSAI : LA FICHE D'UN MAGASIN
   ----------------------------------------------------------------------------
   POURQUOI. La liste des boissons d'un magasin n'avait aucun plafond. Sur un
   Auchan, elle construit 1 170 lignes — chacune avec deux boutons, une
   animation et une image. Deux consequences, et la seconde est celle qu'on
   ressent :
     - la fiche met plusieurs secondes a s'ouvrir ;
     - tout ce qui vit SOUS la liste (le tableau de bord du gerant, les vues,
       le partage) se trouve derriere des centaines d'ecrans de defilement.
       Personne ne le trouvait.

   On pose donc un lot, avec un bouton pour la suite, et une barre de raccourcis
   vers les sections d'en bas. Cet essai mesure les deux, dans un vrai
   navigateur, sur un magasin de la taille des vrais.

   Lancer :  node outils/essai-fiche-magasin.mjs
   ============================================================================ */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.log("playwright n'est pas installe — essai saute (npm i -D playwright)"); process.exit(0); }

const NAVIGATEUR = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

const etapes = [];
const dit = (nom, ok, note) => etapes.push([!!ok, nom, note || ""]);

const srv = createServer(async (q, r) => {
  try {
    const u = decodeURIComponent(q.url.split("?")[0]);
    const f = join(process.cwd(), u === "/" ? "/index.html" : u);
    const b = await readFile(f);
    r.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    r.end(b);
  } catch { r.writeHead(404); r.end("non"); }
});
await new Promise((ok) => srv.listen(8107, ok));

let nav;
try { nav = await chromium.launch({ executablePath: NAVIGATEUR }); }
catch (e) { console.log("aucun navigateur utilisable (" + String(e.message).slice(0, 90) + ") — essai saute"); srv.close(); process.exit(0); }

const page = await nav.newPage();
const plantages = [];
page.on("pageerror", (e) => plantages.push(String(e).slice(0, 160)));
await page.route("**://*.openfoodfacts.org/**", (r) => r.abort());
await page.goto("http://localhost:8107/index.html", { waitUntil: "load" });
await page.waitForTimeout(2500);

const vu = await page.evaluate(() => {
  const out = {};
  const ids = DRINKS.slice(0, 300).map((d) => d.id);
  const conf = {}; ids.forEach((i) => { conf[i] = 1; });
  const s = { id: "o500", fbId: "o500", name: "Grand Magasin", brand: "Delhaize",
              lat: 50.85, lng: 4.35, drinks: ids.slice(), confirmations: conf, seenAt: {} };
  window.STORES = [s]; window.curStoreDetail = s; window._sdTout = null;
  renderStoreDetail();
  out.rayonComplet = (s.drinks || []).length;          // rayon probable compris
  out.lignesPosees = document.querySelectorAll("#sd-drink-list .store-card").length;
  out.boutonSuite = (document.getElementById("sd-plus").textContent || "").trim();

  /* Le cout du rendu, mesure a l'identique des deux cotes : un rechauffage
     non compte, puis cinq rendus moyennes. Sans cela on compare un premier
     rendu (qui calcule le rayon d'enseigne) a un second, et le chiffre ment. */
  const mesure = (tout) => {
    window._sdTout = tout ? String(s.id) : null;
    renderStoreDetail();
    const t = performance.now();
    for (let i = 0; i < 5; i++) renderStoreDetail();
    return Math.round((performance.now() - t) / 5);
  };
  out.msAvecLot = mesure(false);
  out.msSansLot = mesure(true);
  out.lignesSansLot = document.querySelectorAll("#sd-drink-list .store-card").length;

  // « Voir la suite » pose bien tout le reste
  window._sdTout = null; renderStoreDetail();
  const b = document.getElementById("sd-plus-btn");
  if (b) b.onclick();
  out.apresSuite = document.querySelectorAll("#sd-drink-list .store-card").length;
  out.suiteMasquee = document.getElementById("sd-plus").style.display === "none";

  /* Un magasin qui porte VRAIMENT peu de boissons n'a pas de bouton du tout.
     Le rayon probable de l'enseigne s'ajoute a l'ouverture de toute fiche —
     meme un night shop en recoit un depuis « Les independants aussi ont un
     rayon probable ». On le neutralise ici pour mesurer ce qu'on veut
     mesurer : le comportement du lot sur une petite liste. */
  const vraiRayon = window.rayonProbableIds;
  window.rayonProbableIds = function () { return []; };
  const petit = { id: "zz-petit", fbId: "zz-petit", name: "Night shop du coin",
                  lat: 50.85, lng: 4.35, drinks: ids.slice(0, 9), confirmations: conf, seenAt: {} };
  window.STORES = [petit]; window.curStoreDetail = petit; window._sdTout = null;
  renderStoreDetail();
  out.petitLignes = document.querySelectorAll("#sd-drink-list .store-card").length;
  out.petitSansBouton = document.getElementById("sd-plus").style.display === "none";
  window.rayonProbableIds = vraiRayon;

  // La barre de raccourcis mene a des ancres qui existent vraiment
  window.STORES = [s]; window.curStoreDetail = s; window._sdTout = null;
  renderStoreDetail();
  const barre = document.getElementById("sd-acces");
  const puces = Array.prototype.map.call(barre.querySelectorAll(".sd-acces-go"), (b2) => b2.getAttribute("data-vers"));
  out.barreAffichee = barre.style.display !== "none";
  out.raccourcis = puces;
  out.ancresExistantes = puces.every((id) => !!document.getElementById(id));
  return out;
});

await nav.close();
srv.close();

dit("un grand magasin porte bien des centaines de boissons", vu.rayonComplet > 300, vu.rayonComplet + " en rayon");
dit("la fiche n'en pose qu'un lot", vu.lignesPosees === 40, vu.lignesPosees + " lignes posees");
dit("et propose la suite, en disant combien", /Voir les \d+ autres boissons/.test(vu.boutonSuite), vu.boutonSuite);
dit("« voir la suite » pose tout le reste", vu.apresSuite === vu.rayonComplet && vu.suiteMasquee,
  vu.apresSuite + " / " + vu.rayonComplet);
dit("le lot coute nettement moins cher que la liste entiere", vu.msAvecLot * 2 < vu.msSansLot,
  vu.msAvecLot + " ms contre " + vu.msSansLot + " ms pour " + vu.lignesSansLot + " lignes");
dit("un petit magasin n'a pas de bouton « voir la suite »", vu.petitLignes === 9 && vu.petitSansBouton,
  vu.petitLignes + " lignes");
dit("la barre de raccourcis s'affiche", vu.barreAffichee, JSON.stringify(vu.raccourcis));
dit("chacun de ses raccourcis mene a une section qui existe", vu.ancresExistantes,
  "sinon le tap ne fait rien");
dit("aucun plantage pendant l'essai", plantages.length === 0, plantages.join(" ; "));

let ko = 0;
console.log("");
for (const [ok, nom, note] of etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (note ? "  — " + note : "")); }
console.log("\n" + (etapes.length - ko) + "/" + etapes.length + " conformes");
process.exit(ko ? 1 : 0);
