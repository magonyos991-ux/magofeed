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
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
if (!getApps().length) initializeApp();
const db = getFirestore();
const { sendToAdmins, jetonsDe } = require("./outils-admin");

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

/* ══ TESTER LA CHAINE D'ALERTE, SEUL ═══════════════════════════════════════
   « Quand quelqu'un ouvre l'app via le lien, je ne recois rien. » Pour le
   verifier, il fallait jusqu'ici qu'un inconnu cree un compte : impossible a
   provoquer, donc impossible a corriger. Et le test evident — ouvrir l'app
   soi-meme sur son PC — ne peut PAS marcher : notifyAdminNewUser ne part qu'a
   la CREATION du document, et une session deja connectee n'en cree aucun.
   On a donc passe des mois a tester une chose qui ne pouvait pas sonner.

   Cette fonction envoie une vraie alerte, par le meme chemin exactement, et
   rend les chiffres bruts : combien d'administrateurs, combien de jetons,
   combien de poussees parties, le secours a-t-il ecrit, et le code d'erreur
   exact de Google s'il y en a un. Un seul geste, une reponse sans ambiguite.

   Elle N'INVENTE RIEN : si la poussee part vraiment, le telephone sonne
   vraiment. Si elle ne part pas, l'ecran dit laquelle des cinq causes bloque. */
exports.testerAlerteAdmin = onCall(
  { region: REGION, secrets: [BREVO_API_KEY] },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
    const moi = await db.doc(`admins/${uid}`).get();
    if (!moi.exists) throw new HttpsError("permission-denied", "Reserve a l'administrateur.");

    /* L'ETAT AVANT L'ENVOI. sendToAdmins ne dit pas combien d'administrateurs
       existent — seulement combien avaient un jeton. Or « 0 jeton » et
       « 0 administrateur » demandent deux reparations differentes. */
    let nbAdmins = 0, nbJetons = 0;
    let jaiUnJeton = false;
    /* MES APPAREILS, NOMMES. C'est l'information qui manquait et qui a coute
       des semaines : pushTokens/{uid} ne portait qu'un jeton, sans dire a quel
       appareil il appartenait. Ouvrir Magofeed sur son ordinateur suffisait a
       prendre la place du telephone, et l'ecran annoncait « poussee partie »
       en toute bonne foi. Desormais chaque appareil a son entree, et on les
       montre : « iPhone · Safari, vu le 28/11 » dit tout de suite si le
       telephone qu'on tient dans la main est encore dans la liste. */
    let mesAppareils = [];
    let lectureAdmins = false;
    try {
      const admins = await db.collection("admins").get();
      nbAdmins = admins.size;
      lectureAdmins = true;
      for (const a of admins.docs) {
        const liste = await jetonsDe(a.id);
        nbJetons += liste.length;
        if (a.id === uid) {
          jaiUnJeton = liste.length > 0;
          mesAppareils = liste.map((j) => String(j.appareil || "appareil non nomme")).slice(0, 8);
        }
      }
    } catch (e) { /* on envoie quand meme : le resultat reel vaut mieux qu'un compte */ }

    /* L'ADRESSE DU SECOURS. Le secours lit l'e-mail du compte Firebase Auth,
       pas le profil. Un administrateur sans adresse la-bas n'a aucun secours
       possible, et rien ne le disait. On la rend a l'interesse lui-meme, qui
       la connait deja — nulle part ailleurs. */
    let adresseSecours = "";
    try { const u = await getAuth().getUser(uid); adresseSecours = String((u && u.email) || ""); }
    catch (e) {}

    const r = await sendToAdmins("Test d'alerte Magofeed",
      "Si tu lis ceci, la chaine d'alerte fonctionne de bout en bout.", uid);

    /* CE QUE L'ECRAN A LE DROIT D'AFFIRMER, ET RIEN DE PLUS.
       « poussees » comptait les envois acceptes par Google POUR TOUS LES
       ADMINISTRATEURS CONFONDUS. Le 28 novembre il valait 1, l'ecran a conclu
       « ta poussee est partie, va voir tes reglages iOS », et c'etait faux :
       l'envoi concernait un autre appareil. On separe donc ce qui m'est arrive
       (« mesPoussees ») de ce qui est arrive en tout, et on dit lequel. */
    const m = (r && r.moi) || { appareils: 0, parties: 0, courriel: false };
    return {
      admins: nbAdmins,
      lectureAdmins: lectureAdmins,
      jetons: nbJetons,
      jaiUnJeton: jaiUnJeton,
      mesAppareils: mesAppareils,
      mesPoussees: m.parties || 0,
      mesJetons: m.appareils || 0,
      monCourriel: !!m.courriel,
      adresseSecours: adresseSecours,
      poussees: (r && r.parties) || 0,
      courriel: !!(r && r.courriel),
      courriels: (r && r.courriels) || 0,
      echecs: (r && r.echecs) || []
    };
  }
);
