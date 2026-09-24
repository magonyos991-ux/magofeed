#!/usr/bin/env node
/* LA COMMANDE DE DEPLOIEMENT DOIT TELECHARGER TOUT CE QUE LE SERVEUR EXIGE.
   ----------------------------------------------------------------------------
   functions-a-deployer/README.md porte une commande PowerShell qui va chercher
   les fichiers un par un, par leur nom, ecrits a la main. Le jour ou index.js
   a gagne un « require("./chasse-codes") », personne n'a pense a ajouter le
   nom dans cette liste. Resultat, le 24 septembre 2026 :

       Error: Cannot find module './chasse-codes'
       Error: Functions codebase could not be analyzed successfully.

   Le deploiement entier s'arrete. Pas une fonction n'est mise a jour, et rien
   ne dit que la cause est une liste de noms oubliee dans un fichier Markdown.

   Ce controle calcule ce dont le serveur a VRAIMENT besoin — index.js, puis
   tout ce qu'il exige, puis tout ce que ceux-la exigent a leur tour — et
   refuse que la commande en oublie un seul.

   node outils/controle-deploiement.mjs
*/
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = "functions-a-deployer";
const README = join(DOSSIER, "README.md");

let ko = 0;
const dit = (ok, quoi) => { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + quoi); };

/* Ce dont le serveur a besoin : la fermeture transitive depuis index.js. */
function exigences() {
  const vus = new Set(), pile = ["index"], absents = [];
  while (pile.length) {
    const m = pile.pop();
    if (vus.has(m)) continue;
    vus.add(m);
    const f = join(DOSSIER, m + ".js");
    if (!existsSync(f)) { absents.push(m + ".js"); continue; }
    for (const d of readFileSync(f, "utf8").matchAll(/require\("\.\/([a-z0-9-]+)"\)/g)) {
      if (!vus.has(d[1])) pile.push(d[1]);
    }
  }
  return { modules: [...vus].sort(), absents };
}
/* Ce que la commande telecharge : la liste @("a.js","b.js",...) du README. */
function listeDuReadme() {
  const md = readFileSync(README, "utf8");
  const m = md.match(/@\(("index\.js"[^)]*)\)/);
  if (!m) return null;
  return m[1].split(",").map((x) => x.trim().replace(/^"|"$/g, "").replace(/\.js$/, "")).filter(Boolean);
}

const { modules, absents } = exigences();
const liste = listeDuReadme();

console.log("le serveur a besoin de " + modules.length + " fichiers (index.js et tout ce qu'il entraine)\n");
dit(absents.length === 0, "chaque fichier exige existe dans le depot" + (absents.length ? " — introuvable(s) : " + absents.join(", ") : ""));
dit(liste !== null, "la commande de deploiement est bien dans " + README);
if (liste) {
  const manquants = modules.filter((m) => liste.indexOf(m) === -1);
  dit(manquants.length === 0,
    "la commande telecharge tout le necessaire" + (manquants.length ? " — OUBLIE(S) : " + manquants.map((x) => x + ".js").join(", ") : ""));
  /* Un fichier en trop ne casse rien (migration-geohash.js est un script a
     lancer a la main, volontairement present), mais un fichier qui n'existe
     pas ferait echouer le telechargement avant meme le deploiement. */
  const fantomes = liste.filter((m) => !existsSync(join(DOSSIER, m + ".js")));
  dit(fantomes.length === 0,
    "la commande ne demande aucun fichier inexistant" + (fantomes.length ? " — fantome(s) : " + fantomes.map((x) => x + ".js").join(", ") : ""));
  const enTrop = liste.filter((m) => modules.indexOf(m) === -1);
  if (enTrop.length) console.log("  .  | telecharges sans etre exiges (normal pour un script manuel) : " + enTrop.join(", "));
}
/* Un fichier du dossier qui n'est branche nulle part : ce n'est pas une faute,
   mais il vaut mieux le savoir que le decouvrir un jour de panne. */
const surDisque = readdirSync(DOSSIER).filter((f) => f.endsWith(".js") && !f.endsWith(".modele")).map((f) => f.replace(/\.js$/, ""));
const orphelins = surDisque.filter((m) => modules.indexOf(m) === -1 && (!liste || liste.indexOf(m) === -1));
if (orphelins.length) console.log("  .  | presents dans le dossier mais branches nulle part : " + orphelins.join(", "));

console.log("\n" + (ko ? ko + " probleme(s) — le deploiement echouerait" : "TOUT EST CONFORME"));
process.exit(ko ? 1 : 0);
