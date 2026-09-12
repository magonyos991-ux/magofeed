/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   FUSIONNER DE NOUVELLES TRADUCTIONS DANS data/textes.js
   ----------------------------------------------------------------------------
   POURQUOI À CÔTÉ DE assembler-textes.mjs. L'assembleur reconstruit la table
   ENTIÈRE à partir de tableaux parallèles, où l'ordre est le seul lien entre une
   phrase et sa traduction — il le dit lui-même, et refuse de travailler dès
   qu'un fichier a une entrée de trop. C'est le bon outil pour une livraison
   complète, et le mauvais pour en ajouter : il faudrait refournir les 154
   entrées déjà en place, et une seule ligne perdue décalerait tout le reste.

   ICI, CHAQUE TRADUCTION EST ATTACHÉE À SON TEXTE FRANÇAIS, pas à sa position.
   Un fichier incomplet ne peut donc rien décaler. On n'ajoute que ce qui manque.

   CE QUI FAIT ÉCHOUER LA FUSION, PLUTÔT QUE DE LIVRER UNE TABLE FAUSSE :
     - une langue manquante ou vide sur une entrée ;
     - une clé contenant encore une séquence d'échappement (é) : elle ne
       correspondrait à rien à l'exécution, c'est l'erreur qui avait rendu 38
       des 156 premières entrées inutiles ;
     - une traduction identique au français sur TOUTES les langues, signe qu'on
       a recopié la source au lieu de traduire.

   Lancer :  node outils/fusionner-textes.mjs <fichier.json>
             node outils/fusionner-textes.mjs <fichier.json> --remplacer
   ============================================================================ */

import { readFileSync, writeFileSync } from "node:fs";

/* Les neuf langues que l'app propose réellement, en plus du français.
   « zh » figure dans la table depuis une livraison passée mais n'est pas dans
   LANGS : il n'est affichable par personne. On ne l'exige donc pas. */
const LANGUES = ["en", "nl", "de", "es", "it", "pt", "tr", "pl", "ar"];

const source = process.argv[2];
const remplacer = process.argv.includes("--remplacer");
if (!source) { console.error("usage : node outils/fusionner-textes.mjs <fichier.json> [--remplacer]"); process.exit(2); }

const neuf = JSON.parse(readFileSync(source, "utf8"));
const cles = Object.keys(neuf);
console.log("entrées proposées : " + cles.length);

const echecs = [];
for (const cle of cles) {
  if (/\\u[0-9A-Fa-f]{4}|\\n|\\t/.test(cle))
    echecs.push("clé encore échappée : " + JSON.stringify(cle).slice(0, 70));
  const e = neuf[cle] || {};
  const manque = LANGUES.filter((l) => !e[l] || !String(e[l]).trim());
  if (manque.length)
    echecs.push(JSON.stringify(cle).slice(0, 52) + " — manque : " + manque.join(", "));
  else if (LANGUES.every((l) => String(e[l]).trim() === cle.trim()))
    echecs.push(JSON.stringify(cle).slice(0, 52) + " — identique au français partout");
}
if (echecs.length) {
  console.error("\nFUSION REFUSÉE — " + echecs.length + " problème(s) :");
  for (const e of echecs.slice(0, 25)) console.error("  " + e);
  if (echecs.length > 25) console.error("  … et " + (echecs.length - 25) + " autres");
  process.exit(1);
}

/* On relit la table en place plutôt que de la reconstruire : les 154 entrées
   déjà livrées ne doivent pas dépendre de ce fichier-ci. */
const fichier = "data/textes.js";
const actuel = readFileSync(fichier, "utf8");
const debut = actuel.indexOf("var TEXTES = {");
const finMarq = "/* Rend le texte dans la langue courante.";
const fin = actuel.indexOf(finMarq);
if (debut < 0 || fin < 0) { console.error("data/textes.js : repères introuvables, rien n'est écrit."); process.exit(1); }

const existant = new Function(actuel.slice(debut, actuel.indexOf("};", debut) + 2) + "; return TEXTES;")();
let ajoutees = 0, ignorees = 0;
for (const cle of cles) {
  if (existant[cle] && !remplacer) { ignorees++; continue; }
  existant[cle] = Object.assign({}, existant[cle], neuf[cle]);
  ajoutees++;
}

/* Ordre alphabétique du français : un diff lisible vaut mieux qu'un fichier qui
   se réordonne à chaque exécution. */
const ordre = Object.keys(existant).sort((a, b) => a.localeCompare(b, "fr"));
let corps = "";
for (const cle of ordre) {
  const e = existant[cle];
  const parts = Object.keys(e)
    .filter((l) => e[l] && String(e[l]).trim())
    .map((l) => l + ":" + JSON.stringify(e[l]));
  if (!parts.length) continue;
  corps += "  " + JSON.stringify(cle) + ": {" + parts.join(",") + "},\n";
}
writeFileSync(fichier, actuel.slice(0, debut) + "var TEXTES = {\n" + corps + "};\n\n" + actuel.slice(fin), "utf8");

console.log("  ajoutées : " + ajoutees + (ignorees ? "  |  déjà présentes, laissées : " + ignorees : ""));
console.log("  table : " + ordre.length + " entrées -> " + fichier);
