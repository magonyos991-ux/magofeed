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
  /* "system-ui,sans-serif" contient le mot francais "sans" : sans ce filtre,
     chaque icone dessinee etait signalee comme du francais a traduire. Une
     pile de polices n'est pas une phrase. */
  if (/font-family|sans-serif|monospace/.test(s)) return true;
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
/* Quelques fonctions n'ont pas le garde "isAdmin" parce qu'elles sont
   appelees PAR les outils d'administration, jamais par l'interface publique.
   Le garde-fou de confirmation en est le cas type : ses quatre appels sont
   tous dans la zone d'administration. On les nomme ici plutot que de deviner,
   et on redit pourquoi, pour que la liste puisse etre revue le jour ou l'un
   d'eux servira ailleurs. */
const FONCTIONS_ADMIN = new Set([
  "actionSensible",     /* garde-fou de confirmation : 4 appels, tous cote admin */
  "journalAdmin",       /* trace des actions d'administration */
  /* Le panneau d'administration (lignes ~21400 a ~22600) : ces fonctions
     dessinent des ecrans que seul le proprietaire ouvre. Elles n'ont pas
     toutes le garde "isAdmin" en tete parce qu'elles sont appelees depuis une
     fonction qui l'a deja. Liste etablie en remontant, pour chaque phrase
     signalee, jusqu'a la fonction qui la contient — si une de ces fonctions
     sert un jour a l'interface publique, il faut la retirer d'ici. */
  "adminBasculerCertif", "_lancerAssignation", "_lancerAssignationSur",
  "_lancerPurge", "vIds",
  "bannerReportStore", "majBoutonCertif", "renderSearchStats", "onlineTile",
  "_recapMessage", "_contribTypeLabel", "renderContribFeed", "bloc", "stars",
  "renderAdminHistory", "_claimStatutChip", "renderShopClaims", "_boutonReprise",
  "admCertifierUn", "admReprendrePhotos", "admApproveClaim", "admRevokeClaim",
  "renderPhotoSuggestions", "promoteDiscovery", "rejectDiscovery",
  "rejectDiscoveryPhoto", "renderFounderDash", "renderDemandAdmin",
  "renderFeedbackAdmin",
  /* buildChainSets ne contient pas des phrases mais des CLES DE RAPPROCHEMENT :
     "mountain dew sans" sert a retrouver une boisson dans le catalogue, pas a
     etre lu. La traduire casserait le rapprochement sans rien afficher de
     mieux. */
  "buildChainSets",
  /* Cas a part, et pour une tout autre raison : generatePseudo tire au sort un
     surnom dans deux listes de mots. Ce ne sont pas des phrases d'interface,
     ce sont des noms de personnes. Traduire « Panthere » ferait qu'un meme
     utilisateur s'appellerait autrement selon la langue de qui le regarde —
     un classement ou personne ne se reconnait. On n'y touche pas. */
  "generatePseudo",
]);
const RE_ADMIN = /admin|Admin|ADMIN/;

const blocs = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) {
  blocs.push({ code: m[1], decalage: m.index + m[0].indexOf(m[1]) });
}

const trouves = new Map();
const promesses = new Set();
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
    if (/Function/.test(n.type) && (estGardeAdmin(n) || (n.id && FONCTIONS_ADMIN.has(n.id.name)))) dansConsole = true;
    /* Beaucoup de ces fonctions sont ecrites "var bloc = function(){…}" : le
       noeud Function n'a alors pas de nom a lui, le nom est sur la variable.
       Sans ce cas, la liste ci-dessus rate justement les fonctions internes du
       panneau d'administration, qui sont presque toutes ecrites ainsi. */
    if (n.type === "VariableDeclarator" && n.id && FONCTIONS_ADMIN.has(n.id.name) &&
        n.init && /Function|ArrowFunction/.test(n.init.type)) dansConsole = true;
    /* Un appel tr("…") ou trh("…", …) est une promesse : le code annonce que
       cette phrase est traduisible. Si elle n'est pas dans la table, la
       promesse est vide — l'utilisateur voit du francais et rien ne le dit.
       On les releve a part, parce que c'est une erreur franche, pas une
       heuristique de langue. */
    if (n.type === "CallExpression" && n.callee && n.callee.type === "Identifier" &&
        (n.callee.name === "tr" || n.callee.name === "trh") &&
        n.arguments[0] && n.arguments[0].type === "Literal" &&
        typeof n.arguments[0].value === "string") {
      const c = n.arguments[0].value;
      if (c && !TEXTES[c] && !TEXTES[c.trim()]) promesses.add(c);
    }
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

/* Une chaine du code n'est pas toujours une phrase : souvent c'est un bout de
   HTML, "<div class=…>Tes avantages</div>". Ce que l'utilisateur lit, c'est
   "Tes avantages", et c'est ce texte-la, seul, que la passe DOM comparera a la
   table. Si tous les morceaux lisibles d'une chaine sont deja traduits, la
   chaine n'a plus rien a nous dire — la signaler quand meme gonflerait le
   compte et ferait croire qu'il reste du travail la ou il n'y en a plus. */
function morceauxVisibles(texte) {
  const out = [];
  /* Les libelles d'accessibilite vivent dans des ATTRIBUTS, pas entre les
     balises : aria-label, title, placeholder, alt. La passe DOM les traduit
     aussi. Sans les lire ici, une fiche entierement traduite restait signalee
     a cause de son seul bouton « Centrer sur moi ». */
  /* On memorise le guillemet ouvrant et on ferme sur le meme : sinon
     placeholder="Nom exact lu sur l'etiquette" s'arretait a l'apostrophe et
     donnait un morceau tronque, qui ne correspondait a rien. */
  const attr = /\b(?:aria-label|title|placeholder|alt)=(["'])((?:(?!\1)[\s\S])*)\1/g;
  let ma;
  while ((ma = attr.exec(texte)) !== null) {
    const v = ma[2].replace(/\s+/g, " ").trim();
    if (v) out.push(v);
  }
  for (const p0 of texte.split(/<[^>]*>/)) {
    let p = p0;
    if (p.indexOf(">") !== -1) p = p.slice(p.lastIndexOf(">") + 1);
    if (p.indexOf("<") !== -1) p = p.slice(0, p.indexOf("<"));
    const m = p.replace(/\s+/g, " ").trim();
    if (m && m.length >= 3 && !/=["']|event\.|function\s*\(|\bthis\b/.test(m)) out.push(m);
  }
  return out;
}
for (const [s] of [...trouves.entries()]) {
  const parts = morceauxVisibles(s);
  /* Aucun morceau lisible : la chaine s'arrete au milieu d'une balise ou d'un
     attribut ('<button class="th-plus" aria-label="'). Il n'y a rien a y lire,
     donc rien a y traduire — la signaler enverrait chercher une phrase qui
     n'existe pas. */
  if (parts.every((m) => TEXTES[m] || !estFrancais(m))) trouves.delete(s);
}

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
if (promesses.size) {
  console.log("\nAPPELS tr()/trh() SANS ENTREE DANS LA TABLE : " + promesses.size);
  for (const c of promesses) console.log("  " + JSON.stringify(c));
}
process.exitCode = (vus.length || promesses.size) ? 1 : 0;
}
