/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   LES DEUX LISTES DE PSEUDOS DOIVENT RESTER IDENTIQUES
   ----------------------------------------------------------------------------
   L'app fabrique les pseudos automatiques (« Tigre Polaire 664 ») à partir de
   deux listes fermées, dans index.html. notif-admin.js recopie ces mêmes listes
   pour reconnaître un pseudo tiré au sort — c'est ainsi qu'il sait prévenir le
   fondateur quand quelqu'un choisit VRAIMENT son nom.

   Pourquoi recopier plutôt que deviner : un motif vague du genre « deux mots
   suivis de trois chiffres » aurait pris « Clément Dupont 404 » pour un tirage
   automatique, et la notification qui compte le plus ne serait jamais partie.

   Le prix de cette exactitude, c'est ce couplage. Si quelqu'un ajoute un animal
   dans index.html sans toucher au serveur, la panne est silencieuse et
   bénigne — une notification en moins, jamais une notification fausse. Ce
   script la rend visible en une seconde.

   Lancer :  node functions-a-deployer/verifier-listes-pseudos.mjs
   Rend 0 si tout va bien, 1 sinon.
   ============================================================================ */

import { readFileSync } from "node:fs";

const app = readFileSync("index.html", "utf8");
const srv = readFileSync("functions-a-deployer/notif-admin.js", "utf8");

function listeApp(nom) {
  const m = new RegExp("var " + nom + "=\\[(.*?)\\];").exec(app);
  if (!m) throw new Error("liste « " + nom + " » introuvable dans index.html");
  return JSON.parse("[" + m[1] + "]");
}
function listeServeur(nom) {
  const m = new RegExp("const " + nom + " = \\[([\\s\\S]*?)\\];").exec(srv);
  if (!m) throw new Error("liste « " + nom + " » introuvable dans notif-admin.js");
  return JSON.parse("[" + m[1].replace(/\n/g, " ") + "]");
}

let ko = 0;
for (const [cote, serveur] of [["animaux", "ANIMAUX"], ["boissons", "QUALITES"]]) {
  const a = listeApp(cote), b = listeServeur(serveur);
  const memes = a.length === b.length && a.every((x, i) => x === b[i]);
  if (!memes) ko++;
  console.log((memes ? "ok    " : "ECHEC ") + "| " + cote + " (" + a.length + ") vs " +
              serveur + " (" + b.length + ")");
  if (!memes) {
    console.log("   dans l'app :", JSON.stringify(a));
    console.log("   au serveur :", JSON.stringify(b));
    const ecart = a.filter((x) => !b.includes(x)).concat(b.filter((x) => !a.includes(x)));
    console.log("   ecart      :", JSON.stringify(ecart));
  }
}
console.log(ko ? "\nLES LISTES DIVERGENT — la notification « a choisi son nom » va rater des cas."
               : "\nLes deux listes sont identiques, mot pour mot.");
process.exit(ko ? 1 : 0);
