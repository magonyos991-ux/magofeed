/**
 * Magofeed — petit outil partage : prevenir les administrateurs.
 *
 * CE FICHIER N'EST PAS UNE CLOUD FUNCTION et ne doit JAMAIS etre branche dans
 * index.js. Il ne contient qu'une fonction utilitaire, utilisee par
 * notif-admin.js et catalogue-ia.js. Le brancher ferait croire a Firebase
 * qu'il y a une fonction a deployer ici.
 *
 * Origine : recupere le 4 septembre 2026 depuis le code deploye d'une
 * fonction ecrite en juillet, dont la source n'existait plus nulle part.
 */
/* API MODULAIRE UNIQUEMENT. L'ancienne forme namespacee — require("firebase-admin")
   puis admin.firestore() / admin.messaging() — a ete retiree des versions
   recentes du SDK : la propriete n'y est plus une fonction. Le fichier plantait
   alors des le chargement, et « firebase deploy » echouait sur « User code
   failed to load », sans jamais nommer le vrai coupable. */
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
if (!getApps().length) initializeApp();
const db = getFirestore();

const EXPEDITEUR = { name: "Magofeed", email: "magofeed@outlook.com" };

/* SECOURS PAR COURRIEL. Une notification poussee dependant d'un jeton FCM, et
   un jeton FCM meurt sans prevenir : navigateur reinstalle, donnees effacees,
   simple rotation. Pire, sendToAdmins EFFACE le jeton que Google rejette — a
   raison, sinon la liste se remplit de morts — et plus rien n'arrive ensuite,
   sans le moindre signe. C'est exactement ce qu'a vecu le fondateur : « avant
   ca marchait, maintenant ca ne marche plus ». Une adresse e-mail, elle, ne
   tourne pas. On ne l'utilise QUE si aucune poussee n'est partie : le but est
   de ne jamais rater un evenement, pas de doubler chaque alerte. */
async function envoyerCourriel(a, sujet, texte) {
  const cle = process.env.BREVO_API_KEY;
  if (!cle || !a) return false;
  const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
    'max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">' +
    '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a8a8a">Magofeed</div>' +
    '<h1 style="font-size:19px;margin:8px 0 10px">' + echapper(sujet) + '</h1>' +
    '<p style="font-size:15px;line-height:1.5;margin:0">' + echapper(texte) + '</p>' +
    '<p style="font-size:12px;color:#8a8a8a;margin-top:22px;line-height:1.5">' +
    'Tu recois ce message parce que la notification sur ton telephone n\'est pas partie. ' +
    'Ouvre Reglages puis « Verifier mes notifications » dans l\'app pour reactiver le jeton.</p></div>';
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": cle, "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({ sender: EXPEDITEUR, to: [{ email: a }], subject: "Magofeed — " + sujet,
                             htmlContent: html, tags: ["magofeed", "alerte-admin"] })
    });
    if (!res.ok) { console.warn("Brevo " + res.status); return false; }
    return true;
  } catch (e) { console.warn("courriel admin:", e && e.message); return false; }
}
function echapper(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
async function adresseAdmin(uid) {
  try { const u = await getAuth().getUser(String(uid)); return String((u && u.email) || "").trim(); }
  catch (e) { return ""; }
}

const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

/* ══ UN JETON PAR APPAREIL, ET NON UN JETON PAR PERSONNE ═══════════════════
   LA PANNE QUE CE BLOC REPARE, en entier, parce qu'elle a coute des semaines.
   pushTokens/{uid} ne portait QU'UN champ « token ». L'app reecrit ce champ a
   chaque ouverture ou la permission est deja accordee (index.html, restauration
   silencieuse du jeton) : le DERNIER appareil ouvert ecrasait donc le jeton de
   tous les autres. Le fondateur ouvrait Magofeed sur son PC pour consulter le
   journal des alertes ; a cet instant precis le jeton de son iPhone disparaissait
   du serveur, et toutes les alertes suivantes partaient vers le PC. FCM les
   acceptait, « poussees » valait 1, le journal ecrivait « notification envoyee »,
   et l'iPhone ne sonnait plus jamais. Rien, nulle part, ne disait a quel appareil
   le jeton appartenait.

   Desormais chaque appareil ecrit SA propre entree dans la carte « jetons », et
   on envoie a tous. Le champ « token » historique reste ecrit et reste lu : les
   comptes qui n'ont pas encore rouvert l'app continuent de recevoir leurs
   notifications sans rien faire.

   ET ON N'EFFACE PLUS LE DOCUMENT ENTIER quand un jeton meurt. Cette suppression
   emportait avec elle la position, le rayon de zone et le choix du secours : un
   seul appareil remplace, et les notifications « pres de toi » de la personne
   devenaient muettes pour une raison qui n'avait aucun rapport. On retire
   maintenant l'appareil mort, et lui seul. */
function jetonsDuDoc(d) {
  const data = d || {};
  const vus = new Set();
  const liste = [];
  /* Le champ historique d'abord : c'est l'appareil ouvert le plus recemment. */
  if (data.token) {
    vus.add(data.token);
    liste.push({ cle: "token", token: data.token, appareil: String(data.appareil || "") });
  }
  const carte = (data.jetons && typeof data.jetons === "object") ? data.jetons : {};
  for (const cle of Object.keys(carte)) {
    const e = carte[cle] || {};
    /* MEME JETON DANS LES DEUX ENDROITS : c'est le cas NORMAL pour l'appareil
       qui vient d'ecrire. Sans ce garde-fou, il recevrait deux notifications
       identiques pour chaque alerte. */
    if (e.token && !vus.has(e.token)) {
      vus.add(e.token);
      liste.push({ cle: "jetons." + cle, token: e.token, appareil: String(e.appareil || "") });
    }
  }
  return liste;
}

async function jetonsDe(uid) {
  try {
    const snap = await db.collection("pushTokens").doc(String(uid)).get();
    return snap.exists ? jetonsDuDoc(snap.data()) : [];
  } catch (e) { console.warn("jetonsDe:", e && e.message); return []; }
}

/* Un jeton mort, et UNIQUEMENT lui. Voir le bloc ci-dessus. */
async function oublierJeton(uid, cle) {
  try {
    await db.collection("pushTokens").doc(String(uid)).update({ [cle]: FieldValue.delete() });
  } catch (e) { console.warn("oublierJeton:", e && e.message); }
}

function jetonMort(e) {
  return !!e && (e.code === "messaging/registration-token-not-registered" ||
                 e.code === "messaging/invalid-registration-token");
}

/* LA SEULE PORTE DE SORTIE DES POUSSEES. Tout envoi a une personne passe par
   ici : un seul endroit decide de la forme du message, de la liste des
   appareils et du sort d'un jeton mort. Avant, neuf endroits en decidaient
   chacun pour soi, et c'est ainsi qu'un seul d'entre eux a pu partir des mois
   avec une forme que le telephone n'affichait pas.

   LE TITRE ET LE CORPS RESTENT AU PREMIER NIVEAU. FCM aplatit le bloc
   « webpush » : ce qui est livre au navigateur ne contient jamais de cle
   « webpush », seulement « notification », « data » et « fcmOptions ». Le
   service worker officiel de Google lit lui-meme « notification » au premier
   niveau. Donc webpush.notification sert a AJOUTER l'icone et le badge, jamais
   a porter le titre tout seul. */
async function envoyerPush(uid, msg) {
  if (!uid) return { appareils: 0, parties: 0, echecs: [] };
  const liste = await jetonsDe(uid);
  let parties = 0;
  const echecs = [];
  for (const j of liste) {
    try {
      await getMessaging().send(Object.assign({}, msg, { token: j.token }));
      parties++;
    } catch (e) {
      echecs.push(String((e && e.code) || (e && e.message) || e).slice(0, 80));
      if (jetonMort(e)) await oublierJeton(uid, j.cle);
      else console.warn("push:", e && e.message);
    }
  }
  return { appareils: liste.length, parties: parties, echecs: echecs };
}

/* La forme commune d'une notification Magofeed. Un seul endroit a modifier le
   jour ou cette forme doit changer. */
function message(titre, corps, data, lien, tag) {
  const w = { icon: "icons/icon-192.png", badge: "icons/icon-192.png" };
  if (tag) w.tag = String(tag);
  return {
    notification: { title: titre, body: corps },
    data: data || {},
    webpush: { notification: w, fcmOptions: { link: lien || APP_URL } }
  };
}

/* Envoie une push a chaque administrateur, SUR CHACUN DE SES APPAREILS.
   uidAppelant, quand il est fourni, permet de repondre honnetement a la seule
   question qui compte pour la personne qui clique « tester » : est-ce que MON
   telephone a recu quelque chose ? Repondre « 1 poussee partie » sans dire a
   qui est l'appareil, c'est ce qui l'a envoyee fouiller ses reglages iOS
   pendant que la panne etait ailleurs. */
async function sendToAdmins(title, body, uidAppelant) {
  /* TRACE DURABLE, ECRITE AVANT TOUT ENVOI. Une alerte perdue etait perdue pour
     toujours : rien ne disait si l'evenement avait eu lieu, si la poussee etait
     partie, ni pourquoi elle avait echoue. Le document est ecrit d'abord, pour
     qu'il survive meme si tout le reste rate ensuite. */
  let trace = null;
  try {
    trace = await db.collection("alertesAdmin").add({
      titre: String(title || "").slice(0, 120),
      corps: String(body || "").slice(0, 400),
      at: FieldValue.serverTimestamp(),
      pousseesEnvoyees: 0,
      jetonsTrouves: 0,
      courrielEnvoye: false
    });
  } catch (e) { console.warn("trace alerte:", e && e.message); }

  let jetons = 0, parties = 0;
  const sansPoussee = [];     // administrateurs qui n'ont RIEN recu
  const echecs = [];
  const moi = { appareils: 0, parties: 0, courriel: false };
  try {
    const admins = await db.collection("admins").get();
    if (!admins.empty) {
      for (const a of admins.docs) {
          /* TOUT REFUS OUVRE LE SECOURS, pas seulement le jeton mort : une
             mauvaise cle VAPID, un compte de service sans droit ou une panne
             passagere chez Google ne produisaient NI poussee NI courriel.
             envoyerPush remonte chaque code, et n'efface que le jeton mort. */
          const r = await envoyerPush(a.id, message(title, body, { type: "admin" }));
          jetons += r.appareils;
          parties += r.parties;
          for (const c of r.echecs) echecs.push(c);
          if (!r.parties) sansPoussee.push(a.id);
          if (uidAppelant && a.id === String(uidAppelant)) {
            moi.appareils = r.appareils;
            moi.parties = r.parties;
          }
      }
    }
  } catch (e) { console.warn("sendToAdmins:", e && e.message); }

  /* LE SECOURS PART POUR CHAQUE ADMINISTRATEUR QUI N'A RIEN RECU, ET NON
     SEULEMENT QUAND PERSONNE N'A RIEN RECU.
     Avant : « if (!parties) ». Donc des qu'UN administrateur recevait la
     poussee, tous les autres perdaient leur alerte en silence — et le cas
     vecu le 28 novembre est exactement celui-la : Google accepte, parties
     vaut 1, et le seul filet existant ne se declenche jamais. Le but est que
     personne ne rate l'evenement, pas de ne sonner qu'une fois en tout.
     On ne double pas pour autant : seul celui dont AUCUN appareil n'a recu
     la poussee recoit le courriel. Borne a trois envois par alerte, pour que
     la facture d'une rafale reste bornee elle aussi. */
  let courriel = false;
  let courriels = 0;
  for (const uid of sansPoussee.slice(0, 3)) {
    const a = await adresseAdmin(uid);
    if (a && await envoyerCourriel(a, title, body)) {
      courriel = true;
      courriels++;
      /* ON NE REVELE JAMAIS L'ADRESSE D'UN AUTRE ADMINISTRATEUR a celui qui
         clique. On dit seulement a l'appelant si SON courriel est parti. */
      if (uidAppelant && uid === String(uidAppelant)) moi.courriel = true;
    }
  }

  if (trace) {
    try {
      await trace.update({ pousseesEnvoyees: parties, jetonsTrouves: jetons, courrielEnvoye: courriel,
                           /* « FINI » SEPARE DEUX PANNES QUI S'AFFICHAIENT PAREIL.
                              La trace est ecrite AVANT tout envoi, a 0/0/false, puis
                              mise a jour a la fin. Si la fonction depasse son delai ou
                              si l'instance est tuee entre les deux, elle reste a zero —
                              et le journal affichait « aucun appareil enregistre », une
                              conclusion qu'il n'avait aucun moyen de tirer. Ce drapeau
                              dit si la ligne a ete terminee. */
                           fini: true,
                           /* LE CODE D'ERREUR EXACT. « Envoi refuse » ne dit pas quoi reparer :
                              un jeton mort se reactive en deux gestes, une cle VAPID fausse
                              demande d'aller dans la console Firebase. Ce n'est pas la meme
                              journee de travail, et c'etait invisible. */
                           echecs: echecs.slice(0, 5) });
    } catch (e) { /* la trace vaut mieux qu'aucune trace, meme incomplete */ }
  }
  return { parties: parties, jetons: jetons, courriel: courriel, courriels: courriels,
           echecs: echecs.slice(0, 5), moi: moi };
}

/* Une push a UNE personne. Copiee de notifications-push.js, qui ne l'exporte
   pas : la dupliquer ici evite de faire dependre le credit des points du
   fichier des notifications, et un jeton perime est efface des deux cotes de
   la meme facon. */
async function pushToUser(uid, title, body, data, link) {
  await envoyerPush(uid, message(title, body, data, link));
}

/* ══ PREVENIR : POUSSER, ET LAISSER UNE TRACE ══════════════════════════════
   pushToUser envoie une poussée et rien d'autre. Si la personne a refusé les
   notifications ou si son jeton a expiré, le message est perdu pour toujours.
   Un remerciement perdu, c'est le seul retour qu'on avait pour celui qui a
   rendu service — et il ne le saura jamais.

   prevenir() pousse, PUIS écrit une ligne dans userNotifs : la collection que
   la cloche de l'en-tête lit déjà. Même mécanique que la promotion d'une
   découverte, aucune règle Firestore à changer.

   L'identifiant du document est DÉTERMINISTE (« <uid>__<clé> ») : si le
   déclencheur se rejoue — Firestore le fait — on réécrit la même ligne au lieu
   d'en empiler une seconde. Et read vaut vrai quand la poussée est partie :
   celui qui a déjà vu la notification n'a pas en plus une pastille à éteindre. */
async function prevenir(uid, titre, corps, data, lien, cle) {
  if (!uid) return;
  /* « read: pousse » n'est vrai que si AU MOINS un appareil a recu la poussee :
     la pastille de la cloche reste allumee pour qui n'a rien vu passer. */
  const r = await envoyerPush(uid, message(titre, corps, data, lien));
  const pousse = r.parties > 0;
  try {
    const ligne = Object.assign({
      to: String(uid), title: titre, body: corps,
      read: pousse, createdAt: FieldValue.serverTimestamp()
    }, data || {});
    await db.collection("userNotifs").doc(String(uid) + "__" + String(cle)).set(ligne, { merge: true });
  } catch (e) { console.warn("trace userNotifs:", e && e.message); }
}

module.exports = { sendToAdmins, pushToUser, prevenir,
                   /* LA PORTE DE SORTIE PARTAGEE. Tout fichier qui envoie une
                      poussee passe par envoyerPush : c'est ce qui garantit
                      qu'une personne recoit ses notifications sur TOUS ses
                      appareils, et qu'un jeton mort n'emporte pas sa position
                      ni son rayon de zone. jetonsDuDoc sert aux envois en lot,
                      qui lisent la collection entiere en une fois. */
                   envoyerPush, jetonsDe, jetonsDuDoc, message, jetonMort, oublierJeton, APP_URL };
