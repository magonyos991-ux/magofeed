/* ============================================================================
   VERIFICATION D'IMPACT — « Oui, je l'ai vue » sur une boisson DEJA listee
   ----------------------------------------------------------------------------
   QUESTION : qu'est-ce que ca change pour quelqu'un ?

   Le decor n'est pas invente, il est copie de la PRODUCTION. Sur 600 magasins
   lus le 16/09/2026 via l'API REST publique (collection stores) : 80 638 paires
   (magasin, boisson) listees dans le tableau `drinks`, dont 80 636 avec
   confirmations = 0, et ZERO paire confirmee absente de `drinks`. Dans la vraie
   base, la boisson que Bob s'apprete a confirmer est donc quasi toujours DEJA
   dans `drinks`.

   Fonctions rejouees a l'identique (index.html) :
     window.fbSyncWatch        5007-5024
     window.fbJoinHunt         4561-4600
     window.fbConfirmStock     2311-2336   (appelee par confirmWithPrice 6746-6778)
     window.fbAddReport        3316-3350
     window.fbAddDrinkToStore  3889-3906   (« Ou l'as-tu trouvee ? » 17496 / 9031)
     magasinProcheAvec         14805-14819 (la regle que checkWatches 15073 applique)
   Cote serveur (l'emulateur n'execute pas les Cloud Functions : on rejoue leur
   porte d'entree, ligne par ligne) :
     notifyStockToWatchers  notifications-push.js:314-334
     emailHuntFound         emails-brevo.js:276-293
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, addDoc, collection,
         serverTimestamp, arrayUnion, increment } from "firebase/firestore";

const env   = await banc("verif-impact-confirmation-sans-alerte");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const anon  = env.unauthenticatedContext().firestore();
const ALICE = "alice", BOB = "bob";

function verifier(c, m) { if (!c) throw new Error(m); }

/* ── LES ECRITURES DE L'APPLICATION, RECOPIEES ────────────────────────────── */

/* index.html:5007-5024 */
async function fbSyncWatch(db, uid, drinkId, drinkName, lat, lng, radius) {
  await setDoc(doc(db, "watches", uid + "_" + drinkId), {
    uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
    lat: lat != null ? lat : null, lng: lng != null ? lng : null,
    radius: Number(radius) || 10, createdAt: serverTimestamp()
  });
}

/* index.html:4561-4600 — premiere inscription : la chasse n'existe pas encore */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const _coarse = (v) => Math.round(v * 100) / 100;           // index.html:4532
  const moi = { lat: _coarse(lat), lng: _coarse(lng), at: Date.now() };
  await setDoc(doc(db, "hunts", String(drinkId)), {
    drinkId: Number(drinkId), seekers: { [uid]: moi },
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp()
  });
}

/* index.html:2311-2336 — window.fbConfirmStock, value = +1 (« Oui, je l'ai vue ») */
async function fbConfirmStock(db, storeId, drinkId, value) {
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  if (value > 0) {
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = "Bob";
    updates["confirmedAt." + drinkId] = heure;
  } else {
    updates["absentBy." + drinkId] = "Bob";
    updates["absentAt." + drinkId] = heure;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:3889-3906 — window.fbAddDrinkToStore. arrayUnion : si la boisson
   est DEJA dans `drinks`, le tableau ne bouge pas. */
async function fbAddDrinkToStore(db, storeId, drinkId, vu) {
  const updates = { drinks: arrayUnion(Number(drinkId) || drinkId) };
  if (vu !== false) {
    const heure = Math.floor(Date.now() / 3600000) * 3600000;
    updates["confirmations." + drinkId] = increment(1);
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = "Bob";
    updates["confirmedAt." + drinkId] = heure;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:3316-3350 */
async function fbAddReport(db, uid, storeId, drinkId, type, note_) {
  return addDoc(collection(db, "reports"), {
    storeId: storeId, drinkId: drinkId, type: type, by: uid, byPseudo: "Bob",
    createdAt: serverTimestamp(), storeName: "Delhaize Flagey", lat: 50.83, lng: 4.37,
    tz: "Europe/Brussels", note: note_
  });
}

/* ── LES DEUX PORTES D'ENTREE COTE SERVEUR ────────────────────────────────── */

/* notifications-push.js:317-334 — « Trouvee pres de toi » (poussee telephone) */
function notifyStockToWatchers(before, after) {
  const bd = new Set(((before && before.drinks) || []).map(String));
  const added = ((after && after.drinks) || []).map(String).filter((x) => !bd.has(x));
  if (added.length > 3) return { envoi: false, pourquoi: "plus de 3 boissons d'un coup (ligne 330)" };
  if (!added.length) return { envoi: false, pourquoi: "sortie ligne 332 : le tableau `drinks` n'a pas gagne d'identifiant" };
  return { envoi: true, pourquoi: "poussee « Trouvee pres de toi » envoyee" };
}

/* emails-brevo.js:280-293 — le mail « X a ete trouvee pres de chez toi ».
   MEME garde, MEME champ : les deux canaux tombent ensemble. */
function emailHuntFound(before, after) {
  const bd = new Set(((before && before.drinks) || []).map(String));
  const added = ((after && after.drinks) || []).map(String).filter((x) => !bd.has(x));
  if (added.length > 3) return { envoi: false, pourquoi: "plus de 3 boissons d'un coup (ligne 290)" };
  if (!added.length) return { envoi: false, pourquoi: "sortie ligne 292 : le tableau `drinks` n'a pas gagne d'identifiant" };
  return { envoi: true, pourquoi: "mail envoye" };
}

/* index.html:14805-14819 — ce que l'ecran d'Alice montre, LUI. */
function magasinProcheAvec(stores, did) {
  let best = null;
  (stores || []).forEach(function (st) {
    const vu = Number((st.confirmations || {})[did]) > 0 ||
               (st.drinksVerified || []).some((x) => Number(x) === Number(did));
    if (!vu) return;
    if (!best) best = st;
  });
  return best;
}

/* ════════════════════════════════════════════════════════════════════════════
   LE DECOR : un Delhaize tel que la production en contient des centaines.
   `drinks` porte le rayon PROBABLE de l'enseigne (index.html:14796 le dit
   explicitement), personne n'a encore rien confirme.
   ════════════════════════════════════════════════════════════════════════════ */
const BOISSON = 7, NOM = "Alpro Barista Almond", MAG = "st-delhaize-flagey";

await doit("le magasin est dans l'etat de la production : boisson LISTEE, 0 confirmation", async () => {
  await setDoc(doc(bob, "stores", MAG), {
    name: "Delhaize Flagey", lat: 50.8275, lng: 4.3725,
    drinks: [BOISSON, 12, 31], confirmations: {}
  });
  const s = (await getDoc(doc(anon, "stores", MAG))).data();
  verifier((s.drinks || []).map(String).includes(String(BOISSON)), "la boisson devrait etre listee");
  verifier(!Number((s.confirmations || {})[BOISSON]), "personne ne doit l'avoir confirmee");
});

await doit("Alice lance sa chasse : rien ne l'en empeche, la fiche ne dit PAS « en stock » (magasinProcheAvec, 14805)", async () => {
  const s = (await getDoc(doc(anon, "stores", MAG))).data();
  verifier(!magasinProcheAvec([s], BOISSON),
    "l'ecran d'Alice annoncerait deja le magasin : la chasse n'aurait pas lieu");
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", 50.8466, 4.3528);
  await fbSyncWatch(alice, ALICE, BOISSON, NOM, 50.8466, 4.3528, 10);
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  verifier(w.uid === ALICE && Number(w.drinkId) === BOISSON, "la veille d'Alice n'est pas ecrite");
});

/* ── LE GESTE DE BOB ─────────────────────────────────────────────────────────
   Bob est chez Delhaize Flagey. Il ouvre la fiche, la boisson y figure deja :
   le bouton qu'on lui propose est « Oui, je l'ai vue » -> confirmWithPrice
   (index.html:6746-6778), qui appelle fbConfirmStock(+1) et fbAddReport. */
let avantB, apresB;
await doit("Bob confirme le stock : la base enregistre bien son observation", async () => {
  avantB = (await getDoc(doc(anon, "stores", MAG))).data();
  await fbConfirmStock(bob, MAG, BOISSON, 1);
  await fbAddReport(bob, BOB, MAG, BOISSON, "stock", "fiche|120");
  apresB = (await getDoc(doc(anon, "stores", MAG))).data();
  verifier(Number((apresB.confirmations || {})[BOISSON]) === 1,
    "la confirmation n'est pas enregistree : " + JSON.stringify(apresB.confirmations));
  verifier(apresB.confirmedBy && apresB.confirmedBy[BOISSON] === "Bob", "confirmedBy manquant");
});

await doit("le telephone d'Alice sonne « Trouvee pres de toi » (notifications-push.js:332)", async () => {
  const r = notifyStockToWatchers(avantB, apresB);
  verifier(r.envoi, r.pourquoi + " — confirmations 0 -> 1, confirmedBy=Bob, seenAt pose, et Alice ne recoit rien");
});
await doit("a defaut de poussee, Alice recoit au moins le mail (emails-brevo.js:292)", async () => {
  const r = emailHuntFound(avantB, apresB);
  verifier(r.envoi, r.pourquoi + " — le mail est garde par le MEME champ `drinks` : les deux canaux tombent ensemble");
});

/* ── ET SI BOB PASSE PAR L'AUTRE CHEMIN ? ────────────────────────────────────
   Le chemin reconnu comme fonctionnel est « Ou l'as-tu trouvee ? »
   (fbAddDrinkToStore, index.html:17496 / 9031). Mais il ecrit `drinks` avec
   arrayUnion : sur un magasin qui liste DEJA la boisson — les 80 636 paires de
   la production — le tableau ne bouge pas davantage. */
let avantA, apresA;
await doit("Bob passe par « Je l'ai vue en rayon » (fbAddDrinkToStore) : sa confirmation est enregistree", async () => {
  await fbConfirmStock(bob, MAG, BOISSON, -1);            // on repart de 0
  avantA = (await getDoc(doc(anon, "stores", MAG))).data();
  verifier(Number((avantA.confirmations || {})[BOISSON]) === 0, "decor : " + JSON.stringify(avantA.confirmations));
  await fbAddDrinkToStore(bob, MAG, BOISSON, true);
  apresA = (await getDoc(doc(anon, "stores", MAG))).data();
  verifier(Number((apresA.confirmations || {})[BOISSON]) === 1, "la confirmation n'est pas enregistree");
});
await doit("ce chemin-la, lui, fait sonner le telephone d'Alice", async () => {
  const r = notifyStockToWatchers(avantA, apresA);
  verifier(r.envoi, r.pourquoi + " — arrayUnion(" + BOISSON + ") sur un tableau qui contient deja "
    + BOISSON + " ne change rien : meme le chemin « qui marche » est muet ici");
});

/* ── TEMOIN : le seul cas ou l'alerte part vraiment ─────────────────────────── */
await doit("TEMOIN — sur un magasin qui NE liste PAS la boisson, l'alerte part bien", async () => {
  await setDoc(doc(bob, "stores", "st-carrefour-ixelles"), {
    name: "Carrefour Ixelles", lat: 50.8300, lng: 4.3700, drinks: [12], confirmations: {}
  });
  const avant = (await getDoc(doc(anon, "stores", "st-carrefour-ixelles"))).data();
  await fbAddDrinkToStore(bob, "st-carrefour-ixelles", BOISSON, true);
  const apres = (await getDoc(doc(anon, "stores", "st-carrefour-ixelles"))).data();
  verifier(notifyStockToWatchers(avant, apres).envoi, "meme ce cas-la ne marche pas : le scenario est faux");
});

/* ── CE QU'ALICE FINIT PAR VOIR ──────────────────────────────────────────────
   L'application ne MENT pas : quand Alice rouvre l'app et que le magasin est
   dans sa zone chargee, checkWatches (15073) applique magasinProcheAvec et
   l'alerte in-app se declenche. Le mensonge serait de dire « confirmee » sans
   confirmation ; ici c'est l'inverse : une vraie confirmation reste muette. */
await doit("quand Alice ROUVRE l'app, l'alerte in-app se declenche (checkWatches 15073 -> magasinProcheAvec)", async () => {
  const s = (await getDoc(doc(anon, "stores", MAG))).data();
  verifier(!!magasinProcheAvec([s], BOISSON),
    "meme en rouvrant l'app, Alice ne verrait rien : la confirmation de Bob serait perdue pour tout le monde");
});

note("PRODUCTION (16/09/2026, 600 magasins lus par l'API REST publique) : 80 638 paires (magasin, boisson)"
   + " listees dans `drinks`, dont 80 636 a 0 confirmation — et 0 paire confirmee hors de `drinks`.");
note("Consequence chiffree : sur ces 80 636 paires, AUCUN geste de Bob (ni « Oui, je l'ai vue », ni"
   + " « Je l'ai vue en rayon ») ne peut faire gagner un identifiant a `drinks` — donc aucune poussee, aucun mail.");
note("Ce qu'Alice voit : rien sur son telephone. L'alerte n'arrive qu'a la prochaine ouverture de l'app,"
   + " et seulement si le magasin est dans la zone que son telephone a rechargee (STORES).");
note("Ce que Bob voit : « ✓ Stock confirme · +3 pts » (index.html:6776). Rien ne lui dit qu'Alice n'a pas ete prevenue.");

await bilan(env);
