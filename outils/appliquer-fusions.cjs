/* Applique une liste de fusions au catalogue local, LIGNE PAR LIGNE.
   data/drinks.js contient exactement une fiche par ligne, avec des cles non
   quotees. Le reecrire en JSON produirait un fichier d'une seule ligne, un
   diff illisible et une relecture impossible. On retire donc les lignes des
   fiches absorbees et on retouche celle de la fiche conservee.
   REGLE ABSOLUE : aucun code-barres ne disparait. Le script compte les codes
   avant et apres et REFUSE d'ecrire s'il en manque un seul.
   Usage : node appliquer.cjs fusions.json [--ecrire] */
const fs = require("node:fs");
const CHEMIN = "/home/user/magofeed/data/drinks.js";
const fusions = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const ecrire = process.argv.includes("--ecrire");

global.window = {};
const src = fs.readFileSync(CHEMIN, "utf8");
eval(src);
const D = (typeof DRINKS !== "undefined") ? DRINKS : (window.DRINKS || []);
const parId = new Map(D.map(d => [String(d.id), d]));
const codeNu = c => String(c || "").replace(/\D/g, "").replace(/^0+/, "");
const codesAvant = new Set();
D.forEach(d => (d.barcodes || []).forEach(c => { const k = codeNu(c); if (k) codesAvant.add(k); }));

const lignes = src.split("\n");
const ligneDe = new Map();                         // id -> numero de ligne
lignes.forEach((l, i) => { const m = l.match(/^  \{id:(\d+),/); if (m) ligneDe.set(m[1], i); });

const aRetirer = new Set(), merges = {};
let codesDeplaces = 0, nomsGardes = 0;
for (const f of fusions) {
  const garde = parId.get(String(f.garder));
  if (!garde) { console.error("  cible absente : " + f.garder); process.exit(1); }
  const codesNouveaux = [], akaNouveaux = [];
  for (const id of f.absorber) {
    if (String(id) === String(f.garder)) continue;
    const d = parId.get(String(id));
    if (!d) { console.error("  fiche absente : " + id); process.exit(1); }
    (d.barcodes || []).forEach(c => {
      const dejaLa = (garde.barcodes || []).some(x => codeNu(x) === codeNu(c)) || codesNouveaux.some(x => codeNu(x) === codeNu(c));
      if (!dejaLa) { codesNouveaux.push(String(c)); codesDeplaces++; }
    });
    const nom = String(d.name || "").trim();
    if (nom && nom.toLowerCase() !== String(garde.name || "").toLowerCase()) akaNouveaux.push(nom.slice(0, 60));
    (d.aka || []).forEach(a => { if (a) akaNouveaux.push(String(a).slice(0, 60)); });
    aRetirer.add(String(id));
    merges[Number(id)] = Number(f.garder);
  }
  // retouche de la ligne conservee
  const li = ligneDe.get(String(f.garder));
  if (li === undefined) { console.error("  ligne introuvable pour " + f.garder); process.exit(1); }
  let l = lignes[li];
  if (codesNouveaux.length) {
    const m = l.match(/barcodes:\[(.*?)\]/);
    const ajout = codesNouveaux.map(c => JSON.stringify(String(c))).join(",");
    if (m) l = l.replace(/barcodes:\[(.*?)\]/, "barcodes:[" + (m[1] ? m[1] + "," : "") + ajout + "]");
    else   l = l.replace(/^(  \{id:\d+,)/, "$1barcodes:[" + ajout + "],");
  }
  // aka : au plus 5, sans doublon, sans repeter le nom conserve
  const akaExistants = (garde.aka || []).map(String);
  const vus = new Set([String(garde.name || "").toLowerCase(), ...akaExistants.map(a => a.toLowerCase())]);
  const akaFinal = akaExistants.slice();
  for (const a of akaNouveaux) {
    if (akaFinal.length >= 5) break;
    if (vus.has(a.toLowerCase())) continue;
    vus.add(a.toLowerCase()); akaFinal.push(a); nomsGardes++;
  }
  if (akaFinal.length) {
    const txt = "aka:[" + akaFinal.map(a => JSON.stringify(a)).join(",") + "]";
    if (/aka:\[.*?\]/.test(l)) l = l.replace(/aka:\[.*?\]/, txt);
    else l = l.replace(/\},?\s*$/, (m0) => "," + txt + m0);
  }
  lignes[li] = l;
}
const sortie = lignes.filter((l, i) => {
  const m = l.match(/^  \{id:(\d+),/);
  return !(m && aRetirer.has(m[1]));
}).join("\n");

// verification : on relit ce qu'on vient de fabriquer
global.window = {}; let DRINKS2;
try { DRINKS2 = (new Function(sortie + ";return typeof DRINKS!=='undefined'?DRINKS:window.DRINKS;"))(); }
catch (e) { console.error("  LE FICHIER PRODUIT NE S'ANALYSE PAS : " + e.message); process.exit(1); }
const codesApres = new Set();
DRINKS2.forEach(d => (d.barcodes || []).forEach(c => { const k = codeNu(c); if (k) codesApres.add(k); }));
const perdus = [...codesAvant].filter(k => !codesApres.has(k));
const chaines = Object.values(merges).filter(v => merges[v] !== undefined);

console.log("  fiches        : " + D.length + " -> " + DRINKS2.length + "   (" + aRetirer.size + " retirees)");
console.log("  codes distincts: " + codesAvant.size + " -> " + codesApres.size + "   (" + codesDeplaces + " deplaces)");
console.log("  anciens noms conserves dans aka : " + nomsGardes);
console.log("  CODES PERDUS  : " + perdus.length + (perdus.length ? ("  " + perdus.slice(0, 8).join(", ")) : "  (aucun)"));
console.log("  chaines       : " + chaines.length + (chaines.length ? "  INTERDIT" : "  (aucune)"));
if (perdus.length || chaines.length) { console.error("\n  REFUS D'ECRIRE."); process.exit(1); }
if (ecrire) {
  fs.writeFileSync(CHEMIN, sortie);
  fs.writeFileSync(__dirname + "/merges-a-ajouter.json", JSON.stringify(merges, null, 1));
  console.log("\n  data/drinks.js reecrit · merges-a-ajouter.json ecrit.");
} else console.log("\n  (essai a blanc — relancer avec --ecrire)");
