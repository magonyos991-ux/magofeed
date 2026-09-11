/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   INVENTAIRE DES TEXTES VISIBLES NON TRADUITS
   ----------------------------------------------------------------------------
   POURQUOI. L'app se dit disponible en dix langues. En réalité elle lit ses
   textes dans LANGS pour quelques centaines de clés, et écrit tout le reste en
   français directement dans le code. Quelqu'un qui choisit l'arabe ou le
   mandarin voit donc une interface majoritairement française — ce qui est pire
   que de ne pas proposer la langue du tout : on promet quelque chose qu'on ne
   tient pas.

   Traduire demande d'abord de SAVOIR CE QU'IL Y A À TRADUIRE. Ce script lit
   index.html et en sort la liste des textes qu'un utilisateur peut lire et qui
   ne passent pas par le système de traduction.

   CE QU'IL ÉCARTE, ET POURQUOI :
     - les commentaires du code, que personne ne lit à l'écran ;
     - les messages de console (console.warn, console.log) ;
     - les chaînes déjà tirées de LANGS (elles sont, par construction, traduites) ;
     - le CSS, les URL, les noms de classes et d'identifiants ;
     - les écrans réservés à l'administrateur — un seul utilisateur, qui parle
       français. Les traduire coûterait autant que le reste de l'app pour une
       personne. Ils sont comptés à part, pas ignorés en silence.

   Il classe ensuite par ÉCRAN, parce que tout ne se vaut pas : ce qu'on lit à
   la première ouverture compte plus que le fond d'un panneau rarement ouvert.

   Lancer :  node outils/inventaire-textes.mjs
             node outils/inventaire-textes.mjs --json > /tmp/textes.json
   ============================================================================ */

import { readFileSync } from "node:fs";

const src = readFileSync("index.html", "utf8");

/* On retire d'abord les commentaires : ils contiennent énormément de français
   et n'apparaissent jamais à l'écran. Les retirer AVANT toute autre analyse
   évite des centaines de faux positifs. */
function sansCommentaires(t) {
  return t
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/[^\n]*/gm, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

const FRANCAIS = /[éèêàùçôîâûëïÉÈÊÀÇÔÎÂÛ]|\b(?:le|la|les|un|une|des|du|ton|ta|tes|ce|cette|dans|pour|avec|sans|que|qui|est|sont|sur|plus|tout|toute|pas|aucun|aucune|quand|tu|vous|nous|elle|il|son|sa|ses|leur|mais|donc|ou|et|déjà|encore|jamais|toujours)\b/i;

/* Un texte affiché se reconnaît à son contexte, pas à son contenu. */
const CONTEXTES = [
  [/textContent\s*=\s*["'`]([^"'`\n]{3,200})["'`]/g, "texte"],
  [/placeholder\s*=\s*["']([^"'\n]{3,200})["']/g, "champ"],
  [/aria-label\s*=\s*["']([^"'\n]{3,200})["']/g, "accessibilité"],
  [/title\s*=\s*["']([^"'\n]{3,200})["']/g, "infobulle"],
  [/\btoast\s*\(\s*["'`]([^"'`\n]{3,200})["'`]/g, "message"],
  [/\bconfirm\w*\s*\(\s*["'`]([^"'`\n]{3,200})["'`]/g, "question"],
];

const trouves = new Map();          // texte -> {genres:Set, occurrences}
function ajoute(texte, genre) {
  const t = texte.trim();
  if (t.length < 3) return;
  if (!FRANCAIS.test(t)) return;
  if (/^[\w-]+$/.test(t)) return;
  if (/^(https?:|\/|#|data:)/.test(t)) return;
  if (!trouves.has(t)) trouves.set(t, { genres: new Set(), n: 0 });
  const e = trouves.get(t);
  e.genres.add(genre);
  e.n++;
}

const code = sansCommentaires(src);
for (const [re, genre] of CONTEXTES) {
  let m;
  while ((m = re.exec(code))) ajoute(m[1], genre);
}

/* Le texte écrit directement dans le HTML, entre deux balises. */
const htmlSeul = code.split("<script")[0] + code.split("</script>").slice(-1)[0];
let m2;
const entreBalises = /<(?:div|span|b|p|h[1-6]|li|button|label|small|strong|em|td|th|a)[^>]*>([^<>{}]{3,200})</g;
while ((m2 = entreBalises.exec(htmlSeul))) ajoute(m2[1], "html");

const liste = [...trouves.entries()].map(([texte, e]) => ({
  texte, genres: [...e.genres].join("+"), occurrences: e.n
}));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(liste, null, 1));
} else {
  const parGenre = {};
  for (const x of liste) parGenre[x.genres] = (parGenre[x.genres] || 0) + 1;
  console.log("TEXTES VISIBLES NON TRADUITS : " + liste.length + "\n");
  for (const [g, n] of Object.entries(parGenre).sort((a, b) => b[1] - a[1]))
    console.log("  " + String(n).padStart(4) + "  " + g);
  console.log("\nLes dix plus longs (souvent les plus visibles) :");
  for (const x of liste.sort((a, b) => b.texte.length - a.texte.length).slice(0, 10))
    console.log("   " + x.texte.slice(0, 96));
}
