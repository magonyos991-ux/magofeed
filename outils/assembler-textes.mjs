/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   ASSEMBLE data/textes.js À PARTIR DES TRADUCTIONS
   ----------------------------------------------------------------------------
   Entrée  : a-traduire.json (les textes français, dans l'ordre)
             trad-XX.json    (un fichier par langue, MÊME ordre, MÊME longueur)
   Sortie  : data/textes.js, la table consultée par tr() à l'exécution.

   IL REFUSE DE TRAVAILLER PLUTÔT QUE DE PRODUIRE UNE TABLE FAUSSE.
   L'ordre est le seul lien entre une phrase française et sa traduction : si un
   fichier a 155 entrées au lieu de 156, tout ce qui suit le trou est décalé, et
   l'application afficherait des messages qui n'ont rien à voir avec l'action en
   cours — bien pire qu'un texte resté en français. Chaque fichier est donc
   vérifié en longueur, et toute entrée vide fait échouer l'assemblage.

   Lancer :  node outils/assembler-textes.mjs <dossier-des-traductions>
   ============================================================================ */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const dossier = process.argv[2];
if (!dossier) { console.error("usage : node outils/assembler-textes.mjs <dossier>"); process.exit(2); }

const LANGUES = ["en", "ar", "nl", "es", "de", "it", "pt", "tr", "pl", "zh"];

const fr = JSON.parse(readFileSync(dossier + "/a-traduire.json", "utf8"));
console.log("textes français source : " + fr.length);

const tables = {};
let absentes = [];
for (const lg of LANGUES) {
  const f = dossier + "/trad-" + lg + ".json";
  if (!existsSync(f)) { absentes.push(lg); continue; }
  const t = JSON.parse(readFileSync(f, "utf8"));
  if (!Array.isArray(t)) { console.error("ECHEC " + lg + " : ce n'est pas un tableau"); process.exit(1); }
  if (t.length !== fr.length) {
    console.error("ECHEC " + lg + " : " + t.length + " entrées au lieu de " + fr.length +
                  " — l'ordre serait décalé, on n'écrit rien.");
    process.exit(1);
  }
  const vides = t.map((x, i) => (!x || !String(x).trim()) ? i + 1 : 0).filter(Boolean);
  if (vides.length) {
    console.error("ECHEC " + lg + " : entrées vides aux positions " + vides.slice(0, 10).join(", "));
    process.exit(1);
  }
  tables[lg] = t;
  console.log("  ok  " + lg + " : " + t.length);
}
if (absentes.length) console.log("  langues absentes (restent en français) : " + absentes.join(", "));

/* On construit la table dans l'ordre alphabétique du français : un diff lisible
   vaut mieux qu'un fichier qui se réordonne à chaque exécution. */
const paires = fr.map((s, i) => [s, i]).sort((a, b) => a[0].localeCompare(b[0], "fr"));
let corps = "";
for (const [phrase, i] of paires) {
  const trads = [];
  for (const lg of Object.keys(tables)) {
    const v = tables[lg][i];
    if (v && v !== phrase) trads.push(lg + ":" + JSON.stringify(v));
  }
  if (!trads.length) continue;
  corps += "  " + JSON.stringify(phrase) + ": {" + trads.join(",") + "},\n";
}

const fichier = "data/textes.js";
const actuel = readFileSync(fichier, "utf8");
const tete = actuel.slice(0, actuel.indexOf("var TEXTES = {"));
const queue = actuel.slice(actuel.indexOf("/* Rend le texte dans la langue courante."));
writeFileSync(fichier, tete + "var TEXTES = {\n" + corps + "};\n\n" + queue, "utf8");

console.log("\n" + paires.length + " phrases, " + Object.keys(tables).length + " langues -> " + fichier);
