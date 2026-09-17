#!/usr/bin/env node
/* UN SEUL FICHIER D'INDEX, ET IL CONTIENT TOUT.

   « firebase deploy --only firestore:indexes » ne complete pas la liste des
   index du projet : il la REMPLACE. Deployer un fichier incomplet supprime donc
   les index absents — et une requete qui perd son index n'echoue pas doucement,
   elle echoue tout court. Les points, le parrainage, la liste des signalements
   et la messagerie en dependent.

   Ce controle existe parce que la faute a ete commise dans ce depot : un second
   firestore.indexes.json avait ete cree a la racine avec deux index sur dix. Le
   deployer aurait efface les huit autres.

   node outils/controle-index.mjs
*/
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const ATTENDUS = [
  "reports|by:ASCENDING|createdAt:ASCENDING",
  "reports|storeId:ASCENDING|createdAt:ASCENDING",
  "reports|by:ASCENDING|huntCreditedBy:ASCENDING",
  "reports|by:ASCENDING|counted:ASCENDING",
  "reports|storeId:ASCENDING|drinkId:ASCENDING|type:ASCENDING|createdAt:DESCENDING",
  "referrals|parrain:ASCENDING|status:ASCENDING",
  "abus|etat:ASCENDING|at:DESCENDING",
  "conversations|members:CONTAINS|lastAt:DESCENDING",
  "stores|drinks:CONTAINS|lat:ASCENDING",
  "stores|drinksVerified:CONTAINS|lat:ASCENDING",
];
const REFERENCE = "functions-a-deployer/firestore.indexes.json";

let ko = 0;
const dit = (ok, quoi) => { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + quoi); };

const trouves = execSync(
  "git ls-files | grep -E '(^|/)firestore\\.indexes\\.json$' || true",
  { encoding: "utf8" }).trim().split("\n").filter(Boolean);

console.log("fichiers d'index suivis par git : " + (trouves.join(", ") || "aucun") + "\n");
dit(trouves.length === 1, "il n'y a qu'UN fichier d'index dans le depot");
dit(trouves.length === 1 && trouves[0] === REFERENCE, "et c'est " + REFERENCE);
dit(existsSync(REFERENCE), "le fichier de reference existe");

if (existsSync(REFERENCE)) {
  const d = JSON.parse(readFileSync(REFERENCE, "utf8"));
  const cle = (i) => i.collectionGroup + "|" +
    i.fields.map((f) => f.fieldPath + ":" + (f.order || f.arrayConfig || "")).join("|");
  const presents = new Set((d.indexes || []).map(cle));
  for (const a of ATTENDUS) dit(presents.has(a), "index present : " + a);
  const enTrop = [...presents].filter((x) => ATTENDUS.indexOf(x) === -1);
  if (enTrop.length) {
    console.log("\nindex presents mais inconnus de ce controle (ajoute-les a ATTENDUS si c'est voulu) :");
    enTrop.forEach((x) => console.log("   " + x));
  }
}
console.log("\n" + (ko ? ko + " probleme(s)" : "TOUT EST CONFORME"));
process.exit(ko ? 1 : 0);
