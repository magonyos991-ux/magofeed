/* VERIFICATION INDEPENDANTE — « Ta zone » annonce jusqu'a 50 km, l'alerte
   « Trouvee pres de toi » n'en retient que 10 au-dela de 20.

   Tout ce qui suit est recopie a l'identique du depot. Les numeros de ligne
   sont cites pour qu'on puisse verifier chaque copie.                        */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

const env = await banc("verif-rayon-ta-zone");
const alice = env.authenticatedContext("alice").firestore();
const ALICE = "alice", BOISSON = 7, NOM = "Mountain Dew Spark";
const BXL = { lat: 50.8503, lng: 4.3517 };
function verifier(c, m) { if (!c) throw new Error(m); }

/* ══ COPIES CONFORMES DE L'APPLICATION ════════════════════════════════════ */

/* index.html:14182-14185 — le curseur « Ta zone » et sa borne. */
const HR_MIN = 1, HR_MAX = 50;
function _hrClamp(km) { km = Math.round(Number(km)); if (!(km >= HR_MIN)) km = HR_MIN; if (km > HR_MAX) km = HR_MAX; return km; }
/* index.html:14193-14198 — ce que le curseur DIT a la personne. */
function huntRadiusDesc(km) {
  if (km <= 2) return "Tout pres de toi — juste ton coin de rue.";
  if (km <= 5) return "Ton quartier et ceux d'a cote.";
  if (km <= 10) return "Une bonne partie de ta ville.";
  if (km <= 15) return "Large : toute la ville et sa peripherie.";
  if (km <= 30) return "Tres large : la ville entiere et au-dela.";
  return "Toute la region — tu verras des chasses ou tu n'iras peut-etre jamais.";
}

/* index.html:5007-5024 — window.fbSyncWatch. Le rayon part SANS BORNE :
   `var radius = Number(window.magoHuntRadius) || 10;` (ligne 5014).         */
async function fbSyncWatch(db, uid, drinkId, drinkName, lat, lng, magoHuntRadius) {
  const wid = uid + "_" + drinkId;
  const radius = Number(magoHuntRadius) || 10;          // index.html:5014, verbatim
  await setDoc(doc(db, "watches", wid), {
    uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
    lat: lat != null ? lat : null, lng: lng != null ? lng : null,
    radius: radius, createdAt: serverTimestamp(),
  });
}
/* index.html:4771-4772 — window.fbUpdatePushPosition : le MEME chiffre, borne
   a 50 celui-la, part dans pushTokens/{uid}.rayon.                          */
async function fbUpdatePushPosition(db, uid, lat, lng, magoHuntRadius) {
  const _r = Math.max(1, Math.min(50, Math.round(Number(magoHuntRadius) || 10)));
  await setDoc(doc(db, "pushTokens", uid), { lat: lat, lng: lng, rayon: _r, updatedAt: serverTimestamp() }, { merge: true });
}

/* ══ COPIES CONFORMES DU SERVEUR ══════════════════════════════════════════ */

/* notifications-push.js:148-152 — _dist */
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}
/* notifications-push.js:284 — « Chasse pres de toi » : 1 a 50, repli 15. */
function rayonChassePresDeToi(t) { return Math.max(1, Math.min(50, Number(t.rayon) || 15)); }
/* notifications-push.js:346 — « Trouvee pres de toi » : 1 a 20, repli 10. */
function rayonTrouveePresDeToi(wd) {
  return (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
}
/* notifications-push.js:347 — la consequence : on saute le destinataire. */
function alertePartVers(wd, sLat, sLng) {
  const radius = rayonTrouveePresDeToi(wd);
  if (sLat != null && wd.lat != null && _dist(sLat, sLng, wd.lat, wd.lng) > radius) return false;
  return true;
}

/* ══ LE PARCOURS ══════════════════════════════════════════════════════════ */

/* Alice pousse le curseur a 30 km : le curseur l'accepte (HR_MAX = 50). */
const CHOISI = _hrClamp(30);
await doit("le curseur « Ta zone » accepte 30 km (index.html:14182, HR_MAX=50)", async () => {
  verifier(CHOISI === 30, "le curseur a ramene le choix a " + CHOISI);
});
note("ce que l'ecran affiche alors (index.html:14197) : « " + huntRadiusDesc(CHOISI) + " »");
note("ce que le toast annonce (index.html:14367) : « Alerte activee · zone de " + CHOISI + " km »");

/* Les deux ecritures que fait l'app quand Alice regle son rayon. */
await doit("l'app ecrit le rayon d'Alice dans pushTokens (index.html:4771)", async () => {
  await fbUpdatePushPosition(alice, ALICE, BXL.lat, BXL.lng, CHOISI);
  const t = (await getDoc(doc(alice, "pushTokens", ALICE))).data();
  verifier(t.rayon === 30, "rayon ecrit : " + JSON.stringify(t));
});
await doit("l'app ecrit le MEME rayon dans la veille (index.html:5014)", async () => {
  await fbSyncWatch(alice, ALICE, BOISSON, NOM, BXL.lat, BXL.lng, CHOISI);
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  verifier(w.radius === 30, "rayon ecrit : " + JSON.stringify(w));
});

/* Les deux fonctions serveur relisent ces deux documents. */
await doit("« Chasse pres de toi » honore les 30 km d'Alice (notifications-push.js:284)", async () => {
  const t = (await getDoc(doc(alice, "pushTokens", ALICE))).data();
  const r = rayonChassePresDeToi(t);
  verifier(r === 30, "Alice a choisi 30 km, le serveur en retient " + r);
});
await doit("« Trouvee pres de toi » honore les 30 km d'Alice (notifications-push.js:346)", async () => {
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  const r = rayonTrouveePresDeToi(w);
  verifier(r === 30, "Alice a choisi 30 km, le serveur en retient " + r);
});

/* LA CONSEQUENCE CONCRETE : un magasin a 15 km d'Alice. */
const MAGASIN_15KM = { lat: BXL.lat + 15 / 111, lng: BXL.lng };
note("magasin temoin a " + _dist(BXL.lat, BXL.lng, MAGASIN_15KM.lat, MAGASIN_15KM.lng).toFixed(1) + " km d'Alice");
await doit("la boisson reperee a 15 km previent Alice, qui a demande 30 km", async () => {
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  verifier(alertePartVers(w, MAGASIN_15KM.lat, MAGASIN_15KM.lng),
    "aucune alerte : le serveur a retenu " + rayonTrouveePresDeToi(w) + " km au lieu de " + w.radius);
});

/* LE MEME PARCOURS AVEC 20 KM — pour voir si demander PLUS donne MOINS. */
const table = [];
for (const km of [1, 5, 10, 15, 20, 21, 25, 30, 50]) {
  await fbSyncWatch(alice, ALICE, BOISSON, NOM, BXL.lat, BXL.lng, km);
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  table.push(km + "->" + rayonTrouveePresDeToi(w) + (alertePartVers(w, MAGASIN_15KM.lat, MAGASIN_15KM.lng) ? "(prevenue)" : "(silence)"));
}
note("choix de la personne -> rayon retenu par notifications-push.js:346 : " + table.join("  "));
await doit("demander PLUS grand ne previent jamais MOINS loin", async () => {
  let precedent = 0;
  for (const km of [1, 5, 10, 15, 20, 21, 25, 30, 50]) {
    await fbSyncWatch(alice, ALICE, BOISSON, NOM, BXL.lat, BXL.lng, km);
    const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
    const r = rayonTrouveePresDeToi(w);
    verifier(r >= precedent, "en demandant " + km + " km on est prevenue a " + r + " km, moins loin qu'en demandant moins");
    precedent = r;
  }
});
await bilan(env);
