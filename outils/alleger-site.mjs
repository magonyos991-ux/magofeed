/* ════════════════════════════════════════════════════════════════════════════
   ALLEGER CE QUI PART SUR LE RESEAU, SANS TOUCHER AUX SOURCES
   ----------------------------------------------------------------------------
   Mesure sur telephone milieu de gamme en 4G lente, avant : 8,1 secondes avant
   que l'application soit utilisable. Deux causes, mesurees :

     reception du index.html         6 233 ms   583 Ko compresses
     data/textes.js                  4 995 ms   334 Ko compresses

   textes.js porte les DIX langues. Chacun n'en lit qu'une — et un francophone
   n'en lit aucune, puisque tr() rend la cle telle quelle quand la langue est
   le francais. On telechargeait 334 Ko pour rien.

   Ce script ne modifie AUCUN fichier du depot. Il ecrit dans _site/, c'est-a-
   dire uniquement ce qui part en ligne. Les sources restent lisibles, avec
   leurs commentaires, pour qui travaille dessus.

   Il fait deux choses :
   1. decouper data/textes.js en une coquille (les fonctions, table vide) plus
      un fichier par langue, charge seulement si la langue n'est pas le francais
   2. retirer les commentaires de ce qui est livre — 30 % de index.html, et au
      passage cesser de publier tout le raisonnement de conception

   SI QUELQUE CHOSE ECHOUE, ON NE LIVRE PAS UNE VERSION ABIMEE : le fichier
   d'origine est recopie tel quel et le script le dit. Un site lent vaut mieux
   qu'un site casse.
════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

const SITE = process.argv[2] || "_site";
if (!existsSync(SITE)) { console.error("Dossier introuvable : " + SITE); process.exit(1); }

const ko = (b) => (Buffer.byteLength(b) / 1024).toFixed(0);
const koz = (b) => (gzipSync(Buffer.from(b)).length / 1024).toFixed(0);
let gagne = 0;

/* ── 1. LES TEXTES, UNE LANGUE A LA FOIS ─────────────────────────────────── */
function decouperTextes() {
  const src = readFileSync("data/textes.js", "utf8");
  const g = {};
  try { (new Function("window", src + "\nwindow.__T=TEXTES;"))(g); } catch (e) {
    console.warn("  textes.js : non evaluable (" + e.message.slice(0, 60) + ") — laisse tel quel");
    return;
  }
  const T = g.__T;
  if (!T || typeof T !== "object") { console.warn("  textes.js : TEXTES introuvable — laisse tel quel"); return; }

  const langues = {};
  for (const cle of Object.keys(T)) for (const lg of Object.keys(T[cle] || {})) langues[lg] = 1;
  const listeLangues = Object.keys(langues).sort();

  /* La coquille : le fichier d'origine avec la grande table remplacee par {}.
     On repere la table par son ouverture exacte, pas par une acrobatie. */
  const marque = "var TEXTES = {";
  const i = src.indexOf(marque);
  if (i === -1) { console.warn("  textes.js : debut de table introuvable — laisse tel quel"); return; }
  /* Fin de la table : l'accolade qui equilibre, en ignorant ce qui est dans
     une chaine. Les traductions contiennent des accolades ({n}, {t}). */
  /* IL FAUT AUSSI SAUTER LES COMMENTAIRES. Premiere version : elle ne les
     sautait pas, et les commentaires de ce fichier sont en francais — « l'app »,
     « l'avis ». L'apostrophe passait pour une ouverture de chaine qui ne se
     fermait jamais, et la fin de table etait trouvee 800 000 caracteres trop
     loin, en plein milieu d'une fonction. */
  let p = 0, j = i + marque.length - 1, dans = null, ech = false, fin = -1;
  for (; j < src.length; j++) {
    const c = src[j], d = src[j + 1];
    if (dans) { if (ech) ech = false; else if (c === "\\") ech = true; else if (c === dans) dans = null; continue; }
    if (c === "/" && d === "*") { const f = src.indexOf("*/", j + 2); if (f === -1) break; j = f + 1; continue; }
    if (c === "/" && d === "/") { const f = src.indexOf("\n", j); if (f === -1) break; j = f; continue; }
    if (c === '"' || c === "'") { dans = c; continue; }
    if (c === "{") p++;
    else if (c === "}") { p--; if (!p) { fin = j; break; } }
  }
  if (fin === -1) { console.warn("  textes.js : fin de table introuvable — laisse tel quel"); return; }

  const coquille = src.slice(0, i) + "var TEXTES = {}" + src.slice(fin + 1);
  /* Garde-fou : la coquille doit rester du JavaScript valide ET garder tr(). */
  try {
    const t = {}; (new Function("window", coquille + "\nwindow.__ok=(typeof tr===\"function\"&&typeof trh===\"function\");"))(t);
    if (!t.__ok) throw new Error("tr/trh absentes de la coquille");
  } catch (e) {
    console.warn("  textes.js : coquille invalide (" + e.message.slice(0, 60) + ") — laisse tel quel");
    return;
  }

  const avant = readFileSync(SITE + "/data/textes.js");
  writeFileSync(SITE + "/data/textes.js", coquille);
  mkdirSync(SITE + "/data", { recursive: true });
  let totalLangues = 0;
  for (const lg of listeLangues) {
    const une = {};
    for (const cle of Object.keys(T)) { const v = T[cle] && T[cle][lg]; if (v) une[cle] = { [lg]: v }; }
    const corps = "/* Magofeed — textes " + lg + ", genere au deploiement. Source : data/textes.js */\n"
      + "TEXTES = " + JSON.stringify(une) + ";\n";
    writeFileSync(SITE + "/data/textes." + lg + ".js", corps);
    totalLangues += gzipSync(Buffer.from(corps)).length;
  }
  const g1 = gzipSync(avant).length, g2 = gzipSync(Buffer.from(coquille)).length;
  const moyenne = Math.round(totalLangues / listeLangues.length);
  gagne += (g1 - g2);
  console.log("  textes : " + koz(avant) + " Ko -> " + koz(coquille) + " Ko de coquille"
    + " + " + (moyenne / 1024).toFixed(0) + " Ko pour UNE langue (" + listeLangues.length + " fichiers)");
  console.log("           un francophone ne telecharge plus que la coquille.");
}

/* ── 2. LES COMMENTAIRES NE PARTENT PLUS EN LIGNE ────────────────────────── */
/* Retrait prudent : on ne touche qu'aux blocs /* ... *\/ situes HORS chaine de
   caracteres, en lisant le fichier caractere par caractere. Une expression
   reguliere sur 1,9 Mo casserait au premier "/*" ecrit dans une chaine. */
function sansCommentaires(js) {
  let out = "", dans = null, ech = false, i = 0;
  while (i < js.length) {
    const c = js[i], d = js[i + 1];
    if (dans) {
      out += c;
      if (ech) ech = false;
      else if (c === "\\") ech = true;
      else if (dans === "`" && c === "`") dans = null;
      else if (dans !== "`" && c === dans) dans = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { dans = c; out += c; i++; continue; }
    if (c === "/" && d === "*") {
      const f = js.indexOf("*/", i + 2);
      if (f === -1) { out += js.slice(i); break; }
      out += " ";                       /* un espace : « a/*x*\/b » reste « a b » */
      i = f + 2; continue;
    }
    if (c === "/" && d === "/") {
      /* Une ligne commencant par // — mais « // » peut aussi suivre un ':' dans
         une URL. On ne retire que si rien d'autre que des espaces precede sur
         la ligne : c'est le cas sur presque tous les commentaires du fichier,
         et c'est le seul cas ou l'on est certain. */
      let k = out.length - 1;
      while (k >= 0 && (out[k] === " " || out[k] === "\t")) k--;
      if (k < 0 || out[k] === "\n") {
        const f = js.indexOf("\n", i);
        if (f === -1) break;
        i = f; continue;
      }
    }
    out += c; i++;
  }
  return out;
}
function allegerIndex() {
  const chemin = SITE + "/index.html";
  const src = readFileSync(chemin, "utf8");
  const avant = gzipSync(Buffer.from(src)).length;
  /* Les commentaires HTML d'abord, sauf la mention de droits d'auteur en tete :
     elle est la preuve de propriete intellectuelle, elle reste. */
  let out = "", reste = src, premier = true;
  for (;;) {
    const i = reste.indexOf("<!--");
    if (i === -1) { out += reste; break; }
    const f = reste.indexOf("-->", i + 4);
    if (f === -1) { out += reste; break; }
    const bloc = reste.slice(i, f + 3);
    out += reste.slice(0, i);
    if (premier && /©|Copyright|droits/i.test(bloc)) { out += bloc; premier = false; }
    reste = reste.slice(f + 3);
  }
  /* Puis chaque bloc <script> sans attribut src. */
  let res = "", pos = 0;
  const re = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, casse = false;
  while ((m = re.exec(out)) !== null) {
    const corps = m[2];
    let net = corps;
    try {
      net = sansCommentaires(corps);
      /* Garde-fou : le resultat doit rester analysable. On n'EXECUTE pas (le
         code touche au DOM), on verifie seulement qu'il se compile. */
      if (!/\bmodule\b/i.test(m[1])) new Function(net);
    } catch (e) { net = corps; casse = true; }
    res += out.slice(pos, m.index) + "<script" + m[1] + ">" + net + "</script>";
    pos = m.index + m[0].length;
  }
  res += out.slice(pos);
  if (casse) console.warn("  index.html : un bloc n'a pas pu etre allege, il est livre tel quel");
  writeFileSync(chemin, res);
  const apres = gzipSync(Buffer.from(res)).length;
  gagne += (avant - apres);
  console.log("  index.html : " + ko(src) + " Ko -> " + ko(res) + " Ko brut   ("
    + (avant / 1024).toFixed(0) + " -> " + (apres / 1024).toFixed(0) + " Ko compresses)");
}

console.log("Allegement de ce qui part en ligne :");
decouperTextes();
allegerIndex();
console.log("  total economise sur le reseau : " + (gagne / 1024).toFixed(0) + " Ko compresses");
