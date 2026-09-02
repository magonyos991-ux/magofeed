/**
 * Magofeed — REMPLISSAGE DES ENSEIGNES, COTE SERVEUR.
 *
 * Avant, ce travail tournait dans le telephone de l'administrateur : l'app
 * lisait TOUTE la collection stores (des dizaines de milliers de magasins
 * depuis l'import mondial) pour trouver les Carrefour, Delhaize, etc. C'etait
 * long, ca imposait de garder l'ecran allume, et ca consommait le quota de
 * lectures Firestore du client.
 *
 * Ici, le meme travail tourne sur les serveurs de Firebase avec l'Admin SDK :
 * pas de quota client, pas de telephone allume, et des lots d'ecriture de 500.
 * L'app envoie les listes d'identifiants par enseigne (elles viennent du
 * catalogue, que seul le client connait) ; la fonction verifie que l'appelant
 * est bien administrateur avant de toucher quoi que ce soit.
 *
 * Deploiement : copier ce fichier dans ton dossier functions, ajouter dans
 * index.js :  Object.assign(exports, require("./remplir-enseignes"));
 * puis :      firebase deploy --only functions:remplirEnseignes
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();

function normTxt(t) {
  return String(t == null ? "" : t).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Detecte l'enseigne d'un magasin — meme logique que dans l'app.
const CHAINES = [
  ["carrefour", (b) => b.includes("carrefour")],
  ["delhaize", (b) => b.includes("delhaize")],
  ["colruyt", (b) => b.includes("colruyt")],
  ["auchan", (b) => b.includes("auchan")],
  ["leclerc", (b) => b.includes("leclerc")],
  ["intermarche", (b) => b.includes("intermarch")],
  ["monoprix", (b) => b.includes("monoprix") || b.includes("monop")],
  ["coursesu", (b) => b.includes("super u") || b.includes("hyper u") || b.includes("u express")],
  ["cora", (b) => b.includes("cora") || b.includes("houra")],
  ["franprix", (b) => b.includes("franprix")],
  ["albertheijn", (b) => b.includes("albert heijn") || b.includes("ah ") || b === "ah"],
  ["okay", (b) => b.includes("okay")],
  ["jumbo", (b) => b.includes("jumbo")],
];

exports.remplirEnseignes = onCall(
  { region: "europe-west1", timeoutSeconds: 540, memory: "512MiB" },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const adm = await db.collection("admins").doc(uid).get();
    if (!adm.exists) throw new HttpsError("permission-denied", "Réservé à l'administrateur.");

    const sets = (req.data && req.data.sets) || {};
    // Validation stricte : uniquement des tableaux d'entiers, tailles bornees.
    const propre = {};
    for (const k of Object.keys(sets)) {
      if (!CHAINES.some(([c]) => c === k)) continue;
      const ids = [...new Set((sets[k] || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1200);
      if (ids.length) propre[k] = ids;
    }
    if (!Object.keys(propre).length) throw new HttpsError("invalid-argument", "Aucune liste valide.");

    const counts = {}; let parcourus = 0, modifies = 0;
    let last = null;
    for (;;) {
      let q = db.collection("stores").orderBy("__name__").limit(600);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      let batch = db.batch(), n = 0;
      for (const d of snap.docs) {
        parcourus++;
        const v = d.data() || {};
        const b = normTxt((v.brand || "") + " " + (v.name || ""));
        const hit = CHAINES.find(([key, test]) => propre[key] && test(b));
        if (!hit) continue;
        const ids = propre[hit[0]];
        batch.update(d.ref, {
          drinks: FieldValue.arrayUnion(...ids),
          drinksVerified: FieldValue.arrayUnion(...ids),
          verifiedSource: "catalogue enseigne (serveur, " +
            new Date().toISOString().slice(0, 7) + ")",
        });
        counts[hit[0]] = (counts[hit[0]] || 0) + 1;
        modifies++;
        if (++n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
      }
      if (n) await batch.commit();
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 600) break;
    }
    console.log("remplirEnseignes:", parcourus, "parcourus,", modifies, "modifies", counts);
    return { parcourus, modifies, counts };
  }
);
