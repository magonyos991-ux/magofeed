/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   COUPER LES SESSIONS DES AUTRES APPAREILS
   ----------------------------------------------------------------------------
   POURQUOI CE FICHIER EXISTE. Changer son mot de passe ne déconnecte PAS les
   autres appareils. Ce n'est pas une supposition : c'est mesuré, à l'émulateur
   Firebase Auth, dans functions-a-deployer/tests-regles/comptes.test.mjs.

       Scénario joué : quelqu'un obtient ton mot de passe et se connecte
       sur son téléphone. Tu t'en aperçois, tu passes par « mot de passe
       oublié », tu en choisis un neuf. Sa session à lui continue de vivre.

   Autrement dit, la seule action qu'une personne entreprend quand elle se sent
   piratée ne la protège de rien. C'est exactement l'inverse de ce qu'elle croit
   faire, et elle n'a aucun moyen de le savoir.

   CE QUE SEUL LE SERVEUR PEUT FAIRE. Révoquer les jetons de rafraîchissement
   demande l'Admin SDK (revokeRefreshTokens). Aucun code côté téléphone ne peut
   le faire — et c'est heureux, sinon n'importe qui déconnecterait n'importe qui.

   LA LIMITE À CONNAÎTRE, ET À DIRE. Un jeton d'identité déjà délivré reste
   valable jusqu'à UNE HEURE : Firebase ne le rappelle pas, il attend son
   expiration. La révocation agit sur le renouvellement. Donc « les autres
   appareils sont dehors » veut dire « au plus tard dans une heure », et l'app
   l'écrit ainsi plutôt que de promettre l'instantané.

   PARTICULARITÉ : la révocation vaut pour TOUS les jetons du compte, celui qui
   appelle compris. L'app rouvre donc une session juste après, avec le mot de
   passe qu'elle vient d'enregistrer — l'appareil courant reste connecté, les
   autres non.

   DÉPLOIEMENT (manuel, comme toutes les fonctions de ce dossier) :
       firebase deploy --only functions:revoquerMesSessions
   Tant qu'elle n'est pas en ligne, l'app le détecte et le DIT, au lieu de
   laisser croire que les autres appareils ont été déconnectés.
   ============================================================================ */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

if (!getApps().length) initializeApp();

const REGION = "europe-west1";

exports.revoquerMesSessions = onCall(
  { region: REGION, memory: "256MiB", maxInstances: 10 },
  async (req) => {
    /* Un compte anonyme n'a rien à révoquer, et surtout : la personne n'a
       jamais prouvé qui elle est. On refuse plutôt que de faire semblant. */
    if (!req.auth || !req.auth.uid) {
      throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");
    }
    const anonyme = !!(req.auth.token && req.auth.token.firebase &&
      req.auth.token.firebase.sign_in_provider === "anonymous");
    if (anonyme) {
      throw new HttpsError("failed-precondition", "Ce compte n'a pas de session à fermer.");
    }

    const uid = req.auth.uid;
    /* On ne révoque QUE le compte qui appelle. L'uid vient du jeton signé par
       Firebase, jamais d'un champ envoyé par le téléphone : sinon il suffirait
       d'écrire l'uid de quelqu'un d'autre pour le déconnecter en boucle. */
    await getAuth().revokeRefreshTokens(uid);

    const u = await getAuth().getUser(uid);
    console.log("revoquerMesSessions:", uid, "->", u.tokensValidAfterTime);
    return { ok: true, depuis: u.tokensValidAfterTime || null };
  },
);
