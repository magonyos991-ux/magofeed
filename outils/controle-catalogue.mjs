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
/* codeNu vient de l'application, comme le detecteur d'alcool : c'est elle qui
   decide si deux codes designent le meme produit (elle retire les caracteres
   non numeriques ET les zeros de tete, pour que EAN-8, UPC-A et EAN-13 se
   rejoignent). Ce controle comparait les chaines BRUTES — il annoncait donc
   « TOUT EST CONFORME » sur sept fiches en double qui ne differaient de leur
   jumelle que par un zero de tete : exactement ce qu'il existe pour interdire.
   Un controle qui s'ecrit sa propre regle finit par diverger de celle qui
   compte : c'est ecrit en tete de ce fichier, il fallait s'y tenir. */
const app = new Function(readFileSync("data/alcool.js", "utf8") + "\n" + corpsDe("normTxt") + "\n"
  + corpsDe("codeNu") + "\n"
  + corpsDe("nameLooksAlcoholic") + "\nreturn {alcool:nameLooksAlcoholic, codeNu:codeNu};")();

const src = readFileSync("data/drinks.js", "utf8").replace(/^\/\*[\s\S]*?\*\//, "");
const DRINKS = new Function(src + "\nreturn DRINKS;")();

/* Cinq paires de fiches font double emploi et partagent donc un code-barres.
   Elles PRE-EXISTENT a ce controle. On ne les repare pas d'ici : fusionner
   deux fiches doit transporter les magasins et les confirmations attachees a
   celle qui disparait, et ca, seul l'outil « fusionner les fiches » du panneau
   d'administration sait le faire. Les effacer du fichier ferait perdre des
   contributions de gens reels. On les nomme donc, pour que le controle reste
   utile : une NOUVELLE collision sera signalee, celles-ci sont en attente. */
/* Declarees sous la forme NORMALISEE (sans zero de tete), comme la comparaison
   ci-dessous : sinon une tolerance posee en 13 chiffres ne reconnaitrait pas la
   collision qu'elle est censee excuser. */
const COLLISIONS_CONNUES = new Set([
  "3124480196774",   /* Oasis Tropical Sans Sucre / Oasis Tropical Zero */
  "90169168", "90169380",   /* Happy Day Orange / Rauch Orange */
  "90169762",        /* Rauch Happy Day Pomme / Rauch Pomme */
  "90169748",        /* Happy Day Multivitamin / Rauch Multivitamin */
  "5949000012031",   /* Pepsi Original / Pepsi */
  /* LES SEPT QUE CE CONTROLE NE VOYAIT PAS, mesurees le 21 septembre 2026.
     Elles etaient invisibles parce qu'on comparait le texte brut la ou l'app
     compare la forme utile : un zero de tete d'un cote, pas de l'autre. Elles
     existent depuis des mois et le controle annoncait « TOUT EST CONFORME ».
     Elles attendent une fusion depuis l'administration (« Fusionner les
     doublons »), qui garde l'une des deux fiches et reporte sur elle les
     confirmations et les codes de l'autre. Retirer une ligne d'ici des que la
     fusion est faite : c'est ce qui rend la liste utile plutot que decorative. */
  "70847002901",     /* Monster Energy Zero Sucre (14905) / Monster Zero sucre boisson energisante (16432) */
  "70847020905",     /* Monster Ultra Sunrise (14917) / Monster Energy Ultra Sunrise (16319) */
  "613008730710",    /* Arizona Peach (10008) / Peach Tea Arizona (16481) */
  "82592720153",     /* Naked Green Machine (15354) / Naked Boosted Smoothie Green Machine (16722) */
  "82592010728",     /* Naked Green Machine (15354) / Naked Green machine boosted smoothie (17390) */
  "51000012920",     /* V8 Jus de Legumes (15495) / V8 Original 100% Vegetable Juice (16725) */
  "23100000220",     /* Soy Boisson Soja Vanille (15888) / Soy Lait soja vanille bio (17722) */
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

const pb = { alcool: [], identifiants: [], collisions: [], cle: [], categories: [], emoji: [], fusions: [] };
/* LES FICHES FUSIONNEES NE SONT PLUS AU CATALOGUE.
   L'application retire au chargement toute fiche dont l'identifiant est une
   SOURCE de DRINK_MERGES (index.html, juste avant <script src="data/drinks.js">).
   Ce controle lisait le fichier brut : il aurait donc reclame eternellement la
   correction de doublons deja fusionnes. Il lit maintenant la meme table, et
   il en profite pour verifier ce que personne ne verifiait : qu'une CIBLE de
   fusion existe. « Hawaï Ananas » pointait vers un identifiant qui n'a jamais
   existe — la fiche disparaissait du catalogue, son code-barre ne trouvait
   plus rien, et rien ne le signalait.
   Exception : une cible a 13 chiffres est une fiche communautaire, creee par
   Date.now() et vivant dans Firestore (voir growth/build-share-pages.js). */
const MERGES = (() => {
  const src = readFileSync("index.html", "utf8");
  const m = src.match(/window\.DRINK_MERGES = \{([\s\S]*?)\n\};/);
  const t = new Map();
  if (m) for (const p of m[1].matchAll(/(\d+)\s*:\s*(\d+)/g)) t.set(Number(p[1]), Number(p[2]));
  return t;
})();

const vusId = new Set(), vusCode = new Map();
for (const d of DRINKS) {
  if (MERGES.has(Number(d.id))) continue;      // fusionnee : l'app la retire au chargement
  if (app.alcool(d.name, d.brand)) pb.alcool.push(d.name + " / " + (d.brand || ""));
  if (vusId.has(d.id)) pb.identifiants.push(String(d.id)); else vusId.add(d.id);
  if (!CATS.includes(d.cat)) pb.categories.push(d.name + " -> " + d.cat);
  if (EMOJI.test(String(d.name) + String(d.brand || "") + String(d.tag || ""))) pb.emoji.push(d.name);
  for (const b of (d.barcodes || [])) {
    const brut = String(b);
    if (!cleOk(brut)) pb.cle.push(brut + "  (" + d.name + ")");
    /* LA FORME QUE L'APP COMPARE, PAS LE TEXTE BRUT.
       codeNu() retire les zeros de tete : 0078000033489 et 078000033489 sont
       le MEME article. Cet outil comparait les chaines telles quelles, donc
       sept collisions reelles sur treize lui etaient invisibles — et il
       annoncait « TOUT EST CONFORME » a quelqu'un dont le catalogue contenait
       deux fiches pour la meme canette. On prend la fonction de l'app
       elle-meme : une copie finirait par diverger. */
    const c = app.codeNu(brut);
    if (vusCode.has(c) && vusCode.get(c) !== d.id) {
      if (!COLLISIONS_CONNUES.has(c)) pb.collisions.push(brut + " : fiches " + vusCode.get(c) + " et " + d.id);
    } else vusCode.set(c, d.id);
  }
}

/* Une cible de fusion doit exister, sinon la fiche source disparait sans etre
   remplacee — et son code-barre ne trouve plus rien. */
for (const [source, cible] of MERGES) {
  if (vusId.has(cible)) continue;
  if (String(cible).length === 13) continue;   // fiche communautaire (Date.now)
  pb.fusions.push(source + " -> " + cible + " (cible absente du catalogue)");
}

console.log("catalogue : " + DRINKS.length + " boissons · " + vusCode.size + " codes-barres distincts\n");
let ko = 0;
for (const [k, v] of Object.entries(pb)) {
  ko += v.length;
  console.log((v.length ? "PROBLEME  " : "ok        ") + k.padEnd(13) + v.length);
  v.slice(0, 8).forEach((x) => console.log("       " + x));
}
if (COLLISIONS_CONNUES.size) console.log("\n(" + COLLISIONS_CONNUES.size + " collisions connues : " + COLLISIONS_CONNUES.size
  + " paires de fiches pour un meme article, en attente d'une fusion depuis l'administration.\n"
  + " Elles ne font pas echouer ce controle, mais un scan de ces canettes est un tirage au sort entre deux fiches.)");
console.log("\n" + (ko ? "A CORRIGER" : "TOUT EST CONFORME"));
process.exitCode = ko ? 1 : 0;
