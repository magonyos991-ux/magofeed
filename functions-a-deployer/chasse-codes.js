/**
 * Magofeed — LA CHASSE AUX CODES-BARRES : la pose du lien.
 *
 * A QUOI CA SERT
 * Certaines fiches du catalogue sont nees d'une proposition PHOTO et n'ont donc
 * aucun code-barre : elles existent dans la recherche, elles ont parfois leur
 * image, mais scanner le produit qu'elles decrivent ne les trouve pas — et la
 * personne cree un doublon. La chasse demande a ceux qui font les courses de
 * les retrouver en rayon : ils ont le produit en main, c'est le seul moment ou
 * la reponse est certaine.
 *
 * POURQUOI CETTE FONCTION EXISTE PLUTOT QUE DE LAISSER LE TELEPHONE ECRIRE
 * Un code-barre FAUX est pire qu'un code absent. Une fiche sans code ne trouve
 * rien ; une fiche avec le mauvais code affirme une chose fausse, avec
 * assurance, a tout le monde, et le desaveu est individuel. Le catalogue est
 * donc en ecriture isAdmin() (firestore.rules), et c'est ici, avec l'Admin SDK,
 * qu'on pose le lien — a DEUX confirmations de personnes differentes.
 *
 * CE QUE LES REGLES GARANTISSENT DEJA, ET QU'ON NE REVERIFIE PAS ICI
 * chasseCodes/{barcode} n'accepte qu'une chose du client : s'ajouter soi-meme,
 * une seule fois, a la liste 'par'. Ni ajouter quelqu'un d'autre, ni changer la
 * boisson visee, ni se declarer valide. La liste qui arrive ici est donc une
 * liste d'uid distincts et reels.
 *
 * LES POINTS TOMBENT ICI, PAS AU MOMENT DE LA PROPOSITION.
 * Payer le geste plutot que le resultat, c'est installer une imprimante a
 * points : il suffirait de proposer n'importe quoi en boucle. On paie donc les
 * deux confirmants au moment ou le lien devient vrai — et une seule fois, le
 * verrou etant l'etat du document lui-meme.
 *
 * DEPLOIEMENT (~5 min)
 *   1) copier ce fichier dans le dossier functions
 *   2) ajouter dans index.js :
 *        Object.assign(exports, require("./chasse-codes"));
 *   3) firebase deploy --only functions:poserCodeChasse
 *   Rien a configurer : ni secret, ni webhook. La fonction se declenche seule
 *   sur l'ecriture d'une confirmation.
 *
 * SANS CETTE FONCTION, l'app marche quand meme : les confirmations
 * s'accumulent, le lien vaut deja pour l'appareil de qui a confirme, et
 * l'administrateur peut poser le code a la main depuis « Fiches sans
 * code-barre ». La fonction ne fait qu'automatiser le dernier pas.
 */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = "europe-west1";

/* Deux personnes differentes. Pas trois : au-dela, une boisson rare — et ce
   sont justement les rares qui manquent — n'atteindrait jamais le compte, et
   la chasse ne se terminerait pas. Pas une seule : un geste distrait suffirait
   a poser un lien faux pour tout le monde. */
const CONFIRMATIONS_REQUISES = 2;
const POINTS_PAR_CONFIRMANT = 5;

exports.poserCodeChasse = onDocumentWritten(
  { document: "chasseCodes/{barcode}", region: REGION, memory: "256MiB",
    timeoutSeconds: 60, maxInstances: 5 },
  async (event) => {
    const apres = event.data && event.data.after;
    if (!apres || !apres.exists) return;                 // suppression : rien a faire
    const d = apres.data() || {};

    if (d.etat !== "attente") return;                    // deja pose, ou classe sans suite
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return;     // pas encore assez

    const code = String(d.barcode || event.params.barcode || "");
    const drinkId = String(d.drinkId || "");
    if (!code || !drinkId) {
      console.warn("chasse : document incomplet", event.params.barcode);
      return;
    }

    /* VERROU. Deux confirmations peuvent arriver dans la meme seconde et
       declencher deux executions : sans transaction, le code serait pose deux
       fois et les points verses deux fois. Le passage 'attente' -> 'pose' ne
       peut reussir qu'une fois. */
    const ref = apres.ref;
    const aPoser = await db.runTransaction(async (t) => {
      const s = await t.get(ref);
      const v = s.exists ? (s.data() || {}) : {};
      if (v.etat !== "attente") return false;
      t.update(ref, { etat: "pose", poseLe: FieldValue.serverTimestamp() });
      return true;
    }).catch((e) => { console.warn("verrou chasse:", e && e.message); return false; });
    if (!aPoser) return;

    try {
      const fiche = await db.collection("catalog").doc(drinkId).get();
      if (!fiche.exists) {
        /* La fiche a disparu entre la proposition et maintenant (fusion,
           suppression). On ne recree rien : on classe et on ne paie personne
           pour un lien qui ne mene nulle part. */
        await ref.update({ etat: "sans-suite", raison: "fiche-absente" });
        console.warn("chasse : fiche catalogue absente", drinkId);
        return;
      }
      const codes = (fiche.data() || {}).barcodes || [];
      if (codes.indexOf(code) === -1) {
        await db.collection("catalog").doc(drinkId).set(
          { barcodes: codes.concat([code]), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      console.log("chasse : code pose", code, "->", drinkId, "par", par.length, "personnes");
    } catch (e) {
      /* La pose a echoue : on rouvre plutot que de laisser un document dit
         « pose » sur une fiche qui n'a rien recu. */
      console.error("chasse : pose du code:", e && e.message);
      try { await ref.update({ etat: "attente" }); } catch (e2) {}
      return;
    }

    /* Les points, maintenant que le lien est vrai. Chacun des confirmants, une
       fois. Un echec ici ne remet pas le lien en cause : le code est pose, et
       c'est lui qui compte. */
    for (const uid of par) {
      try {
        await db.collection("users").doc(String(uid)).set(
          { pts: FieldValue.increment(POINTS_PAR_CONFIRMANT) },
          { merge: true }
        );
      } catch (e) { console.warn("chasse : points a", uid, e && e.message); }
    }
  }
);
