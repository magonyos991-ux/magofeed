/* ═══════════════════════════════════════════════════════════════════════════
   VERIFICATION INDEPENDANTE — « sans jeton push, la personne n'est prevenue
   NULLE PART (aucun repli in-app) ».

   La trouvaille a verifier s'appuie sur scenarios/notifications.mjs:301, qui
   cherche le repli in-app dans la collection Firestore `userNotifs`. Il n'y
   est pas — c'est exact. Mais ce n'est pas la que l'app le range.

   Le repli in-app d'une veille est CLIENT, pas serveur :
     checkWatches()        index.html:15073  (appelee a chaque chargement de
                                              magasins : applyStores, index.html:2196,
                                              au demarrage 27109, a l'accueil 6465)
       -> magasinProcheAvec index.html:14805  (« qui l'a VUE a moins de 10 km »)
       -> pushActivity      index.html:14467  (journal de la cloche, magoActivity)
          type "found" + action {kind:"store"} — exactement ce que lisent
          openActivity (14622) et fbNotifsReady (27238).

   Ici on ne reecrit rien : on LIT index.html sur le disque, on en EXTRAIT le
   texte exact de ces fonctions et on les EXECUTE, avec pour donnees le magasin
   tel que l'emulateur le rend APRES l'ecriture reelle de Bob (fbAddDrinkToStore,
   index.html:3889), passee par les VRAIES regles du depot.

   Alice n'a AUCUN document pushTokens : c'est l'etat par defaut de l'app.
   ═══════════════════════════════════════════════════════════════════════════ */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, getDoc, getDocs, collection, query, where, limit,
         serverTimestamp, arrayUnion, increment, updateDoc } from "firebase/firestore";
import fs from "node:fs";
import path from "node:path";

const env   = await banc("verif-repli-in-app-trouvee");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();

const ALICE = "alice", BOB = "bob";
const BOISSON = 4242, BOISSON_NOM = "Fritz-Kola sans sucre";
const ALICE_LAT = 50.8466, ALICE_LNG = 4.3528;              // Bruxelles centre
const MAG_PROCHE = { id: "mag-flagey", name: "Night Shop Flagey",
                     lat: ALICE_LAT - 0.019, lng: ALICE_LNG + 0.019 };  // ~2,5 km
const MAG_LOIN   = { id: "mag-nord", name: "Night Shop du Nord",
                     lat: ALICE_LAT + 0.135, lng: ALICE_LNG };          // ~15 km

async function serveur(fn) {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
}
function verifier(c, pourquoi) { if (!c) throw new Error(pourquoi); }

/* ── LE VRAI CODE DE L'APP, LU SUR LE DISQUE ────────────────────────────── */
const INDEX = fs.readFileSync(path.join(process.cwd(), "..", "..", "index.html"), "utf8");
function extraire(nom) {
  const marque = "\nfunction " + nom + "(";
  const debut = INDEX.indexOf(marque);
  if (debut < 0) throw new Error("fonction introuvable dans index.html : " + nom);
  let i = INDEX.indexOf("{", debut), prof = 0, guillemet = null;
  for (; i < INDEX.length; i++) {
    const c = INDEX[i];
    if (guillemet) {
      if (c === "\\") { i++; continue; }
      if (c === guillemet) guillemet = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { guillemet = c; continue; }
    if (c === "{") prof++;
    else if (c === "}") { prof--; if (prof === 0) break; }
  }
  return { src: INDEX.slice(debut + 1, i + 1), ligne: INDEX.slice(0, debut + 1).split("\n").length };
}
const F = {};
for (const n of ["checkWatches", "magasinProcheAvec", "pushActivity", "_saveActivity",
                 "_activitySeen", "activityUnread", "refreshBell", "fmtDist"]) F[n] = extraire(n);
note("Code execute tel quel depuis index.html : checkWatches ligne " + F.checkWatches.ligne
   + ", magasinProcheAvec ligne " + F.magasinProcheAvec.ligne
   + ", pushActivity ligne " + F.pushActivity.ligne + ".");

/* Un faux telephone : localStorage en memoire, pas de DOM, pas de son. */
function telephone(stores, watches, lat, lng) {
  const memoire = {};
  const ls = {
    getItem: (k) => (k in memoire ? memoire[k] : null),
    setItem: (k, v) => { memoire[k] = String(v); },
    removeItem: (k) => { delete memoire[k]; }
  };
  const toasts = [];
  const fabrique = new Function(
    "STORES", "userLat", "userLng", "drinkWatches", "localStorage", "window", "document",
    "toast", "playSound", "sanitize", "renderAlertsCard", "renderChasse",
    "_rappelsIndications", "renderStoreList", "exploreLoadStores",
    "var _activity = [];\n"
    + F.fmtDist.src + "\n"
    + "function saveWatches(){try{localStorage.setItem('magoWatch',JSON.stringify(drinkWatches));}catch(e){}}\n"
    + F._saveActivity.src + "\n" + F._activitySeen.src + "\n" + F.activityUnread.src + "\n"
    + F.refreshBell.src + "\n" + F.pushActivity.src + "\n"
    + F.magasinProcheAvec.src + "\n" + F.checkWatches.src + "\n"
    + "return { checkWatches: checkWatches, journal: function(){ return _activity; },"
    + " stockage: function(){ return localStorage.getItem('magoActivity'); },"
    + " nonLues: function(){ return activityUnread(); } };"
  );
  const app = fabrique(stores, lat, lng, watches, ls, {}, { getElementById: () => null },
    (t) => toasts.push(String(t)), () => {}, (s) => String(s),
    () => {}, () => {}, () => {}, () => {}, () => {});
  app.toasts = toasts;
  return app;
}

/* ── index.html:3889 — fbAddDrinkToStore, l'ecriture de Bob, a l'identique ── */
async function fbAddDrinkToStore(db, storeId, drinkId, pseudo) {
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  const updates = {};
  updates["drinks"] = arrayUnion(Number(drinkId) || drinkId);
  updates["confirmations." + drinkId] = increment(1);
  updates["seenAt." + drinkId] = heure;
  updates["confirmedBy." + drinkId] = String(pseudo || "Explorateur").slice(0, 24);
  updates["confirmedAt." + drinkId] = heure;
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}
/* index.html:5007 — fbSyncWatch */
async function fbSyncWatch(db, uid, drinkId, drinkName, lat, lng, rayon) {
  await setDoc(doc(db, "watches", uid + "_" + drinkId), {
    uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
    lat: lat, lng: lng, radius: Number(rayon) || 10, createdAt: serverTimestamp()
  });
}
/* index.html:5543 — fbLoadMyNotifs */
async function fbLoadMyNotifs(db, uid) {
  const snap = await getDocs(query(collection(db, "userNotifs"), where("to", "==", uid), limit(20)));
  const rows = []; snap.forEach((d) => { const x = d.data(); x.docId = d.id; rows.push(x); });
  return rows;
}
/* Ce que l'app garde d'un magasin (compactStore, index.html:2046) — champs lus
   par magasinProcheAvec. */
function versSTORES(id, d) {
  return { id: id, fbId: id, name: d.name, lat: d.lat, lng: d.lng,
           drinks: d.drinks || [], drinksVerified: d.drinksVerified || [],
           confirmations: d.confirmations || {}, confirmedBy: d.confirmedBy || {},
           seenAt: d.seenAt || {}, confirmedAt: d.confirmedAt || {} };
}

/* ── Le terrain ─────────────────────────────────────────────────────────── */
await serveur(async (db) => {
  for (const m of [MAG_PROCHE, MAG_LOIN]) {
    await db.collection("stores").doc(m.id).set({ name: m.name, lat: m.lat, lng: m.lng, drinks: [] });
  }
});

await doit("Alice suit « " + BOISSON_NOM + " » (fbSyncWatch, index.html:5007)", async () => {
  await fbSyncWatch(alice, ALICE, BOISSON, BOISSON_NOM, ALICE_LAT, ALICE_LNG, 10);
});
await doit("Alice n'a AUCUN jeton push — l'etat par defaut de l'app", async () => {
  const s = await serveur((db) => db.collection("pushTokens").doc(ALICE).get());
  verifier(!s.exists, "Alice a un jeton push : le scenario ne teste plus le cas par defaut");
});
await doit("Bob signale la boisson vue chez « " + MAG_PROCHE.name + " » (fbAddDrinkToStore, index.html:3889)", async () => {
  await fbAddDrinkToStore(bob, MAG_PROCHE.id, BOISSON, "Bob");
});

/* ── LE POINT EN LITIGE ─────────────────────────────────────────────────── */
let journal = null, tel = null;
await doit("la boite in-app d'Alice reste vide cote serveur (userNotifs) — le constat de la trouvaille", async () => {
  const rows = await fbLoadMyNotifs(alice, ALICE);
  verifier(!rows.filter((r) => r.type === "found").length,
    "un userNotifs de type found existe : le constat de la trouvaille tombe");
});
await doit("Alice, sans jeton push, VOIT « Trouvee » dans sa boite in-app (checkWatches, index.html:15073)", async () => {
  const snap = await serveur((db) => db.collection("stores").doc(MAG_PROCHE.id).get());
  const stores = [versSTORES(MAG_PROCHE.id, snap.data())];
  tel = telephone(stores,
    [{ id: BOISSON, name: BOISSON_NOM, emoji: "", lat: ALICE_LAT, lng: ALICE_LNG, created: Date.now(), triggered: false }],
    ALICE_LAT, ALICE_LNG);
  tel.checkWatches();
  journal = tel.journal();
  const f = journal.filter((a) => a.type === "found");
  verifier(f.length, "aucune entree « found » dans le journal de la cloche : le repli in-app n'existe vraiment pas");
  verifier(f[0].action && f[0].action.kind === "store" && String(f[0].action.storeId) === MAG_PROCHE.id,
    "l'entree n'ouvre pas la fiche du magasin : action = " + JSON.stringify(f[0].action));
});
await doit("cette entree survit a la fermeture de l'app (magoActivity, index.html:14457)", async () => {
  const brut = tel.stockage();
  verifier(brut && JSON.parse(brut).some((a) => a.type === "found"),
    "rien n'est ecrit dans magoActivity : la cloche serait vide a la reouverture");
});
note("Journal de la cloche apres checkWatches : " + JSON.stringify(journal));
note("Toast affiche sur le champ : " + JSON.stringify(tel.toasts));
note("Pastille de la cloche (activityUnread, index.html:14459) : " + tel.nonLues() + " non-lue(s).");

/* ── Les bornes de ce repli, mesurees ───────────────────────────────────── */
await doit("sans GPS (userLat absent), le repli in-app previent quand meme", async () => {
  const snap = await serveur((db) => db.collection("stores").doc(MAG_PROCHE.id).get());
  const t = telephone([versSTORES(MAG_PROCHE.id, snap.data())],
    [{ id: BOISSON, name: BOISSON_NOM, lat: null, lng: null, created: Date.now(), triggered: false }],
    undefined, undefined);
  t.checkWatches();
  verifier(t.journal().some((a) => a.type === "found"), "rien sans GPS");
});
let loin = null;
await doit("mesure : le meme signalement a 15 km", async () => {
  await serveur((db) => fbAddDrinkToStore(db, MAG_LOIN.id, BOISSON, "Bob"));
  const snap = await serveur((db) => db.collection("stores").doc(MAG_LOIN.id).get());
  const t = telephone([versSTORES(MAG_LOIN.id, snap.data())],
    [{ id: BOISSON, name: BOISSON_NOM, lat: ALICE_LAT, lng: ALICE_LNG, created: Date.now(), triggered: false }],
    ALICE_LAT, ALICE_LNG);
  t.checkWatches();
  loin = t.journal().filter((a) => a.type === "found").length;
});
note("Magasin a 15 km : " + loin + " alerte in-app. magasinProcheAvec (index.html:14805) coupe a "
   + "10 km en dur, quel que soit le rayon choisi dans la veille (1..20 km cote serveur, "
   + "notifications-push.js:346). Le repli in-app existe, sa portee est plus courte que celle du push.");
await doit("mesure : un signalement « de loin » (opts.vu === false) n'allume pas le repli in-app", async () => {
  await serveur(async (db) => {
    await db.collection("stores").doc("mag-sans-vu").set({ name: "Proxy Sans Vu", lat: MAG_PROCHE.lat, lng: MAG_PROCHE.lng, drinks: [] });
    await db.collection("stores").doc("mag-sans-vu").update({ drinks: arrayUnion(BOISSON) }); // index.html:3897 sans le bloc `vu`
  });
  const snap = await serveur((db) => db.collection("stores").doc("mag-sans-vu").get());
  const t = telephone([versSTORES("mag-sans-vu", snap.data())],
    [{ id: BOISSON, name: BOISSON_NOM, lat: ALICE_LAT, lng: ALICE_LNG, created: Date.now(), triggered: false }],
    ALICE_LAT, ALICE_LNG);
  t.checkWatches();
  verifier(!t.journal().some((a) => a.type === "found"),
    "le repli in-app annonce « trouvee » sur un rayon seulement PROBABLE");
});
note("Cote serveur, notifyStockToWatchers (notifications-push.js:314) se declenche sur le seul "
   + "ajout a `drinks` : le push part meme sans observation, la ou le repli in-app se tait. "
   + "Les deux canaux ne disent donc pas la meme chose — c'est une autre question que celle verifiee ici.");

await bilan(env);
