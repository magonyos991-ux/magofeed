/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   FUSIONNE LES TRADUCTIONS D'INTERFACE DANS data/textes.js
   ----------------------------------------------------------------------------
   Deux sources se rejoignent ici :
     - les messages fugaces (a-traduire.json + trad-XX.json), dix langues ;
     - les textes permanents moissonnés à l'écran (ui-final.json + lots
       ui-NN-XX.json), découpés en quatre pour être traduits en parallèle.

   IL REFUSE DE TRAVAILLER PLUTÔT QUE DE PRODUIRE UNE TABLE FAUSSE.
   L'ordre est le seul lien entre une phrase et sa traduction. Un lot à 184
   entrées au lieu de 185 décalerait tout ce qui suit, et l'application
   afficherait des libellés qui n'ont rien à voir avec le bouton sur lequel ils
   se trouvent — bien pire qu'un texte resté en français. Chaque lot est donc
   vérifié en longueur, et toute entrée vide fait échouer l'assemblage.

   Ce qui existe déjà dans la table n'est jamais écrasé en silence : les deux
   sources sont fusionnées clé par clé, langue par langue.

   Lancer :  node outils/assembler-interface.mjs <dossier>
   ============================================================================ */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const d = process.argv[2];
if (!d) { console.error("usage : node outils/assembler-interface.mjs <dossier>"); process.exit(2); }

const table = new Map();          // phrase française -> { langue: traduction }
function pose(phrase, lg, valeur) {
  if (!phrase || !valeur || valeur === phrase) return;
  if (!table.has(phrase)) table.set(phrase, {});
  table.get(phrase)[lg] = valeur;
}

/* 1. Les messages fugaces, dix langues. */
const msg = JSON.parse(readFileSync(d + "/a-traduire.json", "utf8"));
const DIX = ["en","ar","nl","es","de","it","pt","tr","pl","zh"];
for (const lg of DIX) {
  const f = d + "/trad-" + lg + ".json";
  if (!existsSync(f)) continue;
  const t = JSON.parse(readFileSync(f, "utf8"));
  if (t.length !== msg.length) { console.error("ECHEC messages " + lg + " : " + t.length + "/" + msg.length); process.exit(1); }
  msg.forEach((p, i) => pose(p, lg, t[i]));
}
console.log("messages fugaces : " + msg.length + " phrases");

/* 2. Les textes permanents, par lots. */
const ui = JSON.parse(readFileSync(d + "/ui-final.json", "utf8"));
let debut = 0, lots = 0;
for (const lot of ["00","01","02","03"]) {
  const src = readFileSync(d + "/lot-" + lot + ".txt", "utf8").replace(/\n$/, "").split("\n")
    .map((l) => l.replace(/^\d+\.\s/, ""));
  for (const lg of ["en","es","de"]) {
    const f = d + "/ui-" + lot + "-" + lg + ".json";
    if (!existsSync(f)) { console.error("ECHEC : " + f + " absent"); process.exit(1); }
    const t = JSON.parse(readFileSync(f, "utf8"));
    if (t.length !== src.length) {
      console.error("ECHEC lot " + lot + " " + lg + " : " + t.length + " au lieu de " + src.length +
                    " — l'ordre serait décalé, on n'écrit rien.");
      process.exit(1);
    }
    src.forEach((p, i) => pose(p, lg, t[i]));
  }
  debut += src.length; lots++;
}
console.log("textes permanents : " + debut + " phrases sur " + lots + " lots (en, es, de)");

/* 3. Les langues traduites d'un bloc, un fichier de 772 lignes chacune.
   Elles sont arrivees apres les lots decoupes : meme liste source, meme ordre,
   mais un seul fichier par langue au lieu de quatre. */
const SEPT = ["ar", "nl", "it", "pt", "tr", "pl", "zh"];
let entieres = 0;
for (const lg of SEPT) {
  const f = d + "/uiplein-" + lg + ".json";
  if (!existsSync(f)) { console.log("  absente : " + lg); continue; }
  const t = JSON.parse(readFileSync(f, "utf8"));
  if (t.length !== ui.length) {
    console.error("ECHEC " + lg + " : " + t.length + " au lieu de " + ui.length +
                  " — l'ordre serait décalé, on n'écrit rien.");
    process.exit(1);
  }
  const vides = t.filter((x) => !String(x).trim()).length;
  if (vides) { console.error("ECHEC " + lg + " : " + vides + " entrées vides"); process.exit(1); }
  ui.forEach((p, i) => pose(p, lg, t[i]));
  entieres++;
  console.log("  ok  " + lg + " : " + t.length);
}
console.log("langues completes en plus : " + entieres);

/* Ordre alphabétique : un diff lisible vaut mieux qu'un fichier qui se
   réordonne à chaque exécution. */
const cles = [...table.keys()].sort((a, b) => a.localeCompare(b, "fr"));
let corps = "";
for (const p of cles) {
  const e = table.get(p);
  const parts = Object.keys(e).sort().map((lg) => lg + ":" + JSON.stringify(e[lg]));
  if (parts.length) corps += "  " + JSON.stringify(p) + ": {" + parts.join(",") + "},\n";
}

const fichier = "data/textes.js";
const actuel = readFileSync(fichier, "utf8");
/* L'ANCRE DOIT ETRE UNIQUE. La premiere version coupait la queue sur « /* ===== »,
   motif qui apparait des le cartouche en tete de fichier : tout le fichier
   d'origine — ancienne table comprise — se retrouvait recolle APRES la nouvelle,
   et comme la seconde declaration ecrase la premiere, l'app continuait de lire
   les 156 phrases d'avant. Un bug invisible : le fichier grossissait, tout
   semblait fait, et rien ne changeait a l'ecran. */
const tete = actuel.slice(0, actuel.indexOf("var TEXTES = {"));
const ancre = "/* ============================================================================\n   APPLIQUER LES TRADUCTIONS";
const iq = actuel.indexOf(ancre);
if (iq === -1) { console.error("ECHEC : ancre de fin introuvable dans " + fichier); process.exit(1); }
const queue = actuel.slice(iq);
if (queue.indexOf("var TEXTES = {") !== -1) { console.error("ECHEC : la queue contient encore une table"); process.exit(1); }
writeFileSync(fichier, tete + "var TEXTES = {\n" + corps + "};\n\n" + queue, "utf8");
console.log("\n" + cles.length + " phrases au total -> " + fichier);
