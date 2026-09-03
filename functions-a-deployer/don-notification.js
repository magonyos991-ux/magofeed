/**
 * Magofeed — NOTIFICATION PUSH A CHAQUE DON.
 *
 * A QUOI CA SERT
 * Recevoir un don et ne l'apprendre qu'en allant regarder soi-meme, c'est
 * passer a cote de la seule chose qui compte vraiment dans un don : le moment
 * ou quelqu'un decide que ce que tu construis merite un coup de main. Cette
 * fonction transforme ce moment en notification sur ton telephone, app fermee,
 * avec le montant, le nom et le message.
 *
 * CE QU'IL Y A SANS CETTE FONCTION
 * Ko-fi n'a PAS d'application iPhone (une note precedente disait le contraire :
 * elle etait fausse). Il reste donc deux voies, et aucune ne donne les trois
 * informations d'un coup :
 *   - l'e-mail de Ko-fi : il porte le nom, le montant ET le message, mais il
 *     arrive comme un e-mail parmi d'autres. Sur iPhone, le classer en VIP le
 *     transforme en vraie notification.
 *   - l'app PayPal : elle sonne vite et bien, mais ne dit que le montant. Ni le
 *     nom du donateur, ni son message.
 * Cette fonction-ci est la seule facon d'avoir les trois, dans Magofeed, avec
 * ton icone et ta boite de notifications.
 *
 * CE QUE CA NE FAIT PAS
 * Ca n'encaisse rien et ne touche a aucun paiement : Ko-fi previent, on relaie.
 * Si cette fonction tombe, l'argent arrive quand meme — tu es juste prevenu par
 * Ko-fi au lieu de l'etre par Magofeed.
 *
 * DEPLOIEMENT (~10 min)
 *   1) copier ce fichier dans le dossier functions
 *   2) ajouter dans index.js :
 *        Object.assign(exports, require("./don-notification"));
 *   3) inventer un mot de passe long (30+ caracteres au hasard) et le poser :
 *        firebase functions:secrets:set KOFI_JETON
 *      NE LE COLLE JAMAIS DANS UN FICHIER NI DANS UNE CONVERSATION.
 *   4) firebase deploy --only functions:kofiWebhook
 *      -> le deploiement affiche une adresse. Copie-la.
 *   5) sur Ko-fi : Parametres (ou More -> API / Webhooks), colle cette adresse
 *      dans le champ webhook. Ko-fi affiche a cote un « Verification Token ».
 *   6) refais l'etape 3 avec CE jeton-la (celui de Ko-fi, pas le tien), puis
 *      redeploie. Ko-fi propose un bouton de test : sers-t'en.
 *
 * SI RIEN N'ARRIVE : regarde les journaux de la fonction. Elle ecrit la forme
 * exacte de ce que Ko-fi envoie a la premiere reception (sans l'e-mail du
 * donateur) — de quoi ajuster si Ko-fi a change son format depuis.
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = "europe-west1";
const KOFI_JETON = defineSecret("KOFI_JETON");
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

/* Ko-fi envoie un formulaire dont le champ « data » contient du JSON. Selon la
   version, Cloud Functions le rend deja analyse (req.body.data) ou brut. On
   accepte les deux plutot que de parier sur l'un. */
function lireCharge(req) {
  const b = req.body || {};
  let brut = b.data;
  if (!brut && typeof b === "string") brut = b;
  if (!brut) return null;
  if (typeof brut === "object") return brut;
  try { return JSON.parse(brut); } catch (e) { return null; }
}

function montantLisible(somme, devise) {
  const n = Number(somme);
  if (!isFinite(n)) return String(somme || "?");
  /* Virgule decimale : on ecrit « 5,00 € », pas « 5.00 EUR ». */
  const txt = n.toFixed(2).replace(".", ",");
  const d = String(devise || "EUR").toUpperCase();
  return txt + (d === "EUR" ? " €" : " " + d);
}

exports.kofiWebhook = onRequest(
  { region: REGION, secrets: [KOFI_JETON], memory: "256MiB",
    timeoutSeconds: 30, maxInstances: 5 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("POST attendu"); return; }

    const don = lireCharge(req);
    if (!don) { console.warn("charge illisible"); res.status(400).send("charge illisible"); return; }

    /* LA LIGNE QUI COMPTE. Cette adresse est publique : sans ce controle,
       n'importe qui pourrait t'envoyer de faux dons et faire sonner ton
       telephone toute la nuit. Le jeton vient de Ko-fi et ne transite jamais
       par le navigateur. */
    if (String(don.verification_token || "") !== String(KOFI_JETON.value())) {
      console.warn("jeton de verification invalide");
      res.status(401).send("jeton invalide");
      return;
    }

    /* Trace de la FORME recue, une seule fois et sans donnee personnelle : de
       quoi diagnostiquer si Ko-fi change son format, sans deverser l'identite
       des donateurs dans les journaux. */
    console.log("champs recus:", Object.keys(don).sort().join(","));

    const id = String(don.message_id || don.kofi_transaction_id || "").slice(0, 120);
    const nom = String(don.from_name || "").trim().slice(0, 60) || "Quelqu'un";
    const mot = String(don.message || "").trim().slice(0, 300);
    const somme = montantLisible(don.amount, don.currency);
    const abo = don.is_subscription_payment === true || don.is_subscription_payment === "true";

    /* IDEMPOTENCE. Ko-fi renvoie un webhook quand il n'a pas recu de reponse
       assez vite. Sans ce verrou, le meme don sonnerait deux fois. */
    if (id) {
      const ref = db.collection("dons").doc("kofi_" + id);
      const deja = await db.runTransaction(async (t) => {
        const s = await t.get(ref);
        if (s.exists) return true;
        /* On garde le nom et le message (ils sont destines a etre lus), le
           montant, et RIEN D'AUTRE. L'e-mail du donateur, que Ko-fi nous
           transmet, n'est jamais ecrit : on n'en a aucun usage, et ce qu'on
           ne stocke pas ne peut pas fuiter. */
        t.set(ref, {
          source: "ko-fi", etat: "recu",
          nom: nom, message: mot, montant: String(don.amount || ""),
          devise: String(don.currency || ""), abonnement: abo,
          quand: FieldValue.serverTimestamp()
        });
        return false;
      }).catch((e) => { console.warn("trace don:", e && e.message); return false; });
      if (deja) { res.status(200).send("deja traite"); return; }
    }

    /* Destinataires = les admins qui ont un token push. Meme chemin que le
       recap quotidien (recap-fondateur.js) : une seule facon de te joindre. */
    const tokens = [];
    try {
      const admins = await db.collection("admins").get();
      for (const a of admins.docs) {
        try {
          const tk = await db.collection("pushTokens").doc(a.id).get();
          const token = tk.exists && tk.data().token;
          if (token) tokens.push(token);
        } catch (e) { /* admin sans token : on saute */ }
      }
    } catch (e) { console.warn("lecture admins:", e && e.message); }

    /* Repondre 200 meme sans destinataire : le don est bien arrive, ce n'est
       pas a Ko-fi de reessayer parce que TON telephone n'a pas de token. */
    if (!tokens.length) {
      console.log("don recu, aucun admin avec token push");
      res.status(200).send("ok (personne a prevenir)");
      return;
    }

    const titre = (abo ? "Soutien mensuel · " : "Nouveau soutien · ") + somme;
    const corps = nom + (mot ? " — « " + mot + " »" : "");

    try {
      const r = await getMessaging().sendEach(tokens.map((token) => ({
        token: token,
        notification: { title: titre, body: corps },
        data: { type: "don" },
        webpush: {
          notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
          fcmOptions: { link: APP_URL }
        }
      })));
      console.log("notification de don envoyee : " + r.successCount + "/" + tokens.length);
    } catch (e) {
      console.warn("envoi push:", e && e.message);
    }
    /* Toujours 200 : le don est enregistre. Un push rate ne doit pas declencher
       une avalanche de reessais chez Ko-fi. */
    res.status(200).send("ok");
  }
);
