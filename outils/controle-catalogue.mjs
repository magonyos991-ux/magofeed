/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   CONTROLE DU CATALOGUE
   ----------------------------------------------------------------------------
   Ce que ce controle protege, dans l'ordre :

   1. L'ALCOOL. Magofeed est 100 % sans alcool, y compris les versions « 0,0 % ».
      On ne refait pas une liste ici : on charge le detecteur de l'application
      lui-meme (nameLooksAlcoholic + data/alcool.js). Si une boisson passe ce
      filtre-la, elle passera aussi a l'ecran ; si elle le rate, l'app l'aurait
      refusee de toute facon. Un controle qui s'ecrit sa propre regle finit par
      diverger de celle qui compte.

   2. LES CODES-BARRES. Cle de controle recalculee : un code dont la cle est
      fausse ne peut pas exister, et un code faux fait rater un scan ou, pire,
      affiche la mauvaise boisson. Et un meme code ne doit pas designer deux
      fiches : le scan deviendrait un tirage au sort.

   3. LE RESTE : identifiants uniques, categories connues, aucun emoji.

   Lancer :  node outils/controle-catalogue.mjs
   ============================================================================ */

import { readFileSync } from "node:fs";

globalThis.window = {};
const html = readFileSync("index.html", "utf8");
function corpsDe(nom) {
  const d = html.indexOf("function " + nom + "(");
  if (d === -1) throw new Error("fonction " + nom + " introuvable dans index.html");
  let prof = 0;
  for (let j = html.indexOf("{", d); j < html.length; j++) {
    if (html[j] === "{") prof++;
    else if (html[j] === "}") { prof--; if (!prof) return html.slice(d, j + 1); }
  }
  throw new Error("fin de " + nom + " introuvable");
}
const app = new Function(readFileSync("data/alcool.js", "utf8") + "\n" + corpsDe("normTxt") + "\n"
  + corpsDe("nameLooksAlcoholic") + "\nreturn {alcool:nameLooksAlcoholic};")();

const src = readFileSync("data/drinks.js", "utf8").replace(/^\/\*[\s\S]*?\*\//, "");
const DRINKS = new Function(src + "\nreturn DRINKS;")();

/* Cinq paires de fiches font double emploi et partagent donc un code-barres.
   Elles PRE-EXISTENT a ce controle. On ne les repare pas d'ici : fusionner
   deux fiches doit transporter les magasins et les confirmations attachees a
   celle qui disparait, et ca, seul l'outil « fusionner les fiches » du panneau
   d'administration sait le faire. Les effacer du fichier ferait perdre des
   contributions de gens reels. On les nomme donc, pour que le controle reste
   utile : une NOUVELLE collision sera signalee, celles-ci sont en attente. */
const COLLISIONS_CONNUES = new Set([
  "3124480196774",   /* Oasis Tropical Sans Sucre / Oasis Tropical Zero */
  "90169168", "90169380",   /* Happy Day Orange / Rauch Orange */
  "90169762",        /* Rauch Happy Day Pomme / Rauch Pomme */
  "90169748",        /* Happy Day Multivitamin / Rauch Multivitamin */
  "5949000012031",   /* Pepsi Original / Pepsi */
]);

function cleOk(c) {
  if (!/^\d+$/.test(c) || ![8, 12, 13, 14].includes(c.length)) return false;
  const d = c.split("").map(Number), cle = d.pop();
  let s = 0;
  for (let i = d.length - 1, p = 3; i >= 0; i--, p = p === 3 ? 1 : 3) s += d[i] * p;
  return ((10 - (s % 10)) % 10) === cle;
}
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const CATS = ["Soda", "Energy", "Ice Tea", "Jus", "Eau", "Sport", "Exotique", "Lacté", "Café", "Snacks", "Autre"];

const pb = { alcool: [], identifiants: [], collisions: [], cle: [], categories: [], emoji: [] };
const vusId = new Set(), vusCode = new Map();
for (const d of DRINKS) {
  if (app.alcool(d.name, d.brand)) pb.alcool.push(d.name + " / " + (d.brand || ""));
  if (vusId.has(d.id)) pb.identifiants.push(String(d.id)); else vusId.add(d.id);
  if (!CATS.includes(d.cat)) pb.categories.push(d.name + " -> " + d.cat);
  if (EMOJI.test(String(d.name) + String(d.brand || "") + String(d.tag || ""))) pb.emoji.push(d.name);
  for (const b of (d.barcodes || [])) {
    const c = String(b);
    if (!cleOk(c)) pb.cle.push(c + "  (" + d.name + ")");
    if (vusCode.has(c) && vusCode.get(c) !== d.id) {
      if (!COLLISIONS_CONNUES.has(c)) pb.collisions.push(c + " : fiches " + vusCode.get(c) + " et " + d.id);
    } else vusCode.set(c, d.id);
  }
}

console.log("catalogue : " + DRINKS.length + " boissons · " + vusCode.size + " codes-barres distincts\n");
let ko = 0;
for (const [k, v] of Object.entries(pb)) {
  ko += v.length;
  console.log((v.length ? "PROBLEME  " : "ok        ") + k.padEnd(13) + v.length);
  v.slice(0, 8).forEach((x) => console.log("       " + x));
}
if (COLLISIONS_CONNUES.size) console.log("\n(" + COLLISIONS_CONNUES.size + " collisions connues, en attente d'une fusion depuis l'administration)");
console.log("\n" + (ko ? "A CORRIGER" : "TOUT EST CONFORME"));
process.exitCode = ko ? 1 : 0;
