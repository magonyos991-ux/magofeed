/* ============================================================================
   VERIFICATION D'IMPACT — « Ta zone » petite : plus personne n'existe autour
   ----------------------------------------------------------------------------
   QUESTION UNIQUE : qu'est-ce que ca change pour quelqu'un ?

   On rejoue, a l'identique, les DEUX endroits ou la position arrondie d'un
   chercheur est comparee au rayon choisi par une personne :

     A. LA LISTE, dans l'onglet Chasse
        window.fbLoadNearbyHunts      index.html:4616-4665
        appelee par renderChasse      index.html:21861 (userLat/userLng BRUTS,
                                      rayon = _hrClamp(window.magoHuntRadius))
        position ecrite par fbJoinHunt index.html:4545-4550 via _coarse (4505)

     B. LA NOTIFICATION « Chasse pres de toi »
        notifyHuntNearby              notifications-push.js:153-306
        centre = position ARRONDIE du chercheur (ligne 167)
        destinataire = pushTokens.lat/lng, ecrits BRUTS par
                       fbUpdatePushPosition index.html:4772
        rayon = pushTokens.rayon, ecrit par fbUpdatePushRayon index.html:4759

   Le curseur « Ta zone » va de 1 a 50 km (HR_MIN/HR_MAX, index.html:14183) et
   promet, sous 2 km, « Tout pres de toi — juste ton coin de rue » et, sous
   5 km, « Ton quartier et ceux d'a cote » (huntRadiusDesc, index.html:14186).
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
         serverTimestamp } from "firebase/firestore";

const env = await banc("verif-impact-arrondi-rayon");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob   = env.authenticatedContext(BOB).firestore();
const anon  = env.unauthenticatedContext().firestore();
const verifier = (c, q) => { if (!c) throw new Error(q); };

/* ══ COPIES CONFORMES ═══════════════════════════════════════════════════ */

/* index.html:4505 */
function _coarse(x){ return Math.round(x * 10) / 10; }
/* index.html:14185 */
function _hrClamp(km){ km = Math.round(Number(km)); if(!(km >= 1)) km = 1; if(km > 50) km = 50; return km; }
/* index.html:14186-14192 */
function huntRadiusDesc(km){
  if(km<=2)return "Tout pres de toi — juste ton coin de rue.";
  if(km<=5)return "Ton quartier et ceux d'a cote.";
  if(km<=10)return "Une bonne partie de ta ville.";
  if(km<=15)return "Large : toute la ville et sa peripherie.";
  if(km<=30)return "Tres large : la ville entiere et au-dela.";
  return "Toute la region — tu verras des chasses ou tu n'iras peut-etre jamais.";
}

/* index.html:4545-4593 — window.fbJoinHunt (chemin updateDoc puis setDoc). */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng){
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName||"").slice(0,60),
                   emoji: String(emoji||"").slice(0,4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun); maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); }
  catch (e) {
    await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
      seekers: (function(){ const o = {}; o[uid] = moi; return o; })() }, commun));
  }
}

/* index.html:4616-4665 — window.fbLoadNearbyHunts, cache de 20 s inclus. */
const caches = {};
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm){
  const cache = caches[appareil]; let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;
  else { snap = await getDocs(query(collection(db, "hunts"), limit(200)));
         caches[appareil] = { at: Date.now(), snap: snap }; }
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100, fresh = Date.now() - 365*86400000;
  snap.forEach(function(d){
    const h = d.data(), seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null, lastAt = null;
    Object.keys(seekers).forEach(function(uid){
      const s = seekers[uid]; if (!s) return;
      if (s.at && s.at < fresh) return;
      if (lat != null && s.lat != null) {
        const dLa = (lat - s.lat) * 111, dLo = (lng - s.lng) * 111 * Math.cos(lat * Math.PI/180);
        const dk = Math.sqrt(dLa*dLa + dLo*dLo);
        if (dk > R) return;
        if (distKm == null || dk < distKm) distKm = dk;
      }
      if (s.at && (lastAt == null || s.at > lastAt)) lastAt = s.at;
      near++; if (uid === myUid) mine = true;
    });
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, emoji: h.emoji,
                             seekers: near, mine: mine, distKm: distKm, lastAt: lastAt });
  });
  out.sort(function(a,b){ return b.seekers - a.seekers; });
  return out;
}

/* notifications-push.js:147-151 — _dist ; 264-286 — le tri des destinataires.
   On ne rejoue que la decision « cette personne est-elle prevenue ? » :
   les verrous anti-spam et FCM ne changent rien a la distance. */
function _dist(aLat, aLng, bLat, bLng){
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI/180);
  return Math.sqrt(dLa*dLa + dLo*dLo);
}
function notifyHuntNearby_destinataires(huntDoc, tokens){
  const aSeek = huntDoc.seekers || {};
  let center = null;
  Object.keys(aSeek).forEach(function(u){
    const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s;
  });
  if (!center) return { centre: null, prevenus: [] };
  const seekerUids = new Set(Object.keys(aSeek).filter(function(u){ return aSeek[u]; }));
  const prevenus = [];
  tokens.forEach(function(d){
    if (seekerUids.has(d.id)) return;
    const t = d.data; if (!t.token) return;
    const rayon = Math.max(1, Math.min(50, Number(t.rayon) || 15));
    if (center && t.lat != null && _dist(center.lat, center.lng, t.lat, t.lng) > rayon) return;
    prevenus.push(d.id);
  });
  return { centre: center, prevenus: prevenus };
}

/* ══ LE DECOR : deux personnes a la MEME adresse ════════════════════════ */
/* Place Flagey, Ixelles. Coordonnees reelles, au metre pres : c'est un cafe,
   et Alice et Bob y sont a la meme table. */
const FLAGEY = { lat: 50.8281, lng: 4.3720 };
const BOISSON = 7, NOM = "Mountain Dew Spark";

await doit("Alice lance sa chasse depuis Flagey (fbJoinHunt, index.html:4545)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "\u{1F964}", FLAGEY.lat, FLAGEY.lng);
  const s = await getDoc(doc(anon, "hunts", String(BOISSON)));
  verifier(s.exists(), "la chasse n'existe pas");
  verifier(s.data().seekers[ALICE], "Alice n'est pas inscrite comme chercheuse");
});

const etat = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
const posAlice = etat.seekers[ALICE];
{
  const dLa = (FLAGEY.lat - posAlice.lat) * 111;
  const dLo = (FLAGEY.lng - posAlice.lng) * 111 * Math.cos(FLAGEY.lat * Math.PI/180);
  note("Alice est a " + FLAGEY.lat + ", " + FLAGEY.lng + " ; la base garde "
     + posAlice.lat + ", " + posAlice.lng + " (_coarse, index.html:4505) — un ecart de "
     + Math.sqrt(dLa*dLa + dLo*dLo).toFixed(2) + " km, jamais rattrape a la lecture.");
}

/* ── A. CE QUE BOB VOIT DANS SON ONGLET CHASSE, A LA MEME TABLE ───────── */
const vus = [], invisibles = [];
for (let r = 1; r <= 50; r++) {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, FLAGEY.lat, FLAGEY.lng, _hrClamp(r));
  if (l.find((x) => String(x.drinkId) === String(BOISSON))) vus.push(r); else invisibles.push(r);
}
note("Bob, a la MEME table qu'Alice : la chasse est INVISIBLE avec « Ta zone » a ["
   + (invisibles.length ? invisibles.join(", ") : "aucun") + "] km, visible a partir de "
   + (vus.length ? vus[0] : "jamais") + " km.");
for (const km of [1, 2, 3, 5]) {
  note("  « Ta zone : " + km + " km » — l'app promet « " + huntRadiusDesc(km)
     + " » et la chasse de la personne assise en face est "
     + (vus.includes(km) ? "visible" : "ABSENTE de la liste") + ".");
}

await doit("A — « Tout pres de toi, juste ton coin de rue » (1 km) montre la chasse de la personne assise en face", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, FLAGEY.lat, FLAGEY.lng, _hrClamp(1));
  verifier(l.find((x) => String(x.drinkId) === String(BOISSON)),
    "l'onglet Chasse de Bob est vide alors qu'Alice est a sa table");
});
await doit("A — « Ton quartier et ceux d'a cote » (5 km) montre la chasse de la personne assise en face", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, FLAGEY.lat, FLAGEY.lng, _hrClamp(5));
  verifier(l.find((x) => String(x.drinkId) === String(BOISSON)),
    "l'onglet Chasse de Bob est vide alors qu'Alice est a sa table");
});

/* ── B. LA NOTIFICATION, MEME TABLE, MEME RAYON ───────────────────────── */
/* index.html:4772 — fbUpdatePushPosition ecrit lat/lng BRUTS + le rayon. */
async function ecrirePushToken(db, uid, lat, lng, km){
  const r = Math.max(1, Math.min(50, Math.round(Number(km) || 10)));
  await setDoc(doc(db, "pushTokens", uid), { lat: lat, lng: lng, rayon: r,
    token: "jeton-fcm-" + uid, updatedAt: serverTimestamp() }, { merge: true });
}
const prevenusPar = {};
for (const km of [1, 3, 5, 10, 15]) {
  await ecrirePushToken(bob, BOB, FLAGEY.lat, FLAGEY.lng, km);
  const t = await getDoc(doc(bob, "pushTokens", BOB));
  const res = notifyHuntNearby_destinataires(etat, [{ id: BOB, data: t.data() }]);
  prevenusPar[km] = res.prevenus.length;
}
note("Notification « Chasse pres de toi » (notifications-push.js:284) pour Bob, a la meme table : "
   + [1,3,5,10,15].map((k) => k + " km -> " + (prevenusPar[k] ? "recue" : "RIEN")).join(" ; "));
note("Quand personne n'est retenu, le journal des alertes (notifications-push.js:302) ecrit "
   + "« Aucun appareil dans sa propre zone autour du centre » — alors que l'appareil est a la meme table.");

await doit("B — avec « Ta zone : 3 km », Bob est prevenu qu'on cherche une boisson a sa table", async () => {
  verifier(prevenusPar[3] === 1, "aucune notification ne part vers l'appareil le plus proche du chercheur");
});

/* ── COMBIEN DE GENS ? On mesure sur la maille, pas sur une intuition ──── */
/* L'ecart depend de l'endroit exact ou l'on se trouve DANS la case de 0,1
   degre : au centre de la case il est nul, au coin il est maximal. On
   echantillonne la case a pas regulier, a la latitude de Bruxelles. */
{
  const N = 200, lat0 = 50.85, lng0 = 4.35;
  const seuils = [1, 2, 3, 5, 7, 10];
  const rate = {}; seuils.forEach((s) => rate[s] = 0);
  let somme = 0, pire = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const la = lat0 + (i + 0.5) / N * 0.1 - 0.05;
    const ln = lng0 + (j + 0.5) / N * 0.1 - 0.05;
    const dLa = (la - _coarse(la)) * 111;
    const dLo = (ln - _coarse(ln)) * 111 * Math.cos(la * Math.PI/180);
    const d = Math.sqrt(dLa*dLa + dLo*dLo);
    somme += d; if (d > pire) pire = d;
    seuils.forEach((s) => { if (d > s) rate[s]++; });
  }
  note("Sur " + (N*N) + " positions reparties dans une case de 0,1 degre a la latitude de Bruxelles : "
     + "ecart moyen " + (somme/(N*N)).toFixed(2) + " km, pire cas " + pire.toFixed(2) + " km.");
  note("Part des positions ou un voisin IMMEDIAT est rejete par le filtre : "
     + seuils.map((s) => "rayon " + s + " km -> " + (100*rate[s]/(N*N)).toFixed(0) + " %").join(" ; "));
}

/* ── LE TEMOIN : arrondir AUSSI le lecteur suffit-il ? ─────────────────── */
await doit("temoin — si le lecteur arrondissait sa propre position comme le chercheur, la meme table donne 0 km", async () => {
  const dLa = (_coarse(FLAGEY.lat) - posAlice.lat) * 111;
  const dLo = (_coarse(FLAGEY.lng) - posAlice.lng) * 111 * Math.cos(FLAGEY.lat * Math.PI/180);
  const d = Math.sqrt(dLa*dLa + dLo*dLo);
  verifier(d < 0.001, "meme arrondi des deux cotes, l'ecart reste de " + d.toFixed(2) + " km");
});

/* ── LE CONTRE-EXEMPLE : le rayon reste-t-il utile ? ───────────────────── */
await doit("contre-exemple — a 30 km, la chasse reste bien absente avec un rayon de 10 km", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, 51.098, FLAGEY.lng, _hrClamp(10));
  verifier(!l.find((x) => String(x.drinkId) === String(BOISSON)), "chasse visible a 30 km avec un rayon de 10 km");
});

/* ── OU CE N'EST PAS UN PROBLEME : l'accueil commercant demande 25 km ──── */
await doit("l'accueil du magasin (renderMerchantBoard, index.html:17177 : rayon 25 en dur) voit bien la chasse", async () => {
  delete caches.magasin;
  const l = await fbLoadNearbyHunts(bob, "magasin", BOB, FLAGEY.lat, FLAGEY.lng, 25);
  verifier(l.find((x) => String(x.drinkId) === String(BOISSON)), "meme a 25 km la chasse n'apparait pas");
});

await bilan(env);
