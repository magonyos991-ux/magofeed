#!/usr/bin/env node
/* COMBIEN DE MAGASINS INDEPENDANTS DEVIENNENT TROUVABLES, ET LESQUELS ?
   On extrait du fichier livre les VRAIES fonctions de classement
   (typeDeCommerce, chainIdsForStore) et on les passe sur les 34 137 magasins
   de la base de production. Aucune reecriture : si le classement se trompe,
   il se trompe ici exactement comme dans le telephone.

   node outils/rayon-des-independants.mjs [chemin/index.html]
*/
import { readFileSync } from "node:fs";

const fichier = process.argv[2] || "index.html";
const src = readFileSync(fichier, "utf8");
const drinksSrc = readFileSync("data/drinks.js", "utf8");

function morceau(depart, fin) {
  const a = src.indexOf(depart);
  if (a === -1) throw new Error("introuvable : " + depart);
  const b = src.indexOf(fin, a);
  if (b === -1) throw new Error("fin introuvable apres : " + depart);
  return src.slice(a, b + fin.length);
}
const aD = drinksSrc.indexOf("var DRINKS"), bD = drinksSrc.lastIndexOf("];");
const code = `
  var window = globalThis;
  ` + drinksSrc.slice(aD, bD + 2) + `
  ` + morceau("function normTxt(", "\n}") + `
  ` + morceau("var PACK_BRANDS=", "];") + `
  ` + morceau("function brandIds(", "\n}") + `
  ` + morceau("function packDrinkIds(", "\n}") + `
  ` + morceau("var M4_CATS={", "\n};") + `
  ` + morceau("var _SHOPGO=", "\n}") + `
  ` + morceau("function chainIdsFor(", "\n}") + `
  ` + morceau("function chainIdsForStore(", "\n}") + `
  ` + morceau("function buildChainSets(", "\n}") + `
  ` + morceau("var TYPE_MOTS=[", "window.rayonProbableForStore=function") .replace(/window\.rayonProbableForStore=function[\s\S]*$/, "") + `
  window.rayonProbableForStore = function (n, b, t) { return chainIdsForStore(n, b) || rayonTypeForStore(n, b, t); };
  ` + morceau("var _setsRayon={};", "\nwindow.rayonAppliquer=function(s){") .replace(/\nwindow\.rayonAppliquer=function\(s\)\{$/, "") + `
  return { typeDeCommerce: typeDeCommerce, rayonTypeForStore: rayonTypeForStore,
           chainIdsForStore: chainIdsForStore, buildTypeSets: buildTypeSets,
           cle: window.rayonProbableCle, contient: window.rayonProbableContient };
`;
let M;
try { M = new Function(code)(); }
catch (e) { console.error("le code livre ne s'evalue pas ici : " + e.message); process.exit(1); }

console.log("tailles des rayons par type de commerce :");
const sets = M.buildTypeSets();
for (const k of Object.keys(sets)) console.log("  " + k.padEnd(12) + String(sets[k].length).padStart(5) + " boissons");

/* ── la base ────────────────────────────────────────────────────────────── */
const B = "https://firestore.googleapis.com/v1/projects/magofeed-7f621/databases/(default)/documents:runQuery";
const v = (x) => (x && x.stringValue !== undefined ? x.stringValue : null);
async function req(sq) {
  const r = await fetch(B, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ structuredQuery: sq }) });
  const j = JSON.parse(await r.text());
  if (j[0] && j[0].error) throw new Error(j[0].error.status);
  return j.filter((x) => x.document).map((x) => x.document);
}
let docs = [], cur = null;
for (let p = 0; p < 60; p++) {
  const sq = { from: [{ collectionId: "stores" }], orderBy: [{ field: { fieldPath: "__name__" } }],
    select: { fields: [{ fieldPath: "name" }, { fieldPath: "brand" }, { fieldPath: "type" }] }, limit: 1000 };
  if (cur) sq.startAt = { values: [{ referenceValue: cur }], before: false };
  const lot = await req(sq);
  docs.push(...lot);
  if (lot.length < 1000) break;
  cur = lot[lot.length - 1].name;
  await new Promise((k) => setTimeout(k, 120));
}
console.log("\nmagasins lus dans la base : " + docs.length);

let enseigne = 0, parType = 0, rien = 0;
const detail = {}, exemples = {};
for (const d of docs) {
  const f = d.fields || {};
  const n = v(f.name) || "", b = v(f.brand) || "", t = v(f.type) || "";
  if (M.chainIdsForStore(n, b)) { enseigne++; continue; }
  const r = M.rayonTypeForStore(n, b, t);
  if (!r) { rien++; continue; }
  parType++;
  detail[r.key] = (detail[r.key] || 0) + 1;
  (exemples[r.key] = exemples[r.key] || []).length < 3 && exemples[r.key].push(n || "(sans nom)");
}
console.log("\n  " + String(enseigne).padStart(6) + "  couverts par leur ENSEIGNE (comme avant)");
console.log("  " + String(parType).padStart(6) + "  couverts par leur TYPE DE COMMERCE (nouveau)");
console.log("  " + String(rien).padStart(6) + "  sans rien : on ne sait pas ce qu'ils vendent, on n'invente pas\n");
for (const [k, n] of Object.entries(detail).sort((a, b) => b[1] - a[1]))
  console.log("      " + String(n).padStart(6) + "  " + k.padEnd(11) + "  ex. " + (exemples[k] || []).join(", ").slice(0, 70));

/* ── le prix en memoire : on etiquette, on ne recopie pas ────────────────── */
const echantillon = docs.map((d) => {
  const f = d.fields || {};
  return { name: v(f.name) || "", brand: v(f.brand) || "", type: v(f.type) || "", drinks: [] };
});
if (global.gc) global.gc();
const avant = process.memoryUsage().heapUsed;
for (const st of echantillon) M.cle(st);
if (global.gc) global.gc();
const apres = process.memoryUsage().heapUsed;
console.log("\netiqueter les " + echantillon.length + " magasins coute "
  + ((apres - avant) / 1048576).toFixed(2) + " Mo de memoire");
console.log("(recopier les identifiants dans chaque magasin en coutait 7,2 sur la seule bande parisienne)");

/* ── et la reponse reste juste ───────────────────────────────────────────── */
const COCA = (() => {
  const a = drinksSrc.indexOf("var DRINKS"), b = drinksSrc.lastIndexOf("];");
  const D = new Function(drinksSrc.slice(a, b + 2) + "\nreturn DRINKS;")();
  const d = D.find((x) => /coca-cola/i.test(x.brand || "") && !x.imp);
  return d ? d.id : null;
})();
const cas = [
  ["un night shop belge a du Coca", { name: "Night-Shop Bruxelles", brand: "", type: "" }, COCA, true],
  ["une boulangerie ne promet rien", { name: "Boulangerie Paul", brand: "", type: "boulangerie" }, COCA, false],
  ["un magasin sans nom ne promet rien", { name: "", brand: "", type: "" }, COCA, false],
  ["une epicerie a du Coca", { name: "Epicerie du coin", brand: "", type: "" }, COCA, true],
];
let ko = 0;
console.log("");
for (const [nom, st, did, attendu] of cas) {
  const ok = M.contient(st, did) === attendu;
  if (!ok) ko++;
  console.log((ok ? "ok   " : "ECHEC") + " | " + nom);
}
process.exit(ko ? 1 : 0);
