/* ============================================================================
   VERIFICATION INDEPENDANTE : la collection hunts est-elle vraiment lisible
   sans compte, avec les uid, et peut-on relier un uid a un pseudo ?
   ----------------------------------------------------------------------------
   Fonctions rejouees a l'identique (numeros de ligne dans index.html) :
     _coarse                    4505
     creation du profil         1699-1703  (setDoc users/{uid} {pseudo,...})
     window.fbJoinHunt          4534-4567
     window.fbLoadNearbyHunts   4589-4634  (le getDocs sur toute la collection)
   Regles du depot :
     match /users/{uid}  allow read: if true   -> ligne 139-140
     match /hunts/{id}   allow read: if true   -> ligne 1085-1086
     commentaire « publiques en lecture (agregees, sans noms) » -> ligne 1054
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
         serverTimestamp } from "firebase/firestore";

const env   = await banc("verif-chasse-lisible-sans-compte");
const alice = env.authenticatedContext("alice").firestore();
const anon  = env.unauthenticatedContext().firestore();
const ALICE = "alice";
const BOISSON = 7;
const BXL = { lat: 50.8676, lng: 4.3436 };   // Ixelles, Bruxelles (position brute)

function verifier(c, m) { if (!c) throw new Error(m); }

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4534-4567 — recopie a l'identique (memes champs, meme ordre,
   meme repli updateDoc -> updateDoc imbrique -> setDoc). */
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
  try { await updateDoc(ref, maj); return; } catch (e) {}
  try {
    const bouge = Object.assign({}, commun);
    bouge["seekers." + uid + ".lat"] = pos.lat;
    bouge["seekers." + uid + ".lng"] = pos.lng;
    await updateDoc(ref, bouge); return;
  } catch (e2) {}
  await setDoc(ref, Object.assign({
    drinkId: Number(drinkId) || drinkId,
    seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
  }, commun));
}

/* index.html:1699-1703 — le profil cree a la premiere connexion, avec le
   pseudo choisi par la personne (ici : elle en a choisi un). */
await doit("Alice a un profil avec son pseudo (index.html:1699-1703)", async () => {
  await setDoc(doc(alice, "users", ALICE),
    { pseudo: "Camille V.", signals: 0, confirms: 0, createdAt: serverTimestamp() },
    { merge: true });
});

await doit("Alice lance une chasse depuis chez elle (index.html:4534 fbJoinHunt)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, "Mountain Dew Spark", "", BXL.lat, BXL.lng);
  const s = await getDoc(doc(alice, "hunts", String(BOISSON)));
  verifier(s.exists() && s.data().seekers[ALICE], "Alice n'est pas inscrite");
});

/* Ce que fait vraiment fbLoadNearbyHunts (index.html:4619) : getDocs sur toute
   la collection. On le fait SANS AUCUN COMPTE. */
let brut = null;
await doit("un visiteur SANS COMPTE lit la collection hunts (regles 1085-1086)", async () => {
  const snap = await getDocs(query(collection(anon, "hunts"), limit(200)));
  verifier(snap.docs.length > 0, "rien de lisible sans compte");
  brut = snap.docs.find((x) => x.id === String(BOISSON)).data();
  note("document brut lu sans compte : " + JSON.stringify({
    drinkId: brut.drinkId, drinkName: brut.drinkName, seekers: brut.seekers }));
});

await doit("le document contient des UID en clair, pas un simple compteur", async () => {
  const cles = Object.keys(brut.seekers || {});
  verifier(cles.includes(ALICE),
    "l'uid n'apparait pas : le document serait bien agrege. Cles vues : " + JSON.stringify(cles));
  note("cles de la carte seekers visibles sans compte : " + JSON.stringify(cles)
     + " — ce sont des uid Firebase Auth, pas des compteurs anonymes.");
});

await doit("chaque uid porte une position et une date", async () => {
  const e = brut.seekers[ALICE];
  verifier(typeof e.lat === "number" && typeof e.lng === "number" && typeof e.at === "number",
    "entree sans position ni date : " + JSON.stringify(e));
  note("entree d'Alice : lat=" + e.lat + " lng=" + e.lng + " at=" + e.at
     + " (position brute d'Alice : " + BXL.lat + ", " + BXL.lng + ")");
});

/* Le pas qui transforme un uid en NOM : users/{uid} est lui aussi public. */
let profil = null;
await doit("le MEME visiteur sans compte ouvre users/{uid} et obtient le pseudo (regles 139-140)", async () => {
  const uid = Object.keys(brut.seekers)[0];
  const p = await getDoc(doc(anon, "users", uid));
  verifier(p.exists(), "users/" + uid + " illisible sans compte");
  profil = p.data();
  verifier(typeof profil.pseudo === "string" && profil.pseudo.length > 0,
    "pas de pseudo dans le profil : " + JSON.stringify(profil));
  note("croisement fait sans aucun compte : uid=" + uid + " -> pseudo=\"" + profil.pseudo
     + "\" a la position " + brut.seekers[uid].lat + "," + brut.seekers[uid].lng);
});

/* Taille de la case : 1 decimale de latitude ~ 11,1 km ; 1 decimale de
   longitude a 50,9 deg ~ 7,0 km. C'est l'arrondi assume (index.html:4497-4505). */
await doit("la case revelee fait bien environ 11 km (l'arrondi est celui promis)", async () => {
  const e = brut.seekers[ALICE];
  verifier(e.lat === _coarse(BXL.lat) && e.lng === _coarse(BXL.lng),
    "la position n'est pas celle qu'_coarse produit : " + JSON.stringify(e));
  const kmLat = 0.1 * 111.0;
  const kmLng = 0.1 * 111.0 * Math.cos(e.lat * Math.PI / 180);
  note("case revelee : " + kmLat.toFixed(1) + " km x " + kmLng.toFixed(1) + " km"
     + " — l'arrondi fait ce qu'il promet ; le probleme porte sur le commentaire des regles.");
});

/* Le commentaire lui-meme : c'est la seule chose que la trouvaille met en cause. */
await doit("le commentaire des regles (ligne 1054) dit « agregees, sans noms »", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8").split("\n");
  const ligne = src[1053];   // index 0 -> ligne 1054
  verifier(/agr[ée]g[ée]es, sans noms/.test(ligne), "commentaire introuvable ligne 1054 : " + ligne);
  note("firestore.rules:1054 -> " + ligne.trim());
  note("or ce qui est lu sans compte porte " + Object.keys(brut.seekers).length
     + " uid nomme(s) : ni agrege, ni sans noms.");
});

await bilan(env);
