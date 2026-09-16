/* ============================================================================
   VERIFICATION D'IMPACT — « Ta zone : 50 km » rend la zone DEUX FOIS PLUS
   PETITE que « Ta zone : 20 km »
   ----------------------------------------------------------------------------
   QUESTION UNIQUE : qu'est-ce que ca change pour quelqu'un ?

   Deux personnes habitent le MEME immeuble et guettent la MEME boisson. La
   seule difference entre elles est le chiffre qu'elles ont pose sur le curseur
   « Ta zone » (index.html:757, min=1 max=50) :
     - Alice a pousse le curseur a fond : 50 km
       (« Toute la region — tu verras des chasses ou tu n'iras peut-etre jamais »)
     - Carole s'est arretee a 20 km
       (« Tres large : la ville entiere et au-dela »)
   Bob signale la boisson dans un magasin a 15 km d'elles deux.
   Une seule des deux est prevenue — et ce n'est pas celle qui a demande le plus.

   Fonctions rejouees a l'identique (numeros de ligne dans index.html) :
     curseur « Ta zone »                  757-760   (min="1" max="50")
     HR_MIN=1 / HR_MAX=50 / _hrClamp      14182-14185
     setHuntRadius (ce qu'il ECRIT)       14214-14239
     window.fbSyncWatch                   5006-5023
     window.fbUpdatePushRayon             4755-4761
     window.fbAddDrinkToStore             3889-3907
   Cote serveur (l'emulateur n'execute pas les Cloud Functions : on rejoue leur
   decision avec l'Admin SDK, qui ignore les regles, exactement comme elles) :
     _dist                                notifications-push.js:147-151
     notifyStockToWatchers, filtre rayon  notifications-push.js:346-347
     e-mail « chasse trouvee », filtre    emails-brevo.js:313-314
     e-mail « chasse lancee », TEXTE      emails-brevo.js:251 + 259
     notifyHuntNearby, filtre rayon       notifications-push.js:284-285  (temoin : 1..50, correct)
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, getDoc, collection,
         serverTimestamp, arrayUnion, increment } from "firebase/firestore";

const env = await banc("verif-impact-rayon-50-retrecit");
const alice  = env.authenticatedContext("alice").firestore();
const carole = env.authenticatedContext("carole").firestore();
const bob    = env.authenticatedContext("bob").firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── Le decor ──────────────────────────────────────────────────────────── */
const BOISSON = 7, NOM = "Fritz-Kola sans sucre";
/* Alice et Carole : meme immeuble, place Flagey a Bruxelles. */
const CHEZ_ELLES = { lat: 50.8281, lng: 4.3720 };
/* Le magasin : 15 km plus au nord — Vilvorde. Dans les 20 km de Carole,
   dans les 50 km demandes par Alice, HORS des 10 km que le serveur
   lui imposera. */
const MAGASIN = { id: "st-vilvorde", name: "Colruyt Vilvorde",
                  lat: 50.8281 + 15 / 111, lng: 4.3720 };

/* La formule de distance du serveur, recopiee (notifications-push.js:147-151). */
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}
/* LE GARDE-FOU DU SERVEUR, recopie caractere pour caractere depuis
   notifications-push.js:346 (et, a l'identique, emails-brevo.js:313 et 251). */
function rayonApplique(wd) {
  return (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
}

/* ── Ce que fait l'application, a l'identique ──────────────────────────── */

/* index.html:14182-14185 — le curseur, cote client. */
const HR_MIN = 1, HR_MAX = 50;
const _hrClamp = (km) => { km = Math.round(Number(km)); if (!(km >= HR_MIN)) km = HR_MIN; if (km > HR_MAX) km = HR_MAX; return km; };

/* index.html:5006-5023 — fbSyncWatch(add=true, ...) */
async function fbSyncWatch(db, uid, magoHuntRadius, lat, lng) {
  const wid = uid + "_" + BOISSON;
  const radius = Number(magoHuntRadius) || 10;
  await setDoc(doc(db, "watches", wid), {
    uid: uid, drinkId: Number(BOISSON), drinkName: String(NOM).slice(0, 60),
    lat: lat != null ? lat : null, lng: lng != null ? lng : null,
    radius: radius,
    createdAt: serverTimestamp()
  });
}
/* index.html:4755-4761 — fbUpdatePushRayon(km) */
async function fbUpdatePushRayon(db, uid, km) {
  const r = Math.max(1, Math.min(50, Math.round(Number(km) || 10)));
  await setDoc(doc(db, "pushTokens", uid), { rayon: r, updatedAt: serverTimestamp() }, { merge: true });
}
/* index.html:3889-3907 — fbAddDrinkToStore(storeId, drinkId) */
async function fbAddDrinkToStore(db, storeId, drinkId, pseudo) {
  const updates = {};
  updates["drinks"] = arrayUnion(Number(drinkId));
  updates["confirmations." + drinkId] = increment(1);
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  updates["seenAt." + drinkId] = heure;
  updates["confirmedBy." + drinkId] = String(pseudo).slice(0, 24);
  updates["confirmedAt." + drinkId] = heure;
  await setDoc(doc(db, "stores", String(storeId)), updates, { merge: true });
}

/* ── Le magasin existe deja (import d'enseigne) ────────────────────────── */
await serveur(async (db) => {
  await setDoc(doc(db, "stores", MAGASIN.id),
    { name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng, drinks: [] });
});

/* ── 1. Les deux femmes reglent leur curseur et lancent leur chasse ────── */
await doit("Alice pousse « Ta zone » a fond (50 km) et lance sa chasse — l'app accepte et ecrit radius:50", async () => {
  const km = _hrClamp(50);
  verifier(km === 50, "le curseur client refuse 50 km (il ne devrait pas : max=50)");
  await fbUpdatePushRayon(alice, "alice", km);
  await fbSyncWatch(alice, "alice", km, CHEZ_ELLES.lat, CHEZ_ELLES.lng);
  const w = await serveur((db) => getDoc(doc(db, "watches", "alice_" + BOISSON)));
  verifier(w.data().radius === 50, "radius ecrit = " + w.data().radius);
});

await doit("Carole s'arrete a 20 km et lance la meme chasse", async () => {
  const km = _hrClamp(20);
  await fbUpdatePushRayon(carole, "carole", km);
  await fbSyncWatch(carole, "carole", km, CHEZ_ELLES.lat, CHEZ_ELLES.lng);
  const w = await serveur((db) => getDoc(doc(db, "watches", "carole_" + BOISSON)));
  verifier(w.data().radius === 20, "radius ecrit = " + w.data().radius);
});

/* ── 2. Bob voit la boisson en rayon a 15 km et la signale ─────────────── */
await doit("Bob signale la boisson chez Colruyt Vilvorde (fbAddDrinkToStore)", async () => {
  await fbAddDrinkToStore(bob, MAGASIN.id, BOISSON, "Bob");
  const s = await serveur((db) => getDoc(doc(db, "stores", MAGASIN.id)));
  verifier((s.data().drinks || []).map(Number).includes(BOISSON), "la boisson n'est pas entree au stock");
});

/* ── 3. Le serveur decide qui est prevenu ──────────────────────────────── */
const prevenus = await serveur(async (db) => {
  const out = [];
  for (const uid of ["alice", "carole"]) {
    const w = await getDoc(doc(db, "watches", uid + "_" + BOISSON));
    const wd = w.data();
    if (!wd.uid || !String(w.id).startsWith(String(wd.uid) + "_")) continue;
    const radius = rayonApplique(wd);
    const d = _dist(MAGASIN.lat, MAGASIN.lng, wd.lat, wd.lng);
    out.push({ uid, choisi: wd.radius, applique: radius, distance: d, prevenu: !(d > radius) });
  }
  return out;
});
const A = prevenus.find((p) => p.uid === "alice");
const C = prevenus.find((p) => p.uid === "carole");

await doit(
  "Alice, qui a choisi 50 km, est prevenue d'une boisson reperee a " + A.distance.toFixed(1) + " km",
  async () => {
    verifier(A.prevenu,
      "personne ne la previent — rayon choisi " + A.choisi + " km, rayon applique par le serveur "
      + A.applique + " km (notifications-push.js:346), distance " + A.distance.toFixed(1) + " km");
  }
);

await doit("Carole, qui a choisi MOINS (20 km), est bien prevenue de la meme boisson", async () => {
  verifier(C.prevenu, "elle non plus n'est pas prevenue — la comparaison ne tient pas");
});

await doit(
  "choisir 50 km donne une zone au moins aussi grande que choisir 20 km",
  async () => {
    verifier(A.applique >= C.applique,
      "choisir 50 km donne " + A.applique + " km de zone reelle, choisir 20 km en donne "
      + C.applique + " km : pousser le curseur a fond RETRECIT la zone de moitie");
  }
);

/* ── 4. Et l'e-mail ? Le meme garde-fou y est recopie deux fois ────────── */
await doit(
  "l'e-mail « Chasse lancee » annonce a Alice le rayon qu'elle a choisi",
  async () => {
    /* emails-brevo.js:251 puis 259 : le chiffre affiche dans la phrase EST le
       chiffre rabote. La phrase envoyee mot pour mot :
       « Des qu'un membre la repere dans un magasin a moins de <b>N km</b> de
         toi, tu recois un e-mail avec l'adresse. » */
    const w = await serveur((db) => getDoc(doc(db, "watches", "alice_" + BOISSON)));
    const annonce = rayonApplique(w.data());
    verifier(annonce === 50,
      "l'e-mail lui ecrit « a moins de " + annonce + " km de toi » alors qu'elle a regle "
      + w.data().radius + " km — l'application lui annonce un chiffre qu'elle n'a jamais choisi");
  }
);

/* ── 5. La table complete du curseur ───────────────────────────────────── */
const table = [1, 5, 10, 15, 19, 20, 21, 25, 30, 40, 50]
  .map((k) => k + "->" + rayonApplique({ radius: _hrClamp(k) }))
  .join(", ");
note("Table du rayon reellement applique aux veilles (notifications-push.js:346, "
   + "emails-brevo.js:313 et 251), pour chaque cran du curseur (index.html:757) : " + table + " km.");
note("Le meme reglage, ecrit par fbUpdatePushRayon dans pushTokens/{uid}.rayon, est lui "
   + "correctement borne a 1..50 cote serveur (notifications-push.js:284). Le passage du "
   + "curseur de 20 a 50 km a donc ete repercute sur UN des deux chemins de notification, "
   + "pas sur l'autre : le commentaire de la ligne 345 dit encore « curseur 1 -> 20 km ».");
note("Consequence chiffree pour Alice : zone demandee 50 km (7854 km2), zone reellement "
   + "surveillee 10 km (314 km2) — soit 4 % de ce qu'elle a demande, et 25 % de ce "
   + "qu'elle aurait obtenu en demandant 20 km.");

await bilan(env);
