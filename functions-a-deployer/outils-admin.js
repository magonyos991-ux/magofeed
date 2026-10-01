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

/* Envoie une push a chaque administrateur qui a un jeton enregistre.
   Un jeton refuse par Google est efface : sans ca, la liste se remplit de
   jetons morts et chaque envoi echoue un peu plus. */
async function sendToAdmins(title, body) {
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
  const sansJeton = [];
  try {
    const admins = await db.collection("admins").get();
    if (!admins.empty) {
      for (const a of admins.docs) {
        const tokDoc = await db.collection("pushTokens").doc(a.id).get();
        const token = tokDoc.exists ? (tokDoc.data() || {}).token : null;
        if (!token) { sansJeton.push(a.id); continue; }
        jetons++;
        try {
          await getMessaging().send({
            token,
            webpush: { notification: { title: title, body: body, icon: "icons/icon-192.png" } }
          });
          parties++;
        } catch (e) {
          /* Un jeton refuse par Google est efface : sans ca, la liste se remplit
             de jetons morts et chaque envoi echoue un peu plus. C'est aussi
             pourquoi le secours par courriel existe — cet effacement est
             silencieux, et sans lui on ne saurait jamais que le canal est mort. */
          if (e && e.code === "messaging/registration-token-not-registered") {
            sansJeton.push(a.id);
            try { await db.collection("pushTokens").doc(a.id).delete(); } catch (_) {}
          } else {
            console.warn("push admin:", e && e.message);
          }
        }
      }
    }
  } catch (e) { console.warn("sendToAdmins:", e && e.message); }

  /* AUCUNE POUSSEE PARTIE : on bascule sur le courriel. On ne double jamais une
     alerte deja recue — le but est de ne rien rater, pas de sonner deux fois. */
  let courriel = false;
  if (!parties) {
    for (const uid of sansJeton) {
      const a = await adresseAdmin(uid);
      if (a && await envoyerCourriel(a, title, body)) { courriel = true; break; }
    }
  }

  if (trace) {
    try {
      await trace.update({ pousseesEnvoyees: parties, jetonsTrouves: jetons, courrielEnvoye: courriel });
    } catch (e) { /* la trace vaut mieux qu'aucune trace, meme incomplete */ }
  }
  return { parties: parties, jetons: jetons, courriel: courriel };
}

/* Une push a UNE personne. Copiee de notifications-push.js, qui ne l'exporte
   pas : la dupliquer ici evite de faire dependre le credit des points du
   fichier des notifications, et un jeton perime est efface des deux cotes de
   la meme facon. */
async function pushToUser(uid, title, body, data, link) {
  if (!uid) return;
  try {
    const snap = await db.collection("pushTokens").doc(String(uid)).get();
    const token = snap.exists && snap.data().token;
    if (!token) return;              // pas de jeton : l'in-app suffit
    await getMessaging().send({
      token: token,
      notification: { title: title, body: body },
      data: data || {},
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
        fcmOptions: { link: link || "https://magonyos991-ux.github.io/magofeed/" }
      }
    });
  } catch (e) {
    if (e && (e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token")) {
      try { await db.collection("pushTokens").doc(String(uid)).delete(); } catch (_) {}
    } else {
      console.warn("push error:", e && e.message);
    }
  }
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
  let pousse = false;
  try {
    const snap = await db.collection("pushTokens").doc(String(uid)).get();
    const token = snap.exists && snap.data().token;
    if (token) {
      await getMessaging().send({
        token: token,
        notification: { title: titre, body: corps },
        data: data || {},
        webpush: {
          notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
          fcmOptions: { link: lien || "https://magonyos991-ux.github.io/magofeed/" }
        }
      });
      pousse = true;
    }
  } catch (e) {
    if (e && (e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token")) {
      try { await db.collection("pushTokens").doc(String(uid)).delete(); } catch (_) {}
    } else {
      console.warn("push error:", e && e.message);
    }
  }
  try {
    const ligne = Object.assign({
      to: String(uid), title: titre, body: corps,
      read: pousse, createdAt: FieldValue.serverTimestamp()
    }, data || {});
    await db.collection("userNotifs").doc(String(uid) + "__" + String(cle)).set(ligne, { merge: true });
  } catch (e) { console.warn("trace userNotifs:", e && e.message); }
}

module.exports = { sendToAdmins, pushToUser, prevenir };
