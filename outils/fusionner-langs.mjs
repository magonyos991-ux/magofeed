/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   COMPLÉTER LANGS_EXTRA POUR LES LANGUES EN RETARD
   ----------------------------------------------------------------------------
   LANGS fonctionne par clés courtes (T.badgeScan), choisies au moment où on
   pose le texte. Français, anglais et néerlandais en comptent 574 ; les sept
   autres étaient restées à 104, gelées à l'état de l'app d'il y a plusieurs
   semaines. Tout ce qui a été écrit depuis — la messagerie, le profil, les
   dons, la chasse aux codes — ne leur est jamais parvenu.

   Ce script ajoute les clés manquantes dans LANGS_EXTRA, qui est fusionné dans
   LANGS au chargement. Il n'écrase jamais une traduction existante sans qu'on
   le demande : une langue déjà servie ne doit pas être dégradée par un ajout.

   IL REFUSE DE TRAVAILLER, PLUTÔT QUE DE LIVRER UNE TABLE FAUSSE :
     - si une clé proposée n'existe pas en français, elle ne sera jamais lue —
       c'est une faute de frappe, pas une traduction ;
     - si une langue manque ou est vide sur une entrée ;
     - si une entrée est identique au français dans les sept langues.

   Lancer :  node outils/fusionner-langs.mjs <fichier.json> [--remplacer]
   ============================================================================ */

import { readFileSync, writeFileSync } from "node:fs";

const LANGUES = ["de", "es", "it", "pt", "tr", "pl", "ar"];
const source = process.argv[2];
const remplacer = process.argv.includes("--remplacer");
if (!source) { console.error("usage : node outils/fusionner-langs.mjs <fichier.json> [--remplacer]"); process.exit(2); }

const fichier = "data/i18n.js";
const actuel = readFileSync(fichier, "utf8");
const debut = actuel.indexOf("var LANGS_EXTRA={");
if (debut < 0) { console.error("data/i18n.js : LANGS_EXTRA introuvable, rien n'est écrit."); process.exit(1); }
const finBloc = actuel.indexOf("\n};", debut) + 3;

const [LANGS, EXTRA] = new Function(
  actuel.slice(0, finBloc) + "; return [LANGS, LANGS_EXTRA];")();
const baseFr = Object.assign({}, LANGS.fr, EXTRA.fr || {});

const neuf = JSON.parse(readFileSync(source, "utf8"));
const cles = Object.keys(neuf);
console.log("clés proposées : " + cles.length);

const echecs = [];
for (const k of cles) {
  if (baseFr[k] == null) { echecs.push(k + " — cette clé n'existe pas en français"); continue; }
  const e = neuf[k] || {};
  const manque = LANGUES.filter((l) => !e[l] || !String(e[l]).trim());
  if (manque.length) echecs.push(k + " — manque : " + manque.join(", "));
  else if (LANGUES.every((l) => String(e[l]).trim() === String(baseFr[k]).trim()))
    echecs.push(k + " — identique au français partout");
}
if (echecs.length) {
  console.error("\nFUSION REFUSÉE — " + echecs.length + " problème(s) :");
  for (const e of echecs.slice(0, 25)) console.error("  " + e);
  if (echecs.length > 25) console.error("  … et " + (echecs.length - 25) + " autres");
  process.exit(1);
}

let ajoutees = 0, ignorees = 0;
for (const k of cles) for (const l of LANGUES) {
  EXTRA[l] = EXTRA[l] || {};
  if (EXTRA[l][k] != null && !remplacer) { ignorees++; continue; }
  EXTRA[l][k] = neuf[k][l]; ajoutees++;
}

/* On réécrit le bloc entier, une langue par ligne : c'est déjà sa forme, et un
   diff par langue reste lisible même quand il fait des milliers de caractères. */
let corps = "var LANGS_EXTRA={\n";
for (const l of Object.keys(EXTRA)) {
  const paires = Object.keys(EXTRA[l]).sort()
    .map((k) => JSON.stringify(k) + ":" + JSON.stringify(EXTRA[l][k]));
  corps += "  " + l + ":{" + paires.join(",") + "},\n";
}
corps += "};";
writeFileSync(fichier, actuel.slice(0, debut) + corps + actuel.slice(finBloc), "utf8");

console.log("  traductions écrites : " + ajoutees + (ignorees ? "  |  déjà présentes, laissées : " + ignorees : ""));
for (const l of ["fr", "en", "nl", ...LANGUES])
  console.log("    " + l + " : " + (Object.keys(LANGS[l] || {}).length + Object.keys(EXTRA[l] || {}).length) + " messages");
