/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   VÉRIFIER QUE LA TABLE DE TRADUCTION CORRESPOND ENCORE AU CODE
   ----------------------------------------------------------------------------
   POURQUOI CET OUTIL EXISTE. data/textes.js prend le TEXTE FRANÇAIS pour clé.
   C'est ce qui a permis de traduire 580 messages sans toucher aux 580 endroits
   qui les affichent — et c'est aussi sa fragilité : corriger une faute de frappe
   dans le code casse le lien avec ses neuf traductions, en silence. Le message
   repasse en français pour tout le monde, et rien ne le signale.

   data/textes.js annonçait ce contrôle dès sa première page. Il n'existait pas.
   Le voici.

   IL SIGNALE QUATRE CHOSES, ET RIEN D'AUTRE :

   1. LES CLÉS ABSENTES DU CODE SOURCE — une entrée dont le texte français ne
      s'écrit nulle part. Souvent une phrase réécrite depuis : la traduction
      existe, mais plus rien ne la demande.

      C'EST UN AVERTISSEMENT, PAS UNE ERREUR, et c'est important. Une partie de
      la table a été relevée sur l'app EN MARCHE, pas dans ses fichiers :
      « Coca-Cola · Soda » est assemblé à l'affichage à partir d'un nom et d'une
      catégorie, il n'est écrit nulle part. La passe DOM le traduit pourtant très
      bien quand il apparaît. Un contrôle qui lit la source ne peut pas
      distinguer ces deux cas — alors il les signale sans condamner.

   2. LES CLÉS ENCORE ÉCHAPPÉES — une clé qui porte la séquence d'échappement au
      lieu du caractère accentué ne correspondra jamais à ce que tr() reçoit à
      l'exécution. 38 des 156 premières entrées livrées avaient ce défaut et
      n'ont jamais servi à personne.

   3. LES TRADUCTIONS MANQUANTES — une langue proposée par l'app sans rien à
      afficher.

   4. LES TRADUCTIONS IDENTIQUES AU FRANÇAIS DANS TOUTES LES LANGUES — signe
      qu'on a recopié la source au lieu de traduire.

   Il sort en code 1 si quelque chose cloche : utilisable tel quel dans un
   contrôle avant livraison.

   Lancer :  node outils/verifier-textes.mjs
   ============================================================================ */

import { readFileSync } from "node:fs";

const LANGUES = ["en", "nl", "de", "es", "it", "pt", "tr", "pl", "ar"];

const src = readFileSync("data/textes.js", "utf8");
const debut = src.indexOf("var TEXTES = {");
const TEXTES = new Function(
  src.slice(debut, src.indexOf("};", debut) + 2) + "; return TEXTES;")();

/* Le code, débarrassé de ses commentaires : une phrase qui ne vit plus que dans
   un commentaire est bel et bien orpheline. On ne retire « /* … *\/ » que dans
   les blocs de script et de style — en HTML ce n'est pas un commentaire, et
   accept="image/*" suffirait à faire disparaître 700 lignes d'un coup. */
const blanc = (s) => s.replace(/[^\n]/g, " ");
let code = readFileSync("index.html", "utf8")
  .replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
    (_, ouvre, nom, corps, ferme) => ouvre + corps
      .replace(/\/\*[\s\S]*?\*\//g, blanc)
      .replace(/^([ \t]*)\/\/[^\n]*/gm, blanc) + ferme)
  .replace(/<!--[\s\S]*?-->/g, blanc);
for (const f of ["data/ui.js", "data/i18n.js", "data/state.js"]) {
  try { code += "\n" + readFileSync(f, "utf8"); } catch (e) { /* fichier absent */ }
}

/* ON DÉCODE LE CODE UNE BONNE FOIS, PLUTÔT QUE DE RÉ-ENCODER CHAQUE CLÉ.
   Première tentative : on ré-encodait la clé en séquences d'échappement pour la
   chercher dans le code. Elle produisait « \\u00e9 » en minuscules, alors que le
   code écrit « \\u00E9 » en majuscules — et 79 entrées parfaitement saines
   étaient déclarées orphelines. Un outil de contrôle qui crie au loup sur les
   trois quarts de la table ne sera plus jamais lu.

   On ramène donc le CODE à la forme lisible, une seule fois, et on y cherche la
   clé telle qu'elle est. La casse des séquences, le mélange des deux écritures
   dans un même fichier : plus rien de tout cela ne compte. */
const lisibleCode = code
  .replace(/\\u([0-9A-Fa-f]{4})|\\x([0-9A-Fa-f]{2})/g,
    (tout, u, x) => String.fromCharCode(parseInt(u || x, 16)))
  /* L'APOSTROPHE, ELLE AUSSI. Le code écrit « Nom exact lu sur l\'étiquette »
     quand la chaîne est entre apostrophes simples. Sans cette ligne, les treize
     entrées qui portent une apostrophe — soit un bon tiers des phrases
     françaises — étaient déclarées orphelines à tort. */
  .replace(/\\(['"`])/g, "$1");

const orphelines = [], echappees = [], suspectes = [], vides = [];
for (const cle of Object.keys(TEXTES)) {
  if (/\\u[0-9A-Fa-f]{4}/.test(cle)) { echappees.push(cle); continue; }
  /* Une clé sur plusieurs lignes (la question d'un confirm) n'est jamais écrite
     telle quelle dans le code : on n'en cherche que la première ligne. */
  const lisible = cle.split("\n")[0].trim();
  if (lisible.length >= 4 && !lisibleCode.includes(lisible)) orphelines.push(cle);

  const e = TEXTES[cle];
  const manque = LANGUES.filter((l) => !e[l] || !String(e[l]).trim());
  if (manque.length) vides.push(cle + " — manque : " + manque.join(", "));
  else if (LANGUES.every((l) => String(e[l]).trim() === cle.trim())) suspectes.push(cle);
}

const bloc = (titre, liste, explication) => {
  if (!liste.length) return 0;
  console.log("\n" + titre + " (" + liste.length + ")");
  console.log("  " + explication);
  for (const x of liste.slice(0, 20)) console.log("    " + JSON.stringify(x).slice(0, 110));
  if (liste.length > 20) console.log("    … et " + (liste.length - 20) + " autres");
  return liste.length;
};

console.log("entrées vérifiées : " + Object.keys(TEXTES).length);
let ko = 0;
/* Averti, pas compte comme un echec : voir l'explication en tete de fichier. */
bloc("CLÉS ABSENTES DU CODE SOURCE (avertissement)", orphelines,
  "réécrites depuis, ou composées à l'exécution — la passe DOM les traduit alors très bien.");
ko += bloc("CLÉS ENCORE ÉCHAPPÉES", echappees,
  "elles portent une séquence d'échappement et ne correspondront jamais à tr().");
ko += bloc("TRADUCTIONS MANQUANTES", vides,
  "une langue proposée par l'app n'a rien à afficher.");
ko += bloc("TRADUCTIONS IDENTIQUES AU FRANÇAIS PARTOUT", suspectes,
  "la source a sans doute été recopiée au lieu d'être traduite.");

if (!ko) console.log("\nrien de bloquant : la table est complète et atteignable."
  + (orphelines.length ? "  (" + orphelines.length + " avertissement(s) ci-dessus)" : ""));
process.exit(ko ? 1 : 0);
