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
const { getStorage } = require("firebase-admin/storage");
const { v1 } = require("@google-cloud/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const client = new v1.FirestoreAdminClient();

const PROJET = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
/* LE NOM DU SEAU NE SE DEVINE PLUS. Il etait ecrit en dur comme
   « <projet>.appspot.com ». C'etait vrai pour les anciens projets Firebase ;
   depuis fin 2024 le seau par defaut s'appelle « <projet>.firebasestorage.app »,
   et c'est le cas de Magofeed — sa propre configuration dit
   « magofeed-7f621.firebasestorage.app ». L'export serait donc parti vers un
   seau inexistant : Ilias aurait cru avoir des sauvegardes sans en avoir
   aucune, exactement le faux sentiment de securite que ce fichier dit vouloir
   eviter. On demande donc au SDK le seau REEL du projet, et on ne retombe sur
   un nom devine que s'il ne repond pas. Le nom retenu est journalise a chaque
   sauvegarde : en cas de doute, il est ecrit noir sur blanc. */
function seauDuProjet() {
  try {
    const b = getStorage().bucket();
    if (b && b.name) return "gs://" + b.name;
  } catch (e) { console.warn("seau par defaut introuvable:", e && e.message); }
  return "gs://" + PROJET + ".firebasestorage.app";
}
const BUCKET = seauDuProjet();
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
  console.log("sauvegarde (" + motif + ") lancee ->", dossier, "|", op.name,
              "| seau resolu:", BUCKET);
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

/* « LANCEE » N'EST PAS « REUSSIE ». exportDocuments ne fait que DEMARRER une
   operation longue : elle rend un identifiant, pas un resultat. Personne ne
   relisait jamais si l'export avait abouti, et le journal ne connaissait donc
   que « lancee » — un mot que l'ecran d'administration affichait en vert.
   Chaque passage verifie donc le precedent : c'est le seul moment ou l'on sait
   vraiment. Si l'operation a fini, l'etat devient « reussie » ou
   « echec-confirme » ; si on ne peut pas la relire, on ne touche a rien et on
   le dit plutot que d'inventer. */
async function verifierPrecedente() {
  try {
    const snap = await db.collection("_meta").doc("sauvegardes").get();
    const prec = snap.exists ? ((snap.data() || {}).derniere || null) : null;
    if (!prec || prec.etat !== "lancee" || !prec.operation) return;
    const [op] = await client.operationsClient.getOperation({ name: prec.operation });
    if (!op || !op.done) return;                    // encore en cours : on attend
    await db.collection("_meta").doc("sauvegardes").set({
      derniere: Object.assign({}, prec, op.error
        ? { etat: "echec-confirme", erreur: String(op.error.message || "").slice(0, 300) }
        : { etat: "reussie", finiLe: new Date().toISOString() })
    }, { merge: true });
    console.log("sauvegarde precedente :", op.error ? "ECHOUEE" : "reussie");
  } catch (e) { console.warn("verification precedente impossible:", e && e.message); }
}

exports.sauvegardeQuotidienne = onSchedule(
  { schedule: "0 3 * * *", timeZone: "Europe/Brussels", region: "europe-west1",
    timeoutSeconds: 540, retryCount: 2 },
  async () => {
    await verifierPrecedente();
    try {
      const r = await exporter("automatique");
      await noter({ quand: new Date().toISOString(), dossier: r.dossier, operation: r.operation,
                    etat: "lancee", motif: "automatique" });
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
    await verifierPrecedente();
    const r = await exporter("manuelle");
    await noter({ quand: new Date().toISOString(), dossier: r.dossier, operation: r.operation,
                  etat: "lancee", motif: "manuelle", par: uid });
    return { dossier: r.dossier };
  }
);
