#!/usr/bin/env node
/* UN ARTICLE, UNE FICHE — TESTE SUR LE CODE LIVRE.
   ----------------------------------------------------------------------------
   Un meme article se lit sous plusieurs longueurs : EAN-8 (8 chiffres), UPC-A
   (12) et EAN-13 (13). Les formes courtes ne sont que la longue privee de ses
   zeros de tete, et selon le decodeur le telephone rend tantot l'une, tantot
   l'autre. La question que pose cet outil est donc la seule qui compte :

       deux rencontres avec la MEME canette donnent-elles UNE fiche ?

   Ce n'est pas theorique. Mesure du 21 septembre 2026 :
       drinks.js  id 11381   « Dr Pepper Cream Soda »     code 078000033489
       catalog    1783516912416 « Dr Pepper & Cream Soda » code 0078000033489
   Le meme article a un zero pres. Quelqu'un avait cree la seconde a la main
   apres un scan que l'app ne comprenait pas ; un import a ajoute la premiere.
   Les deux coexistent, et le scan ne rend plus jamais celle de cette personne.

   On extrait les VRAIES fonctions de index.html : une reecriture ne prouverait
   que la reecriture.

   node outils/essai-identite.mjs [chemin/index.html]
*/
import { readFileSync } from "node:fs";

const fichier = process.argv[2] || "index.html";
const src = readFileSync(fichier, "utf8");
function corpsDe(nom) {
  const d = src.indexOf("function " + nom + "(");
  if (d === -1) throw new Error("fonction " + nom + " introuvable dans " + fichier);
  let prof = 0;
  for (let j = src.indexOf("{", d); j < src.length; j++) {
    if (src[j] === "{") prof++;
    else if (src[j] === "}") { prof--; if (!prof) return src.slice(d, j + 1); }
  }
  throw new Error("fin de " + nom + " introuvable");
}
const drinksSrc = readFileSync("data/drinks.js", "utf8").replace(/^\/\*[\s\S]*?\*\//, "");

/* MEME PRINCIPE QUE corpsDe, POUR LES TABLES. mergeCatalog s'appuie sur des
   listes de mots declarees au niveau du fichier. Les recopier ici les aurait
   figees : le jour ou quelqu'un enrichit la liste dans l'app, l'essai aurait
   continue a valider l'ancienne. On les lit donc dans index.html, comme le
   reste. */
function declDe(nom) {
  const re = new RegExp("^(?:var|const|let)\\s+" + nom + "\\s*=", "m");
  const m = re.exec(src);
  if (!m) throw new Error("table " + nom + " introuvable dans " + fichier);
  let i = m.index + m[0].length, prof = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{" || c === "[" || c === "(") prof++;
    else if (c === "}" || c === "]" || c === ")") prof--;
    else if (c === ";" && prof === 0) return src.slice(m.index, i + 1);
  }
  throw new Error("fin de " + nom + " introuvable");
}

/* Le decor minimal dont mergeCatalog a besoin : on ne remplace que ce qui
   touche a l'ecran, jamais la logique qu'on teste. */
const code = `
  var window = globalThis;
  ` + drinksSrc + `
  ` + corpsDe("normTxt") + `
  ` + corpsDe("codeNu") + `
  ` + corpsDe("desechapper") + `
  ` + corpsDe("nomPropre") + `
  ` + corpsDe("indexCode") + `
  ` + corpsDe("porteCode") + `
  ` + /* mergeCatalog a appris a ramener une marque collee ou doublee a la forme
          propre : sans cette ligne, le decor de l'essai n'a pas la fonction et
          TOUT ce fichier plantait au lieu de controler quoi que ce soit. */
      corpsDe("_marquesNatives") + corpsDe("_grapheCommunautaire") +
      corpsDe("_motsDeRecette") + corpsDe("_garderAncienNom") + `
  ` + ["_CLE_COULEUR", "_MOTS_SANS_RECETTE", "_UNITES_SEULES", "_MOTS_PAS_IDENTIFIANTS",
       "_MOTS_DE_CATEGORIE", "_GOUTS_VOCAB", "_GOUTS_FICHE"].map(declDe).join("\n  ") + `
  var VALID_CATS = ["Soda","Energy","Ice Tea","Jus","Eau","Sport","Exotique","Lacté","Café","Snacks","Autre"];
  var CAT_DEFAULTS = { "Autre": { emoji:"", color:"#c69a57", light:"#faf3e8" } };
  function classifyDrink(){ return "Autre"; }
  function sanitize(s){ return String(s == null ? "" : s); }
  var _elemFactice = { innerHTML: "", textContent: "" };
  function renderBrandsRail(){} function renderTrends(){} function renderList(){}
  var document = { getElementById: function(){ return null; } };
  ` + corpsDe("mergeCatalog") + `
  return { DRINKS: DRINKS, mergeCatalog: mergeCatalog, codeNu: codeNu, indexCode: indexCode };
`;
/* ══ LE DECOR SE REPARE TOUT SEUL ══════════════════════════════════════════
   Ce fichier a passe des semaines a planter au lieu de controler quoi que ce
   soit : mergeCatalog avait appris a appeler quatre nouvelles fonctions et
   sept tables de mots, personne ne les avait ajoutees au decor, et l'erreur
   ressemblait a une pile d'appels illisible plutot qu'a un defaut.

   On arrete de lister a la main. Tant qu'il manque un nom, on le cherche dans
   index.html — fonction ou table — on l'ajoute devant, et on recommence. Si
   le nom n'y est pas, on le dit en une phrase au lieu de mourir. */
let code_ = code, ajouts = [], M;
for (let tour = 0; ; tour++) {
  try { M = new Function(code_)(); break; }
  catch (e) {
    const nom = /^(\w+) is not defined$/.exec(String(e && e.message) || "")?.[1];
    if (!nom || tour > 40) {
      console.error("\nLe decor de l'essai ne se construit pas : " + (e && e.message));
      if (ajouts.length) console.error("Deja ajoute automatiquement : " + ajouts.join(", "));
      console.error("Si le nom existe dans index.html mais n'est ni une fonction ni une");
      console.error("table « var NOM = ... ; », il faut l'ajouter a la main au decor.");
      process.exit(1);
    }
    let morceau = null;
    try { morceau = corpsDe(nom); } catch (_) {
      try { morceau = declDe(nom); } catch (__) {
        console.error("\n« " + nom + " » est utilise par mergeCatalog mais introuvable dans " + fichier + ".");
        process.exit(1);
      }
    }
    code_ = morceau + "\n" + code_;
    ajouts.push(nom);
  }
}
if (ajouts.length) console.log("decor complete automatiquement : " + ajouts.join(", "));

const etapes = [];
const dit = (nom, ok, note) => etapes.push([!!ok, nom, note || ""]);
const combien = (nom) => M.DRINKS.filter((d) => d.name === nom).length;

console.log("code lu dans : " + fichier);
console.log("catalogue : " + M.DRINKS.length + " boissons\n");

/* ── 1. LE CAS DU FONDATEUR ────────────────────────────────────────────────
   Il scanne une canette que l'app ne connait pas, tape un nom a lui, et sa
   fiche part au catalogue. Plus tard, la meme canette arrive d'ailleurs, sous
   une autre ecriture du code et sous son vrai nom. */
{
  const avant = M.DRINKS.length;
  M.mergeCatalog([{ id: 9000001, name: "Orangina Lemon", brand: "Orangina", barcodes: ["3124480123456"] }]);
  dit("la fiche qu'il cree lui-meme entre bien au catalogue", combien("Orangina Lemon") === 1);
  M.mergeCatalog([{ id: 9000002, name: "Orangina Citron Zeste", brand: "Orangina", barcodes: ["03124480123456"] }]);
  dit("la meme canette, ecrite avec un zero de tete, ne cree PAS de deuxieme fiche",
      combien("Orangina Citron Zeste") === 0, combien("Orangina Citron Zeste") + " fiche(s) creee(s) en trop");
  dit("c'est bien SA fiche a lui qui reste", combien("Orangina Lemon") === 1);
  const sienne = M.DRINKS.find((d) => d.name === "Orangina Lemon");
  dit("et elle a appris la deuxieme ecriture du code",
      M.indexCode(sienne.barcodes, "03124480123456") !== -1,
      "codes portes : " + JSON.stringify(sienne.barcodes));
  dit("un scan sous l'une ou l'autre ecriture tombe sur elle",
      M.indexCode(sienne.barcodes, "3124480123456") !== -1 && M.indexCode(sienne.barcodes, "03124480123456") !== -1);
  dit("le catalogue n'a grossi que d'une fiche", M.DRINKS.length === avant + 1,
      "avant " + avant + ", apres " + M.DRINKS.length);
}

/* ── 2. LE CAS REEL, CELUI QUI A CASSE ─────────────────────────────────────*/
{
  const avant = M.DRINKS.length;
  M.mergeCatalog([{ id: 1783516912416, name: "Dr Pepper &amp; Cream Soda", brand: "Dr Pepper", barcodes: ["0078000033489"] }]);
  dit("« Dr Pepper & Cream Soda » ne redouble plus « Dr Pepper Cream Soda »",
      M.DRINKS.length === avant, "le catalogue a gagne " + (M.DRINKS.length - avant) + " fiche(s)");
  const dp = M.DRINKS.find((d) => d.id === 11381);
  dit("la fiche d'origine a recupere l'ecriture a 13 chiffres",
      dp && M.indexCode(dp.barcodes, "0078000033489") !== -1, dp ? JSON.stringify(dp.barcodes) : "fiche 11381 absente");
}

/* ── 3. DEUX LIGNES DU MEME LOT ────────────────────────────────────────────*/
{
  const avant = M.DRINKS.length;
  M.mergeCatalog([
    { id: 9100001, name: "Ramune Yuzu Import", brand: "Ramune", barcodes: ["4902102112233"] },
    { id: 9100002, name: "Ramune Yuzu JP", brand: "Ramune", barcodes: ["04902102112233"] },
  ]);
  dit("deux lignes du meme lot pour le meme article ne font qu'une fiche",
      M.DRINKS.length === avant + 1, "le catalogue a gagne " + (M.DRINKS.length - avant) + " fiche(s)");
}

/* ── 4. CE QU'IL NE FAUT SURTOUT PAS FUSIONNER ─────────────────────────────
   Deux articles differents restent deux fiches. Une fusion fausse est pire
   qu'un doublon : le scan afficherait la mauvaise boisson. */
{
  const avant = M.DRINKS.length;
  M.mergeCatalog([
    { id: 9200001, name: "Essai Cola Original", brand: "Essai", barcodes: ["5400141900001"] },
    { id: 9200002, name: "Essai Cola Zero", brand: "Essai", barcodes: ["5400141900018"] },
  ]);
  dit("deux codes differents font bien deux fiches", M.DRINKS.length === avant + 2,
      "le catalogue a gagne " + (M.DRINKS.length - avant) + " fiche(s)");
  const avant2 = M.DRINKS.length;
  M.mergeCatalog([{ id: 9200003, name: "Essai Sans Code", brand: "Essai", barcodes: [] }]);
  dit("une fiche sans code-barres entre quand meme", M.DRINKS.length === avant2 + 1);
  const avant3 = M.DRINKS.length;
  M.mergeCatalog([{ id: 9200004, name: "Essai Sans Code Aussi", brand: "Essai", barcodes: [] }]);
  dit("et deux fiches sans code ne se confondent pas", M.DRINKS.length === avant3 + 1);
}

/* ── 5. L'ETAT REEL DU CATALOGUE LIVRE ─────────────────────────────────────*/
{
  const parCode = new Map();
  for (const b of M.DRINKS) for (const c of (b.barcodes || [])) {
    const k = M.codeNu(c);
    if (!k) continue;
    if (!parCode.has(k)) parCode.set(k, new Set());
    parCode.get(k).add(b.id);
  }
  const collisions = [...parCode.entries()].filter(([, v]) => v.size > 1);
  console.log("\n  codes portes par DEUX fiches differentes : " + collisions.length);
  collisions.slice(0, 15).forEach(([k, v]) => {
    const noms = [...v].map((id) => { const d = M.DRINKS.find((x) => x.id === id); return id + " " + (d ? d.name : "?"); });
    console.log("     " + k + " -> " + noms.join("  |  "));
  });
  console.log("  (elles viennent d'avant ce correctif : a fusionner depuis l'administration)");
}

let ko = 0;
console.log("");
for (const [ok, nom, note] of etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (!ok && note ? " — " + note : "")); }
console.log("\n" + (etapes.length - ko) + "/" + etapes.length + " conformes");
process.exit(ko ? 1 : 0);
