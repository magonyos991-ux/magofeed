/**
 * Magofeed — POINTS CREDITES PAR LE SERVEUR, ET PARRAINAGE
 * ============================================================================
 *
 * POURQUOI CE FICHIER EXISTE
 * Aujourd'hui l'application ecrit elle-meme `users/{uid}.points`, et la regle
 * Firestore l'autorise. N'importe qui peut donc ouvrir la console de son
 * navigateur et s'ecrire 999 999 points : le classement est falsifiable sans
 * aucun effort particulier. Tant que c'est vrai, TOUTE recompense — parrainage
 * compris — est decorative.
 *
 * CE QU'ON NE FAIT PAS, ET POURQUOI
 * La note POINTS-PHASE2-plan.md a compte 28 endroits ou l'application credite
 * des points. Les migrer un par un est un chantier, et bloquer l'ecriture
 * avant de les avoir tous migres gelerait le compteur : l'utilisateur honnete
 * verrait ses points cesser de monter sans explication. Pire que le probleme.
 *
 * CE QU'ON FAIT
 * Le serveur credite a partir de la PREUVE, c'est-a-dire du document que
 * l'action a laisse dans Firestore. Une confirmation de stock ecrit un
 * document `reports` ; une decouverte ecrit un document `discoveries`. Ces
 * documents, le client ne peut pas les inventer sans laisser de trace, et
 * c'est le serveur qui decide ce qu'ils valent.
 *
 * Chaque credit est IDEMPOTENT : le document est marque `counted:true` dans la
 * meme transaction que l'increment. Un evenement rejoue ne credite pas deux
 * fois.
 *
 * CE QUI N'EST PAS COMPTE, ET C'EST VOULU
 * Les recompenses qui ne laissent aucune trace serveur — serie de jours,
 * missions du jour, note d'une boisson, partage — ne comptent plus dans le
 * score officiel. Elles restent affichees localement pour l'encouragement,
 * mais elles ne sont pas verifiables, donc elles ne pesent pas au classement.
 * Un score qui melange du verifiable et du declaratif n'est pas un score.
 *
 * PERSONNE NE PERD SES POINTS : la bascule commence par figer le solde actuel
 * de chacun dans `pointsHerites`. Le score officiel vaut toujours
 * heritage + preuves - sanctions. On ne repart pas de zero.
 *
 * ⚠️ ORDRE DE DEPLOIEMENT — a respecter, voir README-DEPLOIEMENT-POINTS.md.
 * ⚠️ awardPromotionPoints (points-serveur-PHASE2.js) credite deja +50 a la
 *    promotion d'une decouverte. Si tu l'as deploye, NE deploie pas
 *    `crediterPromotion` ci-dessous : ce serait deux fois. Une seule des deux.
 *
 * Firebase Functions v2 (Node 18+).
 */
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";

/* ---------------------------------------------------------------------------
   LE BAREME. Volontairement plus bas que les montants affiches par l'app :
   ceux-ci recompensent l'usage, celui-ci mesure l'apport verifiable. Les deux
   compteurs n'ont pas le meme role et n'ont pas a etre egaux.
--------------------------------------------------------------------------- */
const BAREME_REPORT = {
  stock: 3,        // « je l'ai vue en rayon »
  rupture: 3,      // « elle n'y est plus » — vaut autant : c'est le contrepoids
  contrefacon: 3,
  codebarre: 2,    // un code-barres conteste
  badstore: 2,     // un faux magasin signale
  nouveau: 2,
  prix: 2          // un prix releve en rayon (note = le prix)
};
const POINTS_DECOUVERTE = 20;   // proposer une decouverte
const POINTS_PROMOTION = 50;    // elle entre au catalogue

/* Plafond quotidien : au-dela, on n'ecrit plus de points. Vingt contributions
   comptees dans une journee, c'est deja beaucoup pour quelqu'un d'honnete ;
   c'est surtout ce qui empeche de vider un rayon entier en boucle. */
const MAX_POINTS_JOUR = 60;

const jourUTC = (d) => new Date(d || Date.now()).toISOString().slice(0, 10);

/* Credite un utilisateur, en respectant le plafond du jour. Renvoie ce qui a
   ete reellement credite (0 si le plafond etait atteint). */
async function crediter(uid, montant, motif) {
  if (!uid || !(montant > 0)) return 0;
  const ref = db.doc(`users/${uid}`);
  const j = jourUTC();
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : {};
    const dejaJour = (d.pointsJour === j) ? (d.pointsJourTotal || 0) : 0;
    const reste = Math.max(0, MAX_POINTS_JOUR - dejaJour);
    const verse = Math.min(montant, reste);
    if (verse <= 0) return 0;
    tx.set(ref, {
      pointsPreuves: FieldValue.increment(verse),
      pointsJour: j,
      pointsJourTotal: dejaJour + verse,
      pointsMaj: FieldValue.serverTimestamp(),
      dernierMotif: String(motif || "").slice(0, 40)
    }, { merge: true });
    return verse;
  });
}

/* Le score officiel : heritage du solde d'avant la bascule, plus les preuves,
   plus le parrainage, moins les sanctions. On l'ecrit dans `points` pour que
   le classement n'ait rien a changer. */
async function recalculerScore(uid) {
  if (!uid) return;
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data() || {};
    const total = Math.max(0,
      (d.pointsHerites || 0) + (d.pointsPreuves || 0) + (d.refPoints || 0) - (d.penalty || 0));
    if (d.points === total) return;
    tx.set(ref, { points: total }, { merge: true });
  });
}

/* Anti-rejeu : la meme personne, le meme magasin, la meme boisson, le meme
   type, deux fois dans la journee — la seconde ne rapporte rien. Sans ca, il
   suffit de tapoter le meme bouton. */
async function dejaCompteAujourdhui(rep, idCourant) {
  if (!rep.by) return true;
  const debut = Timestamp.fromDate(new Date(jourUTC() + "T00:00:00Z"));
  const q = await db.collection("reports")
    .where("by", "==", rep.by)
    .where("createdAt", ">=", debut)
    .limit(80).get();
  return q.docs.some((s) => {
    if (s.id === idCourant) return false;
    const o = s.data() || {};
    return o.counted === true &&
           String(o.storeId) === String(rep.storeId) &&
           String(o.drinkId) === String(rep.drinkId) &&
           o.type === rep.type;
  });
}

/* ── Une contribution laisse un document `reports` : c'est elle qui paie ── */
exports.crediterContribution = onDocumentCreated(
  { document: "reports/{id}", region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const rep = snap.data() || {};
    if (rep.counted === true) return;              // deja passe
    const montant = BAREME_REPORT[rep.type] || 0;
    if (!montant || !rep.by) { await snap.ref.set({ counted: true, credited: 0 }, { merge: true }); return; }
    // Un stock ou une rupture declares de loin (ou sans position) ne rapportent rien.
    if ((rep.type === "stock" || rep.type === "rupture") && !surPlace(rep)) {
      await snap.ref.set({ counted: true, credited: 0, raison: "trop loin" }, { merge: true });
      return;
    }
    if (await dejaCompteAujourdhui(rep, snap.id)) {
      await snap.ref.set({ counted: true, credited: 0, raison: "rejeu" }, { merge: true });
      return;
    }
    const verse = await crediter(rep.by, montant, rep.type);
    await snap.ref.set({ counted: true, credited: verse }, { merge: true });
    await recalculerScore(rep.by);
    await evaluerParrainage(rep.by);
  }
);

/* ── ENTRAIDE : « je l'ai vue » pour une chasse, confirmee par un chercheur ──
   L'aidant rattache une boisson chassee a un magasin : son rapport `stock`
   est marque hunt:true si, a ce moment, quelqu'un d'AUTRE chassait cette
   boisson depuis avant (hunts.seekers.{uid}.at < createdAt — `at` est fige
   par les regles). Quand un de ces chercheurs confirme a son tour le meme
   (magasin, boisson) — un rapport `stock` a lui, posterieur — l'aidant
   touche +15, une seule fois par rapport aide (huntCredited), avec un
   plafond par paire (aidant, chercheur) sur 30 jours. Un « pas la » ne paie
   rien de plus a personne : la rupture est deja un rapport ordinaire, et
   deux ruptures distinctes sanctionnent l'aidant (anti-farm.js).
   Index composites a creer (la console les propose au premier appel) :
   reports(storeId, createdAt) et reports(by, huntCreditedBy). */
const POINTS_ENTRAIDE = 15;
const POINTS_ENTRAIDE_LOIN = 5;   // le chercheur a confirme sans etre sur place
const ENTRAIDE_FENETRE_J = 14;
const ENTRAIDE_MAX_PAIRE_30J = 3;
const CHERCHEUR_AGE_MIN_J = 2;    // un compte cree hier ne valide rien

/* Provenance d'un rapport : note = "source|distance en m" (voir _provenance
   dans index.html). Un rapport fait de loin, ou sans position, reste une trace
   utile mais ne vaut aucun point : personne ne voit un rayon depuis son canape. */
const DIST_MAX_M = 500;
function distanceRapport(rep) {
  const m = /\|(\d+)$/.exec(String(rep.note || ""));
  return m ? Number(m[1]) : null;                 // null = inconnue
}
function surPlace(rep) { const d = distanceRapport(rep); return d != null && d <= DIST_MAX_M; }

exports.crediterEntraide = onDocumentCreated(
  { document: "reports/{id}", region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const rep = snap.data() || {};
    if (rep.type !== "stock" || !rep.by || !rep.storeId || rep.drinkId == null) return;
    const creeA = rep.createdAt ? rep.createdAt.toMillis() : Date.now();
    const hunt = await db.doc(`hunts/${String(rep.drinkId)}`).get();
    const seekers = hunt.exists ? ((hunt.data() || {}).seekers || {}) : {};

    // 1) Ce rapport repond-il a une chasse ouverte par quelqu'un d'autre ?
    const autres = Object.keys(seekers).filter((u) =>
      seekers[u] && u !== rep.by && typeof seekers[u].at === "number" && seekers[u].at < creeA);
    if (autres.length) await snap.ref.set({ hunt: true }, { merge: true });

    // 2) Ce rapport confirme-t-il l'aide de quelqu'un d'autre ? Il faut que
    //    son auteur soit lui-meme chercheur de cette boisson, inscrit avant
    //    le rapport de l'aidant.
    const moi = seekers[rep.by];
    if (!moi || typeof moi.at !== "number") return;
    // Un chercheur trop neuf ne valide rien : c'est le compte jetable du duo.
    const u = await db.doc(`users/${rep.by}`).get();
    const cree = (u.exists && u.data().createdAt && u.data().createdAt.toMillis) ? u.data().createdAt.toMillis() : 0;
    if (cree && Date.now() - cree < CHERCHEUR_AGE_MIN_J * 86400000) return;
    const depuis = Timestamp.fromMillis(creeA - ENTRAIDE_FENETRE_J * 86400000);
    const q = await db.collection("reports")
      .where("storeId", "==", rep.storeId)
      .where("createdAt", ">=", depuis)
      .limit(60).get();
    const aides = q.docs
      .map((d) => Object.assign({ id: d.id }, d.data()))
      .filter((o) => o.type === "stock" && o.hunt === true && o.by !== rep.by
        && String(o.drinkId) === String(rep.drinkId) && !o.huntCredited
        && o.createdAt && o.createdAt.toMillis() < creeA
        && moi.at < o.createdAt.toMillis())
      .sort((x, y) => x.createdAt.toMillis() - y.createdAt.toMillis());
    if (!aides.length) return;
    const aide = aides[0];

    // Plafond par paire : au plus 3 aides credites de A confirmees par B en 30 j.
    const paire = await db.collection("reports")
      .where("by", "==", aide.by)
      .where("huntCreditedBy", "==", rep.by)
      .limit(ENTRAIDE_MAX_PAIRE_30J + 2).get();
    const recents = paire.docs.filter((d) => {
      const t = (d.data() || {}).huntCreditedAt;
      return t && t.toMillis() > Date.now() - 30 * 86400000;
    }).length;
    const marque = { huntCredited: true, huntCreditedBy: rep.by, huntCreditedAt: FieldValue.serverTimestamp() };
    if (recents >= ENTRAIDE_MAX_PAIRE_30J) {
      await db.doc(`reports/${aide.id}`).set(Object.assign(marque, { huntCreditedPts: 0, raison: "paire" }), { merge: true });
      return;
    }
    const montant = surPlace(rep) ? POINTS_ENTRAIDE : POINTS_ENTRAIDE_LOIN;
    const verse = await crediter(aide.by, montant, "entraide");
    await db.doc(`reports/${aide.id}`).set(Object.assign(marque, { huntCreditedPts: verse }), { merge: true });
    await recalculerScore(aide.by);
  }
);

/* ── Proposer une decouverte ── */
exports.crediterDecouverte = onDocumentCreated(
  { document: "discoveries/{id}", region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() || {};
    if (d.counted === true || !d.by) return;
    const verse = await crediter(d.by, POINTS_DECOUVERTE, "decouverte");
    await snap.ref.set({ counted: true, credited: verse }, { merge: true });
    await recalculerScore(d.by);
    await evaluerParrainage(d.by);
  }
);

/* ── Elle entre au catalogue ──
   ⚠️ N'ACTIVE CELLE-CI QUE SI awardPromotionPoints n'est PAS deploye. */
exports.crediterPromotion = onDocumentUpdated(
  { document: "discoveries/{id}", region: REGION },
  async (event) => {
    const avant = event.data.before.data() || {};
    const apres = event.data.after.data() || {};
    if (avant.promoted === true || apres.promoted !== true) return;
    if (apres.promoCounted === true || !apres.by) return;
    const verse = await crediter(apres.by, POINTS_PROMOTION, "promotion");
    await event.data.after.ref.set({ promoCounted: true, promoCredited: verse }, { merge: true });
    await recalculerScore(apres.by);
  }
);

/* ── Une sanction change le score : on le recalcule ── */
exports.scoreApresSanction = onDocumentUpdated(
  { document: "users/{uid}", region: REGION },
  async (event) => {
    const a = event.data.before.data() || {};
    const b = event.data.after.data() || {};
    if ((a.penalty || 0) === (b.penalty || 0) &&
        (a.pointsHerites || 0) === (b.pointsHerites || 0)) return;
    await recalculerScore(event.params.uid);
  }
);

/* ===========================================================================
   PARRAINAGE
   ---------------------------------------------------------------------------
   La recompense n'arrive PAS a l'inscription. Creer un compte ne coute rien
   ici — la connexion anonyme est automatique — donc payer l'inscription
   reviendrait a installer une imprimante a points : quelques navigations
   privees et le tour est joue.
   On paie quand le filleul devient REELLEMENT actif. A ce moment-la, farmer
   demande plus de travail que de contribuer honnetement, et le probleme se
   resout tout seul.
=========================================================================== */
const PARRAIN_POINTS = 20;
const FILLEUL_POINTS = 10;
const SEUIL_CONTRIBUTIONS = 3;    // documents `reports` comptes
const SEUIL_MAGASINS = 2;         // dans au moins deux magasins differents
const SEUIL_JOURS = 2;            // sur au moins deux journees differentes
const DELAI_JOURS = 7;            // et pas avant une semaine
const MAX_FILLEULS_SEMAINE = 3;
const MAX_FILLEULS_TOTAL = 10;

/* Le filleul est-il devenu actif ? On ne regarde que des documents ecrits par
   le serveur ou horodates par lui : rien de declaratif. */
async function filleulActif(uid, depuis) {
  const q = await db.collection("reports")
    .where("by", "==", uid).where("counted", "==", true)
    .limit(60).get();
  const magasins = new Set(), jours = new Set();
  let n = 0;
  q.docs.forEach((s) => {
    const o = s.data() || {};
    if (!(o.credited > 0)) return;                 // un rejeu ne compte pas
    if (depuis && o.createdAt && o.createdAt.toMillis() < depuis) return;
    n++;
    if (o.storeId) magasins.add(String(o.storeId));
    if (o.createdAt) jours.add(jourUTC(o.createdAt.toMillis()));
  });
  return n >= SEUIL_CONTRIBUTIONS && magasins.size >= SEUIL_MAGASINS && jours.size >= SEUIL_JOURS;
}

/* Appele apres chaque contribution du filleul. Ne fait rien tant que les
   conditions ne sont pas reunies — et ne paie qu'une fois. */
async function evaluerParrainage(uidFilleul) {
  try {
    const ref = db.doc(`referrals/${uidFilleul}`);
    const snap = await ref.get();
    if (!snap.exists) return;
    const r = snap.data() || {};
    if (r.status !== "pending") return;

    const ne = r.createdAt ? r.createdAt.toMillis() : 0;
    if (!ne || Date.now() - ne < DELAI_JOURS * 86400000) return;   // trop tot
    if (!(await filleulActif(uidFilleul, ne))) return;

    // Qui est le parrain ? Le client n'a jamais ecrit son identifiant : il n'a
    // ecrit qu'un code court. C'est le serveur qui le resout.
    const codeSnap = await db.doc(`refCodes/${String(r.code || "").toUpperCase()}`).get();
    if (!codeSnap.exists) { await ref.set({ status: "expired", raison: "code inconnu" }, { merge: true }); return; }
    const parrain = (codeSnap.data() || {}).uid;
    if (!parrain || parrain === uidFilleul) {
      await ref.set({ status: "expired", raison: "auto-parrainage" }, { merge: true });
      return;
    }

    // Plafonds du parrain, comptes sur des documents que lui ne peut pas ecrire
    const semaine = Timestamp.fromMillis(Date.now() - 7 * 86400000);
    const payes = await db.collection("referrals")
      .where("parrain", "==", parrain).where("status", "==", "paid").limit(40).get();
    if (payes.size >= MAX_FILLEULS_TOTAL) {
      await ref.set({ status: "expired", raison: "plafond total" }, { merge: true }); return;
    }
    const cetteSemaine = payes.docs.filter((s) => {
      const p = (s.data() || {}).paidAt;
      return p && p.toMillis() >= semaine.toMillis();
    }).length;
    if (cetteSemaine >= MAX_FILLEULS_SEMAINE) return;   // pas « expire » : on reessaiera

    await db.doc(`users/${parrain}`).set({
      refPoints: FieldValue.increment(PARRAIN_POINTS),
      refCount: FieldValue.increment(1),
      refAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await db.doc(`users/${uidFilleul}`).set({
      refPoints: FieldValue.increment(FILLEUL_POINTS)
    }, { merge: true });
    await ref.set({
      status: "paid", parrain: parrain,
      paidAt: FieldValue.serverTimestamp(),
      montantParrain: PARRAIN_POINTS, montantFilleul: FILLEUL_POINTS
    }, { merge: true });
    await recalculerScore(parrain);
    await recalculerScore(uidFilleul);
    console.log(`Parrainage paye : ${parrain} <- ${uidFilleul}`);
  } catch (e) {
    console.warn("evaluerParrainage :", e && e.message);
  }
}

/* Fabrique le code court du parrain, une seule fois, et le renvoie.
   Base32 de Crockford, sans I/L/O/U pour qu'on puisse le dicter au telephone
   sans ambiguite. On ne met JAMAIS l'identifiant brut dans un lien : le
   document users/{uid} est lisible par tout le monde (c'est ce qui fait
   marcher le classement), donc un identifiant partage est une cle de lecture
   permanente vers le profil. Un code, lui, se revoque. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
exports.monCodeParrain = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");
  const u = await db.doc(`users/${uid}`).get();
  const existant = u.exists ? (u.data() || {}).refCode : null;
  if (existant) return { code: existant };
  for (let essai = 0; essai < 12; essai++) {
    let code = "";
    for (let i = 0; i < 5; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    try {
      await db.doc(`refCodes/${code}`).create({ uid: uid, createdAt: FieldValue.serverTimestamp() });
      await db.doc(`users/${uid}`).set({ refCode: code }, { merge: true });
      return { code: code };
    } catch (e) { /* deja pris : on retire */ }
  }
  throw new HttpsError("internal", "Impossible de generer un code, reessaie.");
});

/* Le filleul declare le code recu. On n'ecrit qu'une intention : le paiement
   viendra plus tard, quand il aura contribue. Un filleul ne peut declarer
   qu'une fois dans sa vie — l'identifiant du document est son uid. */
exports.utiliserCodeParrain = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");
  const code = String((req.data && req.data.code) || "").trim().toUpperCase().slice(0, 8);
  if (code.length < 4) throw new HttpsError("invalid-argument", "Code trop court.");
  const codeSnap = await db.doc(`refCodes/${code}`).get();
  if (!codeSnap.exists) throw new HttpsError("not-found", "Ce code n'existe pas.");
  if ((codeSnap.data() || {}).uid === uid) throw new HttpsError("failed-precondition", "C'est ton propre code.");
  const ref = db.doc(`referrals/${uid}`);
  try {
    await ref.create({ code: code, status: "pending", createdAt: FieldValue.serverTimestamp() });
  } catch (e) {
    throw new HttpsError("already-exists", "Tu as deja utilise un code de parrainage.");
  }
  return { ok: true, delaiJours: DELAI_JOURS, seuil: SEUIL_CONTRIBUTIONS };
});

/* Bascule : fige le solde actuel de chacun pour que PERSONNE ne perde ses
   points quand le serveur reprend la main. A lancer UNE fois, avant de
   durcir les regles. Reservee a l'admin. */
exports.figerPointsExistants = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  const moi = await db.doc(`admins/${uid}`).get();
  if (!moi.exists) throw new HttpsError("permission-denied", "Reserve a l'administrateur.");
  let traites = 0, curseur = null;
  for (;;) {
    let q = db.collection("users").orderBy("__name__").limit(300);
    if (curseur) q = q.startAfter(curseur);
    const page = await q.get();
    if (page.empty) break;
    const lot = db.batch();
    page.docs.forEach((s) => {
      const d = s.data() || {};
      if (d.pointsHerites !== undefined) return;         // deja fige
      lot.set(s.ref, { pointsHerites: Math.max(0, d.points || 0), pointsPreuves: 0 }, { merge: true });
      traites++;
    });
    await lot.commit();
    curseur = page.docs[page.docs.length - 1];
    if (page.size < 300) break;
  }
  return { ok: true, traites: traites };
});
