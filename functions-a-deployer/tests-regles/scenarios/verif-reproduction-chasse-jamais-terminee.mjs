/* ============================================================================
   VERIFICATION INDEPENDANTE — « une chasse ne se termine jamais toute seule »
   ----------------------------------------------------------------------------
   On ne rejoue PAS le grand parcours : on isole l'etape 6 et on va plus loin
   que la trouvaille a verifier, en mesurant ce que VOIT vraiment un lecteur.

   Ecritures recopiees de index.html (memes collections, champs, ordre) :
     _coarse                  index.html:4505
     window.fbJoinHunt        index.html:4545-4593
     window.fbLeaveHunt       index.html:4595-4604
     window.fbLoadNearbyHunts index.html:4616-4661
     window.fbAddReport       index.html:3316-3350
     window.fbConfirmStock    index.html:2311-2336
     repondreIndication(ok)   index.html:14938-14975  (ce que fait « Je l'ai trouvee »)
     removeWatch(id,force)    index.html:15156-15182  (la croix ✕ de la carte d'alertes, 15227)
     toggleWatch(d)           index.html:14307-14316  (le bouton « Retirer l'alerte » de la fiche)
     checkWatches             index.html:15073-15100  (pose w.triggered, n'ecrit RIEN en ligne)
     magasinProcheAvec        index.html:14805-14820
     _peindreChasse (filtre)  index.html:21895-21902
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc,
  collection, query, limit, serverTimestamp, increment,
} from "firebase/firestore";

const env = await banc("verif-chasse-jamais-terminee");
const ALICE = "alice", BOB = "bob", CAROLE = "carole";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const carole = env.authenticatedContext(CAROLE).firestore();
const anon = env.unauthenticatedContext().firestore();
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* Le decor : Alice a Ixelles, le magasin a 4 km, Carole a 20 km (Louvain). */
const ALICE_POS = { lat: 50.8676, lng: 4.3436 };
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };
const VOISIN_POS = { lat: 50.8300, lng: 4.3700 };   // 1 km du magasin
const CAROLE_POS = { lat: 50.8800, lng: 4.7000 };   // ~23 km du magasin, ~25 km d'Alice
const BOISSON = 7, NOM = "Mountain Dew Spark";
const DRINKS = [{ id: BOISSON, name: NOM, emoji: "🥤" }];

/* ══ COPIES CONFORMES ════════════════════════════════════════════════════ */

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

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
  try { await updateDoc(ref, maj); return "maj"; }
  catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); return "bouge";
    } catch (e2) {
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
      return "creation";
    }
  }
}

/* index.html:4595-4604 */
async function fbLeaveHunt(db, uid, drinkId) {
  const patch = {}; patch["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), patch);
}

/* index.html:4616-4661 — cache de 20 s par « telephone », comme window._huntsCache */
const caches = {};
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;
  else { snap = await getDocs(query(collection(db, "hunts"), limit(200))); caches[appareil] = { at: Date.now(), snap }; }
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
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, emoji: h.emoji, seekers: near, mine, distKm, lastAt });
  });
  out.sort(function (a, b) { return b.seekers - a.seekers; });
  return out;
}

/* index.html:3316-3350 */
async function fbAddReport(db, uid, storeId, drinkId, type, plus) {
  const extra = { storeName: MAGASIN.name, lat: Math.round(MAGASIN.lat * 100) / 100,
                  lng: Math.round(MAGASIN.lng * 100) / 100, tz: "Europe/Brussels" };
  return await addDoc(collection(db, "reports"), Object.assign({
    storeId, drinkId, type, by: uid || null, byPseudo: "Explorateur", createdAt: serverTimestamp(),
  }, extra, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
}

/* index.html:2311-2336 */
async function fbConfirmStock(db, storeId, drinkId, value) {
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  if (value > 0) {
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = "Explorateur";
    updates["confirmedAt." + drinkId] = heure;
  } else {
    updates["absentBy." + drinkId] = "Explorateur";
    updates["absentAt." + drinkId] = heure;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:14805-14820 — magasinProcheAvec, sur la liste STORES du lecteur.
   index.html:3859 le dit : « window.STORES ne contient que les magasins
   charges autour de MA position ». */
function magasinProcheAvec(STORES, userLat, userLng, did) {
  let best = null;
  (STORES || []).forEach(function (st) {
    const vu = Number((st.confirmations || {})[did]) > 0 ||
      (st.drinksVerified || []).some(function (x) { return Number(x) === Number(did); });
    if (!vu) return;
    let dist = null;
    if (typeof userLat === "number" && userLat && typeof st.lat === "number") {
      const dLa = (userLat - st.lat) * 111000, dLo = (userLng - st.lng) * 111000 * Math.cos(st.lat * Math.PI / 180);
      dist = Math.sqrt(dLa * dLa + dLo * dLo);
    }
    if (dist !== null && dist > 10000) return;
    if (!best || (dist !== null && (best.dist === null || dist < best.dist))) best = { store: st, dist };
  });
  return best;
}

/* index.html:21895-21902 — le filtre de _peindreChasse : ce qui reste a l'ecran. */
function peindreChasse(hunts, mesVeillesNonDeclenchees, STORES, userLat, userLng) {
  const demande = {};
  mesVeillesNonDeclenchees.forEach(function (w) {
    demande[String(w.id)] = { id: Number(w.id), chercheurs: 1, moi: true };
  });
  (hunts || []).forEach(function (h) {
    const k = String(h.drinkId);
    if (demande[k]) demande[k].chercheurs = Math.max(demande[k].chercheurs, h.seekers || 0);
    else demande[k] = { id: Number(h.drinkId), chercheurs: h.seekers || 0, moi: !!h.mine };
  });
  return Object.keys(demande).map(function (k) { return demande[k]; }).filter(function (x) {
    const d = DRINKS.find(function (y) { return Number(y.id) === Number(x.id); });
    if (!d) return false;
    if (magasinProcheAvec(STORES, userLat, userLng, x.id)) return false;
    return true;
  });
}

/* index.html:14938-14975 — repondreIndication(did,sid,true) : « Je l'ai trouvee ».
   Cote base, exactement deux ecritures ; cote memoire, w.verdict="ok".
   AUCUN appel a fbLeaveHunt dans cette fonction. */
async function repondreIndication(db, uid, w, storeId, did, ok) {
  if (ok) {
    await fbConfirmStock(db, storeId, did, 1);
    await fbAddReport(db, uid, storeId, did, "stock", { note: "reponse|80" });
    if (w) { w.verdict = "ok"; w.verdictAt = Date.now(); }
  } else {
    await fbConfirmStock(db, storeId, did, -1);
    await fbAddReport(db, uid, storeId, did, "rupture", { note: "reponse|80" });
    if (w) { w.verdict = "ko"; w.verdictAt = Date.now(); }
  }
}

/* index.html:15073-15100 — checkWatches. Reproduit a l'identique sur ce qui
   compte ici : elle pose w.triggered et N'ECRIT RIEN dans Firestore. */
function checkWatches(drinkWatches, STORES, userLat, userLng) {
  let fired = false;
  drinkWatches.forEach(function (w) {
    if (w.triggered) return;
    const best = magasinProcheAvec(STORES, userLat, userLng, w.id);
    if (best) {
      w.triggered = true; w.storeId = best.store.id; w.storeName = best.store.name;
      w.dist = best.dist; w.triggeredAt = Date.now(); w.verdict = null; w.reminders = 0;
      fired = true;
    }
  });
  return fired;   // puis saveWatches() : localStorage, rien d'autre.
}

/* index.html:15156-15182 — removeWatch(id, force). La croix ✕ de la carte
   d'alertes (index.html:15227) appelle CECI. */
function removeWatch(drinkWatches, id) {
  return drinkWatches.filter(function (x) { return Number(x.id) !== Number(id); });
  // saveWatches(); renderAlertsCard(); — et rien d'autre.
}

/* ══ LE PARCOURS ═════════════════════════════════════════════════════════ */

/* Le magasin liste deja la boisson, mais personne ne l'a confirmee : c'est
   l'etat qui autorise Alice a lancer une chasse (magasinProcheAvec exige
   confirmations > 0). */
await doit("le decor : le magasin existe, boisson listee mais non confirmee", async () => {
  await setDoc(doc(bob, "stores", MAGASIN.id), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng, drinks: [BOISSON], confirmations: {},
  });
});

const veillesAlice = [{ id: BOISSON, name: NOM, emoji: "🥤", lat: ALICE_POS.lat, lng: ALICE_POS.lng, created: Date.now(), triggered: false }];

await doit("Alice lance la chasse (toggleWatch -> lancerChasse -> fbJoinHunt, index.html:14307/14368)", async () => {
  const chemin = await fbJoinHunt(alice, ALICE, BOISSON, NOM, "🥤", ALICE_POS.lat, ALICE_POS.lng);
  const d = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
  verifier(d && d.seekers && d.seekers[ALICE], "Alice n'est pas inscrite (" + chemin + ")");
});

await doit("Carole, a 25 km, voit la chasse : « 1 personne cherche »", async () => {
  delete caches.carole;
  const l = await fbLoadNearbyHunts(carole, "carole", CAROLE, CAROLE_POS.lat, CAROLE_POS.lng, 50);
  const h = l.find((x) => String(x.drinkId) === String(BOISSON));
  verifier(h && h.seekers === 1, "Carole ne voit pas la chasse : " + JSON.stringify(l));
});

/* Bob passe au magasin et confirme le stock. */
await doit("Bob confirme le stock en magasin (fbConfirmStock + fbAddReport)", async () => {
  await fbConfirmStock(bob, MAGASIN.id, BOISSON, 1);
  await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "fiche|120" });
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  verifier(Number((s.confirmations || {})[BOISSON]) > 0, "rien de confirme : " + JSON.stringify(s.confirmations));
});

/* L'app d'Alice rouvre : checkWatches voit le magasin et declenche l'alerte. */
let STORES_ALICE = [];
await doit("l'alerte d'Alice se declenche (checkWatches, index.html:15073) : « Trouvee »", async () => {
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  STORES_ALICE = [{ id: MAGASIN.id, name: s.name, lat: s.lat, lng: s.lng, confirmations: s.confirmations || {} }];
  const fired = checkWatches(veillesAlice, STORES_ALICE, ALICE_POS.lat, ALICE_POS.lng);
  verifier(fired && veillesAlice[0].triggered === true, "l'alerte ne part pas");
});

await doit("checkWatches n'ecrit RIEN en ligne : Alice est toujours inscrite comme chercheuse", async () => {
  const d = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
  verifier(d.seekers[ALICE] && d.seekers[ALICE].at, "etat inattendu : " + JSON.stringify(d.seekers));
});
note("c'est le constat de la trouvaille : index.html:15082 pose w.triggered=true, et la fonction se termine sur saveWatches() (localStorage) — aucun appel a fbLeaveHunt.");

/* Alice va au magasin et repond « Je l'ai trouvee ». */
await doit("Alice repond « Je l'ai trouvee » (repondreIndication, index.html:14938)", async () => {
  await repondreIndication(alice, ALICE, veillesAlice[0], MAGASIN.id, BOISSON, true);
  verifier(veillesAlice[0].verdict === "ok", "verdict non pose");
});

await doit("LA MESURE — apres les DEUX confirmations, la chasse annonce encore un chercheur", async () => {
  delete caches.carole;
  const l = await fbLoadNearbyHunts(carole, "carole", CAROLE, CAROLE_POS.lat, CAROLE_POS.lng, 50);
  const h = l.find((x) => String(x.drinkId) === String(BOISSON));
  verifier(h && h.seekers === 1, "la chasse a disparu, la trouvaille ne tient pas : " + JSON.stringify(l));
  note("fbLoadNearbyHunts rend a Carole : " + JSON.stringify(h));
});

/* Ce que chaque lecteur VOIT reellement apres le filtre de _peindreChasse. */
await doit("un voisin a 1 km du magasin ne voit PLUS la chasse (_peindreChasse, index.html:21899)", async () => {
  delete caches.voisin;
  const l = await fbLoadNearbyHunts(bob, "voisin", BOB, VOISIN_POS.lat, VOISIN_POS.lng, 50);
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  const STORES_VOISIN = [{ id: MAGASIN.id, name: s.name, lat: s.lat, lng: s.lng, confirmations: s.confirmations || {} }];
  const lignes = peindreChasse(l, [], STORES_VOISIN, VOISIN_POS.lat, VOISIN_POS.lng);
  verifier(!lignes.find((x) => Number(x.id) === BOISSON), "le voisin la voit encore : " + JSON.stringify(lignes));
});

await doit("Carole, a 23 km du magasin, VOIT « 1 personne cherche » pour une boisson deja trouvee", async () => {
  delete caches.carole;
  const l = await fbLoadNearbyHunts(carole, "carole", CAROLE, CAROLE_POS.lat, CAROLE_POS.lng, 50);
  /* Le magasin est a 23 km de Carole : il n'est pas dans SA liste STORES
     (index.html:3859), et meme s'il y etait, magasinProcheAvec le jette
     au-dela de 10 km. */
  const lignes = peindreChasse(l, [], [], CAROLE_POS.lat, CAROLE_POS.lng);
  const x = lignes.find((y) => Number(y.id) === BOISSON);
  verifier(x && x.chercheurs === 1, "Carole ne voit rien : " + JSON.stringify(lignes));
  note("ce que l'ecran de Carole affiche : " + JSON.stringify(x) + " — alors que deux personnes l'ont confirmee en rayon.");
});

/* Le geste le plus naturel pour « fermer » la chasse : la croix de la carte
   d'alertes. Elle appelle removeWatch, PAS toggleWatch. */
await doit("Alice appuie sur la croix ✕ de sa carte d'alertes (removeWatch, index.html:15227 -> 15156)", async () => {
  const restantes = removeWatch(veillesAlice, BOISSON);
  verifier(restantes.length === 0, "la veille locale n'est pas retiree");
  delete caches.carole;
  const l = await fbLoadNearbyHunts(carole, "carole", CAROLE, CAROLE_POS.lat, CAROLE_POS.lng, 50);
  const h = l.find((x) => String(x.drinkId) === String(BOISSON));
  verifier(h && h.seekers === 1,
    "la chasse a disparu, donc removeWatch previent bien le serveur : " + JSON.stringify(l));
  note("removeWatch (index.html:15180) filtre drinkWatches puis saveWatches() : elle n'appelle PAS fbLeaveHunt. Alice a retire sa veille, la chasse annonce toujours 1 chercheur.");
});

/* Le seul chemin qui previent le serveur. */
await doit("seul toggleWatch (index.html:14312) sort Alice de la chasse", async () => {
  await fbLeaveHunt(alice, ALICE, BOISSON);
  delete caches.carole;
  const l = await fbLoadNearbyHunts(carole, "carole", CAROLE, CAROLE_POS.lat, CAROLE_POS.lng, 50);
  verifier(!l.find((x) => String(x.drinkId) === String(BOISSON)), "encore visible apres fbLeaveHunt");
});

await bilan(env);
