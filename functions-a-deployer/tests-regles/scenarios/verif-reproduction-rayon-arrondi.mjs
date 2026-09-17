/* ============================================================================
   VERIFICATION INDEPENDANTE — « l'arrondi de position n'est pas compense »
   ----------------------------------------------------------------------------
   La trouvaille a verifier dit : les positions des chercheurs sont arrondies a
   0,1 degre (_coarse, index.html:4505) mais fbLoadNearbyHunts (index.html:4650)
   compare la position BRUTE du lecteur a cette position arrondie, sans elargir
   le rayon de la demi-maille. Consequence annoncee : sous ~5 km de rayon, on ne
   voit plus la chasse de la personne assise a cote de soi.

   Je ne me contente pas de rejouer UN point (celui de chasse-bout-en-bout.mjs,
   qui donne 4,72 km). Je balaie 49 positions reparties dans une maille complete
   de 0,1 degre autour de Bruxelles, pour repondre a la vraie question : est-ce
   que ca arrive partout, ou seulement au point choisi par l'autre scenario ?

   Fonctions rejouees, recopiees a l'identique :
     _coarse                  index.html:4505
     window.fbJoinHunt        index.html:4545-4593
     window.fbLoadNearbyHunts index.html:4616-4661  (le filtre est ligne 4649-4652)
     _hrClamp / HR_MIN / HR_MAX index.html:14181-14185
     huntRadiusDesc           index.html:14186-14193
     _chasseDistLabel         index.html:21731-21735
   Cote serveur (rejoue, l'emulateur n'execute pas les Cloud Functions) :
     _dist                    notifications-push.js:147-151
     filtre du rayon          notifications-push.js:284-285
     position du destinataire index.html:4772 (fbUpdatePushPosition, BRUTE)
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs,
  collection, query, limit, serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-rayon-arrondi");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:14181-14185 */
const HR_MIN = 1, HR_MAX = 50;
function _hrClamp(km) { km = Math.round(Number(km)); if (!(km >= HR_MIN)) km = HR_MIN; if (km > HR_MAX) km = HR_MAX; return km; }

/* index.html:14186-14193 */
function huntRadiusDesc(km) {
  if (km <= 2) return "Tout pres de toi — juste ton coin de rue.";
  if (km <= 5) return "Ton quartier et ceux d'a cote.";
  if (km <= 10) return "Une bonne partie de ta ville.";
  if (km <= 15) return "Large : toute la ville et sa peripherie.";
  if (km <= 30) return "Tres large : la ville entiere et au-dela.";
  return "Toute la region — tu verras des chasses ou tu n'iras peut-etre jamais.";
}

/* index.html:21731-21735 */
function _chasseDistLabel(distKm) {
  if (distKm == null || !isFinite(distKm)) return "pres de toi";
  if (distKm <= 12) return "pres de toi";
  return "a environ " + Math.round(distKm) + " km";
}

/* index.html:4545-4593 — window.fbJoinHunt (les trois chemins, dans l'ordre) */
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
  return pos;
}

/* index.html:4616-4661 — window.fbLoadNearbyHunts, cache compris */
const caches = {};
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;
  else { snap = await getDocs(query(collection(db, "hunts"), limit(200))); caches[appareil] = { at: Date.now(), snap: snap }; }
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

/* notifications-push.js:147-151 — _dist (identique au filtre du client) */
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}

/* ════════════════════════════════════════════════════════════════════════ */
/* 1. LE POINT EXACT DE LA TROUVAILLE : est-ce qu'il se reproduit ?         */
/* ════════════════════════════════════════════════════════════════════════ */
const BXL = { lat: 50.8676, lng: 4.3436 };   // le point de chasse-bout-en-bout.mjs

await doit("Alice lance sa chasse a Bruxelles (fbJoinHunt, index.html:4545)", async () => {
  const pos = await fbJoinHunt(alice, ALICE, 7, "Mountain Dew Spark", "", BXL.lat, BXL.lng);
  const d = (await getDoc(doc(bob, "hunts", "7"))).data();
  verifier(d && d.seekers && d.seekers[ALICE], "Alice n'est pas inscrite : " + JSON.stringify(d));
  verifier(d.seekers[ALICE].lat === _coarse(BXL.lat), "position non arrondie");
  note("brute " + BXL.lat + "," + BXL.lng + " -> ecrite " + pos.lat + "," + pos.lng
    + " (arrondi volontaire, index.html:4498-4504)");
});

let dBXL = null;
await doit("Bob EXACTEMENT au meme endroit qu'Alice voit sa chasse avec le rayon 3 km", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, _hrClamp(3));
  delete caches.bob;
  const large = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, _hrClamp(50));
  const h50 = large.find((x) => String(x.drinkId) === "7");
  dBXL = h50 ? h50.distKm : null;
  verifier(l.find((x) => String(x.drinkId) === "7"),
    "Bob est au pied d'Alice (0 m) et ne la voit pas : l'app lui calcule "
    + (dBXL == null ? "?" : dBXL.toFixed(2)) + " km alors qu'il a demande 3 km");
});
note("distance reelle Alice-Bob = 0,00 km ; distance CALCULEE par index.html:4650 = "
  + (dBXL == null ? "?" : dBXL.toFixed(2)) + " km");
note("ce que l'ecran promet a 3 km (huntRadiusDesc, index.html:14188) : « " + huntRadiusDesc(3) + " »");

/* ════════════════════════════════════════════════════════════════════════ */
/* 2. EST-CE UN ACCIDENT DU POINT CHOISI ? — balayage d'une maille entiere  */
/* ════════════════════════════════════════════════════════════════════════ */
/* 49 positions reelles, pas d'un point unique : 7 latitudes x 7 longitudes
   couvrant une maille complete de 0,1 degre. A chaque position, Alice ET Bob
   sont AU MEME ENDROIT (distance reelle 0 m). On mesure ce que l'app calcule. */
const LATS = [50.800, 50.815, 50.830, 50.845, 50.860, 50.875, 50.890];
const LNGS = [4.300, 4.315, 4.330, 4.345, 4.360, 4.375, 4.390];
const RAYONS = [1, 2, 3, 5, 10];

let id = 1000;
const points = [];
for (const la of LATS) for (const ln of LNGS) { points.push({ id: ++id, la, ln }); }

for (const p of points) await fbJoinHunt(alice, ALICE, p.id, "Sonde " + p.id, "", p.la, p.ln);

const invisibles = {};                       // rayon -> nb de points ou on ne voit rien
RAYONS.forEach((r) => { invisibles[r] = 0; });
let pire = 0, meilleur = Infinity, somme = 0;
for (const p of points) {
  for (const r of RAYONS) {
    delete caches.bob;
    const l = await fbLoadNearbyHunts(bob, "bob", BOB, p.la, p.ln, _hrClamp(r));
    if (!l.find((x) => String(x.drinkId) === String(p.id))) invisibles[r]++;
  }
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, p.la, p.ln, 100);
  const h = l.find((x) => String(x.drinkId) === String(p.id));
  const d = h ? h.distKm : null;
  if (d != null) { somme += d; if (d > pire) pire = d; if (d < meilleur) meilleur = d; }
}
note("49 positions, Alice et Bob AU MEME ENDROIT a chaque fois — distance calculee par l'app : "
  + "min " + meilleur.toFixed(2) + " km, moyenne " + (somme / points.length).toFixed(2)
  + " km, max " + pire.toFixed(2) + " km (la vraie distance est 0,00 km partout)");
RAYONS.forEach((r) => {
  note("rayon « Ta zone » = " + r + " km (« " + huntRadiusDesc(r) + " ») : le voisin de palier est INVISIBLE sur "
    + invisibles[r] + " des 49 positions");
});

await doit("« Tout pres de toi — juste ton coin de rue » (1 km, index.html:14187) montre au moins le voisin de palier", async () => {
  verifier(invisibles[1] === 0, invisibles[1] + " positions sur 49 ou la personne au MEME endroit n'apparait pas");
});
await doit("« Ton quartier et ceux d'a cote » (5 km, index.html:14188) montre au moins le voisin de palier", async () => {
  verifier(invisibles[5] === 0, invisibles[5] + " positions sur 49 ou la personne au MEME endroit n'apparait pas");
});
await doit("« Une bonne partie de ta ville » (10 km, index.html:14189) montre au moins le voisin de palier", async () => {
  verifier(invisibles[10] === 0, invisibles[10] + " positions sur 49 ou la personne au MEME endroit n'apparait pas");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 3. L'ERREUR VA AUSSI DANS L'AUTRE SENS : loin affiche comme « pres »     */
/* ════════════════════════════════════════════════════════════════════════ */
/* Alice juste au-dessus du bord de maille, Bob juste au centre de la maille
   suivante : l'arrondi les colle l'un sur l'autre. */
const LOIN = { lat: 50.8501, lng: 4.3501 };    // -> arrondi 50.9 / 4.4
const BOB2 = { lat: 50.9000, lng: 4.4000 };    // deja sur la maille
const reelle = _dist(BOB2.lat, BOB2.lng, LOIN.lat, LOIN.lng);
await fbJoinHunt(alice, ALICE, 9001, "Ramune Original", "", LOIN.lat, LOIN.lng);
let calculee = null;
await doit("une chasse a " + reelle.toFixed(1) + " km n'est pas annoncee dans le rayon « juste ton coin de rue » (1 km)", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, BOB2.lat, BOB2.lng, _hrClamp(1));
  const h = l.find((x) => String(x.drinkId) === "9001");
  calculee = h ? h.distKm : null;
  verifier(!h, "Alice est a " + reelle.toFixed(2) + " km, l'app la calcule a "
    + (calculee == null ? "?" : calculee.toFixed(2)) + " km et l'affiche « "
    + _chasseDistLabel(calculee) + " » avec un rayon de 1 km");
});
note("l'erreur n'est pas seulement une perte : ici distance reelle " + reelle.toFixed(2)
  + " km, distance calculee " + (calculee == null ? "?" : calculee.toFixed(2))
  + " km, libelle affiche (index.html:21733) « " + _chasseDistLabel(calculee) + " »");

/* ════════════════════════════════════════════════════════════════════════ */
/* 4. LE MEME DEFAUT COTE SERVEUR (la notification « chasse pres de toi »)  */
/* ════════════════════════════════════════════════════════════════════════ */
/* notifications-push.js:284-285 compare le CENTRE (position arrondie du
   chercheur, seule position que le document de chasse contienne) a
   pushTokens.lat, que index.html:4772 ecrit BRUTE. Meme comparaison, meme
   defaut : le rayon choisi par le destinataire est ampute de la demi-maille. */
const centre = (await getDoc(doc(bob, "hunts", "7"))).data().seekers[ALICE];
const rayonBob = 3;
const distServeur = _dist(centre.lat, centre.lng, BXL.lat, BXL.lng);
await doit("le serveur previent Bob, au MEME endroit qu'Alice, quand il a choisi 3 km (notifications-push.js:285)", async () => {
  verifier(!(distServeur > Math.max(1, Math.min(50, rayonBob))),
    "le serveur calcule " + distServeur.toFixed(2) + " km entre deux personnes au meme endroit : la poussee est filtree");
});
note("cote serveur : centre de la chasse " + centre.lat + "," + centre.lng
  + " (arrondi) contre pushTokens " + BXL.lat + "," + BXL.lng
  + " (brut, index.html:4772) = " + distServeur.toFixed(2) + " km");

await bilan(env);
