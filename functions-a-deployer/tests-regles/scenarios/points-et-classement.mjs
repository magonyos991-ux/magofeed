/* ============================================================================
   PARCOURS « POINTS, SCORE, CLASSEMENT, ANTI-TRICHE »
   ----------------------------------------------------------------------------
   Ce scenario REJOUE les ecritures exactes de l'application et de ses fonctions
   serveur, recopiees depuis le depot :

   COTE CLIENT (index.html)
     index.html:1367   window.fbSyncUserStats(stats)      -> users/{uid}
     index.html:1430   window.fbLoadMyScore()             -> lit users/{uid}.points
     index.html:1469   window.fbMonParrainage()           -> lit referrals/{uid}
     index.html:3189   window.fbLoadLeaderboard()         -> le classement affiche
     index.html:3246   window.fbMonRang(myPoints)         -> « Tu es 752e sur N »
     index.html:3316   window.fbAddReport(...)            -> reports/{auto}
     index.html:6536   report(type)                       -> le +10 affiche a l'ecran
     index.html:7537   adopterScoreServeur()              -> le score serveur ecrase le local
     index.html:1685   creation du profil a la 1re connexion (createdAt)

   COTE SERVEUR (functions-a-deployer/*.js — Admin SDK, donc hors regles)
     points-et-parrainage.js:118  BAREME_REPORT (ce qu'une contribution vaut VRAIMENT)
     points-et-parrainage.js:139  crediter(uid, montant, motif)  + plafond 60/jour
     points-et-parrainage.js:176  sanctionReelle(uid)
     points-et-parrainage.js:201  recalculerScore(uid)
     points-et-parrainage.js:246  dejaCompteAujourdhui(rep)
     points-et-parrainage.js:267  crediterContribution (declencheur reports/{id})
     points-et-parrainage.js:543  evaluerParrainage(uidFilleul)
     points-et-parrainage.js:682  figerPointsExistants (le bouton « Figer les soldes »)
     anti-farm.js:52 / :199       POINTS_RETIRES = 10, ecriture de penalties/{cle}

   Les regles evaluees sont celles du depot : functions-a-deployer/firestore.rules
   (bloc /users/{uid} lignes 139-184, /refCodes 186, /refMine 195, /referrals 205,
   /penalties 212, /reports 985).

   CE QUE CE BANC NE PEUT PAS REJOUER (dit ici pour ne pas le faire croire) :
     - les Cloud Functions ne tournent pas : on recopie leur code et on l'execute
       avec withSecurityRulesDisabled, qui est exactement ce que fait l'Admin SDK
       (il contourne les regles). Les CHIFFRES sont donc ceux du depot.
     - il n'y a pas d'emulateur Auth : le garde-fou « contradicteur = vrai compte
       de plus de 7 jours » (anti-farm.js:168-183) n'est pas rejoue. On ne teste
       pas le SEUIL de la sanction, on teste son MONTANT.
     - monCodeParrain / utiliserCodeParrain sont des onCall : on teste ce que les
       REGLES laissent passer quand on essaie de s'en passer.

   Un ECHEC ci-dessous n'est pas un scenario casse : c'est une trouvaille.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, addDoc, collection,
  query, where, orderBy, limit, getCountFromServer, runTransaction,
  serverTimestamp, Timestamp, increment, deleteField,
} from "firebase/firestore";

const env   = await banc("points-et-classement");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carol = env.authenticatedContext("carol").firestore();
const mallo = env.authenticatedContext("mallory").firestore();
const lea   = env.authenticatedContext("lea").firestore();
const chef  = env.authenticatedContext("chef").firestore();
const anon  = env.unauthenticatedContext().firestore();

/* withSecurityRulesDisabled ne rend pas ce que la fonction retourne : on le
   capture. C'est notre « Admin SDK ». */
async function serveur(fn) {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
}

/* L'administrateur, c'est un document dans /admins (firestore.rules:38). */
await serveur(async (db) => { await setDoc(doc(db, "admins", "chef"), { role: "fondateur" }); });

/* ══════════════════════════════════════════════════════════════════════════
   LE CLIENT, RECOPIE A L'IDENTIQUE
   ══════════════════════════════════════════════════════════════════════════ */

/* index.html:6536 — report(type). LE NOMBRE QUE L'ECRAN ANNONCE.
   var pts={stock:10,rupture:5,contrefacon:15,nouveau:20};
   var msgs={stock:"✓ +10 pts",...} ; userStats.pts+=pts[type]; flyPts(pts[type]); */
const PTS_AFFICHES = { stock: 10, rupture: 5, contrefacon: 15, nouveau: 20 };

/* index.html:1367 — fbSyncUserStats. `points` n'est PLUS envoye (commentaire
   index.html:1384). Tout le reste part tel quel, en merge. */
async function fbSyncUserStats(db, uid, o) {
  o = o || {};
  const pseudo = String(o.pseudo || "Explorateur").slice(0, 24);
  await setDoc(doc(db, "users", uid), {
    pseudo: pseudo,
    pseudoLower: pseudo.toLowerCase(),
    avatar: o.avatar || null,
    favs: o.favs || [],
    recent: o.recent || [],
    signals: o.signals || 0,
    confirms: o.confirms || 0,
    discAccepted: o.discAccepted || 0,
    streak: o.streak || 0,
    bestStreak: o.bestStreak || 0,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/* index.html:1685 — le profil pose a la premiere connexion. */
async function creerProfilPremiereConnexion(db, uid, pseudo) {
  await setDoc(doc(db, "users", uid), {
    pseudo: String(pseudo || "Explorateur").slice(0, 24),
    signals: 0, confirms: 0,
    createdAt: serverTimestamp(),
  }, { merge: true });
}

/* index.html:14858 — _provenance(src,s) : note = "source|distance en m",
   "fiche|?" quand la position est inconnue. */
function provenance(src, distM) {
  return String(src || "?") + "|" + (distM == null ? "?" : String(Math.round(distM)));
}

/* index.html:3316 — fbAddReport(storeId, drinkId, type, plus). */
async function fbAddReport(db, uid, storeId, drinkId, type, store, laNote) {
  const extra = {};
  if (store) {
    if (store.name) extra.storeName = String(store.name).slice(0, 60);
    if (typeof store.lat === "number" && typeof store.lng === "number") {
      extra.lat = Math.round(store.lat * 100) / 100;
      extra.lng = Math.round(store.lng * 100) / 100;
    }
  }
  extra.tz = "Europe/Brussels";
  const ref = await addDoc(collection(db, "reports"), Object.assign({
    storeId: storeId,
    drinkId: drinkId,
    type: type,
    by: uid || null,
    byPseudo: "Explorateur",
    createdAt: serverTimestamp(),
  }, extra, (laNote != null) ? { note: String(laNote).slice(0, 300) } : {}));
  return ref.id;
}

/* index.html:1430 — fbLoadMyScore. Rend null tant que le serveur n'a pas ecrit
   `points` : c'est ce « null » qui laisse le compteur local a l'ecran. */
async function fbLoadMyScore(db, uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  if (typeof d.points !== "number") return null;
  return { points: d.points, refCode: d.refCode || null, refCount: d.refCount || 0 };
}

/* index.html:3189 — fbLoadLeaderboard. Recopie ligne a ligne. */
async function fbLoadLeaderboard(db) {
  const snap = await getDocs(query(collection(db, "users"), orderBy("points", "desc"), limit(30)));
  const parPseudo = {};
  snap.forEach((d) => {
    const data = d.data() || {};
    const pseudo = String(data.pseudo || "Anonyme").trim();
    const cle = pseudo.toLowerCase();
    const dejaDeduite = (data.pointsHerites !== undefined);
    const pts = Math.max(0, (data.points || 0) - (dejaDeduite ? 0 : (data.penalty || 0)));
    const contributions = (Number(data.confirms) || 0) + (Number(data.signals) || 0)
                        + (Number(data.discAccepted) || 0);
    if (contributions <= 0) return;
    if (!parPseudo[cle] || pts > parPseudo[cle].points) {
      parPseudo[cle] = { uid: d.id, pseudo: pseudo, points: pts, streak: data.streak || 0 };
    }
  });
  return Object.keys(parPseudo).map((k) => parPseudo[k]).sort((a, b) => b.points - a.points);
}

/* index.html:3246 — fbMonRang(myPoints). Les deux comptages agreges + les voisins. */
async function fbMonRang(db, uid, myPoints) {
  const pts = Math.max(0, Number(myPoints) || 0);
  const users = collection(db, "users");
  const res = await Promise.all([
    getCountFromServer(query(users, where("points", ">", pts))),
    getCountFromServer(query(users, where("points", ">", 0))),
    getDocs(query(users, where("points", ">", pts), orderBy("points", "asc"), limit(3))),
    getDocs(query(users, where("points", "<", pts), orderBy("points", "desc"), limit(3))),
  ]);
  function lignes(snap) {
    const vus = {}, out = [];
    snap.forEach((d) => {
      if (d.id === uid) return;
      const data = d.data() || {};
      const pseudo = String(data.pseudo || "").trim();
      if (!pseudo) return;
      const cle = pseudo.toLowerCase();
      if (vus[cle]) return;
      const dejaDeduite = (data.pointsHerites !== undefined);
      const p = Math.max(0, (data.points || 0) - (dejaDeduite ? 0 : (data.penalty || 0)));
      const contributions = (Number(data.confirms) || 0) + (Number(data.signals) || 0)
                          + (Number(data.discAccepted) || 0);
      if (contributions <= 0) return;
      vus[cle] = true;
      out.push({ uid: d.id, pseudo: pseudo, points: p, streak: data.streak || 0 });
    });
    return out;
  }
  return {
    rang: 1 + (Number(res[0].data().count) || 0),
    total: Number(res[1].data().count) || 0,
    dessus: lignes(res[2]).reverse(),
    dessous: lignes(res[3]),
  };
}

/* index.html:1469 — fbMonParrainage. */
async function fbMonParrainage(db, uid) {
  const snap = await getDoc(doc(db, "referrals", uid));
  return snap.exists() ? snap.data() : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   LE SERVEUR, RECOPIE A L'IDENTIQUE (points-et-parrainage.js / anti-farm.js)
   Seule liberte prise : sanctionReelle lit `penalties` HORS transaction — le
   SDK client ne sait pas lire une requete dans une transaction, contrairement
   a l'Admin SDK (commentaire points-et-parrainage.js:203). Les valeurs
   calculees sont identiques ; seule la garantie d'atomicite change.
   ══════════════════════════════════════════════════════════════════════════ */
const BAREME_REPORT = { stock: 3, rupture: 3, contrefacon: 3, codebarre: 2, badstore: 2, nouveau: 2, prix: 2 };
const MAX_POINTS_JOUR = 60;              // points-et-parrainage.js:133
const DIST_MAX_M = 500;                  // points-et-parrainage.js:313
const POINTS_RETIRES = 10;               // anti-farm.js:52
const jourUTC = (d) => new Date(d || Date.now()).toISOString().slice(0, 10);

function distanceRapport(rep) {          // points-et-parrainage.js:314
  const m = /\|(\d+)$/.exec(String(rep.note || ""));
  return m ? Number(m[1]) : null;
}
function surPlace(rep) { const d = distanceRapport(rep); return d != null && d <= DIST_MAX_M; }

async function crediter(db, uid, montant, motif) {     // points-et-parrainage.js:139
  if (!uid || !(montant > 0)) return 0;
  const ref = doc(db, "users", uid);
  const j = jourUTC();
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists() ? snap.data() : {};
    const dejaJour = (d.pointsJour === j) ? (d.pointsJourTotal || 0) : 0;
    const reste = Math.max(0, MAX_POINTS_JOUR - dejaJour);
    const verse = Math.min(montant, reste);
    if (verse <= 0) return 0;
    tx.set(ref, {
      pointsPreuves: increment(verse),
      pointsJour: j,
      pointsJourTotal: dejaJour + verse,
      pointsMaj: serverTimestamp(),
      dernierMotif: String(motif || "").slice(0, 40),
    }, { merge: true });
    return verse;
  });
}

async function sanctionReelle(db, uid) {               // points-et-parrainage.js:176
  const snap = await getDocs(query(collection(db, "penalties"), where("uid", "==", String(uid)), limit(2000)));
  let total = 0;
  snap.forEach((d) => { total += Number((d.data() || {}).points) || 0; });
  return total;
}

async function recalculerScore(db, uid) {              // points-et-parrainage.js:201
  if (!uid) return;
  const sanction = await sanctionReelle(db, uid);
  const ref = doc(db, "users", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const d = snap.data() || {};
    const premierPassage = (d.pointsHerites === undefined);
    const herite = premierPassage ? Math.max(0, Number(d.points) || 0) : (Number(d.pointsHerites) || 0);
    const penalite = (sanction === null) ? (Number(d.penalty) || 0) : sanction;
    const total = Math.max(0, herite + (d.pointsPreuves || 0) + (d.refPoints || 0) - penalite);
    if (!premierPassage && d.points === total && (Number(d.penalty) || 0) === penalite) return;
    const patch = { points: total };
    if ((Number(d.penalty) || 0) !== penalite) patch.penalty = penalite;
    if (premierPassage) { patch.pointsHerites = herite; patch.pointsPreuves = d.pointsPreuves || 0; }
    tx.set(ref, patch, { merge: true });
  });
}

async function dejaCompteAujourdhui(db, rep, idCourant) {   // points-et-parrainage.js:246
  if (!rep.by) return true;
  const debut = Timestamp.fromDate(new Date(jourUTC() + "T00:00:00Z"));
  const snap = await getDocs(query(collection(db, "reports"),
    where("by", "==", rep.by), where("createdAt", ">=", debut), limit(80)));
  let vu = false;
  snap.forEach((s) => {
    if (s.id === idCourant) return;
    const o = s.data() || {};
    if (o.counted === true && String(o.storeId) === String(rep.storeId) &&
        String(o.drinkId) === String(rep.drinkId) && o.type === rep.type) vu = true;
  });
  return vu;
}

/* points-et-parrainage.js:267 — le declencheur qui paie. Rend ce que le
   serveur a REELLEMENT credite, et pourquoi. */
async function crediterContribution(db, reportId) {
  const ref = doc(db, "reports", reportId);
  const snap = await getDoc(ref);
  const rep = snap.data() || {};
  if (rep.counted === true) return { credited: 0, raison: "deja passe" };
  const montant = BAREME_REPORT[rep.type] || 0;
  if (!montant || !rep.by) {
    await setDoc(ref, { counted: true, credited: 0 }, { merge: true });
    return { credited: 0, raison: "type non remunere" };
  }
  if ((rep.type === "stock" || rep.type === "rupture") && !surPlace(rep)) {
    await setDoc(ref, { counted: true, credited: 0, raison: "trop loin" }, { merge: true });
    return { credited: 0, raison: "trop loin" };
  }
  if (await dejaCompteAujourdhui(db, rep, reportId)) {
    await setDoc(ref, { counted: true, credited: 0, raison: "rejeu" }, { merge: true });
    return { credited: 0, raison: "rejeu" };
  }
  const verse = await crediter(db, rep.by, montant, rep.type);
  await setDoc(ref, { counted: true, credited: verse }, { merge: true });
  await recalculerScore(db, rep.by);
  return { credited: verse, raison: "" };
}

/* anti-farm.js:186-218 — la sanction, une fois le seuil atteint. */
function clePenalite(uid, storeId, drinkId) {
  const propre = (v) => String(v == null ? "" : v).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
  return propre(uid) + "__" + propre(storeId) + "__" + propre(drinkId);
}
async function antiFarmSanctionner(db, uid, storeId, drinkId, nbContradicteurs) {
  const ref = doc(db, "penalties", clePenalite(uid, storeId, drinkId));
  if ((await getDoc(ref)).exists()) return 0;
  await setDoc(ref, {
    uid: String(uid), storeId: storeId, drinkId: drinkId,
    points: POINTS_RETIRES, contradicteurs: nbContradicteurs,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", String(uid)),
    { penalty: increment(POINTS_RETIRES), penaltyAt: serverTimestamp() }, { merge: true });
  await recalculerScore(db, uid);          // points-et-parrainage.js:490 scoreApresSanction
  return POINTS_RETIRES;
}

/* points-et-parrainage.js:682 — le bouton « Figer les soldes maintenant ». */
async function figerPointsExistants(db) {
  const page = await getDocs(query(collection(db, "users"), orderBy("__name__"), limit(300)));
  let traites = 0;
  for (const s of page.docs) {
    const d = s.data() || {};
    if (d.pointsHerites !== undefined) continue;
    await setDoc(s.ref, { pointsHerites: Math.max(0, d.points || 0), pointsPreuves: 0 }, { merge: true });
    traites++;
  }
  return { ok: true, traites: traites };
}

const MAGASIN = { id: "s-delhaize-ixelles", name: "Delhaize Ixelles", lat: 50.8267, lng: 4.3671 };
const LOIN    = { id: "s-carrefour-liege",  name: "Carrefour Liege",  lat: 50.6326, lng: 5.5797 };

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 1 — ALICE GAGNE DES POINTS NORMALEMENT
   ══════════════════════════════════════════════════════════════════════════ */
let idStock = null, creditStock = null;

await doit("Alice ouvre l'app : son profil se cree (index.html:1685)", async () => {
  await creerProfilPremiereConnexion(alice, "alice", "Alice");
});

await doit("Alice contribue : fbSyncUserStats ecrit ses compteurs (index.html:1367)", async () => {
  await fbSyncUserStats(alice, "alice", {
    pseudo: "Alice", confirms: 1, signals: 0, discAccepted: 0, streak: 1, bestStreak: 1,
    favs: ["d-club-mate"],
    recent: [{ t: "confirm", d: "Club-Mate", s: "Delhaize Ixelles", j: jourUTC() }],
  });
});

await doit("Alice confirme un stock sur place : fbAddReport passe (index.html:3316)", async () => {
  idStock = await fbAddReport(alice, "alice", MAGASIN.id, "d-club-mate", "stock", MAGASIN,
                              provenance("fiche", 120));
  if (!idStock) throw new Error("pas d'identifiant de rapport");
});

await doit("le serveur credite la contribution (points-et-parrainage.js:267)", async () => {
  creditStock = await serveur((db) => crediterContribution(db, idStock));
  if (creditStock.credited <= 0) throw new Error("rien credite : " + creditStock.raison);
});

await doit("le score officiel d'Alice est lisible par elle (index.html:1430)", async () => {
  const d = await fbLoadMyScore(alice, "alice");
  if (!d || typeof d.points !== "number") throw new Error("fbLoadMyScore rend null");
  if (d.points !== creditStock.credited) throw new Error("points=" + d.points);
});

note("bareme du jour : l'ecran annonce +" + PTS_AFFICHES.stock +
     " pts (index.html:6542-6543), le serveur en credite " + creditStock.credited +
     " (points-et-parrainage.js:119).");

await doit("le nombre annonce a l'ecran (+10 pts) est celui que le serveur credite", async () => {
  if (PTS_AFFICHES.stock !== creditStock.credited) {
    throw new Error("l'app affiche +" + PTS_AFFICHES.stock + " et le serveur verse " +
                    creditStock.credited + " (soit " + (PTS_AFFICHES.stock - creditStock.credited) +
                    " points qui disparaitront a la prochaine ouverture du profil)");
  }
});

await doit("un stock signale SANS position est quand meme enregistre", async () => {
  const id = await fbAddReport(alice, "alice", LOIN.id, "d-club-mate", "stock", LOIN,
                               provenance("fiche", null));   // "fiche|?" : GPS refuse
  const r = await serveur((db) => crediterContribution(db, id));
  note("stock sans position (note « fiche|? ») : l'ecran annonce +" + PTS_AFFICHES.stock +
       " pts, le serveur credite " + r.credited + " (raison serveur : « " + r.raison + " »).");
  if (r.credited !== 0) throw new Error("attendu 0, recu " + r.credited);
});

note("aucun ecran ne dit que ce stock-la ne rapportera rien : index.html:6542-6543 " +
     "joue msgs={stock:\"\\u2713 +10 pts\"} et flyPts(10) avant tout appel reseau, sans regarder " +
     "si la position est connue ; pendingAdd (index.html:14875) n'est utilise que pour l'entraide.");

await doit("le meme geste repete le meme jour ne repaie pas (anti-rejeu)", async () => {
  const id = await fbAddReport(alice, "alice", MAGASIN.id, "d-club-mate", "stock", MAGASIN,
                               provenance("fiche", 80));
  const r = await serveur((db) => crediterContribution(db, id));
  if (r.credited !== 0 || r.raison !== "rejeu") throw new Error("credite " + r.credited);
});

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 2 — ALICE PEUT-ELLE S'ATTRIBUER 999 999 POINTS ?
   ══════════════════════════════════════════════════════════════════════════ */
await doitEchouer("Alice s'ecrit points: 999999 sur son propre profil", async () => {
  await updateDoc(doc(alice, "users", "alice"), { points: 999999 });
});
await doitEchouer("Alice gonfle pointsPreuves (la reserve que le serveur additionne)", async () => {
  await updateDoc(doc(alice, "users", "alice"), { pointsPreuves: 999999 });
});
await doitEchouer("Alice pose pointsHerites elle-meme (contourner « Figer les soldes »)", async () => {
  await updateDoc(doc(alice, "users", "alice"), { pointsHerites: 999999 });
});
await doitEchouer("Alice remet son plafond quotidien a zero (pointsJourTotal)", async () => {
  await updateDoc(doc(alice, "users", "alice"), { pointsJour: "1970-01-01", pointsJourTotal: 0 });
});
await doitEchouer("Alice s'attribue des points de parrainage (refPoints/refCount)", async () => {
  await updateDoc(doc(alice, "users", "alice"), { refPoints: 500, refCount: 25 });
});
await doitEchouer("Alice ecrase son profil entier (setDoc sans merge) pour perdre `points`", async () => {
  await setDoc(doc(alice, "users", "alice"), { pseudo: "Alice", confirms: 1 });
});
await doitEchouer("Alice efface le champ points (deleteField)", async () => {
  await updateDoc(doc(alice, "users", "alice"), { points: deleteField() });
});

await doit("Mallory a le droit d'effacer son profil (RGPD, firestore.rules:167)", async () => {
  await creerProfilPremiereConnexion(mallo, "mallory", "Mallory");
  await deleteDoc(doc(mallo, "users", "mallory"));
});
await doitEchouer("Mallory recree son profil avec points: 999999 (la faille documentee)", async () => {
  await setDoc(doc(mallo, "users", "mallory"), { pseudo: "Mallory", confirms: 1, points: 999999 });
});

await doit("Mallory recree un profil propre apres suppression", async () => {
  await creerProfilPremiereConnexion(mallo, "mallory", "Mallory");
});

/* Les compteurs que le classement utilise pour ecarter les faux comptes
   (index.html:3216-3222 : contributions = confirms + signals + discAccepted)
   ne sont PAS dans champsServeur() (firestore.rules:74-78). */
await doitEchouer("Alice invente 999 999 confirmations (le filtre anti-faux-comptes du classement)", async () => {
  await updateDoc(doc(alice, "users", "alice"), { confirms: 999999, signals: 999999, discAccepted: 999999 });
});
await doitEchouer("Alice se vieillit de six ans (createdAt : le repere « nouveau compte »)", async () => {
  await updateDoc(doc(alice, "users", "alice"), { createdAt: Timestamp.fromMillis(Date.parse("2020-01-01T00:00:00Z")) });
});
await doitEchouer("Alice s'invente une serie de 9 999 jours (streak, affichee au classement)", async () => {
  await updateDoc(doc(alice, "users", "alice"), { streak: 9999, bestStreak: 9999 });
});

/* On remet Alice dans un etat honnete pour la suite du parcours. */
await serveur(async (db) => {
  await setDoc(doc(db, "users", "alice"),
    { confirms: 1, signals: 0, discAccepted: 0, streak: 1, bestStreak: 1 }, { merge: true });
});

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 3 — PEUT-ELLE TOUCHER AU SCORE DE BOB ? LE FAIRE DESCENDRE ?
   ══════════════════════════════════════════════════════════════════════════ */
await doit("Bob a un profil et une contribution creditee", async () => {
  await creerProfilPremiereConnexion(bob, "bob", "Bob");
  await fbSyncUserStats(bob, "bob", { pseudo: "Bob", confirms: 2, signals: 1 });
  const id = await fbAddReport(bob, "bob", MAGASIN.id, "d-fritz-kola", "stock", MAGASIN, provenance("fiche", 60));
  const r = await serveur((db) => crediterContribution(db, id));
  if (r.credited <= 0) throw new Error("Bob n'a rien touche : " + r.raison);
});

await doitEchouer("Alice monte le score de Bob", async () => {
  await updateDoc(doc(alice, "users", "bob"), { points: 999999 });
});
await doitEchouer("Alice fait DESCENDRE le score de Bob", async () => {
  await updateDoc(doc(alice, "users", "bob"), { points: 0 });
});
await doitEchouer("Alice sanctionne Bob en lui posant une penalty", async () => {
  await updateDoc(doc(alice, "users", "bob"), { penalty: 500 });
});
await doitEchouer("Alice efface le profil de Bob", async () => {
  await deleteDoc(doc(alice, "users", "bob"));
});
await doitEchouer("Alice ecrit une sanction dans /penalties au nom de Bob", async () => {
  await setDoc(doc(alice, "penalties", "bob__s1__d1"), { uid: "bob", points: 500 });
});
await doitEchouer("Alice lit /penalties pour savoir qui est sanctionne", async () => {
  await getDocs(query(collection(alice, "penalties"), limit(5)));
});
await doitEchouer("Alice signe une rupture du nom de Bob (arme anti-farm retournee)", async () => {
  await addDoc(collection(alice, "reports"), {
    storeId: MAGASIN.id, drinkId: "d-fritz-kola", type: "rupture",
    by: "bob", byPseudo: "Bob", createdAt: serverTimestamp(), note: provenance("fiche", 30),
  });
});
await doitEchouer("Alice marque son propre rapport comme deja paye (counted/credited)", async () => {
  await updateDoc(doc(alice, "reports", idStock), { counted: false, credited: 999 });
});

/* La sanction legitime : deux personnes differentes contredisent Alice.
   Le SEUIL (anti-farm.js:49) n'est pas rejoue ici (pas d'emulateur Auth) ; on
   teste le MONTANT retire, qui est en dur dans anti-farm.js:52. */
let scoreAvantSanction = null, scoreApresSanction = null;
await doit("deux personnes signalent la rupture : la sanction tombe", async () => {
  await creerProfilPremiereConnexion(carol, "carol", "Carol");
  await fbAddReport(bob,   "bob",   MAGASIN.id, "d-club-mate", "rupture", MAGASIN, provenance("fiche", 40));
  await fbAddReport(carol, "carol", MAGASIN.id, "d-club-mate", "rupture", MAGASIN, provenance("fiche", 55));
  scoreAvantSanction = (await fbLoadMyScore(alice, "alice")).points;
  await serveur((db) => antiFarmSanctionner(db, "alice", MAGASIN.id, "d-club-mate", 2));
  scoreApresSanction = (await fbLoadMyScore(alice, "alice")).points;
});

note("sanction : Alice passe de " + scoreAvantSanction + " a " + scoreApresSanction +
     " point(s) ; la penalite inscrite vaut " + POINTS_RETIRES +
     " (anti-farm.js:52) pour une annonce que le serveur avait payee " +
     creditStock.credited + " (points-et-parrainage.js:119).");

await doit("la sanction retire ce que l'annonce avait rapporte (texte de l'app, index.html:7501)", async () => {
  /* index.html:7501 : « annoncer une boisson en stock rapporte des points. Si
     plusieurs personnes passent ensuite sur place et la signalent absente, CES
     POINTS REPARTENT. » */
  if (POINTS_RETIRES !== creditStock.credited) {
    throw new Error("l'annonce a rapporte " + creditStock.credited + " et la sanction retire " +
                    POINTS_RETIRES + " : " + (POINTS_RETIRES - creditStock.credited) +
                    " points de plus que « ces points »");
  }
});

await doitEchouer("Alice efface sa sanction en supprimant puis recreant son profil", async () => {
  await deleteDoc(doc(alice, "users", "alice"));
  await setDoc(doc(alice, "users", "alice"), { pseudo: "Alice", confirms: 1, penalty: 0 });
});
await doit("apres suppression-recreation, le serveur rend la sanction a Alice", async () => {
  await creerProfilPremiereConnexion(alice, "alice", "Alice");
  await fbSyncUserStats(alice, "alice", { pseudo: "Alice", confirms: 1 });
  await serveur((db) => recalculerScore(db, "alice"));
  const snap = await getDoc(doc(alice, "users", "alice"));
  const d = snap.data() || {};
  if ((d.penalty || 0) !== POINTS_RETIRES) throw new Error("penalty=" + d.penalty);
});
note("effet de bord de la suppression du profil : pointsPreuves et pointsHerites " +
     "disparaissent avec le document, la sanction (collection penalties) revient. " +
     "Score d'Alice apres recreation : " + ((await getDoc(doc(alice, "users", "alice"))).data().points) +
     " — elle repart sous zero et doit regagner " + POINTS_RETIRES + " points avant que son score bouge.");

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 4 — LE CLASSEMENT : QUELLES DONNEES PERSONNELLES ?
   ══════════════════════════════════════════════════════════════════════════ */
await serveur(async (db) => {
  await setDoc(doc(db, "users", "lea"), {
    pseudo: "Lea", pseudoLower: "lea", confirms: 4, signals: 2, discAccepted: 0,
    streak: 6, bestStreak: 9, provider: "google", points: 40, pointsHerites: 0, pointsPreuves: 40,
    favs: ["d-club-mate", "d-fritz-kola"],
    recent: [
      { t: "confirm", d: "Club-Mate", s: "Delhaize Ixelles", j: "2026-09-14" },
      { t: "scan",    d: "Fritz-Kola", s: "Night Shop Flagey", j: "2026-09-15" },
    ],
  });
  await setDoc(doc(db, "users", "noe"), {
    pseudo: "Noe", pseudoLower: "noe", confirms: 1, signals: 1, discAccepted: 0,
    streak: 2, points: 12, pointsHerites: 0, pointsPreuves: 12,
  });
  /* Un compte qui n'a JAMAIS rien declare mais qui a des points : le filtre
     « contributions <= 0 » l'ecarte du tableau (index.html:3222). */
  await setDoc(doc(db, "users", "fantome"), {
    pseudo: "Fantome", pseudoLower: "fantome", confirms: 0, signals: 0, discAccepted: 0,
    points: 300, pointsHerites: 300, pointsPreuves: 0,
  });
});

let vueAnon = null;
await doit("un visiteur SANS COMPTE lit le profil complet de Lea (firestore.rules:140)", async () => {
  const snap = await getDoc(doc(anon, "users", "lea"));
  if (!snap.exists()) throw new Error("illisible");
  vueAnon = snap.data();
});
note("ce qu'un inconnu non connecte lit sur users/lea : " + Object.keys(vueAnon).sort().join(", "));
note("dont `recent` : " + (vueAnon.recent || []).map((g) => g.t + " « " + g.d + " » chez " + g.s + " le " + g.j).join(" | ")
     + " — le nom du magasin et le jour, pour les cinq derniers gestes.");

await doitEchouer("la sanction d'Alice reste privee (/penalties est reserve a l'admin)", async () => {
  const snap = await getDoc(doc(anon, "users", "alice"));
  const p = (snap.data() || {}).penalty;
  if (p === undefined) throw new Error("penalty absent du profil public");
  /* Si on arrive ici, n'importe qui lit la sanction : l'assertion doit echouer. */
});

let tableau = null, rangLea = null;
await doit("le classement se charge (index.html:3189)", async () => {
  tableau = await fbLoadLeaderboard(anon);
  if (!tableau.length) throw new Error("classement vide");
});
note("classement affiche (" + tableau.length + " ligne(s)) : " +
     tableau.map((r) => r.pseudo + " " + r.points + " pts, uid " + r.uid).join(" | ") +
     " — chaque ligne porte l'uid, qui ouvre le profil public.");

let comptesAvecPoints = [];
await doit("« Tu es Ne sur N contributeurs » compte les memes personnes que le classement", async () => {
  rangLea = await fbMonRang(lea, "lea", 40);
  const snap = await getDocs(query(collection(anon, "users"), where("points", ">", 0)));
  snap.forEach((d) => comptesAvecPoints.push(d.id));
  const placeReelle = tableau.findIndex((r) => r.uid === "lea") + 1;
  if (rangLea.rang !== placeReelle || rangLea.total !== tableau.length) {
    throw new Error("l'app dit « " + rangLea.rang + "e sur " + rangLea.total +
      " contributeurs » alors que le tableau des contributeurs la place " + placeReelle +
      "e sur " + tableau.length);
  }
});
note("qui est compte dans le « sur N contributeurs » (where points>0) : " +
     comptesAvecPoints.sort().join(", ") + " — qui est AFFICHE au classement : " +
     tableau.map((r) => r.uid).sort().join(", ") + ".");

await doit("un compte qui reprend le pseudo d'un contributeur ne le fait pas disparaitre", async () => {
  await serveur(async (db) => {
    await setDoc(doc(db, "users", "sosie"), {
      pseudo: "Lea", pseudoLower: "lea", confirms: 1, signals: 0, discAccepted: 0,
      points: 90, pointsHerites: 90, pointsPreuves: 0,
    });
  });
  const t2 = await fbLoadLeaderboard(anon);
  const ligneLea = t2.find((r) => r.pseudo.toLowerCase() === "lea");
  if (!ligneLea || ligneLea.uid !== "lea") {
    throw new Error("la ligne « Lea » du classement pointe maintenant sur l'uid « " +
      (ligneLea && ligneLea.uid) + " » : la vraie Lea (40 pts, 6 contributions) a disparu du tableau");
  }
});
await serveur(async (db) => { await deleteDoc(doc(db, "users", "sosie")); });

/* Cas observe en PRODUCTION le 16/09/2026 (compte « Faucon Mystique 568 » :
   points 3, pointsPreuves 3, confirms/signals/discAccepted a 0) : le serveur a
   PAYE une contribution verifiee, mais le filtre du classement (index.html:3222)
   regarde des compteurs ecrits par le client, pas les preuves. */
await doit("un contributeur PAYE par le serveur apparait au classement meme si ses compteurs clients sont a 0", async () => {
  await serveur(async (db) => {
    await setDoc(doc(db, "users", "preuve"), {
      pseudo: "Preuve", pseudoLower: "preuve", confirms: 0, signals: 0, discAccepted: 0,
      points: 3, pointsHerites: 0, pointsPreuves: 3,
    });
  });
  const t = await fbLoadLeaderboard(anon);
  if (!t.find((r) => r.uid === "preuve")) {
    throw new Error("absent : le serveur lui a verse 3 points pour une contribution verifiee " +
      "(pointsPreuves=3) mais le classement filtre sur confirms+signals+discAccepted, " +
      "trois compteurs ecrits par le client (index.html:3216-3222)");
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 5 — LE PARRAINAGE
   ══════════════════════════════════════════════════════════════════════════ */
await serveur(async (db) => {
  /* Ce que monCodeParrain (points-et-parrainage.js:620) ecrit pour Bob. */
  await setDoc(doc(db, "refCodes", "K7M2Q"), { uid: "bob", createdAt: serverTimestamp() });
  await setDoc(doc(db, "refMine", "bob"), { code: "K7M2Q", createdAt: serverTimestamp() });
});

await doitEchouer("Alice fabrique son propre code de parrainage", async () => {
  await setDoc(doc(alice, "refCodes", "AAAAA"), { uid: "alice", createdAt: serverTimestamp() });
});
await doitEchouer("Alice detourne le code de Bob vers son propre compte", async () => {
  await updateDoc(doc(alice, "refCodes", "K7M2Q"), { uid: "alice" });
});
await doitEchouer("Alice lit l'annuaire des codes pour remonter a leurs proprietaires", async () => {
  await getDoc(doc(alice, "refCodes", "K7M2Q"));
});
await doitEchouer("Alice lit le code prive de Bob (refMine)", async () => {
  await getDoc(doc(alice, "refMine", "bob"));
});
await doit("Bob lit son propre code (refMine, firestore.rules:195)", async () => {
  const snap = await getDoc(doc(bob, "refMine", "bob"));
  if (!snap.exists() || snap.data().code !== "K7M2Q") throw new Error("code illisible");
});
await doitEchouer("Alice s'ecrit une intention de parrainage (referrals/alice)", async () => {
  await setDoc(doc(alice, "referrals", "alice"), { code: "K7M2Q", status: "pending", createdAt: serverTimestamp() });
});
await doitEchouer("Alice fabrique des filleuls a son nom (referrals/carol, parrain: alice)", async () => {
  await setDoc(doc(alice, "referrals", "carol"),
    { code: "AAAAA", parrain: "alice", status: "paid", createdAt: serverTimestamp() });
});

await serveur(async (db) => {
  /* utiliserCodeParrain (points-et-parrainage.js:662) : create(), donc une
     seule fois dans la vie du filleul — l'identifiant du document EST son uid. */
  await setDoc(doc(db, "referrals", "alice"), { code: "K7M2Q", status: "pending", createdAt: serverTimestamp() });
});
await doit("Alice lit son propre parrainage (index.html:1469)", async () => {
  const r = await fbMonParrainage(alice, "alice");
  if (!r || r.status !== "pending") throw new Error("illisible");
});
await doitEchouer("Alice lit le parrainage de quelqu'un d'autre", async () => {
  await getDoc(doc(bob, "referrals", "alice"));
});
await doitEchouer("Alice fait passer son parrainage a « paid »", async () => {
  await updateDoc(doc(alice, "referrals", "alice"), { status: "paid", parrain: "carol" });
});
await doitEchouer("Alice utilise un deuxieme code (un deuxieme parrain)", async () => {
  await setDoc(doc(alice, "referrals", "alice"), { code: "ZZZZZ", status: "pending" }, { merge: true });
});
note("auto-parrainage et code utilise deux fois : refuses par la fonction serveur " +
     "(points-et-parrainage.js:676 « C'est ton propre code » et :679 create() sur referrals/{uid}), " +
     "pas par les regles — non rejouables ici, mais les regles interdisent deja au client " +
     "d'ecrire quoi que ce soit dans referrals, refCodes et refMine.");
note("garde-fous du parrainage lus dans le code : prime payee seulement apres " +
     "7 jours (DELAI_JOURS), 3 contributions creditees, dans 2 magasins, sur 2 jours " +
     "(points-et-parrainage.js:514-518), plafonds 3/semaine et 10 au total.");

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 6 — fbFigerPoints : A QUOI SERT-IL, PEUT-ON LE CONTOURNER ?
   ══════════════════════════════════════════════════════════════════════════ */
/* AVANT le durcissement des regles (firestore.rules:20-24 le documente), le
   client ecrivait `points` lui-meme. On recree un compte de cette epoque. */
await serveur(async (db) => {
  await setDoc(doc(db, "users", "vieuxtricheur"), {
    pseudo: "Zdoudex", pseudoLower: "zdoudex", confirms: 1, signals: 0, discAccepted: 0,
    points: 999999,
  });
});

let figeA = null, figeB = null;
await doit("le gel est rejouable sans risque (deuxieme passage : 0 compte traite)", async () => {
  figeA = await serveur((db) => figerPointsExistants(db));
  figeB = await serveur((db) => figerPointsExistants(db));
  if (figeB.traites !== 0) throw new Error("deuxieme passage : " + figeB.traites + " comptes retouches");
});
note("gel : " + figeA.traites + " compte(s) au premier passage, " + figeB.traites + " au second.");

await doit("le gel ne fige pas un score que le client s'etait attribue avant la bascule", async () => {
  const d = (await getDoc(doc(anon, "users", "vieuxtricheur"))).data() || {};
  if ((d.pointsHerites || 0) >= 999999) {
    throw new Error("pointsHerites = " + d.pointsHerites + " : le solde ecrit par le client " +
      "en Phase 1 devient le socle definitif du score officiel (points-et-parrainage.js:697)");
  }
});
await doit("un administrateur peut corriger un score fige a tort, sans supprimer le compte", async () => {
  /* firestore.rules:164 : allow update: if isSelf(uid). Ni le proprietaire
     (champsServeur) ni l'administrateur ne peuvent toucher pointsHerites. */
  await updateDoc(doc(chef, "users", "vieuxtricheur"), { pointsHerites: 0 });
});
note("consequence : ce compte occupe la premiere place du classement avec " +
     ((await getDoc(doc(anon, "users", "vieuxtricheur"))).data().points) +
     " points, et aucun ecran de l'app ne permet de le corriger.");
await serveur(async (db) => { await deleteDoc(doc(db, "users", "vieuxtricheur")); });

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 7 — L'ECRAN MENT-IL A SON PROPRIETAIRE ?
   Le cas que le tableau de bord admin annonce lui-meme (index.html:24361) :
   les Cloud Functions ne sont pas deployees, donc `points` n'est jamais ecrit.
   ══════════════════════════════════════════════════════════════════════════ */
await doit("Orpheline contribue vraiment, mais aucune fonction serveur ne tourne", async () => {
  const o = env.authenticatedContext("orpheline").firestore();
  await creerProfilPremiereConnexion(o, "orpheline", "Orpheline");
  await fbSyncUserStats(o, "orpheline", { pseudo: "Orpheline", confirms: 3, signals: 2, streak: 4 });
  await fbAddReport(o, "orpheline", MAGASIN.id, "d-club-mate", "stock", MAGASIN, provenance("fiche", 90));
  const snap = await getDoc(doc(o, "users", "orpheline"));
  if (typeof (snap.data() || {}).points === "number") throw new Error("le serveur a ecrit points");
});

await doit("son ecran sait que son score n'existe pas encore (fbLoadMyScore)", async () => {
  const o = env.authenticatedContext("orpheline").firestore();
  const d = await fbLoadMyScore(o, "orpheline");
  if (d === null) {
    throw new Error("fbLoadMyScore rend null (index.html:1437) : adopterScoreServeur sort sans rien " +
      "dire (index.html:7540) et l'ecran garde le total local — 5 contributions x le bareme affiche, " +
      "avec son niveau et sa barre de progression, alors que le serveur n'a rien calcule");
  }
});

await doit("Orpheline, qui a contribue 5 fois, apparait au classement des contributeurs", async () => {
  const t = await fbLoadLeaderboard(anon);
  if (!t.find((r) => r.uid === "orpheline")) {
    throw new Error("absente : orderBy(\"points\") (index.html:3192) ignore les profils sans le champ, " +
      "et where(\"points\",\">\",0) (index.html:3255) ne la compte pas non plus dans « sur N contributeurs »");
  }
});

await bilan(env);
