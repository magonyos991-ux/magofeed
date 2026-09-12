/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   INVENTAIRE DES TEXTES VISIBLES NON TRADUITS
   ----------------------------------------------------------------------------
   POURQUOI. L'app se dit disponible en dix langues. Elle lit ses textes dans
   LANGS pour quelques centaines de clés, dans TEXTES pour les messages dits en
   passant, et écrit tout le reste en français directement dans le code. Qui
   choisit l'arabe voit alors une interface majoritairement française — pire que
   de ne pas proposer la langue : on promet ce qu'on ne tient pas.

   Traduire demande d'abord de SAVOIR CE QU'IL Y A À TRADUIRE. Ce script sort la
   liste de ce qu'un utilisateur peut lire et qui ne passe par aucun des deux
   mécanismes.

   TROIS DÉFAUTS DE LA VERSION PRÉCÉDENTE, ET CE QU'ILS COÛTAIENT :

   1. LE HTML ÉTAIT TRONQUÉ À 519 OCTETS SUR 1,5 Mo. Le texte entre balises
      n'était cherché que AVANT le premier <script> et APRÈS le dernier — or
      l'app en compte seize, et tous ses écrans vivent entre eux. Autrement dit
      la totalité de l'interface statique était invisible à l'inventaire :
      boutons, titres, étiquettes, et jusqu'à la feuille « Proposer une boisson »
      en entier. On croyait mesurer, on ne mesurait rien.

   2. IL NE DÉDUISAIT PAS CE QUI ÉTAIT DÉJÀ TRADUIT. Le total restait à 287
      après la livraison de 156 traductions, parce que ces 156 y figuraient
      encore. Un chiffre qui ne bouge pas quand le travail avance ne sert plus
      à décider quoi que ce soit.

   3. IL ANNONÇAIT ÉCARTER LES ÉCRANS D'ADMINISTRATION, SANS LE FAIRE. Ils
      étaient comptés comme le reste. Or ils n'ont qu'un lecteur, qui parle
      français : les traduire coûterait autant que le reste de l'app pour une
      personne. Ils sont désormais comptés À PART — visibles, jamais mélangés.

   COMMENT LES ÉCRANS D'ADMINISTRATION SONT RECONNUS. En HTML, par un ancêtre
   dont l'identifiant contient « admin » : on suit la profondeur des balises et
   tout ce qui vit sous un tel élément est classé admin. En JavaScript, par le
   nom de la fonction englobante. Aucune des deux méthodes n'est parfaite, mais
   toutes deux se trompent du bon côté — au pire un texte d'admin est proposé à
   la traduction, jamais un texte d'utilisateur oublié.

   CE QUI EST ÉCARTÉ POUR DE BON : commentaires, messages de console, CSS, URL,
   identifiants, et tout élément déjà marqué data-i18n.

   Lancer :  node outils/inventaire-textes.mjs
             node outils/inventaire-textes.mjs --json > /tmp/textes.json
             node outils/inventaire-textes.mjs --admin    (voir l'admin aussi)
   ============================================================================ */

import { readFileSync } from "node:fs";

const src = readFileSync("index.html", "utf8");

/* Les commentaires portent énormément de français et n'atteignent jamais
   l'écran. On les remplace par des espaces DE MÊME LONGUEUR : les positions ne
   bougent pas, donc les numéros de ligne rapportés restent justes.

   ATTENTION, C'EST ICI QUE LA VERSION PRÉCÉDENTE SE DÉTRUISAIT ELLE-MÊME.
   Elle cherchait « /* ... *[/] » dans TOUT le fichier. Or `accept="image/*"`
   — le type MIME d'un champ photo — contient « /* ». Ce faux début de
   commentaire courait jusqu'au premier vrai « *[/] » rencontré plus loin, dans
   le premier bloc de script : 76 602 octets de HTML réel effacés d'un coup,
   soit 721 lignes d'interface, dont la feuille « Proposer une boisson » en
   entier. L'outil annonçait alors sereinement un total qui ignorait tout un pan
   de l'app.

   EN HTML, « /* ... *[/] » N'EST PAS UN COMMENTAIRE. Il ne l'est que dans le
   JavaScript et dans le CSS. On ne le retire donc QUE dans le corps des
   <script> et des <style>. Le « <!-- ... --> », lui, vaut partout. */
const blanc = (s) => s.replace(/[^\n]/g, " ");
function blocsDeCode(t) {
  return t.replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
    (_, ouvre, nom, corps, ferme) =>
      ouvre + corps.replace(/\/\*[\s\S]*?\*\//g, blanc)
                   .replace(/^([ \t]*)\/\/[^\n]*/gm, blanc) + ferme);
}
function sansCommentaires(t) {
  return blocsDeCode(t).replace(/<!--[\s\S]*?-->/g, blanc);
}

const code = sansCommentaires(src);

/* GARDE-FOU. Un outil de mesure qui perd silencieusement une partie du fichier
   est pire qu'absent : on lui fait confiance. Ces témoins sont des textes bien
   réels de l'interface, choisis de part et d'autre des zones à risque. S'ils ne
   survivent pas au nettoyage, c'est qu'il a mordu sur du contenu — et l'outil
   REFUSE de rendre un chiffre plutôt que d'en rendre un faux. */
for (const temoin of [
  "Prendre une photo / choisir dans la pellicule",   // après accept="image/*"
  "Proposer une boisson",
  "Trouve ta boisson",
]) {
  if (src.includes(temoin) && !code.includes(temoin)) {
    console.error("INVENTAIRE REFUSÉ : le nettoyage a effacé un texte réel de");
    console.error("l'interface (« " + temoin + " »). Le total serait faux.");
    process.exit(1);
  }
}

/* Le HTML statique = le fichier entier dont on a vidé le CORPS des <script>.
   On garde les balises elles-mêmes pour ne pas décaler les positions. */
const statique = code.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
  (_, o, corps, f) => o + blanc(corps) + f);
/* Et le JavaScript seul, l'exact complément. */
const scripts = code.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
  (_, o, corps, f) => blanc(o) + corps + blanc(f));

const FRANCAIS = /[éèêàùçôîâûëïÉÈÊÀÇÔÎÂÛ]|\b(?:le|la|les|un|une|des|du|ton|ta|tes|ce|cette|dans|pour|avec|sans|que|qui|est|sont|sur|plus|tout|toute|pas|aucun|aucune|quand|tu|vous|nous|elle|il|son|sa|ses|leur|mais|donc|ou|et|déjà|encore|jamais|toujours|choisir|prendre|envoyer|ajouter|photo|nom|marque)\b/i;

/* Ce qui est déjà traduit ne doit plus apparaître : sinon le total ne baisse
   jamais et l'inventaire cesse de dire où on en est. */
const dejaTraduit = new Set();
try {
  const t = readFileSync("data/textes.js", "utf8");
  const f = new Function(t + "; return typeof TEXTES!=='undefined'?TEXTES:{};");
  for (const k of Object.keys(f())) dejaTraduit.add(k.trim());
} catch (e) { console.error("  (data/textes.js illisible : " + e.message + ")"); }
try {
  const t = readFileSync("data/i18n.js", "utf8");
  const f = new Function(t + "; return [typeof LANGS!=='undefined'?LANGS:{}, typeof LANGS_EXTRA!=='undefined'?LANGS_EXTRA:{}];");
  const [L, X] = f();
  for (const tbl of [L.fr, X.fr]) for (const v of Object.values(tbl || {}))
    if (typeof v === "string") dejaTraduit.add(v.trim());
} catch (e) { console.error("  (data/i18n.js illisible : " + e.message + ")"); }

const ligneDe = (i) => code.slice(0, i).split("\n").length;

const trouves = new Map();          // texte -> {genres:Set, n, lignes:[], admin}
function ajoute(texte, genre, pos, admin) {
  const t = texte.trim().replace(/\s+/g, " ");
  if (t.length < 3) return;
  if (!FRANCAIS.test(t)) return;
  if (/^[\w-]+$/.test(t)) return;                 // un seul mot technique
  if (/^(https?:|\/|#|data:|var\(|rgba?\()/.test(t)) return;
  if (/^[\d\s.,:;%+\-–—·•|/€$()]*$/.test(t)) return;
  if (dejaTraduit.has(t)) return;
  if (!trouves.has(t)) trouves.set(t, { genres: new Set(), n: 0, lignes: [], admin: true });
  const e = trouves.get(t);
  e.genres.add(genre); e.n++;
  if (e.lignes.length < 4) e.lignes.push(ligneDe(pos));
  if (!admin) e.admin = false;      // vu une seule fois hors admin => à traduire
}

/* ---------- 1. LE HTML STATIQUE, EN SUIVANT LA PROFONDEUR DES BALISES -------
   Un scanner de balises plutôt qu'une expression régulière : c'est le seul
   moyen de savoir qu'un texte vit SOUS un conteneur d'administration, et de
   savoir que son élément porte data-i18n. */
const AUTOFERMANTES = new Set(["br","hr","img","input","meta","link","source","path","circle","rect","line","polygon","polyline","use","stop","ellipse","area","col","embed","track","wbr"]);
{
  const pile = [];                     // {nom, admin, i18n}
  let i = 0;
  const estAdmin = () => pile.some((p) => p.admin);
  const estI18n  = () => pile.length && pile[pile.length - 1].i18n;
  while (i < statique.length) {
    const lt = statique.indexOf("<", i);
    if (lt < 0) break;
    /* le texte qui précède la balise */
    const txt = statique.slice(i, lt);
    if (txt.trim() && !estI18n() && !/[{}]/.test(txt)) ajoute(txt, "html", i, estAdmin());
    const gt = statique.indexOf(">", lt);
    if (gt < 0) break;
    const balise = statique.slice(lt, gt + 1);
    i = gt + 1;
    if (/^<\//.test(balise)) { pile.pop(); continue; }
    if (/^<[!?]/.test(balise)) continue;
    const nom = (balise.match(/^<([a-zA-Z][\w-]*)/) || [, ""])[1].toLowerCase();
    if (!nom) continue;
    /* les attributs lisibles portés par CETTE balise */
    for (const [attr, genre] of [["placeholder","champ"],["aria-label","accessibilité"],["title","infobulle"],["alt","alternative"]]) {
      const m = balise.match(new RegExp(attr + '="([^"]{3,200})"'));
      if (m) ajoute(m[1], genre, lt, estAdmin() || /admin/i.test(balise));
    }
    if (AUTOFERMANTES.has(nom) || /\/>$/.test(balise)) continue;
    pile.push({
      nom,
      admin: /\bid="[^"]*admin[^"]*"/i.test(balise),
      i18n: /\bdata-i18n\b/.test(balise),
    });
  }
}

/* ---------- 2. LE JAVASCRIPT -----------------------------------------------
   L'écran admin est ici reconnu au nom de la fonction englobante : on retient
   la dernière déclaration rencontrée avant la position du texte. */
const declarations = [];
for (const m of scripts.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g))
  declarations.push([m.index, m[1]]);
function fonctionEn(pos) {
  let nom = "";
  for (const [i, n] of declarations) { if (i > pos) break; nom = n; }
  return nom;
}
const CONTEXTES = [
  [/textContent\s*=\s*["'`]([^"'`\n]{3,200})["'`]/g, "texte"],
  [/\binnerHTML\s*=\s*["'`]([^"'`<>{}\n]{3,200})["'`]/g, "texte"],
  [/placeholder\s*=\s*["']([^"'\n]{3,200})["']/g, "champ"],
  [/aria-label\s*=\s*["']([^"'\n]{3,200})["']/g, "accessibilité"],
  [/title\s*=\s*["']([^"'\n]{3,200})["']/g, "infobulle"],
  [/\btoast\s*\(\s*["'`]([^"'`\n]{3,200})["'`]/g, "message"],
  [/\bconfirm\w*\s*\(\s*["'`]([^"'`\n]{3,200})["'`]/g, "question"],
  [/\balert\s*\(\s*["'`]([^"'`\n]{3,200})["'`]/g, "alerte"],
  [/\bprompt\s*\(\s*["'`]([^"'`\n]{3,200})["'`]/g, "invite"],
];
for (const [re, genre] of CONTEXTES) {
  let m;
  while ((m = re.exec(scripts))) ajoute(m[1], genre, m.index, /admin/i.test(fonctionEn(m.index)));
}

/* ---------- 3. LE RAPPORT --------------------------------------------------- */
const tout = [...trouves.entries()].map(([texte, e]) => ({
  texte, genres: [...e.genres].join("+"), occurrences: e.n,
  lignes: e.lignes, admin: e.admin,
}));
const utilisateur = tout.filter((x) => !x.admin);
const admin = tout.filter((x) => x.admin);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(process.argv.includes("--admin") ? tout : utilisateur, null, 1));
} else {
  console.log("TEXTES VISIBLES NON TRADUITS (utilisateur) : " + utilisateur.length);
  console.log("écrans d'administration, comptés à part     : " + admin.length + "\n");
  const parGenre = {};
  for (const x of utilisateur) parGenre[x.genres] = (parGenre[x.genres] || 0) + 1;
  for (const [g, n] of Object.entries(parGenre).sort((a, b) => b[1] - a[1]))
    console.log("  " + String(n).padStart(4) + "  " + g);
  console.log("\nLes quinze plus longs (souvent les plus visibles) :");
  for (const x of [...utilisateur].sort((a, b) => b.texte.length - a.texte.length).slice(0, 15))
    console.log("  l." + String(x.lignes[0]).padStart(6) + "  " + x.texte.slice(0, 88));
}
