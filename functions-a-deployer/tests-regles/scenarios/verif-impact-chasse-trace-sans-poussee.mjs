/* ============================================================================
   LENTILLE « IMPACT » — Alice a REFUSE les notifications. Que voit-elle ?
   ----------------------------------------------------------------------------
   La trouvaille affirme : « Rien de la chasse ne laisse de trace dans
   l'application : tout repose sur la poussee telephone. Si la personne a refuse
   les notifications, tout le parcours est silencieux et l'app n'a rien a lui
   montrer en rouvrant. »

   On ne teste donc PAS userNotifs (boite d'administration : promotion d'une
   decouverte, photo refusee — index.html:5527-5533). On rejoue le parcours
   reel, AUCUN jeton FCM nulle part, et on regarde ce que l'app peut afficher
   a la reouverture, uniquement a partir de ce qui est EN BASE.

   Fonctions rejouees a l'identique (numeros de ligne dans index.html) :
     _coarse                 4505
     window.fbJoinHunt       4534-4589
     window.fbAddDrinkToStore 3889-3906   (« Je l'ai vue en rayon »)
     window.fbAddReport      3316-3350
     normalizeStore          2012-2026    (ce que l'app fabrique en memoire)
     magasinProcheAvec       14805-14820  (le test exact de l'alerte)
     checkWatches            15073-15100  (l'alerte a la reouverture)
     pushActivity/_saveActivity 14467/14457 (la cloche, en localStorage)
     repondreIndication      14939-14960  (« Je l'ai trouvee » -> report + stock)
     window.fbCoupsDeMain    5129-5148
     window.fbDireMerci      5149-5153
     window.fbLoadMyNotifs   5541-5552
   Cote serveur (l'emulateur n'execute pas les Cloud Functions : Admin SDK,
   memes decisions, champ pour champ) :
     crediterEntraide        points-et-parrainage.js:320-385
     noterCoupDeMain         points-et-parrainage.js:404-430
     crediter                points-et-parrainage.js:139-159
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc, collection, query, where,
  orderBy, limit, serverTimestamp, arrayUnion, increment, Timestamp,
} from "firebase/firestore";

const env = await banc("verif-impact-chasse-sans-poussee");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

const BOISSON = 412;                      // « Ramune Original »
const NOM = "Ramune Original";
const MAGASIN = "node-1234567";           // id OpenStreetMap, comme les imports
const LAT_ALICE = 50.8267, LNG_ALICE = 4.3722;
const LAT_MAG = 50.8281, LNG_MAG = 4.3705;   // ~250 m d'Alice

/* AUCUN jeton FCM n'est pose nulle part : Alice a refuse les notifications,
   Bob aussi. Si la trouvaille dit vrai, plus rien ne doit leur parvenir. */

/* ── Le magasin importe (comme les imports OSM : aucun stock connu) ─────── */
await serveur(async (db) => {
  await setDoc(doc(db, "stores", MAGASIN), {
    name: "Tagawa Bruxelles", lat: LAT_MAG, lng: LNG_MAG, emoji: "🏪",
    drinks: [], createdAt: serverTimestamp(),
  });
  // Comptes anciens : le garde-fou « compte cree hier ne valide rien »
  // (points-et-parrainage.js:343-345) ne doit pas fausser la mesure.
  const vieux = Timestamp.fromMillis(Date.now() - 40 * 86400000);
  await setDoc(doc(db, "users", ALICE), { pseudo: "Alice", createdAt: vieux }, { merge: true });
  await setDoc(doc(db, "users", BOB), { pseudo: "Bob", createdAt: vieux }, { merge: true });
});

/* ══ 1. ALICE LANCE SA CHASSE — index.html:4534 fbJoinHunt ═══════════════ */
const _coarse = (x) => Math.round(x * 10) / 10;
let joinRes = null;
await doit("Alice lance la chasse (fbJoinHunt, index.html:4534) et la base la reconnait chercheuse", async () => {
  const ref = doc(alice, "hunts", String(BOISSON));
  const moi = { lat: _coarse(LAT_ALICE), lng: _coarse(LNG_ALICE), at: Date.now() };
  const commun = { drinkName: NOM.slice(0, 60), emoji: "🥤".slice(0, 4), updatedAt: serverTimestamp() };
  try {
    const maj = Object.assign({}, commun);
    maj["seekers." + ALICE] = moi;
    await updateDoc(ref, maj);
  } catch (e) {
    await setDoc(ref, Object.assign({
      drinkId: Number(BOISSON), seekers: (() => { const o = {}; o[ALICE] = moi; return o; })(),
    }, commun));
  }
  const verif = await getDoc(ref);
  joinRes = verif.exists() && (verif.data().seekers || {})[ALICE];
  verifier(!!joinRes, "Alice n'est pas inscrite dans seekers");
});

/* ══ 2. BOB LA REPERE EN RAYON ══════════════════════════════════════════
   index.html:3889 fbAddDrinkToStore (« Je l'ai vue ») + 3316 fbAddReport. */
const HEURE = Math.floor(Date.now() / 3600000) * 3600000;
await doit("Bob rattache la boisson au magasin (fbAddDrinkToStore, index.html:3889)", async () => {
  const updates = {};
  updates["drinks"] = arrayUnion(Number(BOISSON));
  updates["confirmations." + BOISSON] = increment(1);
  updates["seenAt." + BOISSON] = HEURE;
  updates["confirmedBy." + BOISSON] = "Bob".slice(0, 24);
  updates["confirmedAt." + BOISSON] = HEURE;
  await updateDoc(doc(bob, "stores", MAGASIN), updates);
});
await doit("et son signalement part (fbAddReport, index.html:3316)", async () => {
  await addDoc(collection(bob, "reports"), {
    storeId: MAGASIN, drinkId: BOISSON, type: "stock", by: BOB, byPseudo: "Bob",
    createdAt: serverTimestamp(), storeName: "Tagawa Bruxelles",
    lat: Math.round(LAT_MAG * 100) / 100, lng: Math.round(LNG_MAG * 100) / 100,
    tz: "Europe/Brussels", note: "rayon|120",
  });
});

/* ══ 3. LE SERVEUR : etape 1 de crediterEntraide (points:335-337) ════════
   Le rapport de Bob repond a une chasse ouverte avant lui -> hunt = true.
   RIEN d'autre n'est ecrit a ce stade : pas de coupsDeMain, pas de userNotifs. */
let repBobId = null;
await serveur(async (db) => {
  const snap = await getDocs(query(collection(db, "reports"), where("by", "==", BOB)));
  const d = snap.docs[0]; repBobId = d.id;
  const rep = d.data();
  const creeA = rep.createdAt.toMillis();
  const hunt = await getDoc(doc(db, "hunts", String(BOISSON)));
  const seekers = hunt.exists() ? (hunt.data().seekers || {}) : {};
  const autres = Object.keys(seekers).filter((u) =>
    seekers[u] && u !== rep.by && typeof seekers[u].at === "number" && seekers[u].at < creeA);
  if (autres.length) await setDoc(d.ref, { hunt: true }, { merge: true });
});

/* ══ 4. ALICE ROUVRE L'APP. AUCUNE POUSSEE N'EST PARTIE. ════════════════
   L'app relit les magasins autour d'elle (stores, lecture publique), fabrique
   ses fiches en memoire (normalizeStore) et lance checkWatches. On rejoue
   exactement ces trois etapes sur ce que la base lui rend. */
function normalizeStore(data, id) {           // index.html:2012, part utile
  data.fbId = id; data.id = data.id || id;
  data.drinks = data.drinks || []; data.confirmations = data.confirmations || {};
  data.seenAt = data.seenAt || {}; data.reports = data.reports || [];
  return data;
}
function magasinProcheAvec(STORES, did, userLat, userLng) {   // index.html:14805
  let best = null;
  (STORES || []).forEach((st) => {
    const vu = Number((st.confirmations || {})[did]) > 0
      || (st.drinksVerified || []).some((x) => Number(x) === Number(did));
    if (!vu) return;
    let dist = null;
    if (typeof userLat === "number" && userLat && typeof st.lat === "number") {
      const dLa = (userLat - st.lat) * 111000;
      const dLo = (userLng - st.lng) * 111000 * Math.cos(st.lat * Math.PI / 180);
      dist = Math.sqrt(dLa * dLa + dLo * dLo);
    }
    if (dist !== null && dist > 10000) return;
    if (!best || (dist !== null && (best.dist === null || dist < best.dist))) best = { store: st, dist };
  });
  return best;
}
const cloche = [];                                   // localStorage "magoActivity"
function pushActivity(item) {                        // index.html:14467, part utile
  const key = item.key || (item.type + ":" + (item.title || ""));
  cloche.unshift({ key, ts: Date.now(), type: item.type, title: item.title, body: item.body });
}
// L'etat local d'Alice : sa veille, telle que saveWatches l'a laissee.
const drinkWatches = [{ id: BOISSON, name: NOM, triggered: false }];
function checkWatches(STORES) {                      // index.html:15073, part utile
  let fired = false;
  drinkWatches.forEach((w) => {
    if (w.triggered) return;
    const best = magasinProcheAvec(STORES, w.id, LAT_ALICE, LNG_ALICE);
    if (best) {
      w.triggered = true; w.storeId = best.store.id; w.storeName = best.store.name;
      w.dist = best.dist; w.triggeredAt = Date.now();
      w.by = (best.store.confirmedBy && best.store.confirmedBy[w.id]) || null;
      if (w.by === "Explorateur") w.by = null;
      w.verdict = null; w.reminders = 0; fired = true;
      pushActivity({
        type: "found",
        title: "« " + w.name + " » repérée près de toi",
        body: "Chez " + best.store.name + ". Appuie pour voir le magasin sur la carte.",
        key: "found:" + w.id + ":" + best.store.id,
      });
    }
  });
  return fired;
}

let STORES = [];
await doit("SANS aucune poussee, Alice relit les magasins autour d'elle (stores, lecture publique)", async () => {
  const snap = await getDocs(collection(alice, "stores"));
  STORES = snap.docs.map((d) => normalizeStore(d.data(), d.id));
  verifier(STORES.length === 1, "Alice lit " + STORES.length + " magasin(s)");
});
await doit("l'alerte in-app se declenche a la reouverture (checkWatches, index.html:15073)", async () => {
  const fired = checkWatches(STORES);
  verifier(fired, "checkWatches n'a rien declenche : rien a montrer a Alice");
  verifier(cloche.length === 1, "la cloche (localStorage) contient " + cloche.length + " entree(s)");
});
note("ce que l'app affiche a Alice sans la moindre poussee — toast + cloche : " + JSON.stringify(cloche[0]));
await doit("l'alerte dit QUI l'a reperee et OU (les champs confirmedBy/seenAt du magasin)", async () => {
  const w = drinkWatches[0];
  verifier(w.by === "Bob", "l'alerte ne dit pas qui : " + JSON.stringify(w.by));
  verifier(w.storeName === "Tagawa Bruxelles", "l'alerte ne dit pas ou : " + JSON.stringify(w.storeName));
  verifier(w.dist != null && w.dist < 500, "distance annoncee : " + w.dist);
});
note("« Tu chasses » (renderMesChasses, index.html:21879) passe au point vert avec le nom du magasin : w.triggered=" +
  drinkWatches[0].triggered + ", storeName=" + JSON.stringify(drinkWatches[0].storeName));

/* ══ 5. ALICE REPOND « JE L'AI TROUVEE » — index.html:14939 ══════════════ */
await doit("Alice repond « Je l'ai trouvee » : stock confirme + rapport (repondreIndication, index.html:14939)", async () => {
  const updates = {};
  updates["confirmations." + BOISSON] = increment(1);
  updates["seenAt." + BOISSON] = HEURE;
  updates["confirmedBy." + BOISSON] = "Alice";
  updates["confirmedAt." + BOISSON] = HEURE;
  await updateDoc(doc(alice, "stores", MAGASIN), updates);
  await addDoc(collection(alice, "reports"), {
    storeId: MAGASIN, drinkId: BOISSON, type: "stock", by: ALICE, byPseudo: "Alice",
    createdAt: serverTimestamp(), storeName: "Tagawa Bruxelles",
    lat: Math.round(LAT_MAG * 100) / 100, lng: Math.round(LNG_MAG * 100) / 100,
    tz: "Europe/Brussels", note: "reponse|250",         // _provenance : sur place
  });
});

/* ══ 6. LE SERVEUR : etape 2 + noterCoupDeMain (points:338-385, 404-430) ══ */
let coupEcrit = null;
await serveur(async (db) => {
  const snap = await getDocs(query(collection(db, "reports"), where("by", "==", ALICE)));
  const rep = Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
  const creeA = rep.createdAt.toMillis();
  const hunt = await getDoc(doc(db, "hunts", String(BOISSON)));
  const seekers = hunt.data().seekers || {};
  const moi = seekers[rep.by];
  if (!moi || typeof moi.at !== "number") return;
  const u = await getDoc(doc(db, "users", rep.by));
  const cree = u.exists() && u.data().createdAt ? u.data().createdAt.toMillis() : 0;
  if (cree && Date.now() - cree < 2 * 86400000) return;
  const depuis = Timestamp.fromMillis(creeA - 14 * 86400000);
  const q = await getDocs(query(collection(db, "reports"),
    where("storeId", "==", MAGASIN), where("createdAt", ">=", depuis), limit(60)));
  const aides = q.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .filter((o) => o.type === "stock" && o.hunt === true && o.by !== rep.by
      && String(o.drinkId) === String(rep.drinkId) && !o.huntCredited
      && o.createdAt && o.createdAt.toMillis() < creeA && moi.at < o.createdAt.toMillis())
    .sort((x, y) => x.createdAt.toMillis() - y.createdAt.toMillis());
  if (!aides.length) return;
  const aide = aides[0];
  // crediter (points-et-parrainage.js:139) : sur place -> 15 points
  await setDoc(doc(db, "users", aide.by), {
    pointsPreuves: increment(15), pointsMaj: serverTimestamp(), dernierMotif: "entraide",
  }, { merge: true });
  await setDoc(doc(db, "reports", aide.id), {
    huntCredited: true, huntCreditedBy: rep.by, huntCreditedAt: serverTimestamp(), huntCreditedPts: 15,
  }, { merge: true });
  // noterCoupDeMain (points-et-parrainage.js:404)
  const ua = await getDoc(doc(db, "users", aide.by));
  const da = ua.exists() ? ua.data() : {};
  let pseudo = null;
  if (da.aideDiscrete !== true && typeof da.pseudo === "string") {
    pseudo = da.pseudo.slice(0, 24);
    if (pseudo === "Explorateur") pseudo = null;
  }
  const quand = aide.createdAt.toMillis
    ? Math.floor(aide.createdAt.toMillis() / 3600000) * 3600000
    : Math.floor(Date.now() / 3600000) * 3600000;
  coupEcrit = {
    aidantUid: pseudo ? String(aide.by) : null, aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId), storeId: String(aide.storeId || ""), at: quand, merci: false,
  };
  await setDoc(doc(db, "coupsDeMain", rep.by, "recus", aide.id), coupEcrit, { merge: true });
});

/* ══ 7. CE QU'ALICE RETROUVE EN BASE, TOUJOURS SANS POUSSEE ══════════════ */
async function fbCoupsDeMain(db, uid) {               // index.html:5129
  const snap = await getDocs(query(collection(db, "coupsDeMain", uid, "recus"), orderBy("at", "desc"), limit(12)));
  const out = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    out.push({ id: d.id, aidantUid: x.aidantUid || null, aidantPseudo: x.aidantPseudo || null,
      drinkId: x.drinkId, storeId: x.storeId || "", at: x.at || 0, merci: x.merci === true });
  });
  return out;
}
async function fbLoadMyNotifs(db, uid) {              // index.html:5541
  const snap = await getDocs(query(collection(db, "userNotifs"), where("to", "==", uid), limit(20)));
  const rows = []; snap.forEach((d) => rows.push(d.data())); return rows;
}
let recus = [];
await doit("la carte « On t'a aidé » existe pour Alice (fbCoupsDeMain, index.html:5129)", async () => {
  recus = await fbCoupsDeMain(alice, ALICE);
  verifier(recus.length === 1, "Alice a " + recus.length + " coup(s) de main, attendu 1");
  verifier(recus[0].aidantPseudo === "Bob", "aidantPseudo : " + JSON.stringify(recus[0].aidantPseudo));
});
await doit("et son bouton « Merci » part sans aucune poussee (fbDireMerci, index.html:5149)", async () => {
  await updateDoc(doc(alice, "coupsDeMain", ALICE, "recus", recus[0].id), { merci: true });
  const r = await fbCoupsDeMain(alice, ALICE);
  verifier(r[0].merci === true, "le merci n'est pas enregistre");
});
await doit("la boite userNotifs reste vide pour Alice — c'est la boite de l'ADMIN, pas celle de la chasse", async () => {
  const rows = await fbLoadMyNotifs(alice, ALICE);
  verifier(rows.length === 0, "userNotifs : " + rows.length + " ligne(s)");
});
note("ORDRE REEL : la carte « On t'a aidé » n'apparait qu'APRES la reponse d'Alice (noterCoupDeMain n'est appele qu'a la fin de crediterEntraide, points-et-parrainage.js:383). Ce qui la previent EN PREMIER, c'est l'alerte locale de checkWatches — pas une poussee.");

/* ══ 8. COTE BOB : que lui reste-t-il, sans poussee ? ════════════════════ */
await doit("Bob relit SON rapport et y voit son coup de main credite (regles 988)", async () => {
  const s = await getDoc(doc(bob, "reports", repBobId));
  verifier(s.exists(), "Bob ne peut pas lire son propre rapport");
  const d = s.data() || {};
  verifier(d.huntCredited === true && Number(d.huntCreditedPts) === 15,
    "marque du credit : " + JSON.stringify(d.huntCredited) + "/" + JSON.stringify(d.huntCreditedPts));
});
await doit("Bob relit ses points et voit qu'ils ont bouge (fbRafraichirPreuves, index.html:3297)", async () => {
  const s = await getDoc(doc(bob, "users", BOB));
  verifier(Number((s.data() || {}).pointsPreuves) === 15, "pointsPreuves = " + JSON.stringify((s.data() || {}).pointsPreuves));
});
await doit("MESURE : aucun document ne dit a Bob qu'on l'a REMERCIE", async () => {
  const cdm = await getDocs(query(collection(bob, "coupsDeMain", BOB, "recus"), orderBy("at", "desc"), limit(12)));
  const nt = await fbLoadMyNotifs(bob, BOB);
  verifier(cdm.docs.length + nt.length === 0,
    "il existe " + (cdm.docs.length + nt.length) + " document(s) chez Bob");
});
note("Le merci ne voyage que par FCM (direMerci -> pushToUser, points-et-parrainage.js:450). Sans poussee, Bob garde ses 15 points et la marque huntCreditedPts sur son rapport, mais la gratitude, elle, se perd.");
note("index.html ne lit nulle part huntCredited/huntCreditedPts/dernierMotif (0 occurrence) : ces champs sont en base, aucun ecran ne les montre a Bob.");

await bilan(env);
