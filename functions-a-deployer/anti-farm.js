/**
 * Magofeed — ANTI-FARM : les faux stocks font PERDRE des points.
 *
 * Le problème réel : annoncer « en stock » rapporte +10 points. Rien
 * n'empêchait quelqu'un d'enchaîner des annonces bidon depuis son canapé.
 * Les points montaient, la carte devenait fausse, et les vraies personnes
 * se déplaçaient pour rien — c'est exactement ce qui tue une app comme
 * celle-ci.
 *
 * La correction : si plusieurs personnes DIFFÉRENTES passent ensuite sur
 * place et signalent la boisson absente, l'auteur de l'annonce perd les
 * points qu'elle lui avait rapportés.
 *
 * ── Pourquoi ce n'est PAS punissable à tort ──────────────────────────────
 *  1. Il faut DEUX personnes différentes (SEUIL) qui signalent la rupture.
 *     Un seul râleur ne peut donc sanctionner personne.
 *  2. Ces personnes ne doivent être ni l'auteur, ni entre elles la même.
 *  3. L'annonce doit être RÉCENTE (FENETRE_JOURS). Une boisson vue il y a
 *     trois semaines et vendue depuis n'est pas un mensonge : c'est la vie
 *     d'un rayon. On ne sanctionne que ce qui ressemble à une invention.
 *  4. Une même annonce (auteur + magasin + boisson) n'est sanctionnée
 *     qu'UNE seule fois : le document penalties/{clé} sert de verrou.
 *
 * ── Pourquoi la sanction est ineffaçable ─────────────────────────────────
 * Elle n'est PAS retirée de users/{uid}.points (que le client réécrit à
 * chaque synchronisation — Phase 1). Elle s'accumule dans un champ à part,
 * users/{uid}.penalty, que les règles Firestore interdisent au client
 * d'écrire. L'app lit ce champ et affiche points − penalty, partout :
 * profil, niveau, classement. Vider le cache ne l'efface pas.
 *
 * ⚠️ À DÉPLOYER AVEC la version de firestore.rules de ce dossier : sans
 *    la règle qui protège `penalty`, un utilisateur pourrait le remettre à
 *    zéro lui-même et toute cette fonction ne servirait à rien.
 *
 * Firebase Functions v2 (Node 18+). Déploiement : voir README.md.
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1"; // ADAPTE si ton projet est ailleurs

// ── Réglages (change-les ici, un seul endroit) ──────────────────────────
const SEUIL = 2;              // combien de personnes différentes doivent contredire
const FENETRE_JOURS = 10;     // au-delà, une rupture n'est plus une contradiction
const POINTS_RETIRES = 10;    // exactement ce que rapportait l'annonce "stock"
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

/* Clé de verrou : une annonce = un auteur + un magasin + une boisson.
   Les identifiants peuvent contenir n'importe quoi, on les nettoie pour
   qu'ils tiennent dans un nom de document Firestore. */
function clePenalite(uid, storeId, drinkId) {
  const propre = (v) => String(v == null ? "" : v).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
  return propre(uid) + "__" + propre(storeId) + "__" + propre(drinkId);
}

/* Horodatage d'un rapport : createdAt est un serverTimestamp, mais un
   document tout juste écrit peut le présenter à null pendant un instant.
   On retombe alors sur "maintenant", ce qui est le comportement sûr. */
function quand(data) {
  try {
    if (data && data.createdAt && typeof data.createdAt.toMillis === "function") {
      return data.createdAt.toMillis();
    }
  } catch (e) {}
  return Date.now();
}

async function prevenir(uid, perdus) {
  // In-app d'abord : c'est le canal qui marche toujours.
  try {
    await db.collection("userNotifs").add({
      to: String(uid),
      type: "penalty",
      title: "-" + perdus + " points",
      body: "Une boisson que tu avais annoncée en stock a été signalée absente par plusieurs personnes.",
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn("anti-farm notif:", e && e.message); }
  // Push si la personne a un token (sinon on n'insiste pas).
  try {
    const snap = await db.collection("pushTokens").doc(String(uid)).get();
    const token = snap.exists && snap.data().token;
    if (!token) return;
    await getMessaging().send({
      token: token,
      notification: {
        title: "-" + perdus + " points sur Magofeed",
        body: "Un stock que tu avais annoncé n'y était pas. Signale ce que tu vois vraiment."
      },
      data: { type: "penalty" },
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
        fcmOptions: { link: APP_URL }
      }
    });
  } catch (e) { console.warn("anti-farm push:", e && e.message); }
}

/**
 * Déclenchée à CHAQUE nouveau rapport. On ne fait quelque chose que pour
 * les ruptures : elles seules peuvent contredire une annonce de stock.
 */
exports.antiFarmRupture = onDocumentCreated(
  { region: REGION, document: "reports/{reportId}" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const r = snap.data() || {};
    if (r.type !== "rupture") return;
    const storeId = r.storeId, drinkId = r.drinkId;
    if (storeId == null || drinkId == null) return;

    const maintenant = Date.now();
    const limite = maintenant - FENETRE_JOURS * 86400000;

    // 1) Toutes les annonces "stock" RÉCENTES sur ce couple magasin/boisson.
    //    (Requête simple : deux égalités + un tri. Firestore demandera
    //    peut-être un index composite — le lien apparaît dans les logs.)
    let stocks;
    try {
      stocks = await db.collection("reports")
        .where("storeId", "==", storeId)
        .where("drinkId", "==", drinkId)
        .where("type", "==", "stock")
        .orderBy("createdAt", "desc")
        .limit(30)
        .get();
    } catch (e) {
      console.warn("anti-farm: lecture des stocks impossible:", e && e.message);
      return;
    }
    const auteurs = new Set();
    stocks.forEach((d) => {
      const x = d.data() || {};
      if (!x.by) return;
      if (quand(x) < limite) return;   // trop vieux : ce n'est plus une contradiction
      auteurs.add(String(x.by));
    });
    if (!auteurs.size) return;

    // 2) Combien de personnes DIFFÉRENTES ont signalé la rupture depuis ?
    let ruptures;
    try {
      ruptures = await db.collection("reports")
        .where("storeId", "==", storeId)
        .where("drinkId", "==", drinkId)
        .where("type", "==", "rupture")
        .orderBy("createdAt", "desc")
        .limit(30)
        .get();
    } catch (e) {
      console.warn("anti-farm: lecture des ruptures impossible:", e && e.message);
      return;
    }
    const contradicteurs = new Set();
    ruptures.forEach((d) => {
      const x = d.data() || {};
      if (!x.by) return;
      if (quand(x) < limite) return;
      contradicteurs.add(String(x.by));
    });

    // 3) Pour chaque auteur d'annonce : ses propres signalements ne comptent
    //    pas contre lui (corriger sa propre erreur est un bon réflexe, pas
    //    une faute — sinon personne ne corrigerait jamais rien).
    for (const uid of auteurs) {
      const contre = new Set(contradicteurs);
      contre.delete(uid);
      if (contre.size < SEUIL) continue;

      const ref = db.collection("penalties").doc(clePenalite(uid, storeId, drinkId));
      // Verrou transactionnel : deux ruptures qui arrivent en même temps ne
      // doivent pas retirer les points deux fois.
      let aSanctionner = false;
      try {
        await db.runTransaction(async (tx) => {
          const dejaVu = await tx.get(ref);
          if (dejaVu.exists) return;          // déjà sanctionné : on ne repasse pas
          tx.set(ref, {
            uid: String(uid),
            storeId: storeId,
            drinkId: drinkId,
            points: POINTS_RETIRES,
            contradicteurs: contre.size,
            createdAt: FieldValue.serverTimestamp()
          });
          tx.set(
            db.collection("users").doc(String(uid)),
            {
              penalty: FieldValue.increment(POINTS_RETIRES),
              penaltyAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
          aSanctionner = true;
        });
      } catch (e) {
        console.warn("anti-farm transaction:", e && e.message);
        continue;
      }
      if (aSanctionner) {
        console.log("anti-farm: -" + POINTS_RETIRES + " pts a " + uid +
                    " (magasin " + storeId + ", boisson " + drinkId + ")");
        await prevenir(uid, POINTS_RETIRES);
      }
    }
  }
);
