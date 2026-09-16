/* ============================================================================
   VERIFICATION, LENTILLE « INTENTION » — bug ou choix ?
   Trouvaille testee : « Le cache de 20 s cache la chasse que quelqu'un vient de
   lancer » (chasse-bout-en-bout.mjs:496-503), annoncee en index.html:4619.

   Recit annonce : « Bob ouvre l'onglet, Alice lance sa chasse a cote de lui,
   Bob rouvre : il ne la voit pas. »

   ── CE QUE LE SCENARIO D'ORIGINE MODELISE (chasse-bout-en-bout.mjs:130-135,
      puis 496-503) ────────────────────────────────────────────────────────
     delete caches.bob;                  // <- vidage a la main, AVANT le 1er regard
     await fbLoadNearbyHunts(bob, ...);  // Bob regarde
     await fbJoinHunt(alice, ...);       // Alice lance
     await fbLoadNearbyHunts(bob, ...);  // Bob « reouvre »  <- RIEN n'est vide ici
   Le second « regard » appelle la fonction de donnees directement. Ouvrir
   l'onglet, dans l'application, ce n'est pas ca.

   ── CE QUE FAIT VRAIMENT L'APPLICATION QUAND ON OUVRE L'ONGLET ──────────
     index.html:1197   <div class="ntab" data-screen="discover"
                             onclick="navTo('discover')" ...>
     index.html:6380   function navTo(s){ ... show(s); }
     index.html:6430   function show(s){ ... _showRaw(s); }
     index.html:6461   if(s==="discover"){try{window._huntsCache=null;}catch(e){}}
     index.html:6470   try{renderChasse();}catch(e){}         <- APRES le vidage
     index.html:21861  renderChasse -> window.fbLoadNearbyHunts(...)
     index.html:6511   if(s==="discover"){renderDiscoveries();renderChasse();}
   L'onglet « La chasse » EST l'ecran `discover` : le bloc #chasse-list que
   renderChasse peint (index.html:512) est DANS #s-discover (index.html:479).
   Ouvrir l'onglet vide donc le cache AVANT de lire. Le commentaire que la
   trouvaille cite le dit lui-meme, index.html:4626 :
     « L'ecran Decouvertes le vide en plus a chaque ouverture. »

   On mesure les deux modeles cote a cote, meme emulateur, memes ecritures.
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
  serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-intention-cache-chasse-onglet");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const BXL = { lat: 50.8676, lng: 4.3436 };
const verifier = (c, q) => { if (!c) throw new Error(q); };

/* index.html:4505 */
const _coarse = (x) => Math.round(x * 10) / 10;
/* index.html:14155-14158 */
const _hrClamp = (km) => { km = Math.round(Number(km)); if (!(km >= 1)) km = 1; if (km > 50) km = 50; return km; };

/* index.html:4534-4576 — window.fbJoinHunt (copie conforme). Le
   `window._huntsCache = null` de la ligne 4547 est le cache de l'appareil
   d'Alice : on le rejoue sur SON appareil a elle, pas sur celui de Bob. */
async function fbJoinHunt(db, appareil, uid, drinkId, drinkName, emoji, lat, lng) {
  delete caches[appareil];                                   // index.html:4547
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp(),
  };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); } catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge);
    } catch (e2) {
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
    }
  }
  /* index.html:4578-4587 : on relit ce qui est REELLEMENT en base. */
  const verif = await getDoc(ref);
  return !!(verif.exists() && (verif.data().seekers || {})[uid]);
}

/* index.html:4595-4604 — window.fbLeaveHunt */
async function fbLeaveHunt(db, appareil, uid, drinkId) {
  delete caches[appareil];                                   // index.html:4597
  const patch = {}; patch["seekers." + uid] = null;
  try { await updateDoc(doc(db, "hunts", String(drinkId)), patch); } catch (e) {}
}

/* index.html:4616-4661 — window.fbLoadNearbyHunts, cache de 20 s inclus.
   Un `caches[appareil]` par telephone = le `window._huntsCache` de cet onglet. */
const caches = {};
let lectures = 0;
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;   // index.html:4628
  else {
    lectures++;
    snap = await getDocs(query(collection(db, "hunts"), limit(200))); // index.html:4630
    caches[appareil] = { at: Date.now(), snap: snap };
  }
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100;
  const fresh = Date.now() - 365 * 86400000;
  snap.forEach(function (d) {
    const h = d.data(); const seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null, lastAt = null;
    Object.keys(seekers).forEach(function (uid) {
      const s = seekers[uid]; if (!s) return;
      if (s.at && s.at < fresh) return;
      if (lat != null && s.lat != null) {
        const dLa = (lat - s.lat) * 111;
        const dLo = (lng - s.lng) * 111 * Math.cos(lat * Math.PI / 180);
        const dk = Math.sqrt(dLa * dLa + dLo * dLo);
        if (dk > R) return;
        if (distKm == null || dk < distKm) distKm = dk;
      }
      if (s.at && (lastAt == null || s.at > lastAt)) lastAt = s.at;
      near++; if (uid === myUid) mine = true;
    });
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, seekers: near, mine: mine, distKm: distKm, lastAt: lastAt });
  });
  out.sort((a, b) => b.seekers - a.seekers);
  return out;
}

/* ── LE GESTE REEL : taper l'onglet « La chasse » ────────────────────────
   index.html:1197 navTo('discover') -> 6380 show -> 6430 _showRaw :
     6461  window._huntsCache = null
     6470  renderChasse()  -> 21861 fbLoadNearbyHunts(userLat,userLng,_hrClamp(rayon))
     6511  renderChasse() une seconde fois (meme donnee fraiche)              */
async function ouvrirOngletChasse(db, appareil, uid, lat, lng, rayon) {
  delete caches[appareil];                                   // index.html:6461
  const l1 = await fbLoadNearbyHunts(db, appareil, uid, lat, lng, _hrClamp(rayon)); // 6470
  await fbLoadNearbyHunts(db, appareil, uid, lat, lng, _hrClamp(rayon));            // 6511
  return l1;
}
/* Rester SUR l'ecran et le voir se redessiner tout seul (arrivee du GPS
   index.html:6290, arrivee des magasins index.html:27157, changement de langue
   index.html:5962) : ces chemins appellent renderChasse SANS vider le cache. */
async function redessinFond(db, appareil, uid, lat, lng, rayon) {
  return fbLoadNearbyHunts(db, appareil, uid, lat, lng, _hrClamp(rayon));
}

const BOISSON = 77, NOM = "Fanta Shokata";

/* ══ 1. LE MODELE DE LA TROUVAILLE (appel direct, sans ouvrir l'onglet) ══ */
await doit("modele d'origine : deux appels directs a fbLoadNearbyHunts en < 20 s", async () => {
  delete caches.bob;
  await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  await fbJoinHunt(alice, "alice", ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  const vue = !!l.find((x) => String(x.drinkId) === String(BOISSON));
  note("modele d'origine (chasse-bout-en-bout.mjs:496-503) : Bob voit la chasse d'Alice = " + vue);
  verifier(!vue, "le cache de 20 s n'a pas retenu la donnee — modele non reproduit");
});

/* ══ 2. LE GESTE REEL : Bob ROUVRE L'ONGLET ═════════════════════════════ */
await fbLeaveHunt(alice, "alice", ALICE, BOISSON);
delete caches.bob; delete caches.alice;

await doit("geste reel (index.html:6461) : Bob ouvre l'onglet, Alice lance, Bob ROUVRE l'onglet -> il la voit", async () => {
  const avant = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  verifier(!avant.find((x) => String(x.drinkId) === String(BOISSON)),
    "la chasse existait deja avant qu'Alice ne la lance");
  const inscrite = await fbJoinHunt(alice, "alice", ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  verifier(inscrite, "l'inscription d'Alice n'a pas pris en base");
  const apres = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  const ligne = apres.find((x) => String(x.drinkId) === String(BOISSON));
  note("Bob rouvre l'onglet immediatement apres : chasse « " + NOM + " » visible = " + !!ligne +
       (ligne ? " (" + ligne.seekers + " chercheur(s), " + (ligne.distKm != null ? ligne.distKm.toFixed(1) + " km" : "sans distance") + ")" : ""));
  verifier(!!ligne,
    "Bob ne voit pas la chasse d'Alice apres avoir rouvert l'onglet");
});

/* ══ 3. LE CAS QUI RESTE : Bob NE BOUGE PAS, l'ecran se redessine seul ══ */
await fbLeaveHunt(alice, "alice", ALICE, BOISSON);
delete caches.bob; delete caches.alice;

await doit("le residu : Bob RESTE sur l'ecran, Alice lance, un redessin de fond (GPS/magasins) garde l'etat d'avant", async () => {
  await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  await fbJoinHunt(alice, "alice", ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  const l = await redessinFond(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  const vue = !!l.find((x) => String(x.drinkId) === String(BOISSON));
  note("Bob immobile sur l'ecran, redessin de fond (index.html:6290/27157) : chasse visible = " + vue +
       " — le cache de 20 s tient, jusqu'a " + 20 + " s ou jusqu'a la prochaine ouverture de l'onglet");
  verifier(!vue, "le cache ne tient plus du tout — l'economie de lectures annoncee n'existe pas");
});

/* ══ 4. Combien de lectures le cache economise-t-il vraiment ? ══════════ */
const avantL = lectures;
await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
note("une ouverture d'onglet = " + (lectures - avantL) + " lecture(s) Firestore pour 2 appels a renderChasse " +
     "(index.html:6470 puis 6511) : c'est l'aller-retour que les 20 s economisent");

note("LECTURE : le comportement decrit par la trouvaille n'apparait que si l'on appelle " +
     "fbLoadNearbyHunts sans passer par l'ouverture de l'onglet. Le geste de l'utilisateur " +
     "— taper « Decouvrir » — passe par index.html:6461 qui met window._huntsCache a null " +
     "AVANT le renderChasse de la ligne 6470. Le commentaire index.html:4626 l'annonce mot pour mot.");

await bilan(env);
