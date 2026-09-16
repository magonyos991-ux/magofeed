/* ============================================================================
   VERIFICATION D'INTENTION — « une chasse ne se termine jamais toute seule »
   ----------------------------------------------------------------------------
   La trouvaille auditee dit : checkWatches (index.html:15082) pose
   w.triggered = true mais n'appelle jamais fbLeaveHunt, donc la chasse continue
   d'annoncer « 1 personne la cherche » une fois la boisson trouvee et
   confirmee.

   Ce fichier ne juge pas : il rejoue le parcours jusqu'au bout, PUIS il rejoue
   les fonctions d'AFFICHAGE de l'application — c'est la, et pas dans la base,
   que l'application decide ce qu'elle annonce a chaque lecteur.

   Fonctions rejouees a l'identique (numeros de ligne dans index.html) :
     _coarse                      4505
     window.fbJoinHunt            4545-4593
     window.fbLeaveHunt           4595-4604
     window.fbLoadNearbyHunts     4616-4661
     window.fbSyncWatch           5007-5025
     window.fbConfirmStock        2311-2336
     window.fbAddDrinkToStore     3889-3907
     magasinProcheAvec            14805-14820
     checkWatches (la partie qui declenche) 15071-15095
     renderChasse (construction de `demande`) 21846-21873
     _peindreChasse (le filtre d'affichage)  21892-21903
     renderAlertsCard (la pilule d'etat)     15205-15213
     toggleWatch (le retrait)     14307-14313
     removeWatch                  15156-15181
     swipeDelete -> removeWatch   10527-10544
   Cote serveur :
     notifyStockToWatchers        functions-a-deployer/notifications-push.js:314-332
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc,
  collection, query, limit, serverTimestamp, arrayUnion, increment,
} from "firebase/firestore";

const env = await banc("verif-intention-chasse-fin");

const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const carol = env.authenticatedContext("carol").firestore();
const dora = env.authenticatedContext("dora").firestore();
const anon = env.unauthenticatedContext().firestore();

const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── Le decor ────────────────────────────────────────────────────────────
   Alice a Ixelles, le Delhaize de Flagey a ~4,6 km d'elle.
   Carol habite a cote du magasin (2 km).
   Dora habite a 3,6 km d'Alice, mais a plus de 10 km du magasin. */
const ALICE_POS = { lat: 50.8676, lng: 4.3436 };
const CAROL_POS = { lat: 50.8300, lng: 4.3900 };
const DORA_POS = { lat: 50.9350, lng: 4.2800 };
const BOISSON = 7, NOM = "Mountain Dew Spark";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };
const DRINKS = [{ id: BOISSON, name: NOM, emoji: "" }];

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:14185 — HR_MIN=1, HR_MAX=50 */
function _hrClamp(km) { km = Math.round(Number(km)); if (!(km >= 1)) km = 1; if (km > 50) km = 50; return km; }

/* index.html:4545-4593 */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp(),
  };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); return; } catch (e) { /* suite */ }
  try {
    const bouge = Object.assign({}, commun);
    bouge["seekers." + uid + ".lat"] = pos.lat;
    bouge["seekers." + uid + ".lng"] = pos.lng;
    await updateDoc(ref, bouge); return;
  } catch (e2) { /* suite */ }
  await setDoc(ref, Object.assign({
    drinkId: Number(drinkId) || drinkId,
    seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
  }, commun));
}

/* index.html:4595-4604 */
async function fbLeaveHunt(db, uid, drinkId) {
  const patch = {}; patch["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), patch);
}

/* index.html:4616-4661 — avec le cache de 20 s, un par « telephone ». */
const caches = {};
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;
  else { snap = await getDocs(query(collection(db, "hunts"), limit(200))); caches[appareil] = { at: Date.now(), snap: snap }; }
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100, fresh = Date.now() - 365 * 86400000;
  snap.forEach(function (d) {
    const h = d.data(); const seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null, lastAt = null;
    Object.keys(seekers).forEach(function (uid) {
      const s = seekers[uid]; if (!s) return;
      if (s.at && s.at < fresh) return;
      if (lat != null && s.lat != null) {
        const dLa = (lat - s.lat) * 111, dLo = (lng - s.lng) * 111 * Math.cos(lat * Math.PI / 180);
        const dk = Math.sqrt(dLa * dLa + dLo * dLo);
        if (dk > R) return;
        if (distKm == null || dk < distKm) distKm = dk;
      }
      if (s.at && (lastAt == null || s.at > lastAt)) lastAt = s.at;
      near++; if (uid === myUid) mine = true;
    });
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, emoji: h.emoji, seekers: near, mine: mine, distKm: distKm, lastAt: lastAt });
  });
  out.sort(function (a, b) { return b.seekers - a.seekers; });
  return out;
}

/* index.html:5007-5025 */
async function fbSyncWatch(db, uid, add, drinkId, drinkName, lat, lng, rayon) {
  const wid = uid + "_" + drinkId;
  if (add) {
    await setDoc(doc(db, "watches", wid), {
      uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
      lat: lat != null ? lat : null, lng: lng != null ? lng : null,
      radius: Number(rayon) || 10, createdAt: serverTimestamp(),
    });
  } else { await deleteDoc(doc(db, "watches", wid)); }
}

/* index.html:3889-3907 */
async function fbAddDrinkToStore(db, storeId, drinkId, vu) {
  const updates = { drinks: arrayUnion(Number(drinkId) || drinkId) };
  if (vu !== false) {
    const heure = Math.floor(Date.now() / 3600000) * 3600000;
    updates["confirmations." + drinkId] = increment(1);
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = "Explorateur";
    updates["confirmedAt." + drinkId] = heure;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:2311-2336 */
async function fbConfirmStock(db, storeId, drinkId, value, pseudo) {
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  const qui = String(pseudo || "Explorateur").slice(0, 24);
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  if (value > 0) {
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = qui;
    updates["confirmedAt." + drinkId] = heure;
  } else {
    updates["absentBy." + drinkId] = qui;
    updates["absentAt." + drinkId] = heure;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* ══ COPIES CONFORMES DE L'AFFICHAGE (le coeur de cette verification) ════ */

/* index.html:14805-14820 — magasinProcheAvec. « VU, PAS PROBABLE » :
   confirmations > 0 ou drinksVerified, et 10 km maximum. */
function magasinProcheAvec(did, STORES, userLat, userLng) {
  let best = null;
  (STORES || []).forEach(function (st) {
    const vu = Number((st.confirmations || {})[did]) > 0
      || (st.drinksVerified || []).some(function (x) { return Number(x) === Number(did); });
    if (!vu) return;
    let dist = null;
    if (typeof userLat === "number" && userLat && typeof st.lat === "number") {
      const dLa = (userLat - st.lat) * 111000, dLo = (userLng - st.lng) * 111000 * Math.cos(st.lat * Math.PI / 180);
      dist = Math.sqrt(dLa * dLa + dLo * dLo);
    }
    if (dist !== null && dist > 10000) return;
    if (!best || (dist !== null && (best.dist === null || dist < best.dist))) best = { store: st, dist: dist };
  });
  return best;
}

/* index.html:15071-15095 — checkWatches, la partie qui declenche l'alerte.
   Elle pose w.triggered, joue le son de victoire... et ne touche PAS a hunts. */
function checkWatches(drinkWatches, STORES, userLat, userLng) {
  let fired = false;
  drinkWatches.forEach(function (w) {
    if (w.triggered) return;
    const best = magasinProcheAvec(w.id, STORES, userLat, userLng);
    if (best) {
      w.triggered = true;
      w.storeId = best.store.id;
      w.storeName = best.store.name;
      w.dist = best.dist;
      w.triggeredAt = Date.now();
      w.by = (best.store.confirmedBy && best.store.confirmedBy[w.id]) || null;
      if (w.by === "Explorateur") w.by = null;
      w.verdict = null; w.reminders = 0;
      fired = true;
    }
  });
  return fired;
}

/* index.html:21846-21873 — renderChasse : ce que MON telephone met dans
   `demande` avant d'y ajouter les chasses lues en base. */
function demandeLocale(drinkWatches, STORES) {
  const demande = {};
  if (STORES && STORES.length) {
    (drinkWatches || []).forEach(function (w) {
      if (w.triggered) return;          // ligne 21851
      demande[String(w.id)] = { id: Number(w.id), chercheurs: 1, moi: true, distKm: 0, lastAt: w.created || null };
    });
  }
  return demande;
}
function fusionner(demande, hunts) {
  (hunts || []).forEach(function (h) {
    const k = String(h.drinkId);
    const n = h.seekers || 0;
    if (demande[k]) {
      demande[k].chercheurs = Math.max(demande[k].chercheurs, n);
      demande[k].moi = demande[k].moi || !!h.mine;
      if (h.lastAt && (!demande[k].lastAt || h.lastAt > demande[k].lastAt)) demande[k].lastAt = h.lastAt;
    } else demande[k] = { id: Number(h.drinkId), chercheurs: n, moi: !!h.mine, distKm: (h.distKm != null ? h.distKm : null), lastAt: h.lastAt || null };
  });
  return demande;
}

/* index.html:21892-21925 — _peindreChasse : le filtre d'affichage, puis la
   phrase exactement telle que l'ecran la compose (data/i18n.js). */
function peindreChasse(demande, STORES, userLat, userLng) {
  const lignes = Object.keys(demande).map(function (k) { return demande[k]; })
    .filter(function (x) {
      const d = (DRINKS || []).find(function (y) { return Number(y.id) === Number(x.id); });
      if (!d) return false;                                          // ligne 21897
      if (magasinProcheAvec(x.id, STORES, userLat, userLng)) return false;  // ligne 21899
      x.d = d; return true;
    })
    .sort(function (a, b) { return b.chercheurs - a.chercheurs; })
    .slice(0, 8);
  return lignes.map(function (x) {
    const n = x.chercheurs;
    const qui = (n > 1) ? (n + " personnes la cherchent") : (x.moi ? "Tu la cherches" : "1 personne la cherche");
    return { id: x.id, phrase: qui, distKm: x.distKm, moi: x.moi };
  });
}

/* index.html:15205-15213 — la pilule d'etat de « Tes alertes ». */
function pilule(w) {
  if (!w.triggered) return "En recherche";
  return (w.verdict === "ok" ? "Confirmée par toi" : "Trouvée") + (w.storeName ? " · " + w.storeName : "");
}

/* index.html:15156-15181 — removeWatch(id, force) : la croix ✕ « Retirer la
   veille » et le glissement de « Tes alertes ». Sans la question en attente
   (verdict deja donne), elle fait EXACTEMENT ces deux lignes. */
function removeWatch(drinkWatches, id) {
  return drinkWatches.filter(function (x) { return Number(x.id) !== Number(id); });
  // saveWatches() = localStorage seul (index.html:14155). Rien d'autre.
}

/* index.html:14307-14313 — toggleWatch, branche « deja en veille ». */
async function toggleWatchRetrait(db, uid, drinkWatches, d) {
  const out = drinkWatches.filter(function (x) { return Number(x.id) !== Number(d.id); });
  await fbLeaveHunt(db, uid, d.id);            // ligne 14312
  await fbSyncWatch(db, uid, false, d.id);     // ligne 14335 (add=false)
  return out;
}

/* notifications-push.js:314-332 */
function notifyStockToWatchers(before, after) {
  const bd = new Set(((before && before.drinks) || []).map(String));
  const added = ((after && after.drinks) || []).map(String).filter((x) => !bd.has(x));
  if (added.length > 3) return { envoi: false, pourquoi: "plus de 3 boissons d'un coup" };
  if (!added.length) return { envoi: false, pourquoi: "le tableau `drinks` n'a pas bouge" };
  return { envoi: true, ajoutees: added, pourquoi: "alerte « trouvee pres de toi » envoyee aux veilleurs" };
}

/* Distance affichee, pour les notes. */
const km = (a, b) => {
  const dLa = (a.lat - b.lat) * 111, dLo = (a.lng - b.lng) * 111 * Math.cos(a.lat * Math.PI / 180);
  return Math.round(Math.sqrt(dLa * dLa + dLo * dLo) * 10) / 10;
};

/* ════════════════════════════════════════════════════════════════════════ */
/* 1. LE PARCOURS, JUSQU'A LA CONFIRMATION D'ALICE                          */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("Alice lance la chasse (fbJoinHunt) et pose sa veille (fbSyncWatch)", async () => {
  await setDoc(doc(alice, "users", ALICE), { pseudo: "Explorateur", createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(bob, "users", BOB), { pseudo: "Explorateur", createdAt: serverTimestamp() }, { merge: true });
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", ALICE_POS.lat, ALICE_POS.lng);
  await fbSyncWatch(alice, ALICE, true, BOISSON, NOM, ALICE_POS.lat, ALICE_POS.lng, 10);
  const d = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
  verifier(d.seekers[ALICE], "Alice n'est pas inscrite");
});

let avantMagasin = null, apresMagasin = null;
await doit("Bob la repere en rayon et la rattache au magasin", async () => {
  await setDoc(doc(bob, "stores", MAGASIN.id), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng, drinks: [], confirmations: {},
  });
  avantMagasin = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  await fbAddDrinkToStore(bob, MAGASIN.id, BOISSON, true);
  apresMagasin = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  verifier(Number((apresMagasin.confirmations || {})[BOISSON]) > 0, "pas de confirmation");
});
{
  const r = notifyStockToWatchers(avantMagasin, apresMagasin);
  note("serveur : " + (r.envoi ? "PUSH" : "rien") + " — " + r.pourquoi);
}

/* Le telephone d'Alice : il a charge le magasin, checkWatches se declenche. */
const STORES_ALICE = [];
let watchesAlice = [{ id: BOISSON, name: NOM, emoji: "", lat: ALICE_POS.lat, lng: ALICE_POS.lng, created: Date.now(), triggered: false }];
await doit("a l'ouverture suivante, l'alerte d'Alice se declenche (checkWatches, index.html:15082)", async () => {
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  STORES_ALICE.push(Object.assign({ id: MAGASIN.id, fbId: MAGASIN.id }, s));
  const fired = checkWatches(watchesAlice, STORES_ALICE, ALICE_POS.lat, ALICE_POS.lng);
  verifier(fired && watchesAlice[0].triggered, "l'alerte ne s'est pas declenchee");
});
await doit("Alice va au magasin et confirme a son tour (repondreIndication, index.html:14951)", async () => {
  await fbConfirmStock(alice, MAGASIN.id, BOISSON, 1);
  watchesAlice[0].verdict = "ok"; watchesAlice[0].verdictAt = Date.now();
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  verifier(Number((s.confirmations || {})[BOISSON]) >= 2, "la 2e confirmation manque");
  STORES_ALICE[0] = Object.assign({ id: MAGASIN.id, fbId: MAGASIN.id }, s);
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 2. CE QUE CHAQUE ECRAN ANNONCE UNE FOIS LA BOISSON TROUVEE               */
/* ════════════════════════════════════════════════════════════════════════ */
note("distances : Alice→magasin " + km(ALICE_POS, MAGASIN) + " km · Carol→magasin " + km(CAROL_POS, MAGASIN)
  + " km · Dora→magasin " + km(DORA_POS, MAGASIN) + " km · Dora→Alice(arrondie) "
  + km(DORA_POS, { lat: _coarse(ALICE_POS.lat), lng: _coarse(ALICE_POS.lng) }) + " km");

await doit("l'ecran d'Alice ne dit nulle part qu'elle cherche encore", async () => {
  const d = fusionner(demandeLocale(watchesAlice, STORES_ALICE),
    await fbLoadNearbyHunts(alice, "alice", ALICE, ALICE_POS.lat, ALICE_POS.lng, _hrClamp(10)));
  const l = peindreChasse(d, STORES_ALICE, ALICE_POS.lat, ALICE_POS.lng);
  verifier(!l.length, "l'onglet Chasse d'Alice affiche : " + JSON.stringify(l));
  verifier(pilule(watchesAlice[0]) === "Confirmée par toi · " + MAGASIN.name,
    "la pilule de « Tes alertes » dit : " + pilule(watchesAlice[0]));
});
note("« Tes alertes » chez Alice : « " + pilule(watchesAlice[0]) + " » (index.html:15212)");

const STORES_CAROL = [];
await doit("chez un lecteur qui a le magasin a moins de 10 km, la chasse ne s'annonce plus (index.html:21899)", async () => {
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  STORES_CAROL.push(Object.assign({ id: MAGASIN.id, fbId: MAGASIN.id }, s));
  const d = fusionner({}, await fbLoadNearbyHunts(carol, "carol", "carol", CAROL_POS.lat, CAROL_POS.lng, _hrClamp(10)));
  const l = peindreChasse(d, STORES_CAROL, CAROL_POS.lat, CAROL_POS.lng);
  verifier(!l.length, "Carol lit encore : " + JSON.stringify(l));
});

/* Dora : meme zone qu'Alice, mais le magasin qui l'a est a plus de 10 km
   d'elle — le filtre de _peindreChasse ne la protege donc pas. */
const STORES_DORA = [];
let ligneDora = null;
{
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  STORES_DORA.push(Object.assign({ id: MAGASIN.id, fbId: MAGASIN.id }, s));
  const d = fusionner({}, await fbLoadNearbyHunts(dora, "dora", "dora", DORA_POS.lat, DORA_POS.lng, _hrClamp(10)));
  const l = peindreChasse(d, STORES_DORA, DORA_POS.lat, DORA_POS.lng);
  ligneDora = l[0] || null;
  note("ce que Dora lit dans l'onglet Chasse : " + (ligneDora ? "« " + ligneDora.phrase + " »" : "rien"));
}

/* La question qui decide si cette annonce ment : la demande qu'elle designe
   est-elle encore vivante ? Si Dora signale la boisson dans un magasin pres
   de chez elle, Alice est-elle prevenue ? */
let veilleAlice = null;
await doit("la demande que Dora lit mene encore a quelqu'un : la veille d'Alice est toujours en base", async () => {
  veilleAlice = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  verifier(veilleAlice && veilleAlice.uid === ALICE, "la veille d'Alice a disparu : " + JSON.stringify(veilleAlice || null));
});
note("veille d'Alice : rayon " + (veilleAlice && veilleAlice.radius) + " km — notifyStockToWatchers la previendra"
  + " pour tout magasin qui GAGNE cette boisson dans ce rayon (notifications-push.js:314).");

/* ════════════════════════════════════════════════════════════════════════ */
/* 3. LES DEUX GESTES QUI SONT CENSES TERMINER LA CHASSE                    */
/* ════════════════════════════════════════════════════════════════════════ */

/* 3a. La croix ✕ de « Tes alertes » — le geste le plus proche de la pilule
   « Confirmée par toi », et le seul propose par le glissement. */
await doit("le ✕ « Retirer la veille » de Tes alertes (index.html:15156) retire aussi Alice de la chasse partagee", async () => {
  watchesAlice = removeWatch(watchesAlice, BOISSON);
  delete caches.dora;
  const d = fusionner({}, await fbLoadNearbyHunts(dora, "dora", "dora", DORA_POS.lat, DORA_POS.lng, _hrClamp(10)));
  const l = peindreChasse(d, STORES_DORA, DORA_POS.lat, DORA_POS.lng);
  const w = await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON));
  verifier(!l.length && !w.exists(),
    "removeWatch n'ecrit QUE dans localStorage (index.html:15180-15181, saveWatches:14155) :"
    + " la chasse annonce toujours « " + (l[0] && l[0].phrase) + " » chez Dora"
    + (w.exists() ? " et la veille serveur survit" : "")
    + " — et Alice ne voit plus la ligne, donc plus aucun ecran ne lui permet d'y revenir");
});
note("apres le ✕ : Alice n'a plus la veille sur son telephone, mais hunts/" + BOISSON
  + ".seekers." + ALICE + " est toujours la (regles 1097 : seul l'administrateur peut effacer le document).");

/* 3b. Le geste qui, lui, parle a tout le monde : la cloche de la fiche boisson. */
await doit("Alice relance la chasse, puis la quitte par la cloche (toggleWatch, index.html:14312) : tout le monde la voit disparaitre", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", ALICE_POS.lat, ALICE_POS.lng);
  await fbSyncWatch(alice, ALICE, true, BOISSON, NOM, ALICE_POS.lat, ALICE_POS.lng, 10);
  let ws = [{ id: BOISSON, name: NOM, triggered: false }];
  ws = await toggleWatchRetrait(alice, ALICE, ws, { id: BOISSON });
  delete caches.dora;
  const d = fusionner({}, await fbLoadNearbyHunts(dora, "dora", "dora", DORA_POS.lat, DORA_POS.lng, _hrClamp(10)));
  const l = peindreChasse(d, STORES_DORA, DORA_POS.lat, DORA_POS.lng);
  verifier(!l.length && !ws.length, "la chasse s'annonce encore : " + JSON.stringify(l));
});

await bilan(env);
