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
/* BREVO_API_KEY : le secours par courriel de sendToAdmins. Un secret n'arrive
   dans process.env que si la fonction qui s'en sert le DECLARE. Sans cette
   ligne, le secours resterait muet — et muet exactement le jour ou la poussee
   echoue, c'est-a-dire le seul jour ou il sert. */
const { defineSecret } = require("firebase-functions/params");
const BREVO_API_KEY = defineSecret("BREVO_API_KEY");
const { sendToAdmins } = require("./outils-admin");

/* RECONNAITRE UN PSEUDO TIRE AU SORT. Le generateur de l'app compose
   « Animal Adjectif NNN » a partir de deux listes fermees de douze mots. On
   recopie ces listes plutot que de deviner avec une expression vague : un
   simple motif « deux mots et trois chiffres » aurait pris « Clement Dupont
   404 » pour un tirage automatique, et le fondateur n'aurait jamais su que
   cette personne avait choisi son nom.

   SI LES LISTES CHANGENT UN JOUR dans index.html, il faut les changer ici
   aussi. Le pire cas est benin — une notification en moins, jamais une
   notification fausse — mais autant le savoir. */
const ANIMAUX = ["Jaguar", "Panthère", "Faucon", "Loup", "Cobra", "Lynx",
                 "Phénix", "Puma", "Condor", "Orque", "Grizzly", "Tigre"];
const QUALITES = ["Nocturne", "Solaire", "Éclair", "Sauvage", "Néon", "Cosmique",
                  "Polaire", "Ultra", "Mystique", "Turbo", "Magnétique", "Suprême"];
function pseudoTireAuSort(nom) {
  const m = /^(\S+) (\S+) (\d{3})$/.exec(String(nom || "").trim());
  if (!m) return false;
  return ANIMAUX.indexOf(m[1]) !== -1 && QUALITES.indexOf(m[2]) !== -1;
}

const REGION = "europe-west1";

exports.notifyAdminNewUser = onDocumentWritten(
  { document: "users/{uid}", region: REGION, secrets: [BREVO_API_KEY] },
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

    /* IL A CHOISI SON VRAI NOM. Un pseudo tire au hasard, c'est quelqu'un qui
       passe. Quelqu'un qui prend la peine de le remplacer par « Clement », il
       reste — c'est le premier signe d'engagement qu'une app recoit, et il
       arrivait jusqu'ici sans que personne le voie.

       On ne previent QUE dans ce sens-la : d'un nom tire au sort vers un nom
       choisi. Renommer ensuite « Clement » en « Clem » ne redeclenche rien,
       sinon la moindre correction de faute de frappe ferait sonner le
       telephone. Le mecanisme s'eteint donc tout seul apres le premier vrai
       choix, sans avoir a retenir quoi que ce soit. */
    const avant = String(before.pseudo || "");
    const apres = String(after.pseudo || "");
    if (avant !== apres && pseudoTireAuSort(avant) && !pseudoTireAuSort(apres) && apres.length >= 2) {
      await sendToAdmins("Un nouveau a choisi son nom",
        avant + " s'appelle maintenant " + apres);
    }
  }
);
