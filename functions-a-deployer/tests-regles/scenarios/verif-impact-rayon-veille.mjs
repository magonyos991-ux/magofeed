/* ============================================================================
   VERIFICATION D'IMPACT — « Ta zone : 30 km », et personne ne previent Alice
   ----------------------------------------------------------------------------
   QUESTION UNIQUE : qu'est-ce que ca change pour quelqu'un ?

   Le decor est celui de deux personnes qui vivent au MEME endroit, a 18 km du
   magasin, et qui guettent la MEME boisson. La seule difference entre elles est
   le chiffre qu'elles ont pose sur le curseur « Ta zone » :
     - Alice a choisi 30 km  (« Tres large : la ville entiere et au-dela »)
     - Carole a choisi 20 km (« Large : toute la ville et sa peripherie »)
   Bob signale la boisson en rayon. Une seule des deux est prevenue.

   Fonctions rejouees a l'identique (numeros de ligne dans index.html) :
     _hrClamp / HR_MIN=1 / HR_MAX=50            14182-14185
     setHuntRadius (ce qu'il ECRIT)             14215-14239
     window.fbUpdatePushRayon                   4755-4761
     window.fbSyncWatch                         5007-5021
     window.fbAddDrinkToStore                   3889-3907
     magasinProcheAvec (l'alerte in-app)        14805-14819
   Cote serveur (l'emulateur n'execute pas les Cloud Functions : on rejoue leur
   decision avec l'Admin SDK, qui ignore les regles, exactement comme elles) :
     _dist                                      notifications-push.js:148-152
     notifyStockToWatchers (le filtre rayon)    notifications-push.js:314-360
     notifyHuntNearby (le filtre rayon)         notifications-push.js:266-288
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
  serverTimestamp, arrayUnion, increment,
} from "firebase/firestore";

const env = await banc("verif-impact-rayon-veille");

const ALICE = "alice", CAROLE = "carole", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const carole = env.authenticatedContext(CAROLE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

/* Le serveur parle par l'Admin SDK : il ignore les regles. */
const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── Le decor ───────────────────────────────────────────────────────────── */
const BOISSON = 7, NOM = "Mountain Dew Spark";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };
/* Alice et Carole habitent le meme village, 18 km au nord du magasin
   (0.16216 degre de latitude = 18.0 km avec le calcul du serveur). */
const CHEZ_ELLES = { lat: MAGASIN.lat + 0.16216, lng: MAGASIN.lng };

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

/* index.html:14182-14185 — HR_MIN=1, HR_MAX=50 */
const HR_MIN = 1, HR_MAX = 50;
function _hrClamp(km) { km = Math.round(Number(km)); if (!(km >= HR_MIN)) km = HR_MIN; if (km > HR_MAX) km = HR_MAX; return km; }

/* index.html:4755-4761 — window.fbUpdatePushRayon (appele par setHuntRadius:14233) */
async function fbUpdatePushRayon(db, uid, km) {
  const r = Math.max(1, Math.min(50, Math.round(Number(km) || 10)));
  await setDoc(doc(db, "pushTokens", uid), { rayon: r, updatedAt: serverTimestamp() }, { merge: true });
}

/* index.html:5007-5021 — window.fbSyncWatch. `rayon` tient lieu de
   window.magoHuntRadius (index.html:5014 : Number(window.magoHuntRadius) || 10). */
async function fbSyncWatch(db, uid, drinkId, drinkName, lat, lng, rayon) {
  const wid = uid + "_" + drinkId;
  const radius = Number(rayon) || 10;
  await setDoc(doc(db, "watches", wid), {
    uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
    lat: lat != null ? lat : null, lng: lng != null ? lng : null,
    radius: radius, createdAt: serverTimestamp(),
  });
  return radius;
}

/* index.html:3889-3907 — window.fbAddDrinkToStore (« Je l'ai vue en rayon ») */
async function fbAddDrinkToStore(db, storeId, drinkId) {
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  const updates = { drinks: arrayUnion(Number(drinkId) || drinkId) };
  updates["confirmations." + drinkId] = increment(1);
  updates["seenAt." + drinkId] = heure;
  updates["confirmedBy." + drinkId] = "Bob";
  updates["confirmedAt." + drinkId] = heure;
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:14805-14819 — magasinProcheAvec : la SEULE porte de secours si le
   push ne part pas. C'est elle qui allume l'alerte a la reouverture de l'app
   (checkWatches, index.html:15073). Le 10 000 m est en dur dans le fichier. */
function magasinProcheAvec(stores, did, userLat, userLng) {
  let best = null;
  (stores || []).forEach(function (st) {
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

/* ══ COPIES CONFORMES DU SERVEUR ═════════════════════════════════════════ */

/* notifications-push.js:148-152 */
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}

/* notifications-push.js:314-360 — notifyStockToWatchers, telle qu'elle est.
   Rendue : la liste des uid qui recoivent VRAIMENT « Trouvee pres de toi ». */
async function notifyStockToWatchers(db, storeId, avant, apres) {
  const bd = new Set(((avant && avant.drinks) || []).map(String));
  const added = ((apres && apres.drinks) || []).map(String).filter((x) => !bd.has(x));
  if (added.length > 3) return { envoyes: [], pourquoi: "plus de 3 boissons d'un coup (ligne 330)" };
  if (!added.length) return { envoyes: [], pourquoi: "le tableau `drinks` n'a pas bouge (ligne 332)" };
  const sLat = apres.lat, sLng = apres.lng;
  const envoyes = [], ignores = [];
  for (const drinkId of added) {
    const snap = await db.collection("watches").where("drinkId", "==", Number(drinkId) || drinkId).limit(200).get();
    for (const w of snap.docs) {
      const wd = w.data();
      if (!wd.uid || !String(w.id).startsWith(String(wd.uid) + "_")) continue;
      // notifications-push.js:346 — la ligne en cause, recopiee mot pour mot :
      const radius = (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
      const d = _dist(sLat, sLng, wd.lat, wd.lng);
      if (sLat != null && wd.lat != null && d > radius) {
        ignores.push({ uid: wd.uid, choisi: wd.radius, retenu: radius, km: Math.round(d * 10) / 10 });
        continue;
      }
      envoyes.push({ uid: wd.uid, choisi: wd.radius, retenu: radius, km: Math.round(d * 10) / 10 });
    }
  }
  return { envoyes: envoyes, ignores: ignores, pourquoi: "alerte diffusee", storeId: storeId };
}

/* notifications-push.js:266-288 — l'AUTRE moitie de la meme promesse :
   « Chasse pres de toi ». Meme personne, meme reglage, autre plafond. */
async function notifyHuntNearby_destinataires(db, centre, seekerUids) {
  const snap = await db.collection("pushTokens").limit(3000).get();
  const out = [];
  snap.forEach(function (d) {
    if (seekerUids.has(d.id)) return;
    const t = d.data();
    if (!t.token) return;
    const rayon = Math.max(1, Math.min(50, Number(t.rayon) || 15));   // ligne 283
    const km = _dist(centre.lat, centre.lng, t.lat, t.lng);
    if (centre && t.lat != null && km > rayon) return;
    out.push({ uid: d.id, rayon: rayon, km: Math.round(km * 10) / 10 });
  });
  return out;
}

/* ════════════════════════════════════════════════════════════════════════ */
/* 1. CE QUE FONT ALICE ET CAROLE, ECRAN PAR ECRAN                          */
/* ════════════════════════════════════════════════════════════════════════ */

let rAlice = 0, rCarole = 0;
await doit("Alice pose le curseur « Ta zone » sur 30 km et met une cloche sur la boisson (setHuntRadius:14215 -> fbSyncWatch:5007)", async () => {
  const km = _hrClamp(30);                       // 30 : dans les bornes du curseur (1 a 50)
  await fbUpdatePushRayon(alice, ALICE, km);     // setHuntRadius:14233
  await setDoc(doc(alice, "pushTokens", ALICE), { token: "tok-alice", lat: CHEZ_ELLES.lat, lng: CHEZ_ELLES.lng }, { merge: true });
  rAlice = await fbSyncWatch(alice, ALICE, BOISSON, NOM, CHEZ_ELLES.lat, CHEZ_ELLES.lng, km);
  verifier(rAlice === 30, "le curseur n'a pas ecrit 30 : " + rAlice);
});
note("Ce qu'Alice lit a cet instant — feuille « Ta zone » (index.html:14260) : « Tu ne seras prevenu que de ce qui se passe dans ce rayon : les chasses lancees autour de toi, ET TES PROPRES BOISSONS QUAND QUELQU'UN LES TROUVE. » puis le toast (index.html:14367) : « Alerte activee · zone de 30 km ».");

await doit("Carole, meme village, meme boisson, pose le curseur sur 20 km", async () => {
  const km = _hrClamp(20);
  await fbUpdatePushRayon(carole, CAROLE, km);
  await setDoc(doc(carole, "pushTokens", CAROLE), { token: "tok-carole", lat: CHEZ_ELLES.lat, lng: CHEZ_ELLES.lng }, { merge: true });
  rCarole = await fbSyncWatch(carole, CAROLE, BOISSON, NOM, CHEZ_ELLES.lat, CHEZ_ELLES.lng, km);
  verifier(rCarole === 20, "le curseur n'a pas ecrit 20 : " + rCarole);
});

await doit("les VRAIES regles acceptent la veille a 30 km (rien ne borne `radius`, firestore.rules:1018-1026)", async () => {
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  verifier(w.radius === 30, "le 30 n'a pas survecu a l'ecriture : " + JSON.stringify(w));
});
note("Le mensonge est donc durable : la base contient bien radius=30 pour Alice. Rien, ni dans l'app ni dans les regles, ne lui dira jamais que ce 30 ne sera pas honore.");

/* ════════════════════════════════════════════════════════════════════════ */
/* 2. BOB TROUVE LA BOISSON A 18 KM                                         */
/* ════════════════════════════════════════════════════════════════════════ */

await doit("le magasin existe, sans la boisson", async () => {
  await setDoc(doc(bob, "stores", MAGASIN.id), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng, drinks: [], confirmations: {},
  });
});

let resultat = null;
await doit("Bob la voit en rayon et la signale (index.html:3889) — le serveur diffuse « Trouvee pres de toi »", async () => {
  const avant = (await getDoc(doc(bob, "stores", MAGASIN.id))).data();
  await fbAddDrinkToStore(bob, MAGASIN.id, BOISSON);
  const apres = (await getDoc(doc(bob, "stores", MAGASIN.id))).data();
  resultat = await serveur((db) => notifyStockToWatchers(db, MAGASIN.id, avant, apres));
  verifier(resultat.envoyes.length + resultat.ignores.length === 2, "les deux veilles n'ont pas ete examinees : " + JSON.stringify(resultat));
});
note("Distance reelle entre le village et le magasin, avec le calcul du serveur : "
  + Math.round(_dist(CHEZ_ELLES.lat, CHEZ_ELLES.lng, MAGASIN.lat, MAGASIN.lng) * 10) / 10 + " km.");
note("Destinataires : " + JSON.stringify(resultat && resultat.envoyes) + " — ecartes : " + JSON.stringify(resultat && resultat.ignores));

await doit("Carole (20 km choisis) recoit « Trouvee pres de toi » et va acheter la boisson", async () => {
  verifier(resultat.envoyes.some((x) => x.uid === CAROLE), "Carole n'a rien recu alors qu'elle est dans SA zone");
});

await doit("Alice (30 km choisis) recoit la meme alerte, a la meme distance, pour la meme boisson", async () => {
  const a = [].concat(resultat.envoyes, resultat.ignores).find((x) => x.uid === ALICE);
  verifier(resultat.envoyes.some((x) => x.uid === ALICE),
    "Alice a choisi " + a.choisi + " km, notifications-push.js:346 n'en retient que " + a.retenu
    + " : a " + a.km + " km du magasin, son telephone reste muet alors que celui de Carole (20 km) sonne");
});

await doit("demander PLUS ne donne jamais MOINS (le curseur ne se retourne pas contre celle qui l'a bouge)", async () => {
  const retenu = (km) => ((typeof km === "number" && km >= 1 && km <= 20) ? km : 10);
  const table = [5, 10, 15, 20, 21, 30, 50].map((k) => k + " -> " + retenu(k));
  const casse = [21, 25, 30, 40, 50].filter((k) => retenu(k) < retenu(20));
  verifier(!casse.length,
    "choisir " + casse.join(", ") + " km alerte MOINS loin que choisir 20 km · table choisi->retenu : " + table.join(", "));
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 3. Y A-T-IL UNE PORTE DE SECOURS ? ALICE FINIT-ELLE PAR L'APPRENDRE ?    */
/* ════════════════════════════════════════════════════════════════════════ */

await doit("a defaut de push, Alice l'apprend en rouvrant l'app (checkWatches:15073 -> magasinProcheAvec:14805)", async () => {
  const st = (await getDoc(doc(alice, "stores", MAGASIN.id))).data();
  const best = magasinProcheAvec([Object.assign({ id: MAGASIN.id }, st)], BOISSON, CHEZ_ELLES.lat, CHEZ_ELLES.lng);
  verifier(best, "magasinProcheAvec borne a 10 000 m en dur (index.html:14818) : a 18 km, l'alerte in-app ne s'allume pas non plus");
});
note("Il n'existe donc aucune deuxieme chance : ni le push, ni l'ecran d'accueil ne diront a Alice que sa boisson a ete trouvee a 18 km.");

/* ════════════════════════════════════════════════════════════════════════ */
/* 4. LA MEME PERSONNE, LE MEME REGLAGE, L'AUTRE NOTIFICATION               */
/* ════════════════════════════════════════════════════════════════════════ */

await doit("« Chasse pres de toi » honore bien les 30 km d'Alice (notifications-push.js:283)", async () => {
  const dest = await serveur((db) => notifyHuntNearby_destinataires(db, MAGASIN, new Set([BOB])));
  verifier(dest.some((x) => x.uid === ALICE), "Alice n'est pas prevenue non plus des chasses : " + JSON.stringify(dest));
  note("Destinataires de « Chasse pres de toi » : " + JSON.stringify(dest));
});
note("Alice est donc derangee jusqu'a 30 km pour les chasses des autres (ligne 283), et jamais prevenue au-dela de 10 km pour SA boisson (ligne 346). Les deux moities de la meme phrase affichee a l'ecran ne suivent pas le meme chiffre.");

await bilan(env);
