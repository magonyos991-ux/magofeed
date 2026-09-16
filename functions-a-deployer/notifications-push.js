/**
 * Magofeed — Notifications PUSH réelles (téléphone, même app fermée).
 *
 * Ce que l'app fait déjà TOUTE SEULE (sans serveur) :
 *  - À la promotion d'une découverte, elle écrit un message in-app (userNotifs)
 *    et crédite +50 points à l'auteur à sa prochaine ouverture.
 *  - Au rejet d'une photo, elle prévient l'auteur in-app.
 *
 * Ce que SEUL un serveur peut faire (et que ces fonctions ajoutent) :
 *  - Envoyer une vraie notification PUSH sur le téléphone de l'auteur, même
 *    quand l'app est fermée (FCM). C'est la pièce manquante.
 *
 * Ces fonctions n'ajoutent AUCUN point. Le crédit des points vit entièrement
 * dans points-et-parrainage.js, côté serveur, depuis la bascule.
 *
 * Firebase Functions v2 (Node 18+). Déploiement : voir README.md.
 */
const { onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
/* FieldValue vient d'etre ajoute a cet import : le journal des chasses s'en
   sert pour dater ses lignes. Sans lui, chaque ecriture levait une
   ReferenceError — avalee par le try/catch qui protege le journal, donc
   parfaitement muette. Un journal qui n'ecrit rien et ne le dit pas est pire
   que pas de journal du tout. */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1"; // ADAPTE si ton projet est ailleurs

/* Envoi d'un push à un utilisateur via le token stocké dans pushTokens/{uid}
   (écrit par l'app quand l'utilisateur active les notifications). Silencieux
   si l'utilisateur n'a pas de token : on ne casse jamais le flux. */
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

async function pushToUser(uid, title, body, data, link) {
  if (!uid) return;
  try {
    const snap = await db.collection("pushTokens").doc(String(uid)).get();
    const token = snap.exists && snap.data().token;
    if (!token) return; // pas de token = pas de push, tant pis, l'in-app suffit
    await getMessaging().send({
      token: token,
      notification: { title: title, body: body },
      data: data || {},
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
        // Le tap ouvre l'app SUR la bonne fiche (ex: #store=ID -> magasin + carte)
        fcmOptions: { link: link || APP_URL }
      }
    });
  } catch (e) {
    // Token périmé -> on le supprime pour ne pas ré-essayer indéfiniment
    if (e && (e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token")) {
      try { await db.collection("pushTokens").doc(String(uid)).delete(); } catch (_) {}
    } else {
      console.warn("push error:", e && e.message);
    }
  }
}

/* TEST — l'utilisateur appuie sur "Tester la notification" dans les réglages.
   On lui envoie un VRAI push FCM sur son propre téléphone : s'il ferme l'app
   juste après et voit quand même la notif, il a la preuve que tout marche
   (app fermée incluse). N'envoie qu'à SON propre token (req.auth.uid) : aucun
   risque d'abus. Renvoie une raison claire si le token manque, pour guider. */
exports.sendTestPush = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");
  const snap = await db.collection("pushTokens").doc(String(uid)).get();
  const token = snap.exists && snap.data().token;
  if (!token) return { ok: false, reason: "no-token" };
  try {
    await getMessaging().send({
      token: token,
      notification: {
        title: "Ca marche",
        body: "Tu recois bien les notifications Magofeed, meme app fermee. Bonne chasse."
      },
      data: { type: "test" },
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
        fcmOptions: { link: APP_URL }
      }
    });
    return { ok: true };
  } catch (e) {
    if (e && (e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token")) {
      try { await db.collection("pushTokens").doc(String(uid)).delete(); } catch (_) {}
      return { ok: false, reason: "stale-token" };
    }
    throw new HttpsError("internal", (e && e.message) || "push failed");
  }
});

/* Découverte promue au catalogue -> push "🎉 Ta découverte est dans Magofeed".
   Se déclenche quand le champ `promoted` passe à true. On lit l'auteur dans
   `by` (l'app l'enregistre à la création de la découverte). */
exports.notifyDiscoveryPromoted = onDocumentUpdated(
  { document: "discoveries/{id}", region: REGION },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (before.promoted === true || after.promoted !== true) return; // déjà traité / pas une promotion
    const by = after.by;
    if (!by) { console.log("Découverte sans auteur (by) — pas de push"); return; }
    const name = String(after.name || "Ta boisson").slice(0, 40);
    await pushToUser(
      by,
      "Ta decouverte est dans Magofeed",
      "\u00AB " + name + " \u00BB fait maintenant partie du catalogue. +50 points de decouvreur.",
      { type: "promoted", barcode: String(after.barcode || "") }
    );
  }
);

/* Photo rejetée par l'admin -> push "📸 Photo à refaire".
   Se déclenche quand `photoRejected` passe à true. */
exports.notifyPhotoRejected = onDocumentUpdated(
  { document: "discoveries/{id}", region: REGION },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (before.photoRejected === true || after.photoRejected !== true) return;
    const by = after.by;
    if (!by) return;
    const name = String(after.name || "ta découverte").slice(0, 40);
    await pushToUser(
      by,
      "Photo a refaire",
      "Ta photo de « " + name + " » ne correspondait pas au produit. Peux-tu en reprendre une bien nette ?",
      { type: "photoRejected", barcode: String(after.barcode || "") }
    );
  }
);

/* CHASSE DE ZONE — push temps réel « à la chasse ! ».
   Quand un NOUVEAU chercheur rejoint une chasse (hunts/{drinkId}.seekers gagne
   un uid), on prévient les gens autour (pushTokens à moins de ~15 km) qu'une
   boisson est activement recherchée près d'eux : « Quelqu'un cherche X — si
   tu la vois, signale-la et gagne des points ». On ne notifie pas le chercheur
   lui-même, ni au-delà du rayon. Distance = pushTokens.lat/lng (déjà stockés).
   ⚠️ Sur une grosse base, filtre par geohash au lieu de tout charger. */
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}
exports.notifyHuntNearby = onDocumentWritten(
  { document: "hunts/{drinkId}", region: REGION },
  async (event) => {
    const before = (event.data.before.exists && event.data.before.data()) || {};
    const after = (event.data.after.exists && event.data.after.data()) || {};
    if (!after || !after.seekers) return;
    const bSeek = before.seekers || {}, aSeek = after.seekers || {};
    // Nouveaux chercheurs (uid présent maintenant, absent ou nul avant)
    const newSeekers = Object.keys(aSeek).filter(function(u){ return aSeek[u] && !bSeek[u]; });
    if (!newSeekers.length) return;
    /* Centre = position (arrondie) du nouveau chercheur le plus recent.
       AVANT : s'il n'y avait pas de position, on notifiait TOUT LE MONDE.
       Comme n'importe quel compte pouvait ecrire un chercheur sans position
       dans un document de son choix, cette ligne etait un envoi de masse a
       toute la base, declenchable en boucle. Sans centre, on ne diffuse plus. */
    let center = null;
    newSeekers.forEach(function(u){ const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
    if (!center) {
      /* Sortie la plus frequente, et la plus invisible : une chasse lancee
         avant que le GPS du telephone n'ait repondu n'a pas de position, donc
         pas de centre, donc personne a prevenir. Le client la repositionne
         desormais des que le GPS repond — ce qui repasse ici avec un centre. */
      try {
        await db.collection("alertesAdmin").add({
          titre: "Chasse \u00ab " + String(after.drinkName || "?").slice(0, 40) + " \u00bb : rien envoy\u00e9",
          corps: "La chasse a \u00e9t\u00e9 lanc\u00e9e sans position (GPS pas encore pr\u00eat). "
               + "Sans centre, on ne sait pas qui pr\u00e9venir. L'app la repositionne d\u00e8s que le GPS r\u00e9pond.",
          at: FieldValue.serverTimestamp(),
          pousseesEnvoyees: 0, jetonsTrouves: 0, courrielEnvoye: false,
          type: "hunt",
          drinkId: String(after.drinkId != null ? after.drinkId : event.params.drinkId)
        });
      } catch (e) {}
      return;
    }
    const seekerUids = new Set(Object.keys(aSeek).filter(function(u){ return aSeek[u]; }));
    const name = String(after.drinkName || "une boisson").slice(0, 40);
    /* Anti-spam. Il etait range dans le document des chasses, que le client
       ecrit : creer un document neuf le sautait, et y ecrire une date lointaine
       eteignait definitivement les alertes d'une boisson. Le verrou vit
       desormais dans _meta, ferme au client par les regles, et il y en a DEUX :
       un par boisson (une vague par boisson toutes les 6 h) et un par personne
       (une vague par compte toutes les 6 h). Le second est celui qui compte :
       un compte s'obtient gratuitement, mais chacun ne declenche qu'une vague. */
    const now = Date.now();
    const _cle = function (v) { return String(v).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80); };
    const lanceur = newSeekers[0];
    /* LE VERROU PAR PERSONNE ETAIT DE SIX HEURES, ET C'EST LUI QUI FAISAIT
       TAIRE LA CHASSE.
       -----------------------------------------------------------------------
       Il existe pour une bonne raison : un compte s'obtient gratuitement, et
       sans lui n'importe qui pourrait declencher vague sur vague vers toute la
       base. Mais SIX HEURES veut dire qu'apres UNE SEULE chasse lancee, ce
       compte ne previent plus personne du reste de la journee — meme sur une
       autre boisson, meme depuis un autre endroit. Pour quelqu'un qui essaie
       son app avec deux telephones, c'est le silence garanti, et rien a
       l'ecran ne dit pourquoi.

       On separe donc les deux roles :
       - PAR BOISSON, on garde six heures. Personne ne veut etre reveille trois
         fois pour le meme Mountain Dew.
       - PAR PERSONNE, quarante-cinq minutes. Cela borne toujours l'abus (au
         pire une trentaine de vagues par jour et par compte, quand la limite
         par boisson laisse passer), sans transformer la premiere chasse de la
         journee en interrupteur general.

       ET SURTOUT : chaque sortie laisse desormais une ligne dans le journal.
       « Aucune notification » et « je ne sais pas pourquoi » etaient jusqu'ici
       la meme chose. */
    /* LE JOURNAL A DEJA UN FORMAT, ET L'ECRAN QUI LE LIT L'ATTEND.
       Ecrire des champs a moi aurait affiche une ligne sans titre, marquee
       « aucun appareil enregistre » — un journal qui ment est pire que pas de
       journal. On ecrit donc titre/corps/pousseesEnvoyees/jetonsTrouves comme
       outils-admin, et la RAISON va dans le corps, en francais. */
    const _tracer = async function (titre, corps, jetons, poussees) {
      try {
        await db.collection("alertesAdmin").add({
          titre: String(titre).slice(0, 120),
          corps: String(corps).slice(0, 400),
          at: FieldValue.serverTimestamp(),
          pousseesEnvoyees: Number(poussees) || 0,
          jetonsTrouves: Number(jetons) || 0,
          courrielEnvoye: false,
          type: "hunt",
          drinkId: String(after.drinkId != null ? after.drinkId : event.params.drinkId)
        });
      } catch (e) { /* le journal ne doit jamais faire echouer l'envoi */ }
    };
    const verrous = [
      { ref: db.collection("_meta").doc("huntPush_d_" + _cle(after.drinkId != null ? after.drinkId : event.params.drinkId)),
        ms: 6 * 3600 * 1000, nom: "boisson" },
      { ref: db.collection("_meta").doc("huntPush_u_" + _cle(lanceur)),
        ms: 45 * 60 * 1000, nom: "personne" }
    ];
    for (const v of verrous) {
      const snap = await v.ref.get();
      const at = (snap.exists && Number(snap.data().at)) || 0;
      if (now - at < v.ms) {
        const reste = Math.ceil((v.ms - (now - at)) / 60000);
        await _tracer(
          "Chasse \u00ab " + name + " \u00bb : rien envoy\u00e9",
          "Verrou anti-spam par " + v.nom + " : encore " + reste + " min. "
          + (v.nom === "boisson"
             ? "Quelqu'un a d\u00e9j\u00e0 lanc\u00e9 une vague pour cette boisson r\u00e9cemment."
             : "Ce compte a d\u00e9j\u00e0 d\u00e9clench\u00e9 une vague r\u00e9cemment. Essaie depuis l'autre t\u00e9l\u00e9phone, ou attends."),
          0, 0);
        return;
      }
    }
    for (const v of verrous) { try { await v.ref.set({ at: now }); } catch (e) {} }
    /* Diffusion aux tokens proches (hors chercheurs). Borne : sans limite, une
       vague lisait la collection entiere — le cout grandit avec la base. */
    const tokensSnap = await db.collection("pushTokens").limit(3000).get();
    const msgs = [];
    tokensSnap.forEach(function(d){
      if (seekerUids.has(d.id)) return;         // pas le(s) chercheur(s)
      const t = d.data();
      if (!t.token) return;
      // On EXCLUT seulement quand on est SÛR que c'est trop loin (centre connu ET
      // position du destinataire connue ET distance > 15 km). Sinon on notifie
      // quand même (position manquante d'un côté = on ne cache pas la chasse).
      if (center && t.lat != null && _dist(center.lat, center.lng, t.lat, t.lng) > 15) return;
      msgs.push({
        token: t.token,
        notification: { title: "Chasse pres de toi", body: "Quelqu'un cherche « " + name + " ». Si tu la vois en magasin, signale-la et gagne des points." },
        data: { type: "hunt", drinkId: String(after.drinkId || "") },
        webpush: { fcmOptions: { link: "https://magonyos991-ux.github.io/magofeed/" } }
      });
    });
    // Envoi (par lots de 500 max côté FCM)
    for (let i = 0; i < msgs.length; i += 500) {
      try { await getMessaging().sendEach(msgs.slice(i, i + 500)); } catch (e) { console.warn("hunt push batch:", e && e.message); }
    }
    console.log("Chasse « " + name + " » : " + msgs.length + " notifiés.");
    await _tracer(
      "Chasse \u00ab " + name + " \u00bb",
      msgs.length
        ? (msgs.length + " personne(s) pr\u00e9venue(s) autour de " + center.lat + ", " + center.lng
           + " \u00b7 " + tokensSnap.size + " appareil(s) enregistr\u00e9(s) au total.")
        : ("Aucun appareil \u00e0 moins de 15 km du centre (" + center.lat + ", " + center.lng + "). "
           + tokensSnap.size + " appareil(s) enregistr\u00e9(s) au total, tous trop loin ou d\u00e9j\u00e0 chasseurs."),
      tokensSnap.size, msgs.length);
  }
);

/* CHASSE TROUVÉE — l'autre moitié : quand un chasseur AJOUTE une boisson à un
   magasin (le tableau `drinks` du magasin gagne un id), on prévient ceux qui la
   guettaient (collection `watches`) et qui sont à proximité : « Trouvée près
   de toi — voilà où l'acheter ». Le chasseur, lui, a déjà son bonus in-app.
   ADAPTE : casse de la collection magasins ("stores" vs "Stores"). */
exports.notifyStockToWatchers = onDocumentUpdated(
  { document: "stores/{id}", region: REGION },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const bd = new Set((before.drinks || []).map(String));
    const added = (after.drinks || []).map(String).filter(function(x){ return !bd.has(x); });
    /* GARDE-FOU CONTRE LA TEMPETE. Une vraie observation en rayon ajoute une
       boisson, parfois deux. Un remplissage d'enseigne en ajoute jusqu'a mille
       deux cents, sur des milliers de magasins : ce declencheur partait alors
       une fois par boisson et par magasin, chacune avec sa requete watches —
       de quoi noyer les utilisateurs de notifications et faire exploser la
       facture, sur un seul clic d'administration. Au-dela de trois boissons
       d'un coup, ce n'est plus quelqu'un qui a vu quelque chose : on se tait. */
    if (added.length > 3) return;

    if (!added.length) return;
    const sLat = after.lat, sLng = after.lng, sName = String(after.name || "un magasin");
    for (const drinkId of added) {
      let watchSnap;
      try {
        watchSnap = await db.collection("watches").where("drinkId", "==", Number(drinkId) || drinkId).limit(200).get();
      } catch (e) { console.warn("watches query:", e && e.message); continue; }
      for (const w of watchSnap.docs) {
        const wd = w.data();
        /* Le champ uid d'une veille est ecrit par le client. Les regles Firestore le
           verrouillent desormais des deux cotes, mais on ne fait pas dependre d'un seul
           verrou l'envoi d'un message a une personne : l'identifiant du document EST
           « uid_boisson » (fbSyncWatch), on recoupe donc le champ avec le nom du
           document. Une veille repointee sur quelqu'un d'autre ne passe plus. */
        if (!wd.uid || !String(w.id).startsWith(String(wd.uid) + "_")) continue;
        // Rayon choisi par la personne (curseur 1 → 20 km) ; 10 par défaut.
        const radius = (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
        if (sLat != null && wd.lat != null && _dist(sLat, sLng, wd.lat, wd.lng) > radius) continue;
        const dName = String(wd.drinkName || "Ta boisson").slice(0, 40);
        const storeId = String(event.params.id);
        await pushToUser(
          wd.uid,
          "Trouvee pres de toi",
          "« " + dName + " » vient d'être repérée chez " + sName + ". Fonce l'acheter avant qu'elle parte !",
          { type: "found", drinkId: String(drinkId), storeId: storeId },
          // Tap sur la notif -> ouvre directement la fiche du magasin (+ carte) :
          APP_URL + "#store=" + encodeURIComponent(storeId)
        );
      }
    }
  }
);
