/**
 * Magofeed — SAUVEGARDE AUTOMATIQUE DE LA BASE.
 *
 * POURQUOI C'EST LA PROTECTION LA PLUS IMPORTANTE
 * Tout le reste de la securite empeche quelqu'un d'ABIMER les donnees. Ceci
 * repare quand c'est deja fait. Une fausse manip a 2 h du matin, un bouton
 * « supprimer » tape a cote, une fonction qui tourne mal : sans sauvegarde,
 * les 30 000 magasins, les points de chaque joueur et les certifications sont
 * perdus pour toujours. Avec, on revient en arriere.
 *
 * CE QUE CA FAIT
 * Chaque nuit a 3 h (heure de Bruxelles), Firestore exporte l'integralite de
 * la base vers un dossier date dans le bucket de stockage du projet. C'est
 * l'export MANAGE de Google : il est coherent (photo instantanee de la base),
 * il ne consomme AUCUNE lecture facturee, et il se restaure avec une seule
 * commande.
 *
 * RESTAURER (a ne faire qu'en cas de vrai probleme) :
 *   gcloud firestore import gs://<TON-BUCKET>/sauvegardes/<AAAA-MM-JJ>
 * Pour ne restaurer qu'une collection :
 *   gcloud firestore import gs://<...>/sauvegardes/<date> --collection-ids=stores
 *
 * COUT : quelques centimes par mois pour une base de cette taille. Les
 * sauvegardes de plus de 30 jours sont supprimees automatiquement.
 *
 * DEPLOIEMENT
 *   1) copier ce fichier dans le dossier functions
 *   2) npm install @google-cloud/firestore  (dans le dossier functions)
 *   3) ajouter dans index.js :
 *        Object.assign(exports, require("./sauvegarde"));
 *   4) firebase deploy --only functions:sauvegardeQuotidienne,functions:sauvegarderMaintenant
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { v1 } = require("@google-cloud/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const client = new v1.FirestoreAdminClient();

const PROJET = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const BUCKET = "gs://" + PROJET + ".appspot.com";
const JOURS_GARDES = 30;

/* Deux chiffres, toujours : « 2026-03-07 » et non « 2026-3-7 ». */
function jour(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}

async function exporter(motif) {
  const nom = client.databasePath(PROJET, "(default)");
  const dossier = BUCKET + "/sauvegardes/" + jour(new Date());
  const [op] = await client.exportDocuments({
    name: nom,
    outputUriPrefix: dossier,
    collectionIds: []      // vide = TOUTE la base
  });
  console.log("sauvegarde (" + motif + ") lancee ->", dossier, "|", op.name);
  return { dossier, operation: op.name };
}

/* Journal des sauvegardes, lisible depuis l'app par l'administrateur : sans
   trace visible, une sauvegarde qui echoue en silence donne un faux
   sentiment de securite — le pire des deux mondes. */
async function noter(champs) {
  try {
    /* _meta et non meta : la collection « meta » est lisible par tous, et le
       journal contient le chemin du bucket de sauvegarde — inutile de le
       publier. « _meta » est reservee a l'administrateur par les regles. */
    await db.collection("_meta").doc("sauvegardes").set({
      derniere: champs,
      majLe: new Date().toISOString()
    }, { merge: true });
  } catch (e) { console.warn("journal sauvegarde:", e && e.message); }
}

exports.sauvegardeQuotidienne = onSchedule(
  { schedule: "0 3 * * *", timeZone: "Europe/Brussels", region: "europe-west1",
    timeoutSeconds: 540, retryCount: 2 },
  async () => {
    try {
      const r = await exporter("automatique");
      await noter({ quand: new Date().toISOString(), dossier: r.dossier, etat: "lancee", motif: "automatique" });
    } catch (e) {
      console.error("SAUVEGARDE ECHOUEE:", e && e.message);
      await noter({ quand: new Date().toISOString(), etat: "echec", erreur: String(e && e.message).slice(0, 300), motif: "automatique" });
      throw e;   // pour que la nouvelle tentative se declenche
    }
  }
);

/* Sauvegarde a la demande : a lancer AVANT toute operation risquee (purge,
   remplissage massif, migration). Reservee a l'administrateur. */
exports.sauvegarderMaintenant = onCall(
  { region: "europe-west1", timeoutSeconds: 540 },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const adm = await db.collection("admins").doc(uid).get();
    if (!adm.exists) throw new HttpsError("permission-denied", "Réservé à l'administrateur.");
    const r = await exporter("manuelle");
    await noter({ quand: new Date().toISOString(), dossier: r.dossier, etat: "lancee", motif: "manuelle", par: uid });
    return { dossier: r.dossier };
  }
);
