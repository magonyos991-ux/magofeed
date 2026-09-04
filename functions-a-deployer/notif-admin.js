/**
 * Magofeed — prevenir l'administrateur d'une nouvelle inscription.
 *
 * Origine : ce code tournait en production depuis le 26 juillet 2026 sans
 * qu'aucune copie n'existe dans le depot. Il a ete recupere le 4 septembre
 * 2026 depuis la source deployee, avant que le nettoyage des dossiers ne le
 * fasse disparaitre pour de bon.
 *
 * Le declencheur est onDocumentWritten et non onDocumentCreated : lier son
 * compte Google ne cree pas le profil, ca le MET A JOUR. Avec
 * onDocumentCreated, la liaison Gmail n'aurait jamais ete signalee. En
 * contrepartie la fonction se declenche a chaque ecriture de profil, d'ou les
 * deux tests ci-dessous qui la font sortir tout de suite dans les autres cas :
 * le gel des soldes, par exemple, a ecrit dans 115 profils d'un coup sans
 * envoyer la moindre notification.
 */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { sendToAdmins } = require("./outils-admin");

const REGION = "europe-west1";

exports.notifyAdminNewUser = onDocumentWritten(
  { document: "users/{uid}", region: REGION },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;                       // suppression de compte : rien a annoncer
    const pseudo = String(after.pseudo || "Explorateur").slice(0, 24);

    if (!before) {
      await sendToAdmins("Nouvel utilisateur Magofeed",
        pseudo + " vient d'ouvrir l'app pour la premiere fois");
      return;
    }
    if (!before.email && after.email) {
      await sendToAdmins("Compte Google lie",
        pseudo + " a connecte son Gmail (" + String(after.email).slice(0, 60) + ")");
    }
  }
);
