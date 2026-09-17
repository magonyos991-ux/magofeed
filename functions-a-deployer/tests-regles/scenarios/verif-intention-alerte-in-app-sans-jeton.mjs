/* ============================================================================
   VERIFICATION D'INTENTION — « sans jeton push, la personne n'est prevenue
   nulle part »
   ----------------------------------------------------------------------------
   La trouvaille examinee dit ceci : pushToUser (notifications-push.js:44) sort
   en silence quand il n'y a pas de jeton, aucune fonction serveur n'ecrit de
   userNotifs de type "found", donc Alice, qui suit une boisson sans avoir
   jamais active les notifications du telephone, ne l'apprend JAMAIS et « la
   boite in-app reste vide ».

   Ce scenario rejoue le parcours COMPLET, cote donnees puis cote app :
     1. Alice suit une boisson          -> window.fbSyncWatch        index.html:5007
     2. Alice n'a AUCUN jeton push      -> pushTokens vide           index.html:4700 (jamais appele)
     3. Bob la voit en rayon            -> window.fbAddDrinkToStore  index.html:3889
     4. Alice rouvre l'app              -> applyStores               index.html:2196
                                           puis checkWatches         index.html:15073
                                           via magasinProcheAvec     index.html:14805
   Le point que la trouvaille n'a pas teste : l'alerte in-app d'une boisson
   trouvee n'est PAS un document userNotifs. Elle est fabriquee par le client,
   a l'ouverture, en relisant le magasin — c'est ce que le code appelle « la
   veille locale » :
     index.html:5001 « La veille locale ne marche qu'app ouverte. Ici : jeton
                       FCM [...] Vide = push desactive, veille locale inchangee. »
     index.html:6819 « Le(s) demandeur(s), eux, sont prevenus par leur veille
                       (checkWatches a l'ouverture, + push telephone si la
                       Cloud Function est deployee) »
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, collection, serverTimestamp,
  arrayUnion, increment,
} from "firebase/firestore";

const ALICE = "alice", BOB = "bob";
const env = await banc("verif-intention-alerte-in-app-sans-jeton");
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

async function serveur(fn) {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
}

/* ── Le code de l'application, recopie ──────────────────────────────────── */

// index.html:5007 — fbSyncWatch (try/catch d'origine retire pour voir l'erreur)
let magoHuntRadius = 10;
async function fbSyncWatch(db, uid, add, drinkId, drinkName, lat, lng) {
  const wid = uid + "_" + drinkId;
  const radius = Number(magoHuntRadius) || 10;
  await setDoc(doc(db, "watches", wid), {
    uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
    lat: lat != null ? lat : null, lng: lng != null ? lng : null,
    radius: radius, createdAt: serverTimestamp()
  });
}

// index.html:3889 — fbAddDrinkToStore, a l'identique (pseudo lu dans localStorage)
async function fbAddDrinkToStore(db, storeId, drinkId, opts, pseudo) {
  const vu = !opts || opts.vu !== false;
  const updates = {};
  updates["drinks"] = arrayUnion(Number(drinkId) || drinkId);
  if (vu) {
    updates["confirmations." + drinkId] = increment(1);
    const heure = Math.floor(Date.now() / 3600000) * 3600000;
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = String(pseudo || "Explorateur").slice(0, 24);
    updates["confirmedAt." + drinkId] = heure;
  }
  // window.fbUpdateDoc === updateDoc (index.html:1351) : les chemins pointes
  // ("confirmations.4242") ne sont interpretes QUE par updateDoc.
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

// index.html:14805 — magasinProcheAvec, a l'identique
function magasinProcheAvec(STORES, did, userLat, userLng) {
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
    if (!best || (dist !== null && (best.dist === null || dist < best.dist))) best = { store: st, dist: dist };
  });
  return best;
}

// index.html:15073 — checkWatches, sa partie « alerte » (toast + pushActivity)
function checkWatches(STORES, drinkWatches, userLat, userLng, journalActivite) {
  let fired = false;
  drinkWatches.forEach(function (w) {
    if (w.triggered) return;
    const best = magasinProcheAvec(STORES, w.id, userLat, userLng);
    if (best) {
      w.triggered = true; w.storeId = best.store.id; w.storeName = best.store.name;
      w.dist = best.dist; w.triggeredAt = Date.now();
      w.by = (best.store.confirmedBy && best.store.confirmedBy[w.id]) || null;
      if (w.by === "Explorateur") w.by = null;
      w.verdict = null; w.reminders = 0;
      fired = true;
      journalActivite.push({
        type: "found",
        title: "« " + w.name + " » repérée près de toi",
        body: "Chez " + best.store.name + ". Appuie pour voir le magasin sur la carte.",
        action: { kind: "store", storeId: best.store.id, drinkId: w.id },
        key: "found:" + w.id + ":" + best.store.id
      });
    }
  });
  return fired;
}

/* notifications-push.js:38-63 — pushToUser : sans jeton, sortie muette. */
async function pushToUserServeur(db, uid) {
  const snap = await db.collection("pushTokens").doc(String(uid)).get();
  const token = snap.exists && snap.data().token;
  return { envoye: !!token };
}

/* ── Le terrain ─────────────────────────────────────────────────────────── */
const ALICE_LAT = 50.8466, ALICE_LNG = 4.3528;     // Bruxelles centre
const MAG_LAT = ALICE_LAT + 0.0063;                // ~700 m au nord
const BOISSON = 4242, BOISSON_NOM = "Fritz-Kola sans sucre";
const MAGASIN = "mag-nord";

await serveur(async (db) => {
  await db.collection("stores").doc(MAGASIN).set({
    name: "Night Shop du Nord", lat: MAG_LAT, lng: ALICE_LNG, drinks: [], confirmations: {}
  });
});

/* ══ 1. Alice suit la boisson, et n'active PAS les notifications ══════════ */
await doit("Alice suit « " + BOISSON_NOM + " » (fbSyncWatch, index.html:5007)", async () => {
  await fbSyncWatch(alice, ALICE, true, BOISSON, BOISSON_NOM, ALICE_LAT, ALICE_LNG);
});
await doit("Alice n'a aucun jeton push : pushToUser sortirait en silence", async () => {
  const p = await serveur((db) => pushToUserServeur(db, ALICE));
  if (p.envoye) throw new Error("un jeton existe — ce scenario ne teste plus rien");
});

/* ══ 2. Bob voit la boisson en rayon et la rattache ═══════════════════════ */
await doit("Bob signale « vu en rayon » (fbAddDrinkToStore vu:true, index.html:3889)", async () => {
  await fbAddDrinkToStore(bob, MAGASIN, BOISSON, { vu: true }, "Bob");
});

/* ══ 3. Alice rouvre l'app : lecture publique des magasins, puis veille ═══ */
let journal = [];
const mesVeilles = [{ id: BOISSON, name: BOISSON_NOM, triggered: false }];  // localStorage "magoWatch"
await doit("Alice sans jeton push est prevenue A L'OUVERTURE par sa veille locale (checkWatches, index.html:15073)", async () => {
  const snap = await getDocs(collection(alice, "stores"));
  const STORES = []; snap.forEach((d) => { const x = d.data(); x.id = d.id; STORES.push(x); });
  checkWatches(STORES, mesVeilles, ALICE_LAT, ALICE_LNG, journal);
  const found = journal.filter((a) => a.type === "found");
  if (!found.length) throw new Error("aucune alerte in-app : la veille locale n'a rien vu dans le magasin relu");
});
await doit("l'alerte in-app pointe sur la bonne fiche magasin (action kind:store)", async () => {
  const a = journal.find((x) => x.type === "found");
  if (!a || !a.action || a.action.kind !== "store" || String(a.action.storeId) !== MAGASIN)
    throw new Error("action inutilisable : " + JSON.stringify(a && a.action));
});
note("Alerte in-app produite sans aucun jeton push, sans aucun userNotifs : « "
  + (journal[0] && journal[0].title) + " · " + (journal[0] && journal[0].body) + " »");
note("Elle est fabriquee par le client a la relecture du magasin (index.html:2196 applyStores -> checkWatches), "
  + "et non par le serveur. Le champ qui la declenche est confirmations." + BOISSON + " > 0, ecrit par fbAddDrinkToStore.");

/* ══ 4. Et le rattachement « je sais ou », sans avoir vu ? ════════════════ */
const MAGASIN2 = "mag-sud";
await serveur(async (db) => {
  await db.collection("stores").doc(MAGASIN2).set({
    name: "Proxy du Sud", lat: ALICE_LAT - 0.0063, lng: ALICE_LNG, drinks: [], confirmations: {}
  });
});
await doit("Bob rattache la boisson SANS l'avoir vue (fbAddDrinkToStore vu:false)", async () => {
  await fbAddDrinkToStore(bob, MAGASIN2, 7777, { vu: false }, "Bob");
});
const veille2 = [{ id: 7777, name: "Boisson rayon probable", triggered: false }];
const journal2 = [];
await doit("un rattachement « rayon probable » ne declenche PAS d'alerte in-app (index.html:14793, VU PAS PROBABLE)", async () => {
  const snap = await getDocs(collection(alice, "stores"));
  const STORES = []; snap.forEach((d) => { const x = d.data(); x.id = d.id; STORES.push(x); });
  checkWatches(STORES, veille2, ALICE_LAT, ALICE_LNG, journal2);
  if (journal2.length) throw new Error("une alerte a ete produite sur un simple rayon probable");
});
note("Cote serveur, notifyStockToWatchers (notifications-push.js:314) se declenche sur le seul tableau drinks : "
  + "ce meme rattachement « rayon probable » enverrait le push « vient d'etre reperee », que la veille locale refuse d'annoncer. "
  + "Deux exigences differentes pour la meme phrase — observation chiffree, sans jugement.");

await bilan(env);
