/* Comble les trous de data/textes.js a partir des lots ecrits a la main.
   On adresse chaque phrase par son INDEX dans manques.json, jamais en
   recopiant la phrase francaise : une phrase recopiee de travers cree une
   entree fantome que personne ne verra jamais, et le trou reste ouvert.

   Deux regles fermes :
   - on n'ecrase jamais une traduction deja en place ;
   - un modele a trous ({n}, {t}, {b}) qui perdrait un trou est refuse, parce
     qu'a l'ecran le trou manquant devient une phrase amputee. */
import { readFileSync, writeFileSync } from "node:fs";

const dossier = process.argv[2];
if (!dossier) { console.error("usage : node outils/combler-manques.mjs <dossier-des-lots>"); process.exit(1); }

const manques = JSON.parse(readFileSync(dossier + "/manques.json", "utf8"));
const autresCles = JSON.parse(readFileSync(dossier + "/autres-manques.json", "utf8"));

const fichier = "data/textes.js";
const source = readFileSync(fichier, "utf8");
const debut = source.indexOf("var TEXTES = {");
const fin = source.indexOf("\n};", debut);
if (debut === -1 || fin === -1) { console.error("ECHEC : table introuvable"); process.exit(1); }
const TEXTES = new Function(source.slice(debut, fin + 3) + "\nreturn TEXTES;")();

const refus = [];
let poses = 0, ignores = 0;

function poser(phrase, langue, valeur) {
  if (phrase === undefined) { refus.push("index hors liste"); return; }
  if (!TEXTES[phrase]) { refus.push("phrase absente de la table : " + phrase.slice(0, 40)); return; }
  if (TEXTES[phrase][langue]) { ignores++; return; }          /* deja traduit : on ne touche pas */
  const trous = phrase.match(/\{\w+\}/g) || [];
  for (const t of new Set(trous)) {
    if (valeur.indexOf(t) === -1) { refus.push("trou " + t + " perdu [" + langue + "] : " + phrase.slice(0, 40)); return; }
  }
  TEXTES[phrase][langue] = valeur;
  poses++;
}

for (const lot of ["zh-a", "zh-b", "zh-c"]) {
  const d = JSON.parse(readFileSync(dossier + "/" + lot + ".json", "utf8"));
  for (const [i, v] of Object.entries(d)) poser(manques.zh[Number(i)], "zh", v);
}

const autres = JSON.parse(readFileSync(dossier + "/autres-valeurs.json", "utf8"));
for (const [i, parLangue] of Object.entries(autres)) {
  for (const [lg, v] of Object.entries(parLangue)) poser(autresCles[Number(i)], lg, v);
}

if (refus.length) {
  console.error("ECHEC : " + refus.length + " entrees refusees, rien n'a ete ecrit");
  refus.slice(0, 20).forEach((r) => console.error("   " + r));
  process.exit(1);
}

const cles = Object.keys(TEXTES).sort((a, b) => a.localeCompare(b, "fr"));
let corps = "";
for (const p of cles) {
  const e = TEXTES[p];
  const parts = Object.keys(e).sort().map((lg) => lg + ":" + JSON.stringify(e[lg]));
  if (parts.length) corps += "  " + JSON.stringify(p) + ": {" + parts.join(",") + "},\n";
}
writeFileSync(fichier, source.slice(0, debut) + "var TEXTES = {\n" + corps + source.slice(fin + 1), "utf8");

console.log("traductions posees : " + poses + "  · deja presentes, laissees telles quelles : " + ignores);
const L = ["ar", "de", "en", "es", "it", "nl", "pl", "pt", "tr", "zh"];
console.log("\n" + cles.length + " phrases");
for (const lg of L) {
  const n = cles.filter((p) => TEXTES[p][lg]).length;
  console.log("  " + lg + " : " + n + "/" + cles.length + "  manque " + (cles.length - n));
}
