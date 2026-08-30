/**
 * Magofeed — VERIFICATION D'UN COMMERCANT PAR LE PAIEMENT.
 *
 * A QUOI CA SERT
 * Quand quelqu'un dit « je tiens ce magasin », il faut le croire ou le
 * verifier. Le verifier a la main coute du temps a chaque demande et ne monte
 * pas en charge. Le verifier par un paiement coute une seule chose au
 * commercant : une petite somme, une fois — et sa banque a deja verifie son
 * identite pour nous. C'est la meme idee que le prelevement d'un euro que font
 * les plateformes de location.
 *
 * CE N'EST PAS UNE SOURCE DE REVENUS. Le montant est volontairement minuscule.
 * Le compte commercant reste gratuit : horaires, rayon, tableau de bord.
 *
 * ⚠️ CE QUE CE FICHIER NE PEUT PAS FAIRE POUR TOI
 * Encaisser de l'argent en Belgique demande un numero d'entreprise (BCE) et un
 * compte Stripe a ce nom. Tant que tu n'as pas ca, NE DEPLOIE PAS ce fichier :
 * l'app continue de fonctionner avec la procedure manuelle, qui marche.
 * Rien dans l'app ne casse s'il n'est pas deploye — le bouton de paiement ne
 * s'affiche simplement pas.
 *
 * CE QUE CA POSE, ET CE QUE CA NE POSE PAS
 * Un paiement reussi prouve UNE chose : qui tient la boutique. Il pose donc
 * 'certified' (« tenu par son gerant ») et la fiche privee merchants/{uid}.
 * Il ne pose JAMAIS 'drinksVerified' (« rayon vu sur place », un fait
 * constate) ni 'partner' (« mis en avant », de la publicite). Ces trois
 * signaux sont separes dans l'app exactement pour cette raison : on ne vend
 * pas une phrase qu'on n'a pas verifiee.
 *
 * DEPLOIEMENT (le jour ou tu auras ton numero d'entreprise)
 *   1) copier ce fichier dans le dossier functions
 *   2) npm install stripe            (dans le dossier functions)
 *   3) firebase functions:secrets:set STRIPE_CLE
 *        -> colle ta cle secrete Stripe (sk_live_... ou sk_test_...)
 *      firebase functions:secrets:set STRIPE_WEBHOOK
 *        -> colle la cle de signature du webhook (whsec_...), donnee par
 *           Stripe quand tu crees le webhook a l'etape 5
 *      NE COLLE JAMAIS CES CLES DANS UN FICHIER NI DANS UNE CONVERSATION.
 *   4) ajouter dans index.js :
 *        Object.assign(exports, require("./verification-commercant"));
 *   5) firebase deploy --only functions:ouvrirVerificationCommercant,functions:stripeWebhook
 *      puis, dans le tableau de bord Stripe -> Developpeurs -> Webhooks,
 *      ajouter l'adresse affichee par le deploiement pour stripeWebhook,
 *      en ecoutant l'evenement « checkout.session.completed ».
 *   6) Refais l'etape 3 pour STRIPE_WEBHOOK avec la cle que Stripe vient de
 *      donner, puis redeploie stripeWebhook.
 */
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = "europe-west1";
const STRIPE_CLE = defineSecret("STRIPE_CLE");
const STRIPE_WEBHOOK = defineSecret("STRIPE_WEBHOOK");

/* Montant de la verification, en centimes. Un euro : assez pour qu'une vraie
   carte bancaire soit engagee, assez peu pour n'arreter aucun commercant
   honnete. Change-le ici si besoin, il n'est ecrit nulle part ailleurs. */
/* ⚠️ LES FRAIS COMPTENT ENORMEMENT SUR UN PETIT MONTANT. Stripe prend une
   commission fixe PLUS un pourcentage : sur 1 euro, la part fixe mange
   l'essentiel, et il te reste environ 70 centimes. Ce n'est pas grave — ce
   paiement n'est pas la pour gagner de l'argent, mais pour verifier une
   identite, et 30 centimes est un prix derisoire pour ca. Sache seulement que
   ce n'est PAS une source de revenus, et ne compte jamais dessus comme telle.
   Les tarifs exacts sont sur stripe.com/be/pricing : verifie-les toi-meme
   plutot que de me croire, ils changent. */
const MONTANT_CENTIMES = 100;
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

/* ─────────────────────────────────────────────────────────────────────────
   1) OUVRIR LA VERIFICATION : renvoie l'adresse de la page de paiement.
   ───────────────────────────────────────────────────────────────────────── */
exports.ouvrirVerificationCommercant = onCall(
  { region: REGION, secrets: [STRIPE_CLE], memory: "256MiB", timeoutSeconds: 30,
    maxInstances: 5 },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");

    /* Un compte anonyme disparait a la moindre reinstallation : la boutique
       resterait attachee a un compte qui n'existe plus, et son vrai gerant
       perdrait son tableau de bord. Meme regle que pour les demandes. */
    const anonyme = req.auth.token && req.auth.token.firebase
      && req.auth.token.firebase.sign_in_provider === "anonymous";
    if (anonyme) {
      throw new HttpsError("permission-denied",
        "Cree un vrai compte (Google ou e-mail) avant de verifier ta boutique.");
    }

    const storeId = String((req.data && req.data.storeId) || "");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(storeId)) {
      throw new HttpsError("invalid-argument", "Magasin invalide.");
    }

    const snap = await db.collection("stores").doc(storeId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Ce magasin n'existe pas.");
    const magasin = snap.data() || {};

    /* Deja tenu par quelqu'un ? On ne prend pas l'argent de quelqu'un pour une
       boutique qu'il n'obtiendra pas. Une boutique qui change de main passe
       par la revocation, cote administration. */
    if (magasin.certified === true) {
      throw new HttpsError("already-exists",
        "Ce magasin est deja tenu par un gerant verifie. Ecris-nous si c'est le tien.");
    }

    const Stripe = require("stripe");
    const stripe = new Stripe(STRIPE_CLE.value());

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      /* PAS de payment_method_types en dur. En le fixant a « card », on
         excluait Bancontact — le moyen de paiement que la plupart des Belges
         utilisent vraiment, et que beaucoup de petits commercants ont a la
         place d'une carte de credit. En l'omettant, Stripe propose ce qui est
         active dans TON tableau de bord : tu ajoutes ou retires un moyen de
         paiement sans jamais retoucher a ce fichier. Va l'activer dans
         Stripe -> Reglages -> Moyens de paiement. */
      /* metadata : c'est ce que le webhook relira. Stripe nous le rend tel
         quel, signe — c'est le seul lien fiable entre le paiement et le
         compte, et il ne transite jamais par le navigateur. */
      metadata: { uid: uid, storeId: storeId },
      client_reference_id: uid,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: MONTANT_CENTIMES,
          product_data: {
            name: "Verification de commercant - " + String(magasin.name || "ma boutique").slice(0, 60),
            description: "Confirme que tu tiens bien ce commerce. Le compte commercant est gratuit."
          }
        }
      }],
      success_url: APP_URL + "?verif=ok",
      cancel_url: APP_URL + "?verif=annule"
    });

    /* Trace cote base, pour retrouver un paiement sans ouvrir Stripe. Aucune
       donnee de carte : Stripe ne nous en transmet aucune, et on n'en veut
       aucune. */
    try {
      await db.collection("verifications").doc(session.id).set({
        uid: uid, storeId: storeId, etat: "ouverte",
        montant: MONTANT_CENTIMES, quand: FieldValue.serverTimestamp()
      });
    } catch (e) { console.warn("trace verification:", e && e.message); }

    return { ok: true, url: session.url };
  }
);

/* ─────────────────────────────────────────────────────────────────────────
   2) LE WEBHOOK : c'est LUI qui accorde la certification, jamais le client.
   ───────────────────────────────────────────────────────────────────────── */
exports.stripeWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_CLE, STRIPE_WEBHOOK], memory: "256MiB",
    timeoutSeconds: 60, maxInstances: 10 },
  async (req, res) => {
    const Stripe = require("stripe");
    const stripe = new Stripe(STRIPE_CLE.value());

    let evenement;
    try {
      /* LA LIGNE QUI COMPTE. Sans verification de signature, n'importe qui
         pourrait envoyer « paiement reussi » a cette adresse et se certifier
         gratuitement. req.rawBody est fourni par Cloud Functions ; il faut le
         corps BRUT, pas le JSON deja analyse. */
      evenement = stripe.webhooks.constructEvent(
        req.rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK.value()
      );
    } catch (e) {
      console.warn("signature webhook invalide:", e && e.message);
      res.status(400).send("signature invalide");
      return;
    }

    if (evenement.type !== "checkout.session.completed") {
      res.status(200).send("ignore");
      return;
    }

    const session = evenement.data.object || {};
    const meta = session.metadata || {};
    const uid = String(meta.uid || "");
    const storeId = String(meta.storeId || "");
    if (!uid || !/^[A-Za-z0-9_-]{1,80}$/.test(storeId)) {
      res.status(200).send("metadonnees absentes");
      return;
    }
    if (session.payment_status !== "paid") {
      res.status(200).send("non paye");
      return;
    }

    /* IDEMPOTENCE. Stripe renvoie un webhook plusieurs fois quand il n'a pas
       recu de reponse assez vite. Sans ce verrou, la meme verification serait
       traitee deux fois. Le document porte l'identifiant de la session, qui
       est unique. */
    const ref = db.collection("verifications").doc(session.id);
    const deja = await db.runTransaction(async (t) => {
      const s = await t.get(ref);
      if (s.exists && (s.data() || {}).etat === "payee") return true;
      t.set(ref, {
        uid: uid, storeId: storeId, etat: "payee",
        montant: session.amount_total || MONTANT_CENTIMES,
        payeLe: FieldValue.serverTimestamp()
      }, { merge: true });
      return false;
    });
    if (deja) { res.status(200).send("deja traite"); return; }

    try {
      const snap = await db.collection("stores").doc(storeId).get();
      if (!snap.exists) {
        console.warn("magasin disparu entre le paiement et le webhook:", storeId);
        res.status(200).send("magasin absent");
        return;
      }
      if ((snap.data() || {}).certified === true) {
        /* Quelqu'un d'autre a ete certifie entre-temps. On ne recouvre pas :
           on le note pour pouvoir rembourser. */
        await ref.set({ etat: "a-rembourser", raison: "deja-certifie" }, { merge: true });
        console.warn("a rembourser (deja certifie):", session.id);
        res.status(200).send("a rembourser");
        return;
      }

      /* Le paiement prouve QUI tient la boutique. Il pose donc 'certified' et
         la fiche privee — et rien d'autre. Ni drinksVerified (un fait
         constate en rayon), ni partner (de la publicite). */
      await db.collection("stores").doc(storeId).set({
        certified: true,
        certifiedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      await db.collection("merchants").doc(uid).set({
        stores: FieldValue.arrayUnion(storeId),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      await db.collection("shopClaims").doc(storeId).set({
        storeId: storeId, by: uid, status: "approved",
        voie: "paiement", decidedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      console.log("commercant verifie par paiement:", uid, storeId);
      res.status(200).send("ok");
    } catch (e) {
      /* On repond 500 pour que Stripe reessaie : le paiement est encaisse, la
         certification DOIT finir par etre posee. */
      console.error("pose de la certification:", e && e.message);
      await ref.set({ etat: "erreur", message: String(e && e.message).slice(0, 200) }, { merge: true });
      res.status(500).send("erreur");
    }
  }
);
