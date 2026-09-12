/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* Verse un lot de traductions dans data/textes.js.

   Les phrases sont adressees par leur INDEX dans candidats.json, jamais
   recopiees : une phrase recopiee de travers cree une entree que personne ne
   lira jamais, et le trou reste ouvert sans que rien ne le signale.

   Regles fermes :
   - une traduction deja en place n'est jamais ecrasee ;
   - les dix langues sont exigees pour chaque phrase : une langue oubliee, et
     l'utilisateur concerne retombe sur du francais sans qu'on le sache ;
   - un modele a trous ({n}, {t}) qui perdrait un trou est refuse ;
   - au moindre refus, RIEN n'est ecrit. Un fichier a moitie ecrit est pire
     qu'un fichier pas ecrit : on ne sait plus ou on en est. */

import { readFileSync, writeFileSync } from "node:fs";

const dossier = process.argv[2];
const lots = process.argv.slice(3);
if (!dossier || !lots.length) { console.error("usage : node outils/verser-lot.mjs <dossier> <lot.json>…"); process.exit(1); }

const LANGUES = ["ar", "de", "en", "es", "it", "nl", "pl", "pt", "tr", "zh"];
const candidats = JSON.parse(readFileSync(dossier + "/candidats.json", "utf8"));

const fichier = "data/textes.js";
const source = readFileSync(fichier, "utf8");
const debut = source.indexOf("var TEXTES = {");
const fin = source.indexOf("\n};", debut);
if (debut === -1 || fin === -1) { console.error("ECHEC : table introuvable"); process.exit(1); }
const TEXTES = new Function(source.slice(debut, fin + 3) + "\nreturn TEXTES;")();

const refus = [];
let ajoutees = 0, completees = 0;

for (const lot of lots) {
  const d = JSON.parse(readFileSync(dossier + "/" + lot, "utf8"));
  for (const [i, parLangue] of Object.entries(d)) {
    const phrase = candidats[Number(i)];
    if (phrase === undefined) { refus.push(lot + " index " + i + " : hors liste"); continue; }
    const absentes = LANGUES.filter((lg) => !parLangue[lg]);
    if (absentes.length) { refus.push(lot + " index " + i + " : langues manquantes " + absentes.join(",")); continue; }
    const trous = [...new Set(phrase.match(/\{\w+\}/g) || [])];
    for (const t of trous) {
      const perdues = LANGUES.filter((lg) => parLangue[lg].indexOf(t) === -1);
      if (perdues.length) refus.push(lot + " index " + i + " : trou " + t + " perdu en " + perdues.join(","));
    }
    if (!TEXTES[phrase]) { TEXTES[phrase] = {}; ajoutees++; } else completees++;
    for (const lg of LANGUES) if (!TEXTES[phrase][lg]) TEXTES[phrase][lg] = parLangue[lg];
  }
}

if (refus.length) {
  console.error("ECHEC : " + refus.length + " refus, rien n'a ete ecrit");
  refus.slice(0, 25).forEach((r) => console.error("   " + r));
  process.exit(1);
}

const cles = Object.keys(TEXTES).sort((a, b) => a.localeCompare(b, "fr"));
let corps = "";
for (const p of cles) {
  const e = TEXTES[p];
  corps += "  " + JSON.stringify(p) + ": {" + Object.keys(e).sort().map((lg) => lg + ":" + JSON.stringify(e[lg])).join(",") + "},\n";
}
writeFileSync(fichier, source.slice(0, debut) + "var TEXTES = {\n" + corps + source.slice(fin + 1), "utf8");

console.log("phrases ajoutees : " + ajoutees + "  · deja presentes, completees : " + completees);
console.log("table : " + cles.length + " phrases");
for (const lg of LANGUES) {
  const n = cles.filter((p) => TEXTES[p][lg]).length;
  if (n !== cles.length) console.log("  " + lg + " : manque " + (cles.length - n));
}
