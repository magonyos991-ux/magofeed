/* ============================================================================
   VERIFICATION D'INTENTION — « l'arrondi ~11 km n'est pas compense
   dans le filtre de distance des chasses »
   ----------------------------------------------------------------------------
   BUG ou CHOIX ? On ne juge pas sur l'ecart mesure : on cherche si le depot
   dit quelque part qu'il accepte ce comportement.

   Fonctions rejouees a l'identique (numeros de ligne dans index.html) :
     _coarse                  4505
     window.fbJoinHunt        4545-4594
     window.fbLoadNearbyHunts 4616-4663
     _hrClamp / HR_MIN / HR_MAX 14182-14185
     huntRadiusDesc           14186-14193   (le texte promis a la personne)
     _chasseDistLabel         21731-21735   (l'AFFICHAGE, lui, compense : <=12 km)
   Cote serveur (rejoue, l'emulateur n'execute pas les Cloud Functions) :
     notifyHuntNearby  functions-a-deployer/notifications-push.js:153-286
       (centre = position ARRONDIE du chercheur ; t.lat = position BRUTE du
        destinataire, ecrite par fbUpdatePushPosition index.html:4763-4773)

   Trois questions :
     1. le meme-endroit echoue-t-il ailleurs qu'a Bruxelles ? (l'ecart depend
        de l'endroit dans la maille : on mesure sur plusieurs villes)
     2. l'ordre est-il inverse ? (un voisin invisible pendant qu'un lointain
        est visible = ce n'est plus une imprecision, c'est un faux)
     3. le meme defaut atteint-il la NOTIFICATION, ou seulement la liste ?
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
         serverTimestamp } from "firebase/firestore";

const env   = await banc("verif-intention-rayon-arrondi");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const anon  = env.unauthenticatedContext().firestore();
const ALICE = "alice", BOB = "bob";

function verifier(c, m) { if (!c) throw new Error(m || "condition fausse"); }

/* index.html:4505 */
const _coarse = (x) => Math.round(x * 10) / 10;
/* index.html:14182-14185 */
const HR_MIN = 1, HR_MAX = 50;
const _hrClamp = (km) => { km = Math.round(Number(km)); if (!(km >= HR_MIN)) km = HR_MIN; if (km > HR_MAX) km = HR_MAX; return km; };
/* index.html:14186-14193 */
function huntRadiusDesc(km) {
  if (km <= 2) return "Tout pres de toi — juste ton coin de rue.";
  if (km <= 5) return "Ton quartier et ceux d'a cote.";
  if (km <= 10) return "Une bonne partie de ta ville.";
  if (km <= 15) return "Large : toute la ville et sa peripherie.";
  if (km <= 30) return "Tres large : la ville entiere et au-dela.";
  return "Toute la region — tu verras des chasses ou tu n'iras peut-etre jamais.";
}
/* index.html:21731-21735 — l'affichage, lui, SAIT que l'arrondi vaut ~12 km */
function _chasseDistLabel(distKm) {
  if (distKm == null || !isFinite(distKm)) return "pres de toi";
  if (distKm <= 12) return "pres de toi";
  return "a environ " + Math.round(distKm) + " km";
}

/* index.html:4545-4594 — window.fbJoinHunt, recopiee. */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName || "").slice(0, 60),
                   emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun); maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); }
  catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge);
    } catch (e2) {
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })()
      }, commun));
    }
  }
}

/* index.html:4616-4663 — window.fbLoadNearbyHunts, recopiee (cache par appareil). */
const caches = {};
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;
  else { snap = await getDocs(query(collection(db, "hunts"), limit(200))); caches[appareil] = { at: Date.now(), snap }; }
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100, fresh = Date.now() - 365 * 86400000;
  snap.forEach(function (d) {
    const h = d.data(); const seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null, lastAt = null;
    Object.keys(seekers).forEach(function (uid) {
      const s = seekers[uid]; if (!s) return;
      if (s.at && s.at < fresh) return;
      if (lat != null && s.lat != null) {
        const dLa = (lat - s.lat) * 111, dLo = (lng - s.lng) * 111 * Math.cos(lat * Math.PI / 180);
        const dk = Math.sqrt(dLa * dLa + dLo * dLo);
        if (dk > R) return;
        if (distKm == null || dk < distKm) distKm = dk;
      }
      if (s.at && (lastAt == null || s.at > lastAt)) lastAt = s.at;
      near++; if (uid === myUid) mine = true;
    });
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, seekers: near, mine, distKm, lastAt });
  });
  out.sort((a, b) => b.seekers - a.seekers);
  return out;
}

/* notifications-push.js:148-152 (_dist) et 265-286 (le filtre par destinataire).
   Le rayon retenu : Math.max(1, Math.min(50, Number(t.rayon) || 15)). */
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}
function serveurPrevient(centre, jeton) {
  const rayon = Math.max(1, Math.min(50, Number(jeton.rayon) || 15));
  if (centre && jeton.lat != null && _dist(centre.lat, centre.lng, jeton.lat, jeton.lng) > rayon) return false;
  return true;
}

/* Quelques vrais endroits belges (centre-ville), pour ne pas conclure sur un
   seul point de la maille. */
const VILLES = [
  ["Bruxelles (Grand-Place)", 50.8467, 4.3525],
  ["Anvers (Grote Markt)",    51.2213, 4.3997],
  ["Gand (Korenmarkt)",       51.0543, 3.7174],
  ["Liege (Saint-Lambert)",   50.6450, 5.5734],
  ["Charleroi (centre)",      50.4114, 4.4446],
  ["Namur (centre)",          50.4674, 4.8720],
  ["Bruges (Markt)",          51.2093, 3.2247],
  ["Louvain (Grote Markt)",   50.8798, 4.7005],
];

/* ════════════════════════════════════════════════════════════════════════ */
/* 1. LE MEME ENDROIT, DANS HUIT VILLES                                     */
/* ════════════════════════════════════════════════════════════════════════ */
note("QUESTION 1 — Bob EXACTEMENT au meme endroit qu'Alice (0 m). Quel rayon");
note("             « Ta zone » lui faut-il pour voir la chasse de son voisin ?");
let piresEcarts = [];
let boissonId = 1000;
for (const [nom, la, ln] of VILLES) {
  boissonId++;
  await fbJoinHunt(alice, ALICE, boissonId, "Boisson " + nom, "", la, ln);
  const seuils = [];
  for (const r of [1, 2, 3, 4, 5, 6, 7, 10]) {
    delete caches.bob;
    const l = await fbLoadNearbyHunts(bob, "bob", BOB, la, ln, _hrClamp(r));
    if (l.find((x) => String(x.drinkId) === String(boissonId))) seuils.push(r);
  }
  const d = (await getDoc(doc(anon, "hunts", String(boissonId)))).data();
  const s = d.seekers[ALICE];
  const ecart = _dist(la, ln, s.lat, s.lng);
  piresEcarts.push([nom, ecart, seuils]);
  note("  " + nom.padEnd(26) + " ecart calcule = " + ecart.toFixed(2).padStart(5)
    + " km  ->  visible a partir de " + (seuils.length ? seuils[0] + " km" : "AUCUN rayon teste")
    + "   (l'app affiche : « " + _chasseDistLabel(ecart) + " »)");
}
const pire = piresEcarts.reduce((a, b) => (b[1] > a[1] ? b : a));
const meilleur = piresEcarts.reduce((a, b) => (b[1] < a[1] ? b : a));
note("  ecart le plus grand : " + pire[1].toFixed(2) + " km (" + pire[0] + ")");
note("  ecart le plus petit : " + meilleur[1].toFixed(2) + " km (" + meilleur[0] + ")");

await doit("« Tout pres de toi — juste ton coin de rue » (1 km, index.html:14187) : le voisin immediat est visible dans les 8 villes", async () => {
  const rates = piresEcarts.filter(([, , seuils]) => !seuils.includes(1)).map(([n]) => n);
  verifier(rates.length === 0,
    rates.length + "/8 villes ou Bob, au pied d'Alice, ne la voit pas a 1 km : " + rates.join(", "));
});
await doit("« Ton quartier et ceux d'a cote » (5 km, index.html:14188) : le voisin immediat est visible dans les 8 villes", async () => {
  const rates = piresEcarts.filter(([, , seuils]) => !seuils.includes(5)).map(([n]) => n);
  verifier(rates.length === 0,
    rates.length + "/8 villes ou Bob, au pied d'Alice, ne la voit pas a 5 km : " + rates.join(", "));
});
await doit("« Une bonne partie de ta ville » (10 km, le reglage par DEFAUT, index.html:14183) : le voisin immediat est visible dans les 8 villes", async () => {
  const rates = piresEcarts.filter(([, , seuils]) => !seuils.includes(10)).map(([n]) => n);
  verifier(rates.length === 0,
    rates.length + "/8 villes ou Bob, au pied d'Alice, ne la voit pas a 10 km : " + rates.join(", "));
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 2. L'ORDRE EST-IL INVERSE ?                                              */
/* ════════════════════════════════════════════════════════════════════════ */
note("");
note("QUESTION 2 — l'ordre des distances est-il seulement imprecis, ou INVERSE ?");
const BXL = { lat: 50.8676, lng: 4.3436 };   // le point du scenario chasse-bout-en-bout
await fbJoinHunt(alice, ALICE, 2001, "Cherry Coke", "", BXL.lat, BXL.lng);
const sA = (await getDoc(doc(anon, "hunts", "2001"))).data().seekers[ALICE];
note("  Alice : position brute " + BXL.lat + ", " + BXL.lng
  + "  ->  ecrite arrondie " + sA.lat + ", " + sA.lng + " (index.html:4549)");

const postes = [
  ["au pied d'Alice",     BXL.lat,  BXL.lng],
  ["a 3 km au nord",      BXL.lat + 3 / 111, BXL.lng],
  ["a 7 km au nord",      BXL.lat + 7 / 111, BXL.lng],
  ["a 10 km au nord",     BXL.lat + 10 / 111, BXL.lng],
];
const inversions = [];
for (const RAYON_TEST of [3, 4, 5, 6]) {
  const releve = [];
  for (const [nom, la, ln] of postes) {
    delete caches.bob;
    const l = await fbLoadNearbyHunts(bob, "bob", BOB, la, ln, _hrClamp(RAYON_TEST));
    const vu = !!l.find((x) => String(x.drinkId) === "2001");
    const reel = _dist(la, ln, BXL.lat, BXL.lng);
    const calc = _dist(la, ln, sA.lat, sA.lng);
    releve.push([nom, reel, calc, vu]);
    if (RAYON_TEST === 4) {
      note("  Bob " + nom.padEnd(18) + " distance REELLE " + reel.toFixed(2).padStart(5)
        + " km | distance CALCULEE " + calc.toFixed(2).padStart(5) + " km");
    }
  }
  const exclus = releve.filter((r) => !r[3]).map((r) => r[1]);
  const inclus = releve.filter((r) => r[3]).map((r) => r[1]);
  const pireExclu = exclus.length ? Math.min(...exclus) : null;
  const pireInclu = inclus.length ? Math.max(...inclus) : null;
  note("  « Ta zone » = " + RAYON_TEST + " km  ->  voit : ["
    + releve.filter((r) => r[3]).map((r) => r[1].toFixed(0) + " km").join(", ")
    + "]   ne voit pas : [" + releve.filter((r) => !r[3]).map((r) => r[1].toFixed(0) + " km").join(", ") + "]");
  if (pireExclu != null && pireInclu != null && pireExclu < pireInclu) {
    inversions.push(RAYON_TEST + " km : exclut quelqu'un a " + pireExclu.toFixed(0)
      + " km reels et garde quelqu'un a " + pireInclu.toFixed(0) + " km reels");
  }
}
await doit("le plus proche n'est jamais exclu pendant qu'un plus lointain passe (rayons 3 a 6 km)", async () => {
  verifier(inversions.length === 0, "ordre INVERSE — " + inversions.join(" ; "));
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 3. LA NOTIFICATION SUBIT-ELLE LE MEME DEFAUT ?                           */
/* ════════════════════════════════════════════════════════════════════════ */
note("");
note("QUESTION 3 — et la notification ? (notifications-push.js:276-286 compare le");
note("             centre ARRONDI a la position BRUTE de pushTokens/{uid})");
await doit("le voisin d'Alice ecrit bien sa position BRUTE dans pushTokens (index.html:4772)", async () => {
  await setDoc(doc(bob, "pushTokens", BOB), {
    token: "jeton-de-bob", lat: BXL.lat, lng: BXL.lng, rayon: 3, updatedAt: serverTimestamp()
  }, { merge: true });
  const j = (await getDoc(doc(bob, "pushTokens", BOB))).data();
  verifier(j.lat === BXL.lat && j.lng === BXL.lng, "position non brute : " + JSON.stringify(j));
});
for (const rayon of [1, 3, 5, 10, 15]) {
  const prevenu = serveurPrevient({ lat: sA.lat, lng: sA.lng }, { lat: BXL.lat, lng: BXL.lng, rayon });
  note("  Bob au pied d'Alice, « Ta zone » = " + String(rayon).padStart(2)
    + " km  ->  le serveur " + (prevenu ? "l'AVERTIT" : "se TAIT"));
}
await doit("Bob, au pied d'Alice, est prevenu quel que soit le rayon qu'il a choisi (1 a 15 km)", async () => {
  const muets = [1, 3, 5, 10, 15].filter((r) => !serveurPrevient({ lat: sA.lat, lng: sA.lng }, { lat: BXL.lat, lng: BXL.lng, rayon: r }));
  verifier(muets.length === 0,
    "le serveur se tait pour un voisin immediat aux rayons suivants : " + muets.join(", ") + " km");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 4. LA COMPENSATION EXISTE-T-ELLE AILLEURS DANS LE MEME CODE ?            */
/* ════════════════════════════════════════════════════════════════════════ */
note("");
note("QUESTION 4 — le depot connait-il l'ampleur de l'arrondi ?");
note("  index.html:21731 _chasseDistLabel : toute distance <= 12 km est affichee");
note("  « pres de toi » — l'AFFICHAGE compense donc explicitement l'arrondi.");
note("  index.html:19533 (magasins) : « +120 m de marge GPS » — la marge est");
note("  ajoutee au rayon, la, et pas ici.");
await doit("l'affichage et le filtre s'accordent : ce que l'app appelle « pres de toi » passe le filtre « Ta zone »", async () => {
  /* Au pied d'Alice, l'app ecrira « pres de toi » (4.72 km <= 12). Si dans le
     meme temps le filtre l'exclut, les deux moities du meme ecran se
     contredisent. */
  const ecart = _dist(BXL.lat, BXL.lng, sA.lat, sA.lng);
  const libelle = _chasseDistLabel(ecart);
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, _hrClamp(3));
  const vu = !!l.find((x) => String(x.drinkId) === "2001");
  verifier(!(libelle === "pres de toi" && !vu),
    "l'app appelle cette chasse « " + libelle + " » (ecart calcule " + ecart.toFixed(2)
    + " km) mais le filtre « Ta zone = 3 km » la fait disparaitre");
});

await bilan(env);
