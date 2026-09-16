/* ============================================================================
   VERIFICATION, LENTILLE « REPRODUCTION »
   Trouvaille testee : « Le cache de 20 s cache la chasse que quelqu'un vient de
   lancer » (chasse-bout-en-bout.mjs:496-503, annoncee en index.html:4619).

   Recit annonce : « Bob ouvre l'onglet, Alice lance sa chasse a cote de lui,
   Bob rouvre : il ne la voit pas. »

   CE QUE LE SCENARIO D'ORIGINE MODELISE (lignes 130-135 + 496-503) : un cache
   par appareil, vide UNIQUEMENT par un `delete caches.bob` place a la main
   avant le PREMIER regard. Le second regard, lui, ne vide rien.

   CE QUE FAIT VRAIMENT L'APPLICATION quand on ouvre l'onglet « La chasse » :
     index.html:1197  <div class="ntab" data-screen="discover" onclick="navTo('discover')">
     index.html:6380  function navTo(s){...show(s);}
     index.html:6420  function show(s){ ... _showRaw(s); }
     index.html:6461  if(s==="discover"){try{window._huntsCache=null;}catch(e){}}
     index.html:6470  try{renderChasse();}catch(e){}        <- APRES le vidage
     index.html:21861 renderChasse -> window.fbLoadNearbyHunts(...)
   L'onglet « La chasse » EST l'ecran `discover` : le bloc #chasse-list que
   renderChasse peint (index.html:512) est a l'interieur de #s-discover
   (index.html:479). Ouvrir l'onglet vide donc le cache AVANT de lire.

   C'est d'ailleurs ecrit dans le commentaire meme que la trouvaille cite,
   index.html:4626 : « L'ecran Decouvertes le vide en plus a chaque ouverture. »

   On mesure les deux modeles cote a cote, sur le meme emulateur et les memes
   ecritures.
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDocs, collection, query, limit, serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-reproduction-cache-chasse-onglet");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const BXL = { lat: 50.8676, lng: 4.3436 };
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4534-4567 — window.fbJoinHunt (copie conforme ; on omet juste le
   `window._huntsCache = null` de la ligne 4547, qui est le cache de l'appareil
   d'Alice, pas celui de Bob). */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp(),
  };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); return; } catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); return;
    } catch (e2) {
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
    }
  }
}

/* index.html:4616-4661 — window.fbLoadNearbyHunts, avec son cache de 20 s.
   Un objet `caches` par « telephone ». */
const caches = {};
let lectures = 0;
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;
  else { lectures++; snap = await getDocs(query(collection(db, "hunts"), limit(200))); caches[appareil] = { at: Date.now(), snap: snap }; }
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
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, seekers: near, mine: mine, distKm: distKm, lastAt: lastAt });
  });
  out.sort(function (a, b) { return b.seekers - a.seekers; });
  return out;
}

/* LE GESTE REEL : taper l'onglet « La chasse ».
   index.html:1197 -> navTo('discover') -> show -> _showRaw
   index.html:6461 : window._huntsCache = null;   (AVANT de peindre)
   index.html:6470 : renderChasse() -> fbLoadNearbyHunts (index.html:21861) */
async function ouvrirOngletChasse(db, appareil, myUid, lat, lng, rayon) {
  delete caches[appareil];                       // index.html:6461
  return await fbLoadNearbyHunts(db, appareil, myUid, lat, lng, rayon);
}

/* ══ LE DECOR : une chasse deja en cours, pour que le cache de Bob ne soit pas
      vide (sinon il n'y a rien a « cacher »). ════════════════════════════ */
await fbJoinHunt(alice, ALICE, 7, "Mountain Dew Spark", "", BXL.lat, BXL.lng);

/* ════════════════════════════════════════════════════════════════════════ */
/* A. LE MODELE DU SCENARIO D'ORIGINE (chasse-bout-en-bout.mjs:496-503)      */
/*    Bob « rouvre » sans que rien ne vide son cache.                        */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("A. modele d'origine : Bob regarde, Alice lance la 77, Bob regarde SANS rien vider", async () => {
  delete caches.bob;
  const avant = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  await fbJoinHunt(alice, ALICE, 77, "Fanta Shokata", "", BXL.lat, BXL.lng);
  const apres = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  note("A. 1er regard : " + avant.length + " chasse(s) ; 2e regard : " + apres.length
    + " chasse(s) ; la 77 est " + (apres.find((x) => String(x.drinkId) === "77") ? "VISIBLE" : "ABSENTE"));
  verifier(!apres.find((x) => String(x.drinkId) === "77"),
    "le cache de 20 s ne retient rien du tout : le modele d'origine ne tient pas non plus");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* B. CE QUE FAIT VRAIMENT L'APPLICATION                                     */
/*    « Bob rouvre l'onglet » = navTo('discover') = index.html:6461          */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("B. l'app reelle : Bob OUVRE l'onglet La chasse, Alice lance la 78, Bob ROUVRE l'onglet — il la voit", async () => {
  const avant = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng, 50);   // index.html:1197 -> 6461 -> 6470
  await fbJoinHunt(alice, ALICE, 78, "Ramune Yuzu", "", BXL.lat, BXL.lng);
  const apres = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng, 50);   // il retape l'onglet
  note("B. 1er regard : " + avant.length + " chasse(s) ; apres reouverture : " + apres.length
    + " chasse(s) ; la 78 est " + (apres.find((x) => String(x.drinkId) === "78") ? "VISIBLE" : "ABSENTE"));
  verifier(apres.find((x) => String(x.drinkId) === "78"),
    "meme en rouvrant l'onglet (index.html:6461 vide le cache), Bob ne voit pas la chasse d'Alice");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* C. LE PIRE CAS HONNETE : Bob arrive d'un AUTRE onglet (accueil), ou l'app  */
/*    appelle aussi renderChasse (index.html:6465 et 6470) SANS vider.        */
/*    Puis il tape « La chasse ».                                             */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("C. Bob passe par l'accueil (renderChasse sans vidage, index.html:6465), puis ouvre La chasse", async () => {
  delete caches.bob;
  await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50);            // accueil : cache rempli
  await fbJoinHunt(alice, ALICE, 79, "Club-Mate", "", BXL.lat, BXL.lng);     // Alice lance
  const surAccueil = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50); // accueil encore : cache
  const surOnglet = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng, 50); // il ouvre l'onglet
  note("C. sur l'accueil la 79 est " + (surAccueil.find((x) => String(x.drinkId) === "79") ? "VISIBLE" : "ABSENTE")
    + " ; a l'ouverture de l'onglet La chasse elle est "
    + (surOnglet.find((x) => String(x.drinkId) === "79") ? "VISIBLE" : "ABSENTE"));
  verifier(surOnglet.find((x) => String(x.drinkId) === "79"),
    "l'ouverture de l'onglet ne rattrape pas le retard");
});

note("lectures Firestore reelles declenchees par ce scenario : " + lectures);
note("index.html:512 (#chasse-list) est DANS index.html:479 (#s-discover) : l'onglet « La chasse » est l'ecran `discover`.");
note("index.html:4626, dans le commentaire meme que la trouvaille cite : « L'ecran Decouvertes le vide en plus a chaque ouverture. »");

await bilan(env);
