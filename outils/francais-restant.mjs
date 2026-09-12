/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   FRANCAIS RESTANT DANS LE CODE
   ----------------------------------------------------------------------------
   POURQUOI CE SCRIPT EXISTE, ALORS QUE inventaire-textes.mjs DIT DEJA ZERO.
   L'inventaire moissonne l'APPLICATION QUI TOURNE : il ne voit que les ecrans
   qu'un parcours automatique atteint. La fiche d'un badge ne s'ouvre qu'apres
   un clic sur un badge ; elle n'a jamais ete moissonnee, et ses vingt phrases
   sont restees en francais pendant que l'inventaire affichait un zero rassurant.
   Une mesure aveugle sur un ecran est pire qu'une absence de mesure : elle
   dit que le travail est fini.

   Celui-ci lit la SOURCE. Il lit les chaines de caracteres du JavaScript avec
   un vrai analyseur (acorn), pas une expression reguliere : une accolade dans
   une chaine, un apostrophe dans un commentaire, et une regex se trompe de
   frontiere. Il garde celles qui sont du francais et qui ne sont pas dans la
   table de traduction.

   CE QU'IL NE PEUT PAS DECIDER A NOTRE PLACE : si une chaine francaise est
   affichee a l'utilisateur ou seulement journalisee pour nous. Il la signale ;
   c'est a un humain de trancher. Mieux vaut une phrase de trop a lire qu'un
   ecran entier oublie. */

import { readFileSync } from "node:fs";
import { parse } from "acorn";

const html = readFileSync("index.html", "utf8");

/* La table : une chaine deja traduite n'est pas un probleme. */
const t = readFileSync("data/textes.js", "utf8");
const d = t.indexOf("var TEXTES = {"), f = t.indexOf("\n};", d);
const TEXTES = new Function(t.slice(d, f + 3) + "\nreturn TEXTES;")();

/* Mots francais courts et sans equivalent anglais identique. On exige la
   frontiere de mot des deux cotes : sans elle, "le" trouvait "Leaderboard",
   "Level", "Legend", et le rapport se remplissait de faux. Un rapport faux
   envoie reparer ce qui marche. */
const MOTS = ["le", "la", "les", "un", "une", "des", "du", "de", "et", "ou",
  "tu", "ton", "ta", "tes", "toi", "je", "il", "elle", "on", "nous", "vous",
  "est", "sont", "sera", "etait", "pour", "avec", "dans", "sur", "sous",
  "pas", "ne", "que", "qui", "quoi", "ce", "cette", "ces", "cet", "sans",
  "plus", "moins", "deja", "aussi", "encore", "jamais", "toujours", "chaque",
  "tout", "tous", "toute", "toutes", "autre", "autres", "meme", "peut",
  "faut", "fait", "voir", "aller", "mais", "donc", "alors", "puis", "ici",
  "quand", "comme", "trop", "bien", "rien", "vers", "chez", "entre", "par"];
const RE_MOTS = new RegExp("(^|[^\\p{L}])(" + MOTS.join("|") + ")([^\\p{L}]|$)", "iu");
const RE_ACCENTS = /[àâäçéèêëîïôöùûüÿœ]/i;

function sansAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function estFrancais(s) {
  if (RE_ACCENTS.test(s)) return true;
  return RE_MOTS.test(sansAccents(s));
}

/* Ce qui n'est pas du texte d'interface : du CSS, du HTML nu, une URL, une
   cle Firestore, un selecteur. On les ecarte avant de juger la langue. */
function estTechnique(s) {
  if (s.length < 4) return true;
  if (/^[\s\p{P}\p{S}\d]*$/u.test(s)) return true;
  if (/^(https?:|data:|mailto:|\/|#|\.|\w+:\/\/)/.test(s)) return true;
  if (/[:;]\s*[-\w]+\s*[:;]/.test(s) && /px|rem|%|var\(|#[0-9a-f]{3,6}|flex|grid|rgba?\(/i.test(s)) return true;
  if (/^[\w-]+(\.[\w-]+)+$/.test(s)) return true;                 /* a.b.c */
  if (/^[A-Za-z_$][\w$]*$/.test(s)) return true;                  /* identifiant */
  /* Un seul mot, sans espace, sans accent, fait de lettres et de tirets :
     c'est une classe CSS ou un identifiant ("th-on", "map-wrap"), pas une
     phrase. Sans ce filtre, "th-on" etait signale comme francais a cause du
     "on" apres le tiret. */
  if (!/\s/.test(s) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(s)) return true;
  return false;
}

/* Les ecrans d'administration sont volontairement en francais : ils ne sont
   lus que par le proprietaire de l'application. On ne les compte pas comme
   une promesse non tenue, mais on les affiche a part pour ne pas les oublier.

   Comment les reconnaitre. Chercher le mot "admin" DANS la phrase ne marche
   pas : "Purger Lidl, Aldi et Match" est un outil d'administration et ne
   contient pas le mot. Le vrai signe est structurel — ces fonctions
   commencent toutes par un garde "if(!isAdmin)return;". On lit donc l'arbre,
   pas le texte. */
function estGardeAdmin(n) {
  if (!n || !n.body) return false;
  const corps = n.body.type === "BlockStatement" ? n.body.body : [];
  for (const st of corps.slice(0, 2)) {
    if (st.type !== "IfStatement") continue;
    let trouve = false;
    (function chercher(x) {
      if (!x || typeof x !== "object" || trouve) return;
      if (Array.isArray(x)) { x.forEach(chercher); return; }
      if (x.type === "Identifier" && /^is[A-Z]?admin$/i.test(x.name)) trouve = true;
      for (const k in x) if (k !== "type" && k !== "start" && k !== "end") chercher(x[k]);
    })(st.test);
    if (trouve) return true;
  }
  return false;
}
const RE_ADMIN = /admin|Admin|ADMIN/;

const blocs = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) {
  blocs.push({ code: m[1], decalage: m.index + m[0].indexOf(m[1]) });
}

const trouves = new Map();
let analyses = 0, illisibles = 0;
for (const b of blocs) {
  let arbre;
  try {
    arbre = parse(b.code, { ecmaVersion: 2022, sourceType: /\bimport\b|\bexport\b/.test(b.code) ? "module" : "script", locations: false });
  } catch (e) { illisibles++; continue; }
  analyses++;
  (function marcher(n, dansConsole) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach((x) => marcher(x, dansConsole)); return; }
    /* Un message de console n'est lu que par nous, dans l'inspecteur du
       navigateur. Le traduire ne servirait personne et noierait la liste de
       ce qui compte vraiment. */
    if (n.type === "CallExpression" && n.callee && n.callee.type === "MemberExpression" &&
        n.callee.object && n.callee.object.name === "console") dansConsole = true;
    if (/Function/.test(n.type) && estGardeAdmin(n)) dansConsole = true;   /* meme traitement : hors perimetre */
    if (n.type === "Literal" && typeof n.value === "string" && !dansConsole) {
      const s = n.value.trim();
      if (s && !estTechnique(s) && !TEXTES[s] && !TEXTES[n.value] && estFrancais(s)) {
        const ligne = html.slice(0, b.decalage + n.start).split("\n").length;
        if (!trouves.has(s)) trouves.set(s, ligne);
      }
    }
    if (n.type === "TemplateLiteral" && !dansConsole) n.quasis.forEach((q) => {
      const s = String(q.value.cooked || "").trim();
      if (s && !estTechnique(s) && !TEXTES[s] && estFrancais(s)) {
        const ligne = html.slice(0, b.decalage + q.start).split("\n").length;
        if (!trouves.has(s)) trouves.set(s, ligne);
      }
    });
    for (const k in n) if (k !== "type" && k !== "start" && k !== "end") marcher(n[k], dansConsole);
  })(arbre, false);
}

/* Beaucoup de ces chaines sont des MORCEAUX d'un message assemble a
   l'execution : "Ta boisson" + le nom + " est au catalogue". Le morceau seul
   n'est pas dans la table, mais la phrase complete y est — moissonnee sur
   l'app qui tourne — et la passe DOM la traduit d'un bloc. Les signaler
   reviendrait a demander de traduire deux fois la meme chose. On considere
   donc couverte toute chaine qui apparait telle quelle dans une entree de la
   table. Ce test peut se tromper sur les chaines tres courtes ; c'est pourquoi
   il ne s'applique qu'a partir de huit caracteres. */
const CLES = Object.keys(TEXTES);
function couvertParUnAssemblage(s) {
  if (s.length < 8) return false;
  for (const c of CLES) if (c.indexOf(s) !== -1) return true;
  return false;
}
for (const s of [...trouves.keys()]) if (couvertParUnAssemblage(s)) trouves.delete(s);

const liste = [...trouves.entries()].sort((a, b) => a[1] - b[1]);
const admin = liste.filter(([s]) => RE_ADMIN.test(s));
const vus = liste.filter(([s]) => !RE_ADMIN.test(s));

/* Mode machine : la sortie lisible tronque les longues phrases a 110
   caracteres pour rester lisible. Un outil qui lirait cette sortie
   fabriquerait des cles amputees — et une cle amputee ne correspond a rien.
   Le mode --json rend les chaines entieres. */
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(liste.map(([s, l]) => ({ texte: s, ligne: l })), null, 1));
  process.exitCode = 0;
} else {

console.log("blocs <script> analyses : " + analyses + (illisibles ? "  (" + illisibles + " illisibles)" : ""));
console.log("\nCHAINES FRANCAISES HORS TABLE : " + vus.length);
for (const [s, l] of vus) console.log("  index.html:" + l + "  " + JSON.stringify(s.length > 110 ? s.slice(0, 110) + "…" : s));
if (admin.length) console.log("\n(dont mentions d'administration, a part : " + admin.length + ")");
process.exitCode = vus.length ? 1 : 0;
}
