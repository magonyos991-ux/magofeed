/**
 * Magofeed — PHASE 2 : points VALIDÉS côté serveur (infalsifiables) + réputation.
 *
 * Pourquoi : aujourd'hui les points sont écrits par l'app (client). Un
 * utilisateur avancé peut donc s'en donner via la console. La seule vraie
 * parade, c'est de créditer les points depuis le SERVEUR, que le client ne
 * peut pas contourner. Ce fichier fait ça pour la récompense la plus
 * importante — la promotion d'une découverte — et pose les bases de la
 * réputation.
 *
 * ⚠️ NE DÉPLOIE PAS ce fichier en même temps que le crédit client, sinon
 *    l'auteur reçoit +50 DEUX fois. Suis l'ordre du README (« Bascule Phase 2 »)
 *    et applique le petit changement dans index.html indiqué plus bas.
 *
 * ⚠️ À TESTER (émulateur puis prod) : je ne peux pas exécuter Firebase ici.
 *
 * Firebase Functions v2 (Node 18+).
 */
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1"; // ADAPTE

const PROMO_REWARD = 50; // doit rester égal à PROMO_REWARD dans index.html

/* Crédite l'auteur d'une découverte quand elle est promue — CÔTÉ SERVEUR.
 * Idempotent : on marque la découverte `rewardGranted:true` dans la même
 * transaction, donc même si l'événement se re-déclenche, on ne crédite qu'une
 * fois. C'est ça qui rend le point « validé » : le client ne décide plus.
 */
exports.awardPromotionPoints = onDocumentUpdated(
  { document: "discoveries/{id}", region: REGION },
  async (event) => {
    const ref = event.data.after.ref;
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    // On ne réagit qu'au passage promoted:false -> true, une seule fois.
    if (before.promoted === true || after.promoted !== true) return;
    if (after.rewardGranted === true) return;
    const by = after.by;
    if (!by) { console.log("Promotion sans auteur (by) — aucun point"); return; }

    const userRef = db.collection("users").doc(String(by));
    await db.runTransaction(async (tx) => {
      const dsnap = await tx.get(ref);
      const d = dsnap.data() || {};
      if (d.promoted !== true || d.rewardGranted === true) return; // course : déjà fait
      tx.set(userRef, {
        points: FieldValue.increment(PROMO_REWARD),
        discAccepted: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      tx.update(ref, { rewardGranted: true, rewardedAt: FieldValue.serverTimestamp() });
    });
    console.log("✅ +" + PROMO_REWARD + " crédités (serveur) à " + by);
  }
);

/* ────────────────────────────────────────────────────────────────────────────
 * RÉPUTATION (couche 1 anti-triche) — à activer quand tu voudras.
 *
 * Idée : ne pas récompenser l'ACTION mais la DONNÉE CONFIRMÉE. Les points d'une
 * contribution restent « en attente » tant qu'un 2ᵉ utilisateur indépendant ne
 * l'a pas confirmée. Résultat : impossible de farmer seul.
 *
 * Prérequis de schéma (À AJOUTER — l'app agrège aujourd'hui les confirmations
 * dans stores/{id}.confirmations.{drinkId}, sans trace par utilisateur) :
 *   - Écrire chaque confirmation comme un doc :
 *       confirmations/{storeId}_{drinkId}_{uid} = { storeId, drinkId, uid, at }
 *     (règle : create si isSelf(uid) ; pas d'update/delete). Ça donne « qui a
 *     confirmé quoi », indispensable pour compter des confirmations INDÉPENDANTES.
 *
 * Fonction (squelette) : à la 2ᵉ confirmation indépendante d'un couple
 * (store, drink), créditer l'AUTEUR initial de points « validés » + monter sa
 * réputation. Laisse en commentaire tant que le schéma ci-dessus n'existe pas.
 *
 * exports.awardOnSecondConfirmation = onDocumentCreated(
 *   { document: "confirmations/{cid}", region: REGION },
 *   async (event) => {
 *     const c = event.data.data();
 *     const q = await db.collection("confirmations")
 *       .where("storeId","==",c.storeId).where("drinkId","==",c.drinkId).get();
 *     const uids = new Set(q.docs.map(d => d.data().uid));
 *     if (uids.size === 2) {               // devient « fiable » à 2 personnes
 *       const firstUid = [...uids].find(u => u !== c.uid) || c.uid;
 *       await db.collection("users").doc(firstUid).set({
 *         points: FieldValue.increment(3),
 *         trust:  FieldValue.increment(1),
 *         updatedAt: FieldValue.serverTimestamp()
 *       }, { merge: true });
 *     }
 *   }
 * );
 * ──────────────────────────────────────────────────────────────────────────── */
