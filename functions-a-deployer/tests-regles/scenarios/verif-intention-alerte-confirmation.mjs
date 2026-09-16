/* ============================================================================
   VERIFICATION D'INTENTION — « Oui, je l'ai vue » sur un magasin qui liste
   deja la boisson : qui est prevenu, et par quel canal ?
   ----------------------------------------------------------------------------
   La trouvaille a verifier affirme que ce geste « n'alerte AUCUN chasseur ».
   Ce scenario rejoue les DEUX moities du parcours, pas seulement celle du
   serveur :

     COTE SERVEUR (l'emulateur n'execute pas les Cloud Functions : on rejoue
     leur porte d'entree, a l'identique)
       notifyStockToWatchers  functions-a-deployer/notifications-push.js:314-330
       emailHuntFound         functions-a-deployer/emails-brevo.js:276-292

     COTE APPLICATION (le canal que le depot documente comme le principal —
     notifications-push.js:8-16 « ce que l'app fait deja TOUTE SEULE », et
     index.html:6818-6821 « les demandeurs sont prevenus par leur veille,
     checkWatches a l'ouverture, + push telephone si la Cloud Function est
     deployee »)
       checkWatches           index.html:15073
       magasinProcheAvec      index.html:14805
       magasinConfirmePour    index.html:22768
       magasinALaBoisson      index.html:22743

     LES ECRITURES DE BOB, recopiees a l'identique
       confirmWithPrice       index.html:6746-6778
       window.fbConfirmStock  index.html:2311-2334
       window.fbAddReport     index.html:3316-3350
       window.fbAddDrinkToStore index.html:3889-3907
       window.fbSyncWatch     index.html:5007
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, addDoc, collection,
  serverTimestamp, arrayUnion, increment,
} from "firebase/firestore";

const env = await banc("verif-intention-alerte-confirmation");

const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── Le decor ────────────────────────────────────────────────────────────── */
const BXL = { lat: 50.8676, lng: 4.3436 };                 // Alice
const BOISSON = 7, NOM = "Mountain Dew Spark";
const AUTRE = 8, AUTRE_NOM = "Alpro Barista";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

/* index.html:2311-2334 — window.fbConfirmStock. Ce que « Oui, je l'ai vue »
   ecrit VRAIMENT : confirmations / seenAt / confirmedBy / confirmedAt.
   Le tableau `drinks` n'y figure pas. */
async function fbConfirmStock(db, storeId, drinkId, value) {
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  const qui = "Explorateur";
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

/* index.html:3316-3350 — window.fbAddReport */
async function fbAddReport(db, uid, storeId, drinkId, type, plus) {
  return addDoc(collection(db, "reports"), Object.assign({
    storeId: storeId, drinkId: drinkId, type: type, by: uid || null,
    byPseudo: "Explorateur", createdAt: serverTimestamp(),
    storeName: MAGASIN.name,
    lat: Math.round(MAGASIN.lat * 100) / 100, lng: Math.round(MAGASIN.lng * 100) / 100,
  }, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
}

/* index.html:3889-3907 — window.fbAddDrinkToStore (« Ou l'as-tu trouvee ? ») */
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

/* index.html:5007 — window.fbSyncWatch (identifiant = uid_boisson) */
async function fbSyncWatch(db, uid, drinkId, drinkName, lat, lng, radius) {
  await setDoc(doc(db, "watches", uid + "_" + drinkId), {
    uid: uid, drinkId: Number(drinkId) || drinkId,
    drinkName: String(drinkName || "").slice(0, 60),
    lat: lat, lng: lng, radius: radius, at: Date.now(),
  });
}

/* index.html:22743-22750 — magasinALaBoisson (sans le rayon probable d'enseigne,
   absent d'un document Firestore brut). */
function magasinALaBoisson(s, did) {
  if (!s || did == null) return false;
  return (s.drinks || []).some((d) => Number(d) === Number(did));
}

/* index.html:22768-22773 — magasinConfirmePour. « EN STOCK n'a qu'un sens » :
   rattache ET vu par quelqu'un. */
function magasinConfirmePour(s, did) {
  if (!s || did == null) return false;
  if (!magasinALaBoisson(s, did)) return false;
  const conf = Number((s.confirmations || {})[did] || 0);
  const verifie = (s.drinksVerified || []).some((v) => Number(v) === Number(did));
  return verifie || conf > 0;
}

/* index.html:14805-14819 — magasinProcheAvec. C'est CETTE fonction qui decide
   si Alice peut lancer une chasse (toggleWatch, index.html:14327-14332) ET si
   son alerte se declenche (checkWatches). Elle ne regarde PAS `drinks`. */
function magasinProcheAvec(stores, userLat, userLng, did) {
  let best = null;
  (stores || []).forEach(function (st) {
    const vu = Number((st.confirmations || {})[did]) > 0 ||
               (st.drinksVerified || []).some((x) => Number(x) === Number(did));
    if (!vu) return;
    let dist = null;
    if (typeof userLat === "number" && userLat && typeof st.lat === "number") {
      const dLa = (userLat - st.lat) * 111000;
      const dLo = (userLng - st.lng) * 111000 * Math.cos(st.lat * Math.PI / 180);
      dist = Math.sqrt(dLa * dLa + dLo * dLo);
    }
    if (dist !== null && dist > 10000) return;
    if (!best || (dist !== null && (best.dist === null || dist < best.dist))) best = { store: st, dist: dist };
  });
  return best;
}

/* index.html:15073-15100 — checkWatches, appele a CHAQUE chargement de
   magasins (applyStores, index.html:2196) et a chaque retour a l'accueil
   (index.html:6465). Rend ce qu'Alice voit a l'ecran. */
function checkWatches(veilles, stores, userLat, userLng) {
  const declenchees = [];
  veilles.forEach(function (w) {
    if (w.triggered) return;
    const best = magasinProcheAvec(stores, userLat, userLng, w.id);
    if (best) {
      w.triggered = true; w.storeId = best.store.id; w.storeName = best.store.name; w.dist = best.dist;
      w.by = (best.store.confirmedBy && best.store.confirmedBy[w.id]) || null;
      declenchees.push({
        toast: w.name + " signalee chez " + best.store.name +
               (best.dist != null ? " (" + Math.round(best.dist) + " m)" : "") + " !",
        activite: "« " + w.name + " » reperee pres de toi",
        par: w.by,
      });
    }
  });
  return declenchees;
}

/* ══ COPIES CONFORMES DU SERVEUR ═════════════════════════════════════════ */

/* notifications-push.js:317-330 — la porte d'entree du PUSH. */
function notifyStockToWatchers(before, after) {
  const bd = new Set(((before && before.drinks) || []).map(String));
  const added = ((after && after.drinks) || []).map(String).filter((x) => !bd.has(x));
  if (added.length > 3) return { envoi: false, pourquoi: "plus de 3 boissons d'un coup (ligne 328)" };
  if (!added.length) return { envoi: false, pourquoi: "le tableau `drinks` n'a pas bouge (ligne 330)" };
  return { envoi: true, ajoutees: added, pourquoi: "push « Trouvee pres de toi » envoye" };
}

/* emails-brevo.js:280-292 — la porte d'entree de l'E-MAIL. Meme code. */
function emailHuntFound(before, after) {
  const bd = new Set(((before && before.drinks) || []).map(String));
  const added = ((after && after.drinks) || []).map(String).filter((x) => !bd.has(x));
  if (added.length > 3) return { envoi: false, pourquoi: "plus de 3 boissons d'un coup (ligne 290)" };
  if (!added.length) return { envoi: false, pourquoi: "le tableau `drinks` n'a pas bouge (ligne 292)" };
  return { envoi: true, ajoutees: added, pourquoi: "e-mail « a ete confirmee en stock » envoye" };
}

/* ════════════════════════════════════════════════════════════════════════ */
/* 1. LE DECOR : une boisson LISTEE, que personne n'a jamais vue            */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("le magasin liste deja la boisson (remplir-enseignes.js:91, Admin SDK) sans aucune confirmation", async () => {
  await serveur((db) => setDoc(doc(db, "stores", MAGASIN.id), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng,
    drinks: [BOISSON], confirmations: {},
  }));
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  verifier(magasinALaBoisson(s, BOISSON), "la boisson devrait etre rattachee");
  verifier(!magasinConfirmePour(s, BOISSON),
    "index.html:22768 — une boisson rattachee sans confirmation n'est PAS du stock");
});

await doit("Alice peut donc lancer sa chasse : magasinProcheAvec (index.html:14805) ne trouve rien", async () => {
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  const best = magasinProcheAvec([Object.assign({ id: MAGASIN.id }, s)], BXL.lat, BXL.lng, BOISSON);
  verifier(best === null, "toggleWatch (index.html:14327) aurait affiche « elle est deja la » : " + JSON.stringify(best));
});

await doit("Alice inscrit sa veille (fbSyncWatch, index.html:5007)", async () => {
  await fbSyncWatch(alice, ALICE, BOISSON, NOM, BXL.lat, BXL.lng, 20);
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  verifier(w && w.uid === ALICE, "la veille n'a pas ete ecrite");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 2. LE GESTE DE BOB : « Oui, je l'ai vue » (confirmWithPrice, 6746)       */
/* ════════════════════════════════════════════════════════════════════════ */
let avant = null, apres = null;
await doit("Bob confirme le stock — ecritures reelles de confirmWithPrice (index.html:6746-6778)", async () => {
  avant = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "fiche|120" });   // index.html:6771
  await fbConfirmStock(bob, MAGASIN.id, BOISSON, 1);                                   // index.html:6775
  apres = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  verifier(Number((apres.confirmations || {})[BOISSON]) === 1,
    "la confirmation n'a pas ete enregistree : " + JSON.stringify(apres.confirmations));
});

note("mesure : confirmations " + Number((avant.confirmations || {})[BOISSON] || 0) + " -> "
  + Number((apres.confirmations || {})[BOISSON] || 0)
  + " · drinks [" + (avant.drinks || []).join(",") + "] -> [" + (apres.drinks || []).join(",") + "] (inchange)");

await doit("CONSTAT 1 — le PUSH ne part pas (notifications-push.js:330 : `drinks` n'a pas bouge)", async () => {
  const r = notifyStockToWatchers(avant, apres);
  verifier(r.envoi === false, "attendu : silence ; obtenu : " + r.pourquoi);
});

await doit("CONSTAT 2 — l'E-MAIL ne part pas non plus (emails-brevo.js:292 : meme porte)", async () => {
  const r = emailHuntFound(avant, apres);
  verifier(r.envoi === false, "attendu : silence ; obtenu : " + r.pourquoi);
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 3. LA MOITIE QUE LA TROUVAILLE N'A PAS REJOUEE : l'alerte IN-APP         */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("CONSTAT 3 — Alice EST prevenue dans l'app : checkWatches (index.html:15073) declenche son alerte", async () => {
  const s = Object.assign({ id: MAGASIN.id }, (await getDoc(doc(anon, "stores", MAGASIN.id))).data());
  const veilles = [{ id: BOISSON, name: NOM, triggered: false }];
  const feu = checkWatches(veilles, [s], BXL.lat, BXL.lng);
  verifier(feu.length === 1,
    "aucune alerte in-app alors que confirmations vaut "
    + Number((s.confirmations || {})[BOISSON] || 0));
  note("    ce qu'Alice voit : toast « " + feu[0].toast + " » + journal « " + feu[0].activite
    + " » (par " + (feu[0].par || "?") + ")");
});

note("index.html:6818-6821 (maybeRewardHuntHelp) dit le partage des roles : « Le(s) demandeur(s) "
  + "sont prevenus par leur veille (checkWatches a l'ouverture, + push telephone si la Cloud "
  + "Function est deployee) ». notifications-push.js:45 : « pas de token = pas de push, tant pis, "
  + "l'in-app suffit ». Le canal in-app est donc le canal documente comme principal.");

/* ════════════════════════════════════════════════════════════════════════ */
/* 4. LE MIROIR : le serveur alerte sur le signal que le client refuse      */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("CONSTAT 4 — un simple rattachement SANS confirmation declenche le push « Trouvee pres de toi »", async () => {
  const a = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  await serveur((db) => updateDoc(doc(db, "stores", MAGASIN.id), { drinks: arrayUnion(AUTRE) }));
  const b = Object.assign({ id: MAGASIN.id }, (await getDoc(doc(anon, "stores", MAGASIN.id))).data());
  const r = notifyStockToWatchers(a, b);
  const e = emailHuntFound(a, b);
  verifier(r.envoi === true && e.envoi === true, "le push/e-mail ne part pas : " + r.pourquoi);
  verifier(magasinConfirmePour(b, AUTRE) === false,
    "le decor n'est pas bon : la boisson ne devrait avoir aucune confirmation");
  note("    « " + AUTRE_NOM + " » : confirmations = "
    + Number((b.confirmations || {})[AUTRE] || 0)
    + " · magasinConfirmePour (index.html:22768) = false · push = PARTI"
    + " · texte e-mail (emails-brevo.js:333) = « a ete confirmee en stock par un membre de la communaute »");
});

await doit("CONTROLE — le chemin qui marche des deux cotes : fbAddDrinkToStore avec vu=true (index.html:3889)", async () => {
  const a = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  await fbAddDrinkToStore(bob, MAGASIN.id, 9, true);
  const b = Object.assign({ id: MAGASIN.id }, (await getDoc(doc(anon, "stores", MAGASIN.id))).data());
  const r = notifyStockToWatchers(a, b);
  verifier(r.envoi === true, r.pourquoi);
  verifier(magasinConfirmePour(b, 9) === true, "le rattachement « vu » devrait valoir stock");
});

note("BILAN DES CANAUX pour « Oui, je l'ai vue » sur une boisson deja listee : "
  + "in-app = OUI (checkWatches), push = NON (drinks inchange), e-mail = NON. "
  + "Et symetriquement, pour un rattachement sans confirmation : in-app = NON "
  + "(magasinProcheAvec exige confirmations > 0), push = OUI, e-mail = OUI.");

await bilan(env);
