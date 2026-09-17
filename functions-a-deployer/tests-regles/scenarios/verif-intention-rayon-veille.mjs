/* VERIFICATION D'INTENTION — le rayon « Ta zone » et la notification
   « on a trouve ta boisson ».

   Question unique : le clamp 1..20 de notifications-push.js:346 est-il un CHOIX
   assume, ou le reste d'une migration inachevee ?

   Ce que dit le depot, noir sur blanc :
     - index.html:14160-14181, commentaire « TA ZONE — UN SEUL REGLAGE » :
       « Il y avait TROIS perimetres qui ne se parlaient pas : [...] 1 a 20 km
       choisis par la personne, qui ne servaient qu'a "on a trouve ta boisson".
       MAINTENANT : un seul rayon, celui que TU choisis, et il decide des trois.
       [...] Jusqu'a 50 km. »
     - index.html:14182 : var HR_MIN=1,HR_MAX=50;
     - index.html:14261, la phrase montree a la personne : « Tu ne seras prevenu
       que de ce qui se passe dans ce rayon : les chasses lancees autour de toi,
       ET TES PROPRES BOISSONS QUAND QUELQU'UN LES TROUVE. C'est toi qui decides. »
     - notifications-push.js:284 : le perimetre "chasse" A ETE migre -> 1..50.
     - notifications-push.js:346 : le perimetre "boisson trouvee" ne l'a PAS ete,
       et son commentaire dit encore « curseur 1 -> 20 km ».

   On rejoue les deux decisions serveur sur LA MEME personne, avec LE MEME
   chiffre, pour voir si « un seul rayon decide des trois » est tenu. */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, getDoc, collection, query, where, getDocs,
         serverTimestamp } from "firebase/firestore";

const env = await banc("verif-intention-rayon-veille");
const alice = env.authenticatedContext("alice").firestore();
const ALICE = "alice";

/* ── Le client, recopie a l'identique ───────────────────────────────────── */

// index.html:14182 + _hrClamp : le curseur va de 1 a 50, pas au-dela.
const HR_MIN = 1, HR_MAX = 50;
function _hrClamp(km) { km = Math.round(Number(km)); if (!(km >= HR_MIN)) km = HR_MIN; if (km > HR_MAX) km = HR_MAX; return km; }

// index.html:5007 — window.fbSyncWatch, ses ecritures a l'identique.
async function fbSyncWatch(db, magoHuntRadius, drinkId, drinkName, lat, lng) {
  const wid = ALICE + "_" + drinkId;
  const radius = Number(magoHuntRadius) || 10;
  await setDoc(doc(db, "watches", wid), {
    uid: ALICE, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
    lat: lat != null ? lat : null, lng: lng != null ? lng : null,
    radius: radius,
    createdAt: serverTimestamp()
  });
}
// index.html:4755 — fbUpdatePushRayon ecrit le MEME chiffre dans pushTokens.rayon.
async function fbUpdatePushRayon(db, km, lat, lng) {
  await setDoc(doc(db, "pushTokens", ALICE),
    { token: "jeton-alice", rayon: _hrClamp(km), lat: lat, lng: lng }, { merge: true });
}

/* ── Le serveur, recopie a l'identique ──────────────────────────────────── */

// notifications-push.js:147-151
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}
// notifications-push.js:284 — perimetre « chasse pres de toi » (MIGRE).
function rayonChasse(t) { return Math.max(1, Math.min(50, Number(t.rayon) || 15)); }
// notifications-push.js:346 — perimetre « on a trouve ta boisson » (NON MIGRE).
// Ligne identique dans emails-brevo.js:313.
function rayonVeille(wd) { return (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10; }

// notifications-push.js:314-360 — la boucle de decision de notifyStockToWatchers.
async function notifyStockToWatchers(db, drinkId, sLat, sLng) {
  const prevenus = [];
  const snap = await getDocs(query(collection(db, "watches"), where("drinkId", "==", Number(drinkId))));
  snap.forEach((w) => {
    const wd = w.data();
    if (!wd.uid || !String(w.id).startsWith(String(wd.uid) + "_")) return;
    const radius = rayonVeille(wd);
    if (sLat != null && wd.lat != null && _dist(sLat, sLng, wd.lat, wd.lng) > radius) return;
    prevenus.push(wd.uid);
  });
  return prevenus;
}

/* ── Le terrain ─────────────────────────────────────────────────────────── */
const A_LAT = 50.8466, A_LNG = 4.3528;           // Alice, Bruxelles centre
const MAG_15KM = A_LAT + 0.135;                  // magasin a ~15 km au nord
const BOISSON = 4242, NOM = "Fritz-Kola sans sucre";

/* ── 1. Le curseur accepte bien 50, et le client ecrit bien 50 ──────────── */

await doit("le curseur « Ta zone » monte jusqu'a 50 km (index.html:14182/14267)", async () => {
  if (HR_MAX !== 50) throw new Error("HR_MAX = " + HR_MAX);
  if (_hrClamp(50) !== 50) throw new Error("le client rabote 50 en " + _hrClamp(50));
});

await doit("Alice regle 50 km : fbSyncWatch (index.html:5007) ecrit radius: 50", async () => {
  await fbSyncWatch(alice, 50, BOISSON, NOM, A_LAT, A_LNG);
  await fbUpdatePushRayon(alice, 50, A_LAT, A_LNG);
  const s = await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON));
  if (s.data().radius !== 50) throw new Error("radius ecrit = " + s.data().radius);
});

/* ── 2. Le meme chiffre, les deux decisions serveur ─────────────────────── */

await doit("le perimetre « chasse pres de toi » honore les 50 km (notifications-push.js:284)", async () => {
  const t = (await getDoc(doc(alice, "pushTokens", ALICE))).data();
  const r = rayonChasse(t);
  if (r !== 50) throw new Error("rayon applique = " + r + " km");
});

await doit("le perimetre « on a trouve ta boisson » honore aussi les 50 km (notifications-push.js:346)", async () => {
  const wd = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  const r = rayonVeille(wd);
  if (r !== 50) throw new Error("rayon choisi 50 km, rayon applique " + r + " km");
});

await doit("Alice, zone reglee sur 50 km, est prevenue d'une boisson reperee a 15 km", async () => {
  const d = _dist(MAG_15KM, A_LNG, A_LAT, A_LNG);
  const prevenus = await notifyStockToWatchers(alice, BOISSON, MAG_15KM, A_LNG);
  if (!prevenus.includes(ALICE))
    throw new Error("personne n'est prevenu — distance " + d.toFixed(1) + " km, rayon applique "
      + rayonVeille({ radius: 50 }) + " km alors qu'elle a choisi 50");
});

/* ── 3. La monotonie : choisir plus grand doit elargir, jamais retrecir ─── */

await doit("choisir plus grand n'a jamais pour effet de retrecir la zone", async () => {
  const anomalies = [];
  for (let km = HR_MIN; km <= HR_MAX; km++) {
    const applique = rayonVeille({ radius: km });
    if (applique < rayonVeille({ radius: km - 1 >= HR_MIN ? km - 1 : HR_MIN }))
      anomalies.push(km + " km -> " + applique + " km (alors que " + (km - 1) + " km -> " + rayonVeille({ radius: km - 1 }) + " km)");
  }
  if (anomalies.length) throw new Error(anomalies.join(" ; "));
});

/* ── 4. Mesures, sans jugement ──────────────────────────────────────────── */

const table = [1, 5, 10, 15, 20, 21, 25, 30, 40, 50]
  .map((k) => k + "->" + rayonVeille({ radius: k })).join(", ");
note("« On a trouve ta boisson » (notifications-push.js:346) — rayon choisi -> rayon applique : " + table + " km.");
note("« Chasse pres de toi » (notifications-push.js:284) — rayon choisi -> rayon applique : "
  + [1, 5, 10, 15, 20, 21, 25, 30, 40, 50].map((k) => k + "->" + rayonChasse({ rayon: k })).join(", ") + " km.");
note("Les deux perimetres lisent le MEME chiffre choisi par la personne. L'un a ete migre en 1..50, "
  + "l'autre non. emails-brevo.js:313 duplique la ligne non migree : le courriel se tait pareillement.");

let plusPetitQue20 = 0;
for (let km = 21; km <= HR_MAX; km++) if (rayonVeille({ radius: km }) < 20) plusPetitQue20++;
note("Sur les " + HR_MAX + " crans du curseur, " + plusPetitQue20 + " (de 21 a 50 km) donnent une zone "
  + "PLUS PETITE que le cran 20 km, parce que la ligne 346 ne rabote pas a 20 : elle retombe sur 10.");

note("Promesse faite a la personne, index.html:14261 : « Tu ne seras prevenu que de ce qui se passe "
  + "dans ce rayon : les chasses lancees autour de toi, et tes propres boissons quand quelqu'un les "
  + "trouve. C'est toi qui decides. » — la seconde moitie de la phrase passe par la ligne 346.");

await bilan(env);
