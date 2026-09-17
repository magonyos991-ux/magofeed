/* ============================================================================
   PARCOURS « MAGASINS : CONFIRMER UN STOCK, CREER, RECLAMER, SIGNALER »
   ----------------------------------------------------------------------------
   Ce scenario REJOUE les ecritures exactes de l'application, recopiees depuis
   index.html — memes collections, memes champs, meme ordre, memes valeurs :

     index.html:2311   window.fbConfirmStock(storeId, drinkId, value)
     index.html:2343   window.fbSavePrice(storeId, drinkId, price)
     index.html:3124   window.fbBumpStoreStat(storeId, metrique, jour)
     index.html:3316   window.fbAddReport(storeId, drinkId, type, plus)
     index.html:3356   window.fbReportBadBarcode(code, drinkId, drinkName, realName)
     index.html:3455   window.fbDeleteStore(storeId)
     index.html:3839   window.fbCreateStore(store)
     index.html:3889   window.fbAddDrinkToStore(storeId, drinkId, opts)
     index.html:4013   window.fbMonCompteCommercant()   (appele par fbMesMagasins)
     index.html:4032   window.fbMesMagasins()
     index.html:4075   window.fbSubmitShopClaim(store, infos)
     index.html:5026   window.fbSaveStore(id, data)
     index.html:5362   window.fbGetStore(storeId)
     index.html:5408   window.fbCommunityAddDrinks(storeId, ids)

   Cote ecrans, les appelants rejoues ici :
     index.html:8472   saveNewStore()          — creation d'un magasin
     index.html:6541   report("stock")         — « Trouvee ici ! » depuis la fiche
     index.html:16791  sdSetStock(did, want)   — les boutons ✓ / ✕ de la fiche magasin
     index.html:15319  bannerReportStore(id)   — « ce magasin n'existe pas »
     index.html:17380  (formulaire commercant) — la demande de certification

   Les regles evaluees sont celles du depot, functions-a-deployer/firestore.rules :
     /stores/{id}                    lignes 846-872
     /shopClaims/{storeId}           lignes 917-960
     /reports/{id}                   lignes 985-1008
     /merchants/{uid}                lignes 1147-1152
     /stores/{storeId}/stats/{jour}  lignes 1283-1296

   Un ECHEC ci-dessous n'est pas un scenario casse : c'est une trouvaille.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, addDoc, collection,
  serverTimestamp, arrayUnion, increment, deleteField,
} from "firebase/firestore";

const env = await banc("magasins-et-stock");

const ALICE = "alice";      // la personne qui cree le magasin et confirme le stock
const BOB = "bob";          // un autre compte ordinaire
const CHEF = "chef";        // l'administrateur (document admins/chef)

const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const chef = env.authenticatedContext(CHEF).firestore();
const anon = env.unauthenticatedContext().firestore();
/* Un compte anonyme EST connecte au sens de request.auth : c'est exactement le
   compte que l'app fabrique toute seule au premier lancement (ensureAuthed). */
const fantome = env.authenticatedContext("fantome", {
  firebase: { sign_in_provider: "anonymous", identities: {} },
}).firestore();

/* Le serveur (Admin SDK / console) : il contourne les regles. C'est par la que
   l'administrateur est declare et que les comptes commercants sont poses. */
const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── LES ECRITURES DE L'APP, RECOPIEES ────────────────────────────────────── */

/* geohashForLocation vient de geofire-common. Sa valeur n'entre dans aucune
   regle : seule sa PRESENCE compte (elle est refusee au non-createur avec
   name/lat/lng, ligne 871). On pose donc une chaine de la meme forme. */
function geohashForLocation(lat, lng) {
  const c = "0123456789bcdefghjkmnpqrstuvwxyz";
  let n = Math.abs(Math.round((lat + 90) * 1000 + (lng + 180) * 7));
  let s = "";
  for (let i = 0; i < 9; i++) { s = c[n % 32] + s; n = Math.floor(n / 32); }
  return s;
}

/* index.html:3839 — fbCreateStore. Recopie champ pour champ. */
function fbCreateStore(db, uid, store) {
  return setDoc(doc(db, "stores", String(store.id)), {
    name: String(store.name).slice(0, 60),
    emoji: store.emoji || "",
    lat: Number(store.lat),
    lng: Number(store.lng),
    geohash: geohashForLocation(Number(store.lat), Number(store.lng)),
    drinks: [],
    confirmations: {},
    community: true,
    addedBy: uid,
    createdAt: serverTimestamp(),
  });
}

/* index.html:2311 — fbConfirmStock. `qui` sort de localStorage("magopseudo"),
   `quand` est arrondi a l'heure cote client. */
function fbConfirmStock(db, pseudo, storeId, drinkId, value) {
  const qui = String(pseudo || "Explorateur").slice(0, 24);
  const quand = Math.floor(Date.now() / 3600000) * 3600000;
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  if (value > 0) {
    updates["seenAt." + drinkId] = quand;
    updates["confirmedBy." + drinkId] = qui;
    updates["confirmedAt." + drinkId] = quand;
  } else {
    updates["absentBy." + drinkId] = qui;
    updates["absentAt." + drinkId] = quand;
  }
  return updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:3889 — fbAddDrinkToStore. opts.vu === false => rayon probable seul. */
function fbAddDrinkToStore(db, pseudo, storeId, drinkId, opts) {
  const vu = !opts || opts.vu !== false;
  const updates = { drinks: arrayUnion(Number(drinkId) || drinkId) };
  if (vu) {
    const heure = Math.floor(Date.now() / 3600000) * 3600000;
    updates["confirmations." + drinkId] = increment(1);
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = String(pseudo || "Explorateur").slice(0, 24);
    updates["confirmedAt." + drinkId] = heure;
  }
  return updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:2343 — fbSavePrice (le plafond 0,20-25 EUR vit cote client). */
function fbSavePrice(db, storeId, drinkId, price) {
  price = Number(price);
  if (!(price >= 0.20 && price <= 25)) return Promise.resolve("refuse par le client");
  price = Math.round(price * 100) / 100;
  const updates = {};
  updates["prices." + drinkId] = price;
  updates["priceHistory." + drinkId] = arrayUnion({ p: price, t: Date.now() });
  return updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:5408 — fbCommunityAddDrinks. */
function fbCommunityAddDrinks(db, pseudo, storeId, ids) {
  const nums = ids.map(Number).filter((n) => !isNaN(n));
  if (!nums.length) return Promise.resolve(0);
  const upd = { drinks: arrayUnion.apply(null, nums) };
  const seenNow = Math.floor(Date.now() / 3600000) * 3600000;
  const quiNow = String(pseudo || "Explorateur").slice(0, 24);
  nums.forEach((id) => {
    upd["confirmations." + id] = increment(1);
    upd["seenAt." + id] = seenNow;
    upd["confirmedBy." + id] = quiNow;
    upd["confirmedAt." + id] = seenNow;
  });
  return updateDoc(doc(db, "stores", String(storeId)), upd);
}

/* index.html:5026 — fbSaveStore. */
function fbSaveStore(db, id, data) {
  if (data && typeof data.lat === "number" && typeof data.lng === "number") {
    data = Object.assign({}, data, { geohash: geohashForLocation(data.lat, data.lng) });
  }
  return setDoc(doc(db, "stores", String(id)), data, { merge: true });
}

/* index.html:5362 — fbGetStore. */
async function fbGetStore(db, storeId) {
  const snap = await getDoc(doc(db, "stores", String(storeId)));
  return snap.exists() ? snap.data() : null;
}

/* index.html:3124 — fbBumpStoreStat. */
function fbBumpStoreStat(db, storeId, metrique, jour) {
  const champs = { jour: String(jour).slice(0, 10), updatedAt: serverTimestamp() };
  champs[metrique] = increment(1);
  return setDoc(doc(db, "stores", String(storeId), "stats", String(jour)), champs, { merge: true });
}

/* index.html:3316 — fbAddReport. `st` est le magasin trouve dans window.STORES :
   quand il y est, l'app ajoute storeName + lat/lng arrondis au centieme. */
function fbAddReport(db, uid, pseudo, storeId, drinkId, type, st, plus) {
  const extra = {};
  if (st) {
    if (st.name) extra.storeName = String(st.name).slice(0, 60);
    if (typeof st.lat === "number" && typeof st.lng === "number") {
      extra.lat = Math.round(st.lat * 100) / 100;
      extra.lng = Math.round(st.lng * 100) / 100;
    }
  }
  extra.tz = "Europe/Brussels";
  return addDoc(collection(db, "reports"), Object.assign({
    storeId: storeId,
    drinkId: drinkId,
    type: type,
    by: uid || null,
    byPseudo: String(pseudo || "Explorateur").slice(0, 24),
    createdAt: serverTimestamp(),
  }, extra, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
}

/* index.html:3356 — fbReportBadBarcode. */
function fbReportBadBarcode(db, uid, pseudo, code, drinkId, drinkName, realName) {
  const note_ = String(code).slice(0, 20) + " lie a tort a \"" + String(drinkName || "").slice(0, 80) +
    "\" — c'est en realite : " + String(realName || "(non precise)").slice(0, 120);
  return addDoc(collection(db, "reports"), {
    storeId: null,
    drinkId: drinkId != null ? drinkId : null,
    type: "codebarre",
    note: note_.slice(0, 300),
    by: uid || null,
    byPseudo: String(pseudo || "Explorateur").slice(0, 24),
    createdAt: serverTimestamp(),
  });
}

/* index.html:3455 — fbDeleteStore. */
function fbDeleteStore(db, storeId) {
  return deleteDoc(doc(db, "stores", String(storeId)));
}

/* index.html:4075 — fbSubmitShopClaim. */
function fbSubmitShopClaim(db, uid, pseudo, store, infos) {
  const sid = String(store.fbId || store.id);
  return setDoc(doc(db, "shopClaims", sid), {
    storeId: sid,
    storeName: String(store.name || "").slice(0, 80),
    by: uid,
    byPseudo: String(pseudo || "Explorateur").slice(0, 24),
    contact: String((infos && infos.contact) || "").slice(0, 80),
    role: String((infos && infos.role) || "").slice(0, 40),
    note: String((infos && infos.note) || "").slice(0, 300),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

/* index.html:4013 + 4032 — fbMonCompteCommercant / fbMesMagasins. */
async function fbMesMagasins(db, uid) {
  const snap = await getDoc(doc(db, "merchants", String(uid)));
  if (!snap.exists()) return [];
  const d = snap.data() || {};
  return Array.isArray(d.stores) ? d.stores.map(String) : [];
}

/* ── LE DECOR ─────────────────────────────────────────────────────────────── */
const NUIT = "u1758000000000";          // le magasin d'Alice (« Nuit & Jour », Bruxelles)
const OSM = "00ZU2qg6exuPjSKvXLw1";     // un magasin importe (identifiant auto, comme en production)
const SEOUL = "u1758000009999";         // un magasin a l'autre bout du monde
const COCA0 = 42;                       // une boisson du catalogue
const FUZE = 9001;
const JOUR = "2026-09-16";

await serveur(async (db) => {
  await setDoc(doc(db, "admins", CHEF), { role: "fondateur" });
  /* Un magasin importe : il n'a PAS de champ addedBy — c'est le cas de la
     quasi-totalite de la base (34 000 documents OSM). */
  await setDoc(doc(db, "stores", OSM), {
    name: "Delhaize Fransman", brand: "Delhaize", lat: 50.8788, lng: 4.3402,
    hours: "Mo-Sa 08:00-20:00", osmImport: true, drinks: [COCA0], confirmations: {},
  });
  await setDoc(doc(db, "stores", SEOUL), {
    name: "CU Gangnam", lat: 37.4979, lng: 127.0276, drinks: [], confirmations: {},
  });
});

/* ═══ 1. ALICE CONFIRME QU'UNE BOISSON EST EN RAYON ════════════════════════
   saveNewStore (index.html:8472) puis report("stock") (index.html:6541). */

await doit("1a. Alice cree son magasin (fbCreateStore, index.html:3839)", async () => {
  await fbCreateStore(alice, ALICE, {
    id: NUIT, name: "Nuit & Jour Flagey", emoji: "", type: "convenience",
    lat: 50.8275, lng: 4.3718, address: "Place Flagey 12, 1050 Ixelles",
  });
});

/* saveNewStore collecte un TYPE (index.html:8478) et une ADRESSE
   (index.html:8488-8491, commentaire « Enregistree pour toute la communaute »).
   fbCreateStore, lui, ne recopie que name/emoji/lat/lng/geohash. On regarde
   ce que le serveur a vraiment recu. */
await doit("1b. le magasin cree est relisible par un inconnu (fbGetStore, index.html:5362)", async () => {
  const st = await fbGetStore(anon, NUIT);
  verifier(st && st.name === "Nuit & Jour Flagey", "magasin introuvable");
});
{
  const st = await fbGetStore(anon, NUIT);
  note("1c. champs reellement enregistres par fbCreateStore : " +
       Object.keys(st).sort().join(", "));
  note("1d. address enregistree = " + JSON.stringify(st.address) +
       " ; type enregistre = " + JSON.stringify(st.type) +
       " — saveNewStore (index.html:8478 et 8488-8491) les avait pourtant saisis.");
}

await doit("1e. Alice confirme la boisson en rayon (fbConfirmStock +1, index.html:2311)", async () => {
  await fbConfirmStock(alice, "Alice", NUIT, COCA0, 1);
});
await doit("1f. le compteur monte : confirmations.42 == 1", async () => {
  const st = await fbGetStore(anon, NUIT);
  verifier(Number((st.confirmations || {})[COCA0]) === 1,
    "confirmations.42 = " + JSON.stringify((st.confirmations || {})[COCA0]));
});
await doit("1g. la pastille « vu par » est posee : confirmedBy.42 == Alice", async () => {
  const st = await fbGetStore(anon, NUIT);
  verifier((st.confirmedBy || {})[COCA0] === "Alice", "confirmedBy absent");
});
{
  const st = await fbGetStore(anon, NUIT);
  note("1h. apres fbConfirmStock, drinks = " + JSON.stringify(st.drinks) +
       " — fbConfirmStock (index.html:2311-2334) n'ecrit JAMAIS le tableau drinks, " +
       "alors que sdSetStock (index.html:16811) l'ajoute en memoire locale.");
}
await doit("1i. c'est fbAddDrinkToStore (index.html:3889) qui pose le rayon", async () => {
  await fbAddDrinkToStore(alice, "Alice", NUIT, FUZE, { vu: true });
  const st = await fbGetStore(anon, NUIT);
  verifier((st.drinks || []).map(Number).indexOf(FUZE) !== -1, "drinks ne contient pas 9001");
  verifier(Number((st.confirmations || {})[FUZE]) === 1, "confirmations.9001 != 1");
});
await doit("1j. « je sais qu'on en trouve ici » (opts.vu=false) pose le rayon SANS confirmer", async () => {
  await fbAddDrinkToStore(bob, "Bob", NUIT, 7777, { vu: false });
  const st = await fbGetStore(anon, NUIT);
  verifier((st.drinks || []).map(Number).indexOf(7777) !== -1, "drinks ne contient pas 7777");
  verifier((st.confirmations || {})[7777] === undefined, "une confirmation a ete posee a tort");
});
await doit("1k. un prix communautaire s'enregistre (fbSavePrice, index.html:2343)", async () => {
  await fbSavePrice(alice, NUIT, COCA0, 1.35);
  const st = await fbGetStore(anon, NUIT);
  verifier(st.prices && st.prices[COCA0] === 1.35, "prix non enregistre");
  verifier(st.priceHistory && st.priceHistory[COCA0].length === 1, "historique de prix absent");
});
await doit("1l. le remplissage en rafale ecrit tout d'un coup (fbCommunityAddDrinks, index.html:5408)", async () => {
  await fbCommunityAddDrinks(alice, "Alice", NUIT, [101, 102, 103]);
  const st = await fbGetStore(anon, NUIT);
  verifier((st.drinks || []).length >= 5, "drinks = " + JSON.stringify(st.drinks));
  verifier(Number((st.confirmations || {})[101]) === 1, "confirmations.101 != 1");
});
await doit("1m. les statistiques de la fiche s'incrementent (fbBumpStoreStat, index.html:3124)", async () => {
  await fbBumpStoreStat(alice, NUIT, "vues", JOUR);
});
await doitEchouer("1n. un visiteur NON connecte ne confirme rien", async () => {
  await fbConfirmStock(anon, "Pirate", NUIT, COCA0, 1);
});

/* ═══ 2. CENT FOIS LA MEME BOISSON, ET DEPUIS DEUX COMPTES ═════════════════
   Cote ecran il existe deux garde-fous : awardOnce("rep:…", 24) (index.html:6703)
   et le delai de 90 secondes de sdSetStock (index.html:16805). Les deux vivent
   dans localStorage. On regarde ce que le SERVEUR accepte. */

const PING = 5555;
await doit("2a. Alice confirme 100 fois la meme boisson dans le meme magasin", async () => {
  for (let i = 0; i < 100; i++) await fbConfirmStock(alice, "Alice", NUIT, PING, 1);
});
{
  const st = await fbGetStore(anon, NUIT);
  note("2b. apres 100 fbConfirmStock du SEUL compte d'Alice : confirmations.5555 = " +
       (st.confirmations || {})[PING] + " (aucun plafond dans firestore.rules:864-871)");
}
await doit("2c. Bob, deuxieme compte, ajoute les siennes", async () => {
  for (let i = 0; i < 20; i++) await fbConfirmStock(bob, "Bob", NUIT, PING, 1);
});
{
  const st = await fbGetStore(anon, NUIT);
  note("2d. deux comptes suffisent a porter confirmations.5555 a " +
       (st.confirmations || {})[PING] + " ; confirmedBy.5555 = " +
       JSON.stringify((st.confirmedBy || {})[PING]));
}
/* LE SENS INVERSE EST LE PLUS DANGEREUX : un compteur negatif fait afficher
   « ● Rupture » (index.html:16758) et sort le magasin des resultats et des
   notifications de veille (commentaire index.html:6555). */
await doit("2e. Bob seul enfonce de 40 crans une boisson REELLEMENT en stock", async () => {
  for (let i = 0; i < 40; i++) await fbConfirmStock(bob, "Saboteur", NUIT, COCA0, -1);
});
{
  const st = await fbGetStore(anon, NUIT);
  note("2f. confirmations.42 = " + (st.confirmations || {})[COCA0] +
       " ; absentBy.42 = " + JSON.stringify((st.absentBy || {})[COCA0]) +
       " — il faudra autant de confirmations honnetes pour repasser au-dessus de zero.");
}
await doit("2g. Bob signe la fausse observation du pseudo d'Alice", async () => {
  await fbConfirmStock(bob, "Alice", NUIT, 606, 1);
  const st = await fbGetStore(anon, NUIT);
  verifier((st.confirmedBy || {})[606] === "Alice", "confirmedBy != Alice");
});
note("2h. la fiche affichera « vu par Alice » (vuParTexte, index.html:6711) pour une " +
     "observation ecrite par le compte de Bob : aucune regle ne relie confirmedBy a request.auth.uid.");

/* ═══ 3. CONFIRMER A L'AUTRE BOUT DU MONDE ════════════════════════════════
   L'app se donne trois regimes (index.html:8957-8982) : < 500 m = VU,
   < 100 km = SU, au-dela = REFUSE. Ils vivent dans _regimeSignalement, cote
   navigateur. Le serveur, lui, ne sait pas ou est la personne. */

await doit("3a. depuis Bruxelles, Alice confirme un stock a Seoul (8 500 km) : accepte", async () => {
  await fbConfirmStock(alice, "Alice", SEOUL, COCA0, 1);
  await fbAddDrinkToStore(alice, "Alice", SEOUL, COCA0, { vu: true });
  const st = await fbGetStore(anon, SEOUL);
  verifier(Number((st.confirmations || {})[COCA0]) === 2, "confirmations = " +
    (st.confirmations || {})[COCA0]);
});
note("3b. le document de Seoul porte desormais « vu par Alice, aujourd'hui » — " +
     "firestore.rules:864-871 n'a aucune notion de position, et _regimeSignalement " +
     "(index.html:8968) est contournable : il suffit de ne pas passer par l'ecran.");

/* ═══ 4. LA COCHE VERTE « RAYON VERIFIE » ═════════════════════════════════
   drinksVerified / certified / certifiedAt / owner / partner : champsServeurStore()
   (firestore.rules:825). C'est la ligne que le fichier de regles designe lui-meme
   comme la plus importante. */

await doitEchouer("4a. Bob ne peut pas ecrire drinksVerified sur le magasin d'Alice", async () => {
  await updateDoc(doc(bob, "stores", NUIT), { drinksVerified: arrayUnion(COCA0) });
});
await doitEchouer("4b. Alice ne peut pas l'ecrire non plus sur SON PROPRE magasin", async () => {
  await updateDoc(doc(alice, "stores", NUIT), { drinksVerified: arrayUnion(COCA0) });
});
await doitEchouer("4c. ni le glisser dans un magasin neuf a la creation", async () => {
  await setDoc(doc(bob, "stores", "u1758000001111"), {
    name: "Faux Verifie", lat: 50.8, lng: 4.3, drinks: [COCA0], drinksVerified: [COCA0],
    confirmations: {}, community: true, addedBy: BOB, createdAt: serverTimestamp(),
  });
});
await doitEchouer("4d. Bob ne se certifie pas lui-meme (pastille bleue)", async () => {
  await setDoc(doc(bob, "stores", NUIT), { certified: true, certifiedAt: serverTimestamp() }, { merge: true });
});
await doitEchouer("4e. Bob ne se declare pas proprietaire (champ owner)", async () => {
  await updateDoc(doc(bob, "stores", NUIT), { owner: BOB });
});
await doitEchouer("4f. Bob ne s'achete pas une mise en avant (champ partner)", async () => {
  await updateDoc(doc(bob, "stores", NUIT), { partner: true });
});
await doitEchouer("4g. Bob n'invente pas une date de verification (verifiedSource)", async () => {
  await updateDoc(doc(bob, "stores", NUIT), { verifiedSource: "photos rayon (09/2026)" });
});
await doit("4h. l'administrateur, lui, pose la coche verte", async () => {
  await updateDoc(doc(chef, "stores", NUIT), {
    drinksVerified: arrayUnion(COCA0), certified: true, certifiedAt: serverTimestamp(),
  });
});

/* ═══ 5. EFFACER LE RAYON, LES CONFIRMATIONS, LES HORAIRES ════════════════
   `drinks`, `confirmations`, `prices`, `hours` ne figurent dans aucune liste
   protegee de firestore.rules:864-871 : la regle d'update ne verrouille que
   les champs serveur, addedBy/createdAt/community, verifiedSource, et
   name/brand/lat/lng/emoji/geohash (ceux-la reserves au createur). */

await doitEchouer("5a. Bob, qui n'a rien cree, ne devrait pas pouvoir vider le rayon et les confirmations du magasin d'Alice", async () => {
  await updateDoc(doc(bob, "stores", NUIT), { drinks: [], confirmations: {} });
});
{
  const st = await fbGetStore(anon, NUIT);
  note("5b. apres la tentative de Bob : drinks = " + JSON.stringify(st.drinks) +
       ", confirmations = " + JSON.stringify(st.confirmations));
}
await doitEchouer("5c. Bob ne devrait pas pouvoir effacer les horaires d'un magasin importe", async () => {
  await updateDoc(doc(bob, "stores", OSM), { hours: deleteField() });
});
await doitEchouer("5d. ni reecrire de faux horaires (fbSaveStore, index.html:5026)", async () => {
  await fbSaveStore(bob, OSM, { hours: "Mo-Su 00:00-00:01" });
});
{
  const st = await fbGetStore(anon, OSM);
  note("5e. horaires du Delhaize Fransman apres le passage de Bob : " + JSON.stringify(st.hours));
}
await doitEchouer("5f. Bob ne renomme pas le magasin d'Alice", async () => {
  await fbSaveStore(bob, NUIT, { name: "FERME DEFINITIVEMENT" });
});
await doitEchouer("5g. Bob ne deplace pas le magasin d'Alice", async () => {
  await fbSaveStore(bob, NUIT, { lat: 0, lng: 0 });
});
await doitEchouer("5h. Bob ne s'attribue pas la creation du magasin d'Alice (addedBy)", async () => {
  await updateDoc(doc(bob, "stores", NUIT), { addedBy: BOB });
});
await doitEchouer("5i. Bob ne renomme pas un magasin importe (aucun addedBy au document)", async () => {
  await fbSaveStore(bob, OSM, { name: "Ce magasin n'existe plus" });
});
await doitEchouer("5j. Bob ne supprime pas un magasin (fbDeleteStore, index.html:3455)", async () => {
  await fbDeleteStore(bob, NUIT);
});
await doitEchouer("5k. Alice ne supprime pas son propre magasin non plus", async () => {
  await fbDeleteStore(alice, NUIT);
});
await doit("5l. seul l'administrateur supprime", async () => {
  await serveur(async (db) => { await setDoc(doc(db, "stores", "u_a_jeter"), { name: "Doublon", lat: 50.8, lng: 4.3 }); });
  await fbDeleteStore(chef, "u_a_jeter");
});
await doit("5m. Alice, creatrice, peut corriger le nom de SON magasin", async () => {
  await fbSaveStore(alice, NUIT, { name: "Nuit & Jour Flagey (1050)" });
});

/* ═══ 6. RECLAMER UN MAGASIN ══════════════════════════════════════════════
   fbSubmitShopClaim (index.html:4075), regles firestore.rules:917-960. */

await doitEchouer("6a. un compte anonyme ne reclame pas (pasAnonyme, firestore.rules:913)", async () => {
  await fbSubmitShopClaim(fantome, "fantome", "Fantome", { id: NUIT, name: "Nuit & Jour" },
    { contact: "0470 00 00 00", role: "gerant", note: "" });
});
await doitEchouer("6b. on ne reclame pas un magasin qui n'existe pas", async () => {
  await fbSubmitShopClaim(alice, ALICE, "Alice", { id: "u_invente_9999", name: "Nulle part" },
    { contact: "0470 11 11 11", role: "gerant", note: "" });
});
await doit("6c. Alice depose sa demande sur le magasin qu'elle tient", async () => {
  await fbSubmitShopClaim(alice, ALICE, "Alice", { id: NUIT, name: "Nuit & Jour Flagey" },
    { contact: "Alice Dupont 0470 12 34 56", role: "gerante", note: "C'est ma boutique" });
});
await doitEchouer("6d. Bob ne recupere pas la demande d'Alice (le contact contient son telephone)", async () => {
  await getDoc(doc(bob, "shopClaims", NUIT));
});
await doitEchouer("6e. Bob n'ecrase pas la demande d'Alice pour se mettre a sa place", async () => {
  await fbSubmitShopClaim(bob, BOB, "Bob", { id: NUIT, name: "Nuit & Jour Flagey" },
    { contact: "Bob 0470 99 99 99", role: "gerant", note: "" });
});
await doitEchouer("6f. Bob ne supprime pas la demande d'Alice pour deposer la sienne", async () => {
  await deleteDoc(doc(bob, "shopClaims", NUIT));
});
await doitEchouer("6g. Alice ne s'approuve pas elle-meme", async () => {
  await updateDoc(doc(alice, "shopClaims", NUIT), { status: "approved" });
});
await doitEchouer("6h. Alice ne devient pas proprietaire du magasin (stores.owner)", async () => {
  await updateDoc(doc(alice, "stores", NUIT), { owner: ALICE });
});
await doitEchouer("6i. Alice ne s'ouvre pas un compte commercant (merchants/alice)", async () => {
  await setDoc(doc(alice, "merchants", ALICE), { stores: [NUIT], pass: "complet" });
});
await doit("6j. Alice relit SA demande et voit ou en est son dossier", async () => {
  const s = await getDoc(doc(alice, "shopClaims", NUIT));
  verifier(s.exists() && s.data().status === "pending", "statut inattendu");
});
await doit("6k. l'administrateur refuse la demande", async () => {
  await updateDoc(doc(chef, "shopClaims", NUIT), { status: "rejected", reason: "justificatif manquant" });
});
await doit("6l. Alice a le droit de redeposer apres un refus", async () => {
  await fbSubmitShopClaim(alice, ALICE, "Alice", { id: NUIT, name: "Nuit & Jour Flagey" },
    { contact: "Alice Dupont 0470 12 34 56", role: "gerante", note: "voici le bail" });
});
await doit("6m. l'administrateur approuve, puis ouvre le compte commercant", async () => {
  await updateDoc(doc(chef, "shopClaims", NUIT), { status: "approved" });
  await serveur(async (db) => {
    await setDoc(doc(db, "merchants", ALICE), { stores: [NUIT], pass: "complet", passOrigine: "admin" });
    await setDoc(doc(db, "stores", NUIT), { owner: ALICE }, { merge: true });
  });
});
await doit("6n. fbMesMagasins rend bien la boutique d'Alice (index.html:4032)", async () => {
  const l = await fbMesMagasins(alice, ALICE);
  verifier(l.length === 1 && l[0] === NUIT, "mes magasins = " + JSON.stringify(l));
});
await doitEchouer("6o. Bob ne lit pas le compte commercant d'Alice", async () => {
  await getDoc(doc(bob, "merchants", ALICE));
});
await doit("6p. Bob, lui, n'a aucun magasin (et pas d'erreur affichee)", async () => {
  const l = await fbMesMagasins(bob, BOB);
  verifier(l.length === 0, "Bob a des magasins ?");
});
/* Le re-depot d'une demande REFUSEE repointee vers une autre boutique :
   le garde-fou est `request.resource.data.storeId == storeId` (firestore.rules:955). */
await doit("6q. le decor du re-depot : une demande de Bob, refusee", async () => {
  await fbSubmitShopClaim(bob, BOB, "Bob", { id: OSM, name: "Delhaize Fransman" },
    { contact: "Bob 0470 99 99 99", role: "gerant", note: "" });
  await updateDoc(doc(chef, "shopClaims", OSM), { status: "rejected" });
});
await doitEchouer("6r. Bob ne repointe pas sa demande refusee vers la boutique d'Alice", async () => {
  await updateDoc(doc(bob, "shopClaims", OSM), { status: "pending", storeId: NUIT });
});
await doit("6s. Bob efface sa propre demande (son nom et son telephone y sont)", async () => {
  await deleteDoc(doc(bob, "shopClaims", OSM));
});

/* ═══ 7. CREER DES MAGASINS ═══════════════════════════════════════════════ */

await doitEchouer("7a. un magasin sans nom est refuse", async () => {
  await fbCreateStore(bob, BOB, { id: "u_sans_nom", name: "", lat: 50.8, lng: 4.3 });
});
await doitEchouer("7b. un magasin a la latitude 999 est refuse", async () => {
  await fbCreateStore(bob, BOB, { id: "u_lat_999", name: "Nulle part", lat: 999, lng: 4.3 });
});
await doitEchouer("7c. une longitude 4000 est refusee", async () => {
  await fbCreateStore(bob, BOB, { id: "u_lng_4000", name: "Nulle part", lat: 50.8, lng: 4000 });
});
await doitEchouer("7d. un nom de 10 000 caracteres est refuse", async () => {
  await setDoc(doc(bob, "stores", "u_nom_geant"), {
    name: "A".repeat(10000), emoji: "", lat: 50.8, lng: 4.3, geohash: "u151",
    drinks: [], confirmations: {}, community: true, addedBy: BOB, createdAt: serverTimestamp(),
  });
});
await doitEchouer("7e. une latitude en texte (\"cinquante\") est refusee", async () => {
  await setDoc(doc(bob, "stores", "u_lat_texte"), {
    name: "Nulle part", emoji: "", lat: "cinquante", lng: "quatre", geohash: "u151",
    drinks: [], confirmations: {}, community: true, addedBy: BOB, createdAt: serverTimestamp(),
  });
});
await doitEchouer("7f. on ne cree pas un magasin au nom de quelqu'un d'autre (addedBy)", async () => {
  await fbCreateStore(bob, ALICE, { id: "u_usurpe", name: "Chez Alice", lat: 50.8, lng: 4.3 });
});
await doitEchouer("7g. un visiteur non connecte ne cree pas de magasin", async () => {
  await fbCreateStore(anon, "personne", { id: "u_anon", name: "Chez personne", lat: 50.8, lng: 4.3 });
});
await doit("7h. un compte ANONYME, lui, cree un magasin (c'est le compte que l'app fabrique seule)", async () => {
  await fbCreateStore(fantome, "fantome", { id: "u_fantome_1", name: "Chez le fantome", lat: 50.8, lng: 4.3 });
});
await doitEchouer("7i. fbCreateStore ne peut pas ecraser le magasin d'un autre (meme identifiant)", async () => {
  await fbCreateStore(bob, BOB, { id: NUIT, name: "Chez Bob", lat: 50.8, lng: 4.3 });
});
await doit("7j. Bob cree 120 magasins d'affilee", async () => {
  const lots = [];
  for (let i = 0; i < 120; i++) {
    lots.push(fbCreateStore(bob, BOB, {
      id: "u_masse_" + i, name: "Magasin fantome " + i,
      lat: 50.8 + i / 10000, lng: 4.3 + i / 10000,
    }));
  }
  await Promise.all(lots);
});
{
  const snap = await getDocs(collection(chef, "stores"));
  let masse = 0;
  snap.forEach((d) => { if (String(d.id).indexOf("u_masse_") === 0) masse++; });
  note("7k. " + masse + " magasins crees par le seul compte de Bob, en une fois : " +
       "firestore.rules:857-871 ne compte ni ne limite les creations.");
}

/* ═══ 8. FAIRE SUPPRIMER LE MAGASIN D'UN CONCURRENT ═══════════════════════
   bannerReportStore (index.html:15319) : le joueur signale, l'administrateur
   decide. Le garde-fou de l'app, awardFree("badstore:"+id, 168), vit dans
   localStorage. */

let refBob = null;      // le signalement de Bob, pour verifier ce qu'il peut en refaire
await doit("8a. Bob signale « ce magasin n'existe pas » (fbAddReport, index.html:3316)", async () => {
  refBob = await fbAddReport(bob, BOB, "Bob", NUIT, 0, "badstore",
    { name: "Nuit & Jour Flagey", lat: 50.8275, lng: 4.3718 });
});
await doit("8b. Bob en depose 50 de plus, tous signes de son vrai compte", async () => {
  const lots = [];
  for (let i = 0; i < 50; i++) {
    lots.push(fbAddReport(bob, BOB, "Bob", NUIT, 0, "badstore",
      { name: "Nuit & Jour Flagey", lat: 50.8275, lng: 4.3718 }));
  }
  await Promise.all(lots);
});
{
  const snap = await getDocs(collection(chef, "reports"));
  let n = 0;
  snap.forEach((d) => { if ((d.data() || {}).type === "badstore") n++; });
  note("8c. " + n + " signalements « badstore » deposes par un seul compte : " +
       "firestore.rules:994-1006 ne compte pas les signalements par auteur.");
}
await doit("8d. le magasin vise n'a pas bouge : aucune suppression automatique", async () => {
  const st = await fbGetStore(anon, NUIT);
  verifier(st && st.name.indexOf("Nuit & Jour") === 0, "le magasin a disparu ou change de nom");
});
await doitEchouer("8e. Bob ne signe pas un signalement du nom d'Alice", async () => {
  await fbAddReport(bob, ALICE, "Alice", NUIT, COCA0, "rupture", null, { note: "vide" });
});
await doitEchouer("8f. Bob ne se declare pas deja paye (champ counted)", async () => {
  await addDoc(collection(bob, "reports"), {
    storeId: NUIT, drinkId: COCA0, type: "stock", by: BOB, byPseudo: "Bob",
    counted: true, credited: true, createdAt: serverTimestamp(),
  });
});
/* fbAddReport tronque la note a 300 caracteres AVANT d'ecrire (index.html:3345).
   On court-circuite donc le client pour voir ce que la regle, elle, accepte. */
await doitEchouer("8g. une note de 5 000 caracteres, ecrite sans passer par l'app, est refusee", async () => {
  await addDoc(collection(bob, "reports"), {
    storeId: NUIT, drinkId: COCA0, type: "stock", by: BOB, byPseudo: "Bob",
    note: "x".repeat(5000), createdAt: serverTimestamp(),
  });
});
await doit("8h. la note de 300 caracteres exactement, elle, passe (c'est le plafond du client)", async () => {
  await fbAddReport(bob, BOB, "Bob", NUIT, COCA0, "stock", null, { note: "x".repeat(300) });
});
await doitEchouer("8i. un type de signalement de 200 caracteres est refuse", async () => {
  await fbAddReport(bob, BOB, "Bob", NUIT, COCA0, "t".repeat(200), null, null);
});
await doit("8j. un code-barres mal attribue remonte (fbReportBadBarcode, index.html:3356)", async () => {
  await fbReportBadBarcode(bob, BOB, "Bob", "5449000000996", COCA0, "Coca-Cola Zero", "Coca-Cola Cherry");
});
let refAlice = null;
await doit("8k. Alice depose son propre signalement", async () => {
  refAlice = await fbAddReport(alice, ALICE, "Alice", NUIT, COCA0, "stock", null, null);
});
await doitEchouer("8l. Bob ne lit pas le signalement d'Alice", async () => {
  await getDoc(doc(bob, "reports", refAlice.id));
});
await doit("8m. Bob relit le sien (ce que le serveur lui a compte)", async () => {
  const s = await getDoc(doc(bob, "reports", refBob.id));
  verifier(s.exists() && s.data().type === "badstore", "signalement introuvable");
});
await doitEchouer("8n. Bob ne rejoue pas SON signalement pour se faire recrediter", async () => {
  await updateDoc(doc(bob, "reports", refBob.id), { counted: deleteField() });
});
await doitEchouer("8o. Bob n'efface pas son signalement pour le redeposer", async () => {
  await deleteDoc(doc(bob, "reports", refBob.id));
});

/* ═══ 9. LE TABLEAU DE BORD DU COMMERCANT ════════════════════════════════
   stores/{id}/stats/{jour} : firestore.rules:1283-1296. */

await doit("9a. Alice, commercante certifiee, lit ses statistiques", async () => {
  const snap = await getDocs(collection(alice, "stores", NUIT, "stats"));
  verifier(snap.size >= 1, "aucune statistique");
});
await doitEchouer("9b. Bob ne lit pas le tableau de bord d'Alice", async () => {
  await getDocs(collection(bob, "stores", NUIT, "stats"));
});
await doit("9c. Bob gonfle pourtant les chiffres qu'Alice regarde (100 vues inventees)", async () => {
  for (let i = 0; i < 100; i++) await fbBumpStoreStat(bob, NUIT, "vues", JOUR);
});
{
  const s = await getDoc(doc(chef, "stores", NUIT, "stats", JOUR));
  note("9d. vues du " + JOUR + " apres le passage de Bob : " + (s.data() || {}).vues +
       " — firestore.rules:1293 dit `allow create, update: if isSignedIn()`, " +
       "ce que le commentaire d'index.html:3119 assume (« gonflable par quelqu'un de determine »).");
}

await bilan(env);
