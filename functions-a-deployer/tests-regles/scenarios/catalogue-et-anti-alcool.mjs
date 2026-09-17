/* ============================================================================
   PARCOURS : LE CATALOGUE, LA GARDE ANTI-ALCOOL ET LA COHERENCE DES DONNEES
   ----------------------------------------------------------------------------
   Ce parcours-la ne passe pas par l'emulateur : il n'y a pas de deuxieme
   personne, pas de regle Firestore a interroger. Ce qu'il verifie, c'est ce que
   l'application AFFICHE a partir de ses propres fichiers, et ce que la base de
   PRODUCTION contient vraiment (lecture seule, API REST publique).

   CE QU'IL REJOUE, LIGNE PAR LIGNE, SANS RIEN REECRIRE :
     - index.html:7919   nameLooksAlcoholic()   la garde anti-alcool, chargee
                         telle quelle depuis index.html + data/alcool.js
                         (meme technique que outils/controle-catalogue.mjs)
     - index.html:10234  normTxt()              la normalisation qu'elle emploie
     - index.html:9541   codeNu()               ce qu'un code-barres DEVIENT
     - index.html:9542   indexCode()            la comparaison du scan
     - index.html:9341   la recherche au scan : DRINKS.find(porteCode(...))
     - index.html:18099  _stripAutoDrinks()     le nettoyage des inventaires
                         inventes des magasins auto-importes
     - index.html:2012   normalizeStore()       d'ou vient le s.id qu'il teste
     - index.html:19693  la ligne « N boissons » de la liste des magasins
     - index.html:6531   l'affichage du champ drink.emoji
     - outils/controle-catalogue.mjs            le controle deja en place

   POURQUOI CHARGER LA VRAIE FONCTION PLUTOT QUE D'EN REECRIRE UNE : une garde
   anti-alcool recopiee derive de celle qui compte. Si nameLooksAlcoholic
   laisse passer un nom ici, elle le laissera passer a l'ecran.

   Lancer :  node scenarios/catalogue-et-anti-alcool.mjs
        ou :  node lancer-scenario.mjs scenarios/catalogue-et-anti-alcool.mjs
   ============================================================================ */
import { doit, note, bilan } from "../banc.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.resolve(ICI, "..", "..", "..");
const lire = (f) => readFileSync(path.join(DEPOT, f), "utf8");

/* ── Charger l'application, pas une imitation ──────────────────────────────
   Exactement la meme extraction que outils/controle-catalogue.mjs : on decoupe
   le corps de la fonction dans index.html et on l'execute avec data/alcool.js.
   Si index.html change, ce scenario change avec lui. */
globalThis.window = {};
const HTML = lire("index.html");
function corpsDe(nom) {
  const d = HTML.indexOf("function " + nom + "(");
  if (d === -1) throw new Error("fonction " + nom + " introuvable dans index.html");
  let prof = 0;
  for (let j = HTML.indexOf("{", d); j < HTML.length; j++) {
    if (HTML[j] === "{") prof++;
    else if (HTML[j] === "}") { prof--; if (!prof) return HTML.slice(d, j + 1); }
  }
  throw new Error("fin de " + nom + " introuvable");
}
const ligneDe = (nom) => HTML.slice(0, HTML.indexOf("function " + nom + "(")).split("\n").length;

const APP = new Function(
  lire("data/alcool.js") + "\n" + corpsDe("normTxt") + "\n" + corpsDe("nameLooksAlcoholic") + "\n"
  + corpsDe("codeNu") + "\n" + corpsDe("indexCode") + "\n"
  + "return { alcool: nameLooksAlcoholic, codeNu: codeNu, indexCode: indexCode };")();

const DRINKS = new Function(lire("data/drinks.js").replace(/^\/\*[\s\S]*?\*\//, "") + "\nreturn DRINKS;")();

note("index.html:" + ligneDe("nameLooksAlcoholic") + " nameLooksAlcoholic, index.html:" + ligneDe("codeNu")
  + " codeNu : chargees depuis le fichier, pas recopiees");
note("catalogue lu : " + DRINKS.length + " fiches");

/* ══════════════════════════════════════════════════════════════════════════
   1. LA GARDE ANTI-ALCOOL
   Regle du fondateur : ZERO alcool, « meme 0,0 % ». Chaque nom qui passe est
   une boisson alcoolisee qui peut entrer au catalogue par le scan (index.html:
   17723) ou par une proposition (index.html:24845).
   ══════════════════════════════════════════════════════════════════════════ */
const refuse = (nom) => doit("refuse « " + nom + " »", async () => {
  if (!APP.alcool(nom, "")) throw new Error("PASSE la garde");
});
const autorise = (nom) => doit("laisse passer « " + nom + " » (sans alcool)", async () => {
  if (APP.alcool(nom, "")) throw new Error("bloque a tort");
});

note("--- 1a. ce que la garde attrape deja : le temoin de fidelite ---");
["Jupiler", "Heineken 0.0", "Corona Cero", "Leffe Blonde 0.0", "Erdinger Alkoholfrei",
 "Clausthaler", "Bitburger Drive", "Carlsberg Nordic", "Rotwein", "Ginger Beer",
 "Jack Daniels", "\u30d3\u30fc\u30eb", "\u043f\u0438\u0432\u043e", "\u0628\u064a\u0631\u0629",
 "Aperol Spritz", "40 % vol", "Punch Coco 18% vol"].forEach(refuse);
["Canada Dry Ginger Ale", "Virgin Mojito", "Coca-Cola sans alcool", "Malta Guinness",
 "Finley Spritz", "Hell Lime Spritz"].forEach(autorise);

note("--- 1b. ALCOOL_FAUX efface des mots qui sont dans ALCOOL_MOTS/ALCOOL_MARQUES ---");
/* data/alcool.js: ALCOOL_FAUX contient /\bspritz\b/g, qui retire « spritz » du
   texte AVANT la recherche. Or « spritz veneziano » est dans ALCOOL_MOTS et
   « hugo spritz » / « cava spritz » dans ALCOOL_MARQUES : ces entrees ne
   peuvent donc jamais correspondre. « aperol spritz » survit par accident,
   parce que « aperol » est aussi liste tout seul.
   A NOTER : retirer /\bspritz\b/ de ALCOOL_FAUX n'est PAS la reparation — deux
   fiches du catalogue s'appellent « Finley Spritz » et « Hell Lime Spritz », et
   elles sont sans alcool. Ce sont les entrees mortes qu'il faut ecrire
   autrement (« veneziano », « hugo » seuls). */
["Spritz Veneziano", "Hugo Spritz"].forEach(refuse);

note("--- 1c. la forme SANS apostrophe ---");
/* L'echappement (index.html, dans nameLooksAlcoholic) remplace l'apostrophe par
   une espace : « sheridan's » devient le motif « sheridan[ -]s », qui ne peut
   pas reconnaitre « Sheridans » ecrit d'un seul tenant. La liste double la
   plupart des marques (jack daniel's ET jack daniels) ; trois ne le sont pas. */
["Sheridan's", "Dewar's", "Sir Edward's"].forEach(refuse);   // la forme listee
["Sheridans", "Dewars", "Sir Edwards"].forEach(refuse);      // la meme, sans apostrophe

note("--- 1d. marques de biere absentes de ALCOOL_MARQUES ---");
/* Bavaria 8.6 titre 7,9 % vol ; Perlenbacher est la biere de Lidl — c'est
   exactement le cas cite en commentaire dans index.html (« lidl Argus pils »).
   Verifie au prealable : aucune fiche du catalogue ne porte ces noms, les
   ajouter a la liste ne creerait donc aucun faux positif. */
["Bavaria 8.6", "Bavaria Premium", "Perlenbacher", "Hollandia", "Oettinger Export"].forEach(refuse);

note("--- 1e. bieres 0,0 % de marques dediees (le fondateur les refuse aussi) ---");
["Tourtel Twist Agrumes", "Buckler", "Moussy", "Free Damm"].forEach(refuse);

note("--- 1f. liqueurs et spiritueux nommes sans marque connue ---");
["Triple Sec", "Creme de Cassis", "Peachtree", "Fireball", "Stroh 80"].forEach(refuse);

note("--- 1g. cocktails alcoolises (negroni, moscow mule, b52 sont deja listes) ---");
["Margarita", "Daiquiri", "Caipirinha", "Cosmopolitan", "Long Island Iced Tea", "Michelada"].forEach(refuse);

note("--- 1h. le degre ecrit sans « vol » / « alc » / « abv » ---");
/* index.html, regle 2 de nameLooksAlcoholic : le pourcentage n'est lu que s'il
   est suivi de vol/alc/abv. « Punch Coco 18% vol » est refuse, « Punch Coco
   18% » passe — c'est pourtant le meme punch. */
["Punch Coco 18%", "Ponche Crema 17%"].forEach(refuse);

note("--- 1i. le vinaigre que ALCOOL_FAUX pretend proteger ---");
/* data/alcool.js annonce que ALCOOL_FAUX sert « a ne pas bloquer un ginger ale,
   un vinaigre ou une vitamine », et contient /vinaigres?/ et /vinegars?/. Mais
   retirer le mot « vinaigre » laisse « de cidre » et « de vin » derriere lui :
   les deux vinaigres les plus courants restent bloques. La protection annoncee
   ne protege que le vinaigre sans complement. */
["Vinaigre blanc", "Vinaigre de cidre de pomme", "Vinaigre de vin rouge"].forEach(autorise);

note("--- 1j. « 0,0 % » quelque part dans le nom desarme la regle du degre ---");
/* Meme ligne : && !/\b0[.,]0\s*%/.test(bas). La condition porte sur TOUT le
   nom, pas sur le degre trouve. Un nom qui contient les deux perd la regle. */
["Coffret 0,0 % + 40 % vol", "Duo degustation 0.0% et 12% vol"].forEach(refuse);

/* ══════════════════════════════════════════════════════════════════════════
   2. LES CODES-BARRES : CE QUE LE SCAN VOIT VRAIMENT
   outils/controle-catalogue.mjs compare les codes en TEXTE BRUT. L'application,
   elle, compare codeNu(code) — sans les zeros de tete (index.html:9541), parce
   qu'un EAN-13, son UPC-A a 12 chiffres et sa forme courte designent le meme
   article. Deux ecritures differentes peuvent donc etre le MEME code au scan.
   ══════════════════════════════════════════════════════════════════════════ */
const CONNUES = new Set(["3124480196774", "90169168", "90169380", "90169762", "90169748", "5949000012031"]);
const parNu = new Map();
for (const d of DRINKS) for (const b of (d.barcodes || [])) {
  const nu = APP.codeNu(b);
  if (!parNu.has(nu)) parNu.set(nu, []);
  parNu.get(nu).push({ id: d.id, name: d.name, brut: String(b) });
}
const collisions = [...parNu.entries()].filter(([, l]) => new Set(l.map((x) => x.id)).size > 1);
/* Celles que le controle en place NE PEUT PAS voir : aucune des deux fiches
   n'ecrit le code de la meme facon, et le code n'est pas dans sa liste
   d'exceptions. */
const invisibles = collisions.filter(([, l]) => {
  const brutPartage = l.some((a) => l.some((b) => a.id !== b.id && a.brut === b.brut));
  return !brutPartage && !l.some((x) => CONNUES.has(x.brut));
});
note("collisions de codes-barres vues par le SCAN (apres codeNu) : " + collisions.length
  + " — dont " + CONNUES.size + " declarees connues dans outils/controle-catalogue.mjs");
invisibles.forEach(([nu, l]) => note("   invisible pour le controle : " + nu + " = "
  + l.map((x) => x.brut + " (#" + x.id + " " + x.name + ")").join("  ET  ")));

await doit("aucune collision de code-barres echappe a outils/controle-catalogue.mjs", async () => {
  if (invisibles.length) throw new Error(invisibles.length + " collision(s) que le controle ne voit pas, "
    + "parce qu'il compare le texte brut la ou l'app compare codeNu()");
});

/* Codes a circulation restreinte : la cle de controle est bonne, donc cleOk()
   les accepte, mais GS1 reserve 020-029 / 040-049 / 200-299 aux codes INTERNES
   d'une enseigne. Le meme numero designe un autre produit ailleurs : scanne
   dans une autre chaine, il montre la mauvaise boisson. */
const restreints = [];
for (const d of DRINKS) for (const b of (d.barcodes || [])) {
  const c = String(b);
  if (c.length !== 12 && c.length !== 13) continue;
  const p = (c.length === 12 ? "0" + c : c).slice(0, 3);
  if (/^(02\d|04\d|2\d\d)$/.test(p)) restreints.push(c + " (prefixe " + p + ", #" + d.id + " " + d.name + ")");
}
note("codes-barres a prefixe GS1 « circulation restreinte » (code interne d'enseigne) : " + restreints.length);
restreints.slice(0, 6).forEach((x) => note("   " + x));
await doit("aucun code-barres a prefixe de circulation restreinte au catalogue", async () => {
  if (restreints.length) throw new Error(restreints.length + " codes internes d'enseigne, cle valide mais non mondiaux");
});

/* Fiches en double sur le nom : sans code-barres commun, le controle en place
   ne peut pas les rapprocher. Chacune collecte ses propres confirmations. */
const cle = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const parNom = new Map();
for (const d of DRINKS) {
  const k = cle(d.name) + "|" + cle(d.brand);
  if (!parNom.has(k)) parNom.set(k, []);
  parNom.get(k).push(d);
}
const doublons = [...parNom.values()].filter((l) => l.length > 1);
note("fiches distinctes portant le MEME nom et la MEME marque : " + doublons.length);
doublons.slice(0, 5).forEach((l) => note("   " + l[0].name + " / " + (l[0].brand || "") + " -> ids " + l.map((d) => d.id).join(", ")));

/* ══════════════════════════════════════════════════════════════════════════
   3. ZERO EMOJI — Y COMPRIS DANS LE CHAMP QUI S'APPELLE « emoji »
   outils/controle-catalogue.mjs teste name + brand + tag. Il ne regarde jamais
   d.emoji — le seul champ prevu pour en contenir. index.html:6531 l'injecte
   pourtant tel quel dans la page.
   ══════════════════════════════════════════════════════════════════════════ */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const champEmoji = DRINKS.filter((d) => d.emoji && String(d.emoji).trim());
const pointsDe = (s) => Array.from(String(s)).map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
champEmoji.forEach((d) => note("   fiche #" + d.id + " " + d.name + " : emoji = " + pointsDe(d.emoji)
  + (EMOJI.test(String(d.emoji)) ? "  (signe graphique visible)" : "  (ni lettre ni signe lisible)")));
await doit("le champ emoji des fiches est vide partout", async () => {
  if (champEmoji.length) throw new Error(champEmoji.length + " fiche(s) avec un champ emoji non vide ; "
    + "outils/controle-catalogue.mjs ne teste que name+brand+tag et annonce « ok emoji 0 »");
});

/* ══════════════════════════════════════════════════════════════════════════
   4. LA BASE DE PRODUCTION — LECTURE SEULE
   Rien n'est ecrit. On mesure, on ne juge pas.
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = "https://firestore.googleapis.com/v1/projects/magofeed-7f621/databases/(default)/documents";
async function pages(champs) {
  const out = [];
  let apres = null;
  for (let t = 0; t < 60; t++) {
    const q = { structuredQuery: {
      from: [{ collectionId: "stores" }],
      select: { fields: champs.map((f) => ({ fieldPath: f })) },
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: 1000 } };
    if (apres) q.structuredQuery.startAt = { values: [{ referenceValue: apres }], before: false };
    const r = await fetch(BASE + ":runQuery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const docs = (await r.json()).filter((x) => x.document);
    if (!docs.length) break;
    out.push(...docs);
    apres = docs[docs.length - 1].document.name;
    if (docs.length < 1000) break;
  }
  return out;
}

let prodOk = true, magasins = [];
try {
  magasins = await pages(["drinks", "osmId", "confirmations", "id"]);
} catch (e) { prodOk = false; note("production illisible (" + String(e.message) + ") : section 4 sautee"); }

if (prodOk) {
  const rCat = await fetch(BASE + ":runQuery", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "catalog" }],
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 500 } }) });
  const idsCatalogFB = (await rCat.json()).filter((x) => x.document).map((x) => Number(x.document.name.split("/").pop()));
  const rMerges = await fetch(BASE + "/meta/drinkMerges");
  const mergesExiste = rMerges.ok;

  const univers = new Set([...DRINKS.map((d) => Number(d.id)), ...idsCatalogFB]);
  const vues = new Map();
  let vides = 0, refs = 0, fantomes = 0, magFantome = 0;
  const idsFantomes = new Map();
  let echappent = 0, echappentSansConf = 0, boissonsEchappees = 0;

  for (const doc of magasins) {
    const f = doc.document.fields || {};
    const docId = doc.document.name.split("/").pop();
    const arr = ((f.drinks && f.drinks.arrayValue && f.drinks.arrayValue.values) || [])
      .map((v) => Number(v.integerValue ?? v.doubleValue ?? v.stringValue));
    const conf = (f.confirmations && f.confirmations.mapValue && f.confirmations.mapValue.fields) || {};
    /* normalizeStore (index.html:2012) : data.id = data.id || <id du document> */
    const idApp = f.id ? String(f.id.stringValue ?? f.id.integerValue) : docId;

    if (!arr.length) { vides++; continue; }
    refs += arr.length;
    let n = 0;
    for (const id of arr) { vues.set(id, (vues.get(id) || 0) + 1); if (!univers.has(id)) { n++; idsFantomes.set(id, (idsFantomes.get(id) || 0) + 1); } }
    if (n) { magFantome++; fantomes += n; }
    /* _stripAutoDrinks (index.html:18099) ne retient que s.id.charAt(0)==="o" */
    if (f.osmId && idApp.charAt(0) !== "o") {
      echappent++; boissonsEchappees += arr.length;
      if (!Object.keys(conf).length) echappentSansConf++;
    }
  }
  const dansAucun = DRINKS.filter((d) => !vues.has(Number(d.id)));

  note("--- 4. mesures de la base de PRODUCTION (lecture seule) ---");
  note("magasins : " + magasins.length + " — sans aucune boisson : " + vides
    + " (" + (100 * vides / magasins.length).toFixed(1) + " %)");
  note("boissons du catalogue : " + DRINKS.length + " — dans AUCUN magasin : " + dansAucun.length
    + " (" + (100 * dansAucun.length / DRINKS.length).toFixed(1) + " %)");
  note("references magasin -> boisson : " + refs);
  note("meta/drinkMerges (le remappage des fiches fusionnees) : " + (mergesExiste ? "present" : "ABSENT"));
  note("identifiants cites par des magasins mais introuvables au catalogue : " + idsFantomes.size
    + " ids, " + fantomes + " references, " + magFantome + " magasins");
  [...idsFantomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .forEach(([i, n]) => note("   id " + i + " cite par " + n + " magasins"));
  note("magasins portant osmId que _stripAutoDrinks NE nettoie PAS : " + echappent
    + " (dont " + echappentSansConf + " sans la moindre confirmation), " + boissonsEchappees + " boissons annoncees");

  await doit("chaque boisson citee par un magasin existe au catalogue", async () => {
    if (idsFantomes.size) throw new Error(idsFantomes.size + " identifiants fantomes, " + fantomes
      + " references ; la ligne « N boissons » (index.html:19693) les compte, l'ecran detail ne peut pas les lister");
  });
  await doit("le nettoyage des inventaires inventes atteint tous les magasins auto-importes", async () => {
    if (echappent) throw new Error(echappent + " magasins OSM gardent " + boissonsEchappees
      + " boissons supposees : _stripAutoDrinks (index.html:18099) exige s.id commencant par « o », "
      + "or ces documents ont ete ecrits avec un identifiant Firestore automatique");
  });
}

await bilan(null);
