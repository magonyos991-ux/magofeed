/**
 * Magofeed — La notification PUSH d'un nouveau message (téléphone, même app
 * fermée). Firebase Functions v2 (Node 18+), région europe-west1.
 *
 * L'app affiche déjà la pastille et le message quand elle est ouverte. Ce que
 * seul le serveur peut faire : prévenir l'AUTRE membre quand l'app est fermée.
 *
 * Règles du jeu, alignées sur les règles Firestore de la messagerie :
 *  - une demande (state == "request") se présente comme « X veut t'écrire »,
 *    sans le texte : tant que la personne n'a pas accepté, l'inconnu n'a pas
 *    la parole sur son écran de verrouillage ;
 *  - un fil ouvert montre le pseudo et un aperçu (texte, ou « Photo »,
 *    « Position », « Emplacement : … ») ;
 *  - le tap ouvre l'app directement sur le fil (#thread=<cid>).
 * Aucun point, aucune écriture : la fonction ne fait que prévenir.
 *
 * Déploiement : firebase deploy --only functions:notifierNouveauMessage,functions:notifierDemandeAmi
 */
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

/* ══ TOUS LES APPAREILS, ET PLUS SEULEMENT LE DERNIER OUVERT ═══════════════
   pushTokens/{uid} ne portait qu'un champ « token », reecrit a chaque
   ouverture de l'app : le dernier appareil ouvert ecrasait celui des autres.
   envoyerPush lit la carte « jetons » — une entree par appareil — envoie a
   chacun, et ne supprime jamais le document entier (il porte aussi la
   position, le rayon de zone et le choix du secours). Bloc complet dans
   outils-admin.js. */
const { envoyerPush, message } = require("./outils-admin");

/* UNE NOTIFICATION PAR CONVERSATION, ET PAR DEMANDE D'AMI.
   Ce tag ne connaissait que `cid`. Les demandes d'ami n'en ont pas : elles
   retombaient toutes sur « msg-x », donc la deuxieme effacait la premiere sur
   le telephone. Deux personnes vous demandent en ami, vous n'en voyez qu'une —
   en silence. On prend la premiere identite disponible, quelle que soit la
   sorte de notification. */
async function pushToUser(uid, title, body, data, link) {
  await envoyerPush(uid, message(title, body, data, link,
    String((data && (data.cid || data.pid)) || "magofeed")));
}

function apercu(m) {
  const t = String(m.type || "text");
  if (t === "image") return "Photo";
  if (t === "pos") return "Position partagée";
  if (t === "spot") return "Emplacement : " + String(m.drinkName || "une boisson").slice(0, 40) + " chez " + String(m.storeName || "un magasin").slice(0, 40);
  return String(m.text || "").replace(/\s+/g, " ").trim().slice(0, 90);
}

exports.notifierNouveauMessage = onDocumentCreated(
  { document: "conversations/{cid}/messages/{mid}", region: REGION },
  async (event) => {
    const m = event.data && event.data.data();
    if (!m || !m.by) return;
    const cid = event.params.cid;
    const convSnap = await db.collection("conversations").doc(cid).get();
    if (!convSnap.exists) return;
    const conv = convSnap.data() || {};
    const membres = Array.isArray(conv.members) ? conv.members : [];
    const dest = membres.find((u) => u !== m.by);
    if (!dest) return;
    /* Bloqué : les règles refusent déjà l'écriture, mais si un jour elles
       changent, on ne réveillera jamais le téléphone d'une personne qui a
       bloqué l'expéditeur. */
    try {
      const b = await db.collection("blocks").doc(dest).get();
      if (b.exists && Array.isArray(b.data().list) && b.data().list.includes(m.by)) return;
    } catch (_) {}
    let pseudo = "Quelqu'un";
    try {
      const u = await db.collection("users").doc(m.by).get();
      if (u.exists && u.data().pseudo) pseudo = String(u.data().pseudo).slice(0, 24);
    } catch (_) {}
    const demande = conv.state === "request";
    const title = demande ? (pseudo + " veut t'écrire") : pseudo;
    const body = demande ? "Ouvre Magofeed pour lire sa demande et décider." : apercu(m);
    await pushToUser(dest, title, body, { type: "msg", cid: cid }, APP_URL + "#thread=" + encodeURIComponent(cid));
  }
);

/* ── UNE DEMANDE D'AMI PREVIENT LA PERSONNE ──────────────────────────────
   Le lien d'ami vit dans `amis/{pid}` : `members` (les deux uid, tries),
   `requestBy` (qui demande) et `state` — "request", puis "ok" ou "declined".
   L'app affiche la pastille quand elle est ouverte. Ce que seul le serveur
   peut faire : reveiller le telephone quand elle est fermee.
   Deux moments valent une notification, et deux seulement :
     - la demande arrive -> on previent CELUI QUI LA RECOIT ;
     - la demande est acceptee -> on previent CELUI QUI L'AVAIT FAITE.
   Un refus ne notifie personne : dire « X a refuse » n'aide personne et
   transforme un non en camouflet.
   Aucun point, aucune ecriture : la fonction ne fait que prevenir.

   Deploiement : firebase deploy --only functions:notifierDemandeAmi */
exports.notifierDemandeAmi = onDocumentWritten(
  { document: "amis/{pid}", region: REGION },
  async (event) => {
    const avant = event.data && event.data.before && event.data.before.exists
      ? event.data.before.data() : null;
    const apres = event.data && event.data.after && event.data.after.exists
      ? event.data.after.data() : null;
    if (!apres) return;                                   // lien supprime
    const membres = Array.isArray(apres.members) ? apres.members : [];
    const auteur = String(apres.requestBy || "");
    const autre = membres.find((u) => u !== auteur);
    if (!auteur || !autre) return;

    const etatAvant = avant ? String(avant.state || "") : null;
    const etat = String(apres.state || "");
    let dest = null; let titre = null; let corps = null; let qui = null;

    if (etat === "request" && etatAvant !== "request") {
      dest = autre; qui = auteur;
      corps = "Ouvre Magofeed pour accepter ou refuser.";
    /* Toute arrivee sur « ok », pas seulement depuis « request » : les regles
       autorisent explicitement declined -> ok (on a le droit de revenir sur un
       refus qu'on a prononce), et l'app emprunte ce chemin. Le demandeur
       n'etait alors prevenu par rien du tout. */
    } else if (etat === "ok" && etatAvant !== "ok") {
      dest = auteur; qui = autre;
      corps = "Vous pouvez vous écrire.";
    } else {
      return;
    }
    /* Bloque : meme precaution que pour les messages. On ne reveille jamais
       le telephone de quelqu'un pour une personne qu'il a bloquee. */
    try {
      const b = await db.collection("blocks").doc(dest).get();
      if (b.exists && Array.isArray(b.data().list) && b.data().list.includes(qui)) return;
    } catch (_) {}
    let pseudo = "Quelqu'un";
    try {
      const u = await db.collection("users").doc(qui).get();
      if (u.exists && u.data().pseudo) pseudo = String(u.data().pseudo).slice(0, 24);
    } catch (_) {}
    titre = etat === "ok" ? (pseudo + " a accepté ta demande") : (pseudo + " veut devenir ton ami");
    await pushToUser(dest, titre, corps, { type: "ami", pid: event.params.pid },
      APP_URL + (etat === "ok" ? "#thread=" + encodeURIComponent(event.params.pid) : "#amis"));
  }
);
