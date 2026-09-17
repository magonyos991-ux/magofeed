/* ============================================================================
   VERIFICATION, LENTILLE « IMPACT »
   Trouvaille testee : « Le cache de 20 s cache la chasse que quelqu'un vient de
   lancer » (chasse-bout-en-bout.mjs:495-503, annoncee en index.html:4619).

   LA SEULE QUESTION : qu'est-ce que ca change pour quelqu'un ? Quel geste reel,
   sur quel ecran, fait voir quoi ?

   CE QU'ON REJOUE, LIGNE PAR LIGNE
     index.html:4534  window.fbJoinHunt          (Alice lance sa chasse)
     index.html:4616  window.fbLoadNearbyHunts   (le cache de 20 s)
     index.html:1197  <div class="ntab" data-screen="discover" onclick="navTo('discover')">
     index.html:6380  navTo -> show -> _showRaw
     index.html:6461  if(s==="discover"){ window._huntsCache=null; }   <- AVANT
     index.html:6470  try{ renderChasse(); }                           <- APRES
     index.html:21856 renderChasse -> fbLoadNearbyHunts(userLat,userLng,rayon)
     index.html:21915 _peindreChasse -> majBadgeChasse(lignes.length)
     index.html:20179 visibilitychange -> renderChasse()  (SANS vider le cache)
     index.html:17177 renderMerchantBoard -> fbLoadNearbyHunts(lat,lng,25)

   DEUX FAITS DE STRUCTURE, verifiables a l'oeil :
     - #chasse-list (index.html:512) est DANS #s-discover (index.html:479) :
       la liste des chasses n'existe QUE sur l'ecran `discover`.
     - show() n'a pas de raccourci quand on retape l'onglet deja actif
       (index.html:6420-6437 : le test `curId!==s` ne touche que la pile de
       navigation, _showRaw(s) est appele dans tous les cas).
     - toutes les routes vers `discover` passent par _showRaw : navTo (6380),
       le retour systeme (_navAppliquer, 6355), les etats vides (emptyGo, 6416).

   L'HORLOGE. Pour mesurer l'age maximum servi sans attendre 20 s reelles, on
   avance une horloge virtuelle `ECOULE` qui s'ajoute a Date.now() dans la SEULE
   comparaison d'age du cache — exactement ce que ferait le temps qui passe.
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
  serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-impact-cache-chasse-20s");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const BXL = { lat: 50.8676, lng: 4.3436 };
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }
/* index.html:14188 — le rayon de « Ta zone », borne. */
function _hrClamp(v) { const n = Number(v); return (n >= 1 && n <= 50) ? Math.round(n) : 25; }

/* ── HORLOGE VIRTUELLE ─────────────────────────────────────────────────── */
let ECOULE = 0;                         // millisecondes « passees »
const maintenant = () => Date.now() + ECOULE;

/* ── index.html:4534-4567 — window.fbJoinHunt, copie conforme. ──────────── */
async function fbJoinHunt(db, appareil, uid, drinkId, drinkName, emoji, lat, lng) {
  delete caches[appareil];                                  // index.html:4547
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
  /* index.html:4577-4586 : on relit ce qui est REELLEMENT en base. */
  const verif = await getDoc(ref);
  return !!(verif.exists() && (verif.data().seekers || {})[uid]);
}

/* ── index.html:4616-4661 — window.fbLoadNearbyHunts, copie conforme, avec
      son cache de 20 s. Un objet `caches` par « telephone ». ────────────── */
const caches = {};
let lectures = 0;
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (maintenant() - cache.at) < 20000) snap = cache.snap;   // index.html:4628
  else {
    lectures++;
    snap = await getDocs(query(collection(db, "hunts"), limit(200)));  // index.html:4629
    caches[appareil] = { at: maintenant(), snap: snap };
  }
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
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, emoji: h.emoji, seekers: near, mine: mine, distKm: distKm, lastAt: lastAt });
  });
  out.sort(function (a, b) { return b.seekers - a.seekers; });
  return out;
}

/* ── LES GESTES REELS ───────────────────────────────────────────────────── */

/* Taper l'onglet « Decouvrir » (index.html:1197) — ou y revenir par le geste
   retour (index.html:6355) : les deux passent par _showRaw.
   index.html:6461 vide le cache, index.html:6470 peint. */
async function ouvrirOngletChasse(db, appareil, uid, lat, lng) {
  delete caches[appareil];                                   // index.html:6461
  return await renderChasse(db, appareil, uid, lat, lng);    // index.html:6470
}
/* renderChasse (index.html:21839) : appele a CHAQUE changement d'ecran
   (index.html:6470), et au retour au premier plan (index.html:20179). Sur tout
   ecran autre que `discover`, la liste #chasse-list est cachee : seul le BADGE
   de l'onglet en sort (index.html:21915 -> majBadgeChasse). */
async function renderChasse(db, appareil, uid, lat, lng) {
  const hunts = await fbLoadNearbyHunts(db, appareil, uid, lat, lng, _hrClamp(window_magoHuntRadius));
  badge[appareil] = hunts.length;                            // index.html:21915
  return hunts;
}
let window_magoHuntRadius = 25;
const badge = {};
const voit = (liste, id) => !!liste.find((x) => String(x.drinkId) === String(id));

/* ══════════════════════════════════════════════════════════════════════════
   1. LE RECIT ANNONCE, JOUE AVEC LE VRAI GESTE
      « Bob ouvre l'onglet, Alice lance sa chasse a cote de lui, Bob rouvre. »
   ═════════════════════════════════════════════════════════════════════════ */
await doit("1. Bob OUVRE l'onglet La chasse, Alice lance la 77 a cote de lui, Bob ROUVRE l'onglet : il la voit", async () => {
  const avant = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  const inscrite = await fbJoinHunt(alice, "alice", ALICE, 77, "Fanta Shokata", "\u{1F34B}", BXL.lat, BXL.lng);
  verifier(inscrite, "la chasse d'Alice n'est meme pas inscrite en base");
  const apres = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  note("1. Bob voit " + avant.length + " chasse(s) au 1er regard, " + apres.length + " au 2e ; la 77 est "
    + (voit(apres, 77) ? "VISIBLE" : "ABSENTE") + " — delai : 0 s");
  verifier(voit(apres, 77),
    "en rouvrant l'onglet (index.html:6461 vide le cache AVANT index.html:6470) Bob ne voit toujours pas la chasse d'Alice");
});

await doit("2. Bob ne change meme pas d'onglet : il RETAPE « Decouvrir » alors qu'il y est deja (index.html:6420, pas de raccourci)", async () => {
  await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  await fbJoinHunt(alice, "alice", ALICE, 78, "Ramune Yuzu", "\u{1F3D3}", BXL.lat, BXL.lng);
  const apres = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  note("2. retape de l'onglet deja actif : la 78 est " + (voit(apres, 78) ? "VISIBLE" : "ABSENTE") + " — delai : 0 s");
  verifier(voit(apres, 78), "retaper l'onglet ne rafraichit pas");
});

/* ══════════════════════════════════════════════════════════════════════════
   2. OU LE CACHE MORD VRAIMENT : LES ECRANS QUI NE SONT PAS `discover`
      renderChasse tourne partout (index.html:6470) mais ne vide qu'ici
      (index.html:6461). Ce qui en sort ailleurs, c'est le BADGE de l'onglet.
   ═════════════════════════════════════════════════════════════════════════ */
await doit("3. Bob reste sur l'accueil : le badge de l'onglet Decouvrir ignore la chasse d'Alice pendant un temps", async () => {
  delete caches.bob;
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);                  // accueil : cache rempli
  const badgeAvant = badge.bob;
  await fbJoinHunt(alice, "alice", ALICE, 79, "Club-Mate", "\u{1F33F}", BXL.lat, BXL.lng);
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);                  // il va sur Profil, Reglages...
  const badgePendant = badge.bob;
  const surOnglet = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  note("3. badge avant = " + badgeAvant + " ; badge sur les autres ecrans = " + badgePendant
    + " (la 79 n'y est pas) ; a l'ouverture de l'onglet La chasse = " + badge.bob
    + ", la 79 est " + (voit(surOnglet, 79) ? "VISIBLE" : "ABSENTE"));
  verifier(badgePendant === badgeAvant, "le badge s'est mis a jour tout seul : il n'y a pas de cache");
  verifier(voit(surOnglet, 79), "meme en ouvrant l'onglet, Bob ne voit pas la 79");
});

await doit("4. Bob revient dans l'app (index.html:20179 : renderChasse SANS vider) : le badge peut encore etre en retard", async () => {
  delete caches.bob;
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);                  // dernier regard avant de poser le telephone
  await fbJoinHunt(alice, "alice", ALICE, 80, "Bitter Lemon", "\u{1F34B}", BXL.lat, BXL.lng);
  ECOULE += 5000;                                                        // 5 s d'absence
  const auRetour = await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng); // index.html:20182
  note("4. retour au premier plan apres 5 s : la 80 est " + (voit(auRetour, 80) ? "VISIBLE" : "ABSENTE")
    + " (le commentaire d'index.html:20180 dit pourtant « un badge qui ment sur la barre de navigation est pire que pas de badge »)");
  verifier(!voit(auRetour, 80), "le cache ne mord pas ici : la trouvaille n'a plus de terrain du tout");
});

/* ══════════════════════════════════════════════════════════════════════════
   3. COMBIEN DE TEMPS, AU MAXIMUM ? L'age servi ne se renouvelle PAS :
      index.html:4630 ne reecrit `at` que sur une VRAIE lecture.
   ═════════════════════════════════════════════════════════════════════════ */
await doit("5. le cache ne se renouvelle pas tout seul : 40 regards d'affilee ne repoussent pas l'echeance de 20 s", async () => {
  delete caches.bob;
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  const poseALa = caches.bob.at;
  await fbJoinHunt(alice, "alice", ALICE, 81, "Ginger Beer Bio", "\u{1F9C9}", BXL.lat, BXL.lng);
  let vuALa = null;
  for (let i = 1; i <= 40; i++) {            // 40 regards, un toutes les 0,5 s virtuelles
    ECOULE += 500;
    const l = await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
    if (voit(l, 81) && vuALa == null) vuALa = i * 500;
  }
  note("5. la 81 apparait apres " + vuALa + " ms d'attente SANS ouvrir l'onglet (cache pose a t0, "
    + (caches.bob.at - poseALa) + " ms plus tard il a ete refait) ; plafond du code : 20000 ms");
  verifier(vuALa != null && vuALa <= 20500, "l'attente depasse les 20 s annoncees : le cache se renouvelle");
});

/* ══════════════════════════════════════════════════════════════════════════
   4. LE CACHE PEUT-IL FAIRE MENTIR L'APP, ou seulement la mettre en retard ?
      Il garde le SNAPSHOT BRUT (index.html:4629) ; tout le filtrage
      (distance, rayon, fraicheur, chercheur parti) est refait a chaque appel
      sur la position et le rayon du moment.
   ═════════════════════════════════════════════════════════════════════════ */
await doit("6. le cache garde les documents bruts : changer de rayon ou de position donne le bon filtrage sans relire", async () => {
  delete caches.bob;
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  const lectAvant = lectures;
  const large = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50);
  const loin = await fbLoadNearbyHunts(bob, "bob", BOB, 53.5711, BXL.lng, 50);   // 300 km
  note("6. sur le MEME cache (" + (lectures - lectAvant) + " lecture Firestore de plus) : au pied d'Alice "
    + large.length + " chasse(s) ; a 300 km " + loin.length + " chasse(s)");
  verifier(lectures === lectAvant, "le cache a ete relu : la mesure ne veut rien dire");
  verifier(loin.length === 0, "le cache sert une chasse a 300 km : il fausserait le filtre de distance");
});

await doit("7. une chasse ABANDONNEE pendant la fenetre de cache ne reste pas affichee au-dela : l'onglet la retire", async () => {
  delete caches.bob;
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  /* index.html:4599-4601 — window.fbLeaveHunt : seekers.<uid> = null */
  const patch = {}; patch["seekers." + ALICE] = null;
  await updateDoc(doc(alice, "hunts", "81"), patch);
  const surAutreEcran = await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  const surOnglet = await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng);
  note("7. Alice abandonne la 81 : sur un autre ecran Bob la voit encore = " + voit(surAutreEcran, 81)
    + " ; a l'ouverture de l'onglet La chasse = " + voit(surOnglet, 81));
  verifier(!voit(surOnglet, 81), "l'onglet continue d'annoncer une chasse abandonnee");
});

/* ══════════════════════════════════════════════════════════════════════════
   5. LE COUT QUE LE CACHE PAIE — ce qu'on perdrait en le retirant.
   ═════════════════════════════════════════════════════════════════════════ */
await doit("8. un aller-retour entre deux onglets : combien de lectures de la collection hunts", async () => {
  delete caches.bob;
  const avant = lectures;
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);        // accueil
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);        // chercher
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);        // scanner
  await ouvrirOngletChasse(bob, "bob", BOB, BXL.lat, BXL.lng);  // Decouvrir
  await renderChasse(bob, "bob", BOB, BXL.lat, BXL.lng);        // profil
  note("8. 5 changements d'ecran = " + (lectures - avant) + " lecture(s) de la collection hunts (sans cache : 5)");
  verifier(lectures - avant <= 2, "le cache n'economise plus rien");
});

note("TOTAL des lectures Firestore reelles de ce scenario : " + lectures);
note("#chasse-list (index.html:512) est DANS #s-discover (index.html:479) : la liste des chasses n'existe que sur l'ecran `discover`.");
note("chasseSegTap (index.html:21710) ne rappelle PAS renderChasse : aucun geste INTERIEUR a l'ecran ne relit — seul l'ouverture de l'onglet le fait, et elle vide le cache.");

await bilan(env);
