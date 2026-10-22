/* REDRESSE LES CHAINES DE FUSION.
   remapDrinkId ne fait qu'UN saut : si 16548 pointe vers 16507 et que 16507 a
   lui-meme ete absorbe par 16565, alors tout ce qui portait 16548 atterrit sur
   une fiche qui n'existe plus — un rayon, un favori ou une confirmation perdus
   en silence. Le controle du catalogue detecte le cas ; ce script le repare,
   en faisant pointer chaque redirection directement vers sa cible FINALE.
   Usage : node outils/redresser-chaines.cjs [--ecrire] */
const fs = require("node:fs");
const P = "/home/user/magofeed/index.html";
const ecrire = process.argv.includes("--ecrire");
let s = fs.readFileSync(P, "utf8");
const i = s.indexOf("window.DRINK_MERGES = {");
const j = s.indexOf("};", i);
if (i < 0 || j < 0) { console.error("table DRINK_MERGES introuvable"); process.exit(1); }
let bloc = s.slice(i, j);
const paires = {};
bloc.replace(/^\s+(\d+):\s*(\d+),/gm, (m, a, b) => { paires[+a] = +b; return m; });
const chaines = Object.keys(paires).map(Number).filter(k => paires[paires[k]] !== undefined);
if (!chaines.length) { console.log("  aucune chaine."); process.exit(0); }
chaines.forEach(k => {
  let final = paires[k], vu = new Set([k]);
  while (paires[final] !== undefined && !vu.has(final)) { vu.add(final); final = paires[final]; }
  console.log("  " + k + " : " + paires[k] + " -> " + final);
  bloc = bloc.replace(new RegExp("^(\\s+" + k + "):\\s*" + paires[k] + ",", "m"), "$1: " + final + ",");
});
if (ecrire) { fs.writeFileSync(P, s.slice(0, i) + bloc + s.slice(j)); console.log("\n  " + chaines.length + " chaine(s) redressee(s)."); }
else console.log("\n  (essai a blanc — relancer avec --ecrire)");
