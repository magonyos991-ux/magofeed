/* ============================================================================
   VERIFICATION « IMPACT » — QU'EST-CE QUE CA CHANGE POUR QUELQU'UN ?
   ----------------------------------------------------------------------------
   La trouvaille dit : une chasse ne se termine jamais toute seule. On ne
   remesure pas seulement le compteur : on suit CAROLE, la personne qui lit
   cette chasse perimee et qui AGIT dessus, et on mesure mot pour mot ce que
   son ecran lui dit.

   Ecritures et calculs recopies de index.html (memes collections, memes
   champs, meme ordre, memes valeurs) :
     _coarse                  index.html:4505
     window.fbJoinHunt        index.html:4545
     window.fbLeaveHunt       index.html:4595
     window.fbHuntSeekers     index.html:4606
     window.fbLoadNearbyHunts index.html:4616
     window.fbAddReport       index.html:3316
     window.fbConfirmStock    index.html:2311
     window.fbAddDrinkToStore index.html:3889
     magasinProcheAvec        index.html:14805
     checkWatches             index.html:15073  (pose w.triggered, n'ecrit rien en ligne)
     removeWatch              index.html:15156  (la croix ✕, index.html:15227)
     toggleWatch              index.html:14307  (le seul appel a fbLeaveHunt : 14312)
     _peindreChasse (filtre + libelles) index.html:21892-21926
     maybeRewardHuntHelp      index.html:6821-6841
   Libelles exacts : data/i18n.js:30
     huntSeekers1 "1 personne la cherche"
     huntLead     "Si tu en vois une en rayon, dis-le : tout le monde qui la
                   cherche est prévenu, et tu gagnes des points."
     huntHelped   "Tu as aidé une chasse ! {n} personne{s} cherchai{v} ça ·
                   +5 pts · +15 si quelqu'un confirme"
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc,
  collection, query, limit, serverTimestamp, increment, arrayUnion,
} from "firebase/firestore";

const env = await banc("verif-impact-chasse-terminee");
const ALICE = "alice", BOB = "bob", CAROLE = "carole";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const carole = env.authenticatedContext(CAROLE).firestore();
const anon = env.unauthenticatedContext().firestore();
const verifier = (c, q) => { if (!c) throw new Error(q); };
const serveur = async (fn) => { let o; await env.withSecurityRulesDisabled(async (c) => { o = await fn(c.firestore()); }); return o; };

/* Le decor. Alice a Ixelles. Le magasin ou la boisson sera trouvee est a 4 km
   d'elle. Carole habite Louvain, a ~23 km du magasin — donc HORS des 10 km de
   magasinProcheAvec, et son magasin a elle est un autre magasin. */
const BOISSON = 7, NOM = "Mountain Dew Spark";
const DRINKS = [{ id: BOISSON, name: NOM, emoji: "" }];
const ALICE_POS  = { lat: 50.8676, lng: 4.3436 };
const CAROLE_POS = { lat: 50.8800, lng: 4.7000 };
const MAG_ALICE  = { id: "st-flagey",  name: "Delhaize Flagey",  lat: 50.8281, lng: 4.3720 };
const MAG_CAROLE = { id: "st-louvain", name: "Carrefour Leuven", lat: 50.8790, lng: 4.7010 };

/* ══ COPIES CONFORMES ════════════════════════════════════════════════════ */

/* index.html:4505 */
const _coarse = (x) => Math.round(x * 10) / 10;

/* index.html:4545 */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName || "").slice(0, 60), emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun); maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); return "maj"; }
  catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat; bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); return "bouge";
    } catch (e2) {
      await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
        seekers: (() => { const o = {}; o[uid] = moi; return o; })() }, commun));
      return "creation";
    }
  }
}
/* index.html:4595 */
async function fbLeaveHunt(db, uid, drinkId) {
  const p = {}; p["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), p);
}
/* index.html:4606 */
async function fbHuntSeekers(db, uid, drinkId) {
  const s = await getDoc(doc(db, "hunts", String(drinkId)));
  if (!s.exists()) return 0;
  const seekers = s.data().seekers || {};
  let n = 0; const fresh = Date.now() - 30 * 86400000;
  Object.keys(seekers).forEach((u) => { const x = seekers[u]; if (x && x.at && x.at >= fresh && u !== uid) n++; });
  return n;
}
/* index.html:4616 — cache de 20 s par telephone (window._huntsCache) */
const caches = {};
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const c = caches[appareil]; let snap;
  if (c && (Date.now() - c.at) < 20000) snap = c.snap;
  else { snap = await getDocs(query(collection(db, "hunts"), limit(200))); caches[appareil] = { at: Date.now(), snap }; }
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100, fresh = Date.now() - 365 * 86400000;
  snap.forEach((d) => {
    const h = d.data(); const seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null, lastAt = null;
    Object.keys(seekers).forEach((uid) => {
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
  out.sort((a, b) => b.seekers - a.seekers);
  return out;
}
/* index.html:3316 */
async function fbAddReport(db, uid, st, drinkId, type, plus) {
  const extra = { storeName: String(st.name).slice(0, 60),
    lat: Math.round(st.lat * 100) / 100, lng: Math.round(st.lng * 100) / 100, tz: "Europe/Brussels" };
  return await addDoc(collection(db, "reports"), Object.assign({
    storeId: st.id, drinkId, type, by: uid || null, byPseudo: "Explorateur", createdAt: serverTimestamp(),
  }, extra, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
}
/* index.html:2311 */
async function fbConfirmStock(db, storeId, drinkId, value) {
  const u = {}; const quand = Math.floor(Date.now() / 3600000) * 3600000;
  u["confirmations." + drinkId] = increment(value);
  if (value > 0) { u["seenAt." + drinkId] = quand; u["confirmedBy." + drinkId] = "Explorateur"; u["confirmedAt." + drinkId] = quand; }
  else { u["absentBy." + drinkId] = "Explorateur"; u["absentAt." + drinkId] = quand; }
  await updateDoc(doc(db, "stores", String(storeId)), u);
}
/* index.html:3889 */
async function fbAddDrinkToStore(db, storeId, drinkId, vu) {
  const u = { drinks: arrayUnion(Number(drinkId) || drinkId) };
  if (vu !== false) {
    const h = Math.floor(Date.now() / 3600000) * 3600000;
    u["confirmations." + drinkId] = increment(1);
    u["seenAt." + drinkId] = h; u["confirmedBy." + drinkId] = "Explorateur"; u["confirmedAt." + drinkId] = h;
  }
  await updateDoc(doc(db, "stores", String(storeId)), u);
}
/* index.html:14805 — sur la liste STORES du lecteur (index.html:3859 : elle ne
   contient que les magasins charges autour de MA position). */
function magasinProcheAvec(STORES, userLat, userLng, did) {
  let best = null;
  (STORES || []).forEach((st) => {
    const vu = Number((st.confirmations || {})[did]) > 0 ||
      (st.drinksVerified || []).some((x) => Number(x) === Number(did));
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
/* index.html:15073 — checkWatches : pose w.triggered, rien de plus en ligne. */
function checkWatches(watches, STORES, userLat, userLng) {
  let fired = false;
  watches.forEach((w) => {
    if (w.triggered) return;
    const best = magasinProcheAvec(STORES, userLat, userLng, w.id);
    if (best) { w.triggered = true; w.storeId = best.store.id; w.storeName = best.store.name;
      w.dist = best.dist; w.triggeredAt = Date.now(); w.verdict = null; w.reminders = 0; fired = true; }
  });
  return fired;   // puis saveWatches() : localStorage. Aucun fbLeaveHunt.
}
/* index.html:15156 — removeWatch(id,force) : la croix ✕ de « Tes alertes ». */
function removeWatch(watches, id) {
  return watches.filter((x) => Number(x.id) !== Number(id));   // saveWatches() + renderAlertsCard(), rien d'autre.
}
/* index.html:21892-21926 — le filtre de _peindreChasse ET le libelle affiche. */
const I18N = {
  huntSeekers1: "1 personne la cherche",
  huntSeekersN: "{n} personnes la cherchent",
  huntYou: "Tu la cherches",
  huntHelped: "Tu as aidé une chasse ! {n} personne{s} cherchai{v} ça · +5 pts · +15 si quelqu’un confirme",
};
function peindreChasse(hunts, veilles, STORES, userLat, userLng) {
  const demande = {};
  if (STORES && STORES.length) veilles.forEach((w) => {
    if (w.triggered) return;                                  // index.html:21851
    demande[String(w.id)] = { id: Number(w.id), chercheurs: 1, moi: true, distKm: 0 };
  });
  (hunts || []).forEach((h) => {
    const k = String(h.drinkId);
    if (demande[k]) { demande[k].chercheurs = Math.max(demande[k].chercheurs, h.seekers || 0); demande[k].moi = demande[k].moi || !!h.mine; }
    else demande[k] = { id: Number(h.drinkId), chercheurs: h.seekers || 0, moi: !!h.mine, distKm: h.distKm };
  });
  return Object.keys(demande).map((k) => demande[k]).filter((x) => {
    const d = DRINKS.find((y) => Number(y.id) === Number(x.id));
    if (!d) return false;                                     // index.html:21898
    if (magasinProcheAvec(STORES, userLat, userLng, x.id)) return false;  // index.html:21899
    x.d = d; return true;
  }).map((x) => {                                             // index.html:21925
    const n = x.chercheurs;
    x.libelle = (n > 1) ? I18N.huntSeekersN.replace("{n}", n) : (x.moi ? I18N.huntYou : I18N.huntSeekers1);
    return x;
  });
}
/* index.html:6821-6841 — maybeRewardHuntHelp : ce que l'ecran de l'aidant dit. */
async function maybeRewardHuntHelp(db, uid, drinkId) {
  const n = await fbHuntSeekers(db, uid, drinkId);
  if (!(n > 0)) return { recompense: false, n: 0 };
  return { recompense: true, n, pts: 5, sonWin: true, confetti: true, enAttente: 15,
    toast: I18N.huntHelped.replace("{n}", n).replace("{s}", n > 1 ? "s" : "").replace("{v}", n > 1 ? "ent" : "t") };
}
/* points-et-parrainage.js:320-385 — la partie de crediterEntraide qui decide si
   le rapport de Carole est marque « hunt » (donc creditable plus tard). */
async function marqueHunt(db, repId) {
  const rep = (await getDoc(doc(db, "reports", repId))).data() || {};
  const creeA = rep.createdAt ? rep.createdAt.toMillis() : Date.now();
  const hs = await getDoc(doc(db, "hunts", String(rep.drinkId)));
  const seekers = hs.exists() ? ((hs.data() || {}).seekers || {}) : {};
  return Object.keys(seekers).filter((u) => seekers[u] && u !== rep.by
    && typeof seekers[u].at === "number" && seekers[u].at < creeA);
}

/* ══ LE PARCOURS ═════════════════════════════════════════════════════════ */

await doit("le decor : deux magasins, aucune confirmation (c'est ce qui autorise une chasse)", async () => {
  await setDoc(doc(bob, "stores", MAG_ALICE.id), { name: MAG_ALICE.name, lat: MAG_ALICE.lat, lng: MAG_ALICE.lng, drinks: [], confirmations: {} });
  await setDoc(doc(carole, "stores", MAG_CAROLE.id), { name: MAG_CAROLE.name, lat: MAG_CAROLE.lat, lng: MAG_CAROLE.lng, drinks: [], confirmations: {} });
  await setDoc(doc(alice, "users", ALICE), { pseudo: "Explorateur", createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(carole, "users", CAROLE), { pseudo: "Explorateur", createdAt: serverTimestamp() }, { merge: true });
});

const veillesAlice = [{ id: BOISSON, name: NOM, emoji: "", lat: ALICE_POS.lat, lng: ALICE_POS.lng, created: Date.now(), triggered: false }];

await doit("ETAPE 1 — Alice lance la chasse (toggleWatch -> lancerChasse -> fbJoinHunt)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", ALICE_POS.lat, ALICE_POS.lng);
  const d = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
  verifier(d && d.seekers && d.seekers[ALICE], "Alice n'est pas inscrite");
});

await doit("ETAPE 2 — Bob la trouve et la rattache au magasin (fbAddDrinkToStore, index.html:3889)", async () => {
  await fbAddDrinkToStore(bob, MAG_ALICE.id, BOISSON, true);
  await fbAddReport(bob, BOB, MAG_ALICE, BOISSON, "stock", { note: "fiche|120" });
  const s = (await getDoc(doc(anon, "stores", MAG_ALICE.id))).data();
  verifier(Number((s.confirmations || {})[BOISSON]) > 0, "rien de confirme");
});

let STORES_ALICE = [];
await doit("ETAPE 3 — l'alerte d'Alice se declenche a l'ouverture (checkWatches, index.html:15073)", async () => {
  const s = (await getDoc(doc(anon, "stores", MAG_ALICE.id))).data();
  STORES_ALICE = [{ id: MAG_ALICE.id, name: s.name, lat: s.lat, lng: s.lng, confirmations: s.confirmations || {} }];
  verifier(checkWatches(veillesAlice, STORES_ALICE, ALICE_POS.lat, ALICE_POS.lng), "l'alerte ne part pas");
  verifier(veillesAlice[0].triggered === true, "w.triggered non pose");
});

await doit("ETAPE 4 — Alice y va et confirme a son tour (fbConfirmStock + fbAddReport)", async () => {
  await fbConfirmStock(alice, MAG_ALICE.id, BOISSON, 1);
  await fbAddReport(alice, ALICE, MAG_ALICE, BOISSON, "stock", { note: "reponse|80" });
  veillesAlice[0].verdict = "ok";
  const s = (await getDoc(doc(anon, "stores", MAG_ALICE.id))).data();
  verifier(Number((s.confirmations || {})[BOISSON]) >= 2, "deux confirmations attendues : " + JSON.stringify(s.confirmations));
});

await doit("ETAPE 5 — Alice appuie sur la croix ✕ de « Tes alertes » (removeWatch, index.html:15227)", async () => {
  const restantes = removeWatch(veillesAlice, BOISSON);
  verifier(restantes.length === 0, "veille locale non retiree");
  const d = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
  verifier(d.seekers[ALICE] && d.seekers[ALICE].at, "Alice serait sortie de la chasse : " + JSON.stringify(d.seekers));
});
note("index.html:15180 : removeWatch filtre drinkWatches puis saveWatches(). Ni fbLeaveHunt, ni fbSyncWatch(false). Pour Alice, l'affaire est classee sur SON telephone ; en base, elle cherche encore.");

/* ══ CE QUE CAROLE VOIT, ET CE QU'ELLE FAIT ══════════════════════════════ */

let ligneCarole = null;
await doit("IMPACT 1 — Carole (23 km) ouvre l'onglet Chasse : son ecran affiche « 1 personne la cherche »", async () => {
  delete caches.carole;
  const l = await fbLoadNearbyHunts(carole, "carole", CAROLE, CAROLE_POS.lat, CAROLE_POS.lng, 50);
  /* Le magasin d'Alice est a 23 km de Carole : il n'est pas dans SA liste
     STORES, et meme charge, magasinProcheAvec le jette au-dela de 10 km. */
  const s = (await getDoc(doc(anon, "stores", MAG_CAROLE.id))).data();
  const STORES_CAROLE = [{ id: MAG_CAROLE.id, name: s.name, lat: s.lat, lng: s.lng, confirmations: s.confirmations || {} }];
  const lignes = peindreChasse(l, [], STORES_CAROLE, CAROLE_POS.lat, CAROLE_POS.lng);
  ligneCarole = lignes.find((x) => Number(x.id) === BOISSON);
  verifier(ligneCarole, "Carole ne voit rien : " + JSON.stringify(lignes));
  verifier(ligneCarole.libelle === I18N.huntSeekers1, "libelle inattendu : " + ligneCarole.libelle);
});
note("ecran de Carole, sous « Cherchées près de toi » : « " + NOM + " — " + (ligneCarole && ligneCarole.libelle) + " » + bouton « Je l'ai vue en magasin » et « +5 pts ».");
note("sous-titre affiche juste au-dessus (huntLead) : « Si tu en vois une en rayon, dis-le : tout le monde qui la cherche est prévenu, et tu gagnes des points. » — plus personne ne la cherche.");

await doit("IMPACT 2 — un voisin du magasin, lui, ne la voit plus : l'attenuation existe mais ne couvre que 10 km", async () => {
  delete caches.voisin;
  const l = await fbLoadNearbyHunts(bob, "voisin", BOB, 50.8300, 4.3700, 50);
  const lignes = peindreChasse(l, [], STORES_ALICE, 50.8300, 4.3700);
  verifier(!lignes.find((x) => Number(x.id) === BOISSON), "le voisin la voit encore : " + JSON.stringify(lignes));
});

let recompense = null, rapportCarole = null;
await doit("IMPACT 3 — Carole repond (chasseJeLaiVue -> fbAddReport) et son ecran la felicite pour une aide qui n'aide personne", async () => {
  await fbAddDrinkToStore(carole, MAG_CAROLE.id, BOISSON, true);
  rapportCarole = await fbAddReport(carole, CAROLE, MAG_CAROLE, BOISSON, "stock", { note: "chasse|150" });
  recompense = await maybeRewardHuntHelp(carole, CAROLE, BOISSON);
  verifier(recompense.recompense && recompense.n === 1,
    "maybeRewardHuntHelp ne se declenche pas : " + JSON.stringify(recompense));
});
note("ecran de Carole apres son geste : son de victoire + confettis + « " + (recompense && recompense.toast) + " »");
note("les trois affirmations de ce message sont fausses : personne ne cherchait, l'aide n'a aide personne, et le +15 ne viendra jamais — le seul « chercheur » a deja sa bouteille.");

await doit("IMPACT 4 — le +15 « en attente » ne peut plus se resoudre : Alice n'ira jamais confirmer a Louvain", async () => {
  const autres = await serveur((db) => marqueHunt(db, rapportCarole.id));
  verifier(autres.includes(ALICE),
    "le serveur ne voit pas Alice comme chercheuse anterieure : " + JSON.stringify(autres));
  note("points-et-parrainage.js:330 marque le rapport de Carole `hunt: true` grace a une chercheuse partie. Le +15 (index.html:6836, pendingAdd) n'a AUCUNE date d'expiration (index.html:14875) : la ligne « +15 pts en attente » reste sur l'ecran de Carole indefiniment.");
});

/* ══ COMBIEN DE TEMPS, ET LE DESACCORD ENTRE DEUX ECRANS ═════════════════ */

await doit("DUREE — une chercheuse inscrite il y a 300 jours est encore annoncee « 1 personne la cherche »", async () => {
  await serveur(async (db) => {
    const p = {}; p["seekers." + ALICE + ".at"] = Date.now() - 300 * 86400000;
    await updateDoc(doc(db, "hunts", String(BOISSON)), p);
  });
  delete caches.carole;
  const l = await fbLoadNearbyHunts(carole, "carole", CAROLE, CAROLE_POS.lat, CAROLE_POS.lng, 50);
  const h = l.find((x) => String(x.drinkId) === String(BOISSON));
  verifier(h && h.seekers === 1, "la chasse a disparu a 300 jours : " + JSON.stringify(l));
  const n = await fbHuntSeekers(carole, CAROLE, BOISSON);
  note("a 300 jours : fbLoadNearbyHunts (fenetre 365 j, index.html:4643) annonce " + h.seekers
    + " chercheur ; fbHuntSeekers (fenetre 30 j, index.html:4612) en compte " + n
    + ". Deux ecrans, deux chiffres, la meme chasse.");
});

await doit("LE SEUL CHEMIN QUI FERME LA CHASSE reste le geste manuel de la fiche boisson (toggleWatch, index.html:14312)", async () => {
  await fbLeaveHunt(alice, ALICE, BOISSON);
  delete caches.carole;
  const l = await fbLoadNearbyHunts(carole, "carole", CAROLE, CAROLE_POS.lat, CAROLE_POS.lng, 50);
  verifier(!l.find((x) => String(x.drinkId) === String(BOISSON)), "encore visible apres fbLeaveHunt");
  note("or Alice n'a plus de raison d'ouvrir la fiche : sa veille a disparu de son telephone a l'etape 5. Le bouton qui fermerait la chasse n'est plus sur son chemin.");
});

await bilan(env);
