/**
 * Magofeed — LE DON (soutenir le projet).
 *
 * A QUOI CA SERT
 * Magofeed est gratuit et le restera. Mais l'heberger coute, et le construire
 * prend du temps. Cette fonction ouvre une page de paiement Stripe pour qui
 * veut donner un coup de main — 50 centimes ou 5 euros, c'est la personne qui
 * choisit. Rien n'est vendu en echange : pas d'avantage, pas de points, pas de
 * fonction reservee. Un don qui achete quelque chose n'est plus un don, c'est
 * un achat, avec les regles des boutiques d'applications qui vont avec.
 *
 * ⚠️ CE QUE CE FICHIER NE PEUT PAS FAIRE POUR TOI
 * Encaisser de l'argent en Belgique demande un numero d'entreprise (BCE) et un
 * compte Stripe a ce nom. Tant que tu n'as pas ca, NE DEPLOIE PAS ce fichier.
 * Et surtout : TU N'AS PAS BESOIN DE LUI POUR RECEVOIR TON PREMIER DON. Une
 * page de don toute faite (Stripe Payment Link, Ko-fi, Liberapay, Buy Me a
 * Coffee) se cree en cinq minutes et l'app sait deja s'en servir : il suffit
 * de coller son adresse dans DON_LIEN, dans index.html. Ce fichier-ci ne sert
 * que le jour ou tu veux le paiement DANS l'app, avec le choix du montant.
 *
 * CE QU'UN DON NE DONNE PAS
 * Il ne pose aucun droit, aucun badge de confiance, aucune certification. Le
 * seul effet cote app : on arrete de te redemander (soutiens/{uid}), et on te
 * dit merci. C'est deliberé — voir plus bas.
 *
 * DEPLOIEMENT (le jour ou tu auras ton numero d'entreprise)
 *   1) copier ce fichier dans le dossier functions
 *   2) npm install stripe            (dans le dossier functions)
 *   3) firebase functions:secrets:set STRIPE_CLE
 *        -> colle ta cle secrete Stripe (sk_live_... ou sk_test_...)
 *      NE COLLE JAMAIS CETTE CLE DANS UN FICHIER NI DANS UNE CONVERSATION.
 *   4) ajouter dans index.js :
 *        Object.assign(exports, require("./dons"));
 *   5) firebase deploy --only functions:ouvrirDon,functions:donWebhook
 *      puis, dans le tableau de bord Stripe -> Developpeurs -> Webhooks,
 *      ajouter l'adresse affichee pour donWebhook, en ecoutant l'evenement
 *      « checkout.session.completed ».
 *   6) firebase functions:secrets:set STRIPE_WEBHOOK_DON
 *        -> colle la cle de signature (whsec_...) que Stripe vient de donner,
 *           puis redeploie donWebhook.
 *   7) dans index.html, passe DON_FONCTION a true.
 *
 * POURQUOI UN WEBHOOK SEPARE DE stripeWebhook
 * Stripe accepte plusieurs adresses de webhook, chacune avec sa propre cle de
 * signature. En separant, tu peux deployer les dons sans toucher a la
 * verification des commercants, et l'inverse. Deux fonctions qui portent le
 * meme nom dans index.js s'ecraseraient l'une l'autre : c'est aussi pour ca.
 */
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = "europe-west1";
const STRIPE_CLE = defineSecret("STRIPE_CLE");
const STRIPE_WEBHOOK_DON = defineSecret("STRIPE_WEBHOOK_DON");

const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

/* Les montants proposes, en centimes. Le client envoie un montant, on ne le
   croit pas : on verifie qu'il est dans cette liste. Sinon n'importe qui
   pourrait ouvrir une page a 0 centime (Stripe la refuse) ou a 9 999 euros
   (et se plaindre ensuite). Ajoute ou retire des montants ici, c'est le seul
   endroit ou ils sont ecrits cote serveur.
   ⚠️ LES FRAIS PESENT ENORMEMENT SUR UN PETIT MONTANT. Stripe prend une part
   FIXE plus un pourcentage : sur 50 centimes, la part fixe mange environ la
   moitie. Ce n'est pas une raison de refuser un petit don — quelqu'un qui
   donne 50 centimes te dit quelque chose que l'argent ne dit pas — mais ne
   construis jamais un budget la-dessus. Tarifs exacts : stripe.com/be/pricing,
   va les lire toi-meme, ils changent. */
const MONTANTS_AUTORISES = [50, 100, 200, 500, 1000];

/* ─────────────────────────────────────────────────────────────────────────
   1) OUVRIR LE DON : renvoie l'adresse de la page de paiement Stripe.
   ───────────────────────────────────────────────────────────────────────── */
exports.ouvrirDon = onCall(
  { region: REGION, secrets: [STRIPE_CLE], memory: "256MiB", timeoutSeconds: 30,
    maxInstances: 5 },
  async (req) => {
    /* Pas de connexion exigee. Quelqu'un qui veut donner 50 centimes n'a pas a
       creer un compte d'abord : ce serait le meilleur moyen de le perdre en
       route. Un compte anonyme suffit, et meme personne du tout. On garde
       seulement l'uid quand il existe, pour arreter de lui redemander. */
    const uid = (req.auth && req.auth.uid) || "";
    /* CE QUE CA COUTE DE NE PAS EXIGER DE COMPTE : n'importe qui peut appeler
       cette fonction et faire creer des sessions Stripe a la chaine. Ce n'est
       pas grave — une session non payee ne coute rien, chez Stripe comme chez
       nous — et maxInstances plafonne les degats. Le prix a payer pour ne pas
       perdre en route quelqu'un qui voulait juste donner 50 centimes. */

    const montant = Math.round(Number((req.data && req.data.montant) || 0));
    if (MONTANTS_AUTORISES.indexOf(montant) === -1) {
      throw new HttpsError("invalid-argument", "Montant non propose.");
    }

    const Stripe = require("stripe");
    const stripe = new Stripe(STRIPE_CLE.value());

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      /* PAS de payment_method_types en dur : en le fixant a « card », on
         excluait Bancontact, que la plupart des Belges utilisent vraiment.
         En l'omettant, Stripe propose ce qui est active dans TON tableau de
         bord -> Reglages -> Moyens de paiement. */
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: montant,
          product_data: {
            name: "Soutien a Magofeed",
            /* Cette phrase est lue par la personne sur la page Stripe, et
               relue par sa banque en cas de litige. Elle doit etre exacte :
               un don ne donne rien en echange, et le dire ici evite les
               contestations autant que les malentendus. */
            description: "Don libre. L'app reste gratuite et rien n'est debloque en echange."
          }
        }
      }],
      ...(uid ? { metadata: { uid: uid, type: "don" }, client_reference_id: uid }
              : { metadata: { type: "don" } }),
      success_url: APP_URL + "?don=merci",
      cancel_url: APP_URL + "?don=annule"
    });

    /* Trace cote base, pour retrouver un don sans ouvrir Stripe. Aucune donnee
       de carte : Stripe ne nous en transmet aucune, et on n'en veut aucune. */
    try {
      await db.collection("dons").doc(session.id).set({
        uid: uid || null, etat: "ouverte", montant: montant,
        quand: FieldValue.serverTimestamp()
      });
    } catch (e) { console.warn("trace don:", e && e.message); }

    return { ok: true, url: session.url };
  }
);

/* ─────────────────────────────────────────────────────────────────────────
   2) LE WEBHOOK : c'est LUI qui enregistre le don, jamais le navigateur.
   Le navigateur revient sur « ?don=merci » et l'app dit merci — mais cette
   adresse se tape a la main : elle ne prouve rien, et elle n'ecrit rien.
   ───────────────────────────────────────────────────────────────────────── */
exports.donWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_CLE, STRIPE_WEBHOOK_DON], memory: "256MiB",
    timeoutSeconds: 60, maxInstances: 10 },
  async (req, res) => {
    const Stripe = require("stripe");
    const stripe = new Stripe(STRIPE_CLE.value());

    let evenement;
    try {
      /* LA LIGNE QUI COMPTE. Sans verification de signature, n'importe qui
         pourrait envoyer « don recu » a cette adresse. req.rawBody est fourni
         par Cloud Functions : il faut le corps BRUT, pas le JSON analyse. */
      evenement = stripe.webhooks.constructEvent(
        req.rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK_DON.value()
      );
    } catch (e) {
      console.warn("signature webhook don invalide:", e && e.message);
      res.status(400).send("signature invalide");
      return;
    }

    if (evenement.type !== "checkout.session.completed") {
      res.status(200).send("ignore");
      return;
    }

    const session = evenement.data.object || {};
    const meta = session.metadata || {};
    /* Cette adresse ne traite QUE les dons. Si un jour les deux webhooks sont
       pointes sur la meme adresse par erreur, on ne veut pas qu'un don
       certifie une boutique, ni l'inverse. */
    if (meta.type !== "don") { res.status(200).send("pas un don"); return; }
    if (session.payment_status !== "paid") { res.status(200).send("non paye"); return; }

    const uid = String(meta.uid || "");
    const montant = Number(session.amount_total || 0);

    /* IDEMPOTENCE. Stripe renvoie un webhook plusieurs fois quand il n'a pas
       recu de reponse assez vite. Le document porte l'identifiant de session,
       qui est unique : sans ce verrou le meme don serait compte deux fois. */
    const ref = db.collection("dons").doc(session.id);
    let deja = false;
    try {
      deja = await db.runTransaction(async (t) => {
        const s = await t.get(ref);
        if (s.exists && (s.data() || {}).etat === "payee") return true;
        t.set(ref, {
          uid: uid || null, etat: "payee", montant: montant,
          payeLe: FieldValue.serverTimestamp()
        }, { merge: true });
        return false;
      });
    } catch (e) {
      /* On repond 500 pour que Stripe reessaie : l'argent est encaisse, la
         trace DOIT finir par exister. */
      console.error("trace du don:", e && e.message);
      res.status(500).send("erreur");
      return;
    }
    if (deja) { res.status(200).send("deja traite"); return; }

    /* Un don anonyme est un don quand meme : il n'y a juste personne a qui
       arreter de demander. */
    if (!uid) { res.status(200).send("ok (anonyme)"); return; }

    try {
      /* Le SEUL effet cote app. On note qu'une personne a soutenu, pour ne
         plus lui remettre la carte de don sous le nez, et pour pouvoir lui
         dire merci. On ne pose AUCUN droit et AUCUN avantage : un don qui
         debloque quelque chose n'est plus un don, c'est un achat — et un
         achat dans une app obeit aux regles d'Apple et de Google. */
      await db.collection("soutiens").doc(uid).set({
        total: FieldValue.increment(montant),
        fois: FieldValue.increment(1),
        dernier: FieldValue.serverTimestamp()
      }, { merge: true });
      console.log("don recu:", uid, montant);
      res.status(200).send("ok");
    } catch (e) {
      console.error("enregistrement du soutien:", e && e.message);
      /* La trace du don, elle, est deja posee : l'argent n'est pas perdu de
         vue. On redemande quand meme un renvoi pour finir proprement. */
      res.status(500).send("erreur");
    }
  }
);
