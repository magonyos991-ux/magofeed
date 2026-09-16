/* ═══════════════════════════════════════════════════════════════════════════
   VERIFICATION INDEPENDANTE — « Oui, je l'ai vue » sur un magasin qui liste
   deja la boisson n'alerte aucun chasseur.

   Difference avec scenarios/chasse-bout-en-bout.mjs : celui-la REDIGE une
   copie de la porte d'entree du declencheur. Ici on ne recopie rien. On LIT
   functions-a-deployer/notifications-push.js sur le disque, on en EXTRAIT le
   texte exact du bloc `exports.notifyStockToWatchers = onDocumentUpdated(...)`
   (lignes 314-361) et on l'EXECUTE, avec la vraie base de l'emulateur derriere
   `db.collection("watches")`. Si le declencheur envoyait quelque chose, le
   faux pushToUser le verrait.

   Chemin rejoue cote application :
     doConfirm(...,1)        index.html:6715-6726  -> bouton « Oui » (index.html:15994)
     confirmWithPrice        index.html:6746-6779
       -> fbSavePrice        index.html:2343-2362  (prices / priceHistory)
       -> fbAddReport        index.html:3341-3348  (collection reports)
       -> fbConfirmStock     index.html:2311-2336  (confirmations/seenAt/confirmedBy/confirmedAt)
     fbAddDrinkToStore       index.html:3889-3907  (le SEUL ecrivain de `drinks`)
   ═══════════════════════════════════════════════════════════════════════════ */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, limit,
         serverTimestamp, addDoc, arrayUnion, increment } from "firebase/firestore";
import fs from "node:fs";
import path from "node:path";

const env = await banc("verif-confirmation-sans-alerte");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();

const ALICE = "alice", BOB = "bob";
const BOISSON = 7, NOM = "Mountain Dew Spark";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8276, lng: 4.3719 };
const BXL = { lat: 50.8476, lng: 4.3572 };   // ~2,3 km du magasin

function verifier(c, pourquoi) { if (!c) throw new Error(pourquoi); }

/* ── LE VRAI CODE DU DECLENCHEUR, LU SUR LE DISQUE ───────────────────────── */
const SRC_PATH = path.join(process.cwd(), "..", "notifications-push.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");
const DEBUT = SRC.indexOf("exports.notifyStockToWatchers = onDocumentUpdated(");
const FIN = SRC.indexOf("\n);", DEBUT);
const BLOC = SRC.slice(DEBUT, FIN + 3);
const LIGNE_DEBUT = SRC.slice(0, DEBUT).split("\n").length;

/* _dist, tel quel, notifications-push.js:148-152 */
const D1 = SRC.indexOf("function _dist(");
const BLOC_DIST = SRC.slice(D1, SRC.indexOf("\n}", D1) + 2);

/* On fabrique le handler a partir du TEXTE du depot. onDocumentUpdated rend
   simplement la fonction qu'on lui passe ; db / pushToUser / APP_URL sont des
   doublures. Rien n'est reecrit. */
const pousseesEnvoyees = [];
function fabriquerDeclencheur(dbShim) {
  const exportsFaux = {};
  const fabrique = new Function(
    "onDocumentUpdated", "db", "pushToUser", "APP_URL", "REGION", "exports", "console",
    BLOC_DIST + "\n" + BLOC + "\nreturn exports.notifyStockToWatchers;"
  );
  return fabrique(
    (_opts, handler) => handler,
    dbShim,
    async (uid, titre, corps, data, lien) => { pousseesEnvoyees.push({ uid, titre, corps, data, lien }); },
    "https://magonyos991-ux.github.io/magofeed/",
    "europe-west1",
    exportsFaux,
    console
  );
}

/* Doublure minimale de l'Admin SDK, branchee sur la VRAIE base de l'emulateur. */
function dbAdmin(fdb) {
  return {
    collection(nom) {
      return {
        where(champ, op, val) {
          return {
            limit(n) {
              return {
                async get() {
                  const s = await getDocs(query(collection(fdb, nom), where(champ, op, val), limit(n)));
                  return { size: s.size, docs: s.docs.map((d) => ({ id: d.id, data: () => d.data() })) };
                },
              };
            },
          };
        },
      };
    },
  };
}

function evenement(avant, apres, storeId) {
  return {
    data: { before: { data: () => avant }, after: { data: () => apres } },
    params: { id: storeId },
  };
}

/* ── LES ECRITURES DE L'APPLICATION, RECOPIEES A L'IDENTIQUE ─────────────── */

/* index.html:2311-2336 — window.fbConfirmStock(storeId, drinkId, value) */
async function fbConfirmStock(db, storeId, drinkId, value) {
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  const qui = "Bobby";                                   // localStorage magopseudo
  const quand = Math.floor(Date.now() / 3600000) * 3600000;
  if (value > 0) {
    updates["seenAt." + drinkId] = quand;
    updates["confirmedBy." + drinkId] = qui;
    updates["confirmedAt." + drinkId] = quand;
  } else {
    updates["absentBy." + drinkId] = qui;
    updates["absentAt." + drinkId] = quand;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:2343-2362 — window.fbSavePrice(storeId, drinkId, price) */
async function fbSavePrice(db, storeId, drinkId, price) {
  price = Number(price);
  if (!(price >= 0.20 && price <= 25)) return;
  price = Math.round(price * 100) / 100;
  const updates = {};
  updates["prices." + drinkId] = price;
  updates["priceHistory." + drinkId] = arrayUnion({ p: price, t: Date.now() });
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:3341-3348 — window.fbAddReport(storeId, drinkId, type, plus) */
async function fbAddReport(db, uid, storeId, drinkId, type, plus) {
  return addDoc(collection(db, "reports"), Object.assign({
    storeId: storeId, drinkId: drinkId, type: type, by: uid || null,
    byPseudo: "Bobby", createdAt: serverTimestamp(),
    storeName: MAGASIN.name, lat: Math.round(MAGASIN.lat * 100) / 100, lng: Math.round(MAGASIN.lng * 100) / 100,
    tz: "Europe/Brussels",
  }, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
}

/* index.html:6746-6779 — confirmWithPrice(sid,did) : la TOTALITE de ce que ce
   geste ecrit dans Firestore, dans l'ordre du fichier. */
async function confirmWithPrice(db, uid, storeId, drinkId, prix) {
  if (prix >= 0.20 && prix <= 25) await fbSavePrice(db, storeId, drinkId, prix);   // ligne 6766
  await fbAddReport(db, uid, storeId, drinkId, "stock", { note: "fiche|120" });    // ligne 6769
  await fbConfirmStock(db, storeId, drinkId, 1);                                   // ligne 6773
}

/* index.html:3889-3907 — window.fbAddDrinkToStore(storeId, drinkId, opts) */
async function fbAddDrinkToStore(db, storeId, drinkId) {
  const updates = {};
  updates["drinks"] = arrayUnion(Number(drinkId) || drinkId);
  updates["confirmations." + drinkId] = increment(1);
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  updates["seenAt." + drinkId] = heure;
  updates["confirmedBy." + drinkId] = "Bobby";
  updates["confirmedAt." + drinkId] = heure;
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:5007-5025 — window.fbSyncWatch(add, drinkId, drinkName, lat, lng) */
async function fbSyncWatch(db, uid, drinkId, drinkName, lat, lng, rayon) {
  await setDoc(doc(db, "watches", uid + "_" + drinkId), {
    uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
    lat: lat, lng: lng, radius: Number(rayon) || 10, createdAt: serverTimestamp(),
  });
}

/* ═════════════════════════════════════════════════════════════════════════ */

note("code execute : notifications-push.js lignes " + LIGNE_DEBUT + "-"
  + (LIGNE_DEBUT + BLOC.split("\n").length - 1) + ", lu sur le disque, non recopie ("
  + BLOC.length + " caracteres).");

await doit("le declencheur reel ne lit AUCUN champ de confirmation (preuve textuelle)", async () => {
  const cherche = ["confirmations", "seenAt", "confirmedAt", "confirmedBy", "reports"];
  const trouves = cherche.filter((m) => BLOC.includes(m));
  verifier(trouves.length === 0,
    "le bloc mentionne " + JSON.stringify(trouves) + " : ma lecture du code est fausse");
  verifier(BLOC.includes("after.drinks"), "le bloc ne lit pas after.drinks : extraction ratee");
});

/* Decor : Alice chasse la boisson et pose sa veille ; le magasin LISTE deja la
   boisson mais personne ne l'a confirmee. C'est l'etat produit par le
   remplissage d'enseigne (remplir-enseignes.js:91, `drinks: arrayUnion(...)`
   sans confirmation) — l'etat exact que magasinProcheAvec (index.html:14805,
   `confirmations > 0`) refuse d'appeler « vue », ce qui laisse Alice chasser. */
await doit("le decor existe : Alice veille, le magasin liste la boisson a 0 confirmation", async () => {
  await fbSyncWatch(alice, ALICE, BOISSON, NOM, BXL.lat, BXL.lng, 10);
  await setDoc(doc(bob, "stores", MAGASIN.id), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng,
    drinks: [BOISSON], confirmations: {},
  });
  const s = (await getDoc(doc(bob, "stores", MAGASIN.id))).data();
  verifier((s.drinks || []).map(String).includes(String(BOISSON)), "la boisson n'est pas listee");
  verifier(!(Number((s.confirmations || {})[BOISSON]) > 0), "elle est deja confirmee : mauvais decor");
});

let avantB = null, apresB = null;
await doit("Bob fait « Oui » puis « OK » (confirmWithPrice) : la confirmation est bien ecrite", async () => {
  avantB = (await getDoc(doc(bob, "stores", MAGASIN.id))).data();
  await confirmWithPrice(bob, BOB, MAGASIN.id, BOISSON, 1.30);
  apresB = (await getDoc(doc(bob, "stores", MAGASIN.id))).data();
  verifier(Number((apresB.confirmations || {})[BOISSON]) === 1,
    "confirmations vaut " + JSON.stringify(apresB.confirmations));
  verifier(Number((apresB.prices || {})[BOISSON]) === 1.30, "le prix n'est pas enregistre");
  /* La collection reports n'est pas listable par un simple utilisateur
     (regles 988 : `by` exige) — on la relit donc comme le serveur. */
  await env.withSecurityRulesDisabled(async (ctx) => {
    const r = await getDocs(query(collection(ctx.firestore(), "reports"), where("storeId", "==", MAGASIN.id)));
    verifier(r.size === 1, "le signalement n'est pas parti : " + r.size);
  });
});

await doit("CAS B — apres « Oui, je l'ai vue », le vrai declencheur previent Alice", async () => {
  pousseesEnvoyees.length = 0;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const declencheur = fabriquerDeclencheur(dbAdmin(ctx.firestore()));
    await declencheur(evenement(avantB, apresB, MAGASIN.id));
  });
  verifier(pousseesEnvoyees.length > 0,
    "AUCUNE poussee. `drinks` avant = " + JSON.stringify(avantB.drinks)
    + ", apres = " + JSON.stringify(apresB.drinks)
    + " : identique, donc `added` est vide et la fonction sort ligne "
    + (LIGNE_DEBUT + 16) + " — alors que confirmations est passe de "
    + (Number((avantB.confirmations || {})[BOISSON]) || 0) + " a "
    + Number((apresB.confirmations || {})[BOISSON]));
});

/* Temoin : la veille d'Alice est bien joignable. Si CAS A passe, l'echec du
   CAS B ne peut pas venir du decor (veille absente, rayon, uid). */
let avantA = null, apresA = null;
await doit("TEMOIN, CAS A — Bob rattache la boisson (fbAddDrinkToStore) : le meme declencheur previent Alice", async () => {
  await setDoc(doc(bob, "stores", MAGASIN.id + "-2"), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng, drinks: [], confirmations: {},
  });
  avantA = (await getDoc(doc(bob, "stores", MAGASIN.id + "-2"))).data();
  await fbAddDrinkToStore(bob, MAGASIN.id + "-2", BOISSON);
  apresA = (await getDoc(doc(bob, "stores", MAGASIN.id + "-2"))).data();
  pousseesEnvoyees.length = 0;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const declencheur = fabriquerDeclencheur(dbAdmin(ctx.firestore()));
    await declencheur(evenement(avantA, apresA, MAGASIN.id + "-2"));
  });
  verifier(pousseesEnvoyees.length === 1, "le temoin ne part pas non plus : " + JSON.stringify(pousseesEnvoyees));
  verifier(pousseesEnvoyees[0].uid === ALICE, "la poussee ne vise pas Alice");
});
note("poussee du TEMOIN (CAS A) : " + JSON.stringify(pousseesEnvoyees[0] || null));

/* Et si Bob refait « Oui » sur le magasin du temoin, la boisson etant deja
   listee ? C'est exactement le geste du lendemain, sur une fiche que le
   rattachement d'hier a remplie. */
await doit("CAS B bis — le lendemain, Bob reconfirme la meme fiche : Alice est prevenue", async () => {
  const avant = (await getDoc(doc(bob, "stores", MAGASIN.id + "-2"))).data();
  await fbConfirmStock(bob, MAGASIN.id + "-2", BOISSON, 1);
  const apres = (await getDoc(doc(bob, "stores", MAGASIN.id + "-2"))).data();
  pousseesEnvoyees.length = 0;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const declencheur = fabriquerDeclencheur(dbAdmin(ctx.firestore()));
    await declencheur(evenement(avant, apres, MAGASIN.id + "-2"));
  });
  verifier(pousseesEnvoyees.length > 0,
    "AUCUNE poussee : confirmations " + Number((avant.confirmations || {})[BOISSON])
    + " -> " + Number((apres.confirmations || {})[BOISSON]) + ", `drinks` inchange");
});

note("emails-brevo.js:281-282 fait la meme lecture (`before.drinks` / `after.drinks`) : "
  + "le rappel par courriel se tait pour la meme raison.");

await bilan(env);
