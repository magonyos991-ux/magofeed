/* VERIFICATION D'IMPACT — « hunts est lisible sans compte et porte les uid »
   Question posee : qu'est-ce que ca change pour QUELQU'UN ?

   On ne teste pas une idee : on rejoue a l'identique les deux ecritures que
   l'application fait vraiment.
     - profil public            : index.html:1406  (setDoc(userDocRef(uid), {pseudo, pseudoLower, favs, recent, ...}))
     - inscription a une chasse : index.html:4538  (window.fbJoinHunt), avec
       _coarse() de index.html:4506 (Math.round(x*10)/10)
   Puis on se met a la place d'un VISITEUR SANS COMPTE et on mesure ce qu'il
   reconstitue. Regles concernees : firestore.rules:1053 (commentaire),
   1086 (hunts read: if true), 140 (users read: if true).
*/
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection,
         serverTimestamp } from "firebase/firestore";

const env  = await banc("verif-impact-chasse-publique");
const alice = env.authenticatedContext("alice").firestore();
const anon  = env.unauthenticatedContext().firestore();

/* _coarse, recopie de index.html:4506 */
const _coarse = (x) => Math.round(x * 10) / 10;

/* Position reelle d'Alice : place Flagey, Ixelles (Bruxelles). */
const LAT_VRAI = 50.8275, LNG_VRAI = 4.3722;

// ── 1. Alice utilise l'app normalement : son profil se synchronise (index.html:1406)
await doit("alice a un profil public, ecrit comme index.html:1406", async () => {
  await setDoc(doc(alice, "users", "alice"), {
    pseudo: "Zdoudex",
    pseudoLower: "zdoudex",
    avatar: null,
    favs: [7, 12],
    recent: [{ t: "confirm", d: "Mountain Dew Spark", s: "Carrefour Flagey", j: "2026-09-16" }],
    signals: 3, confirms: 5, discAccepted: 1, streak: 2, bestStreak: 4,
    updatedAt: serverTimestamp()
  }, { merge: true });
});

// ── 2. Alice met une boisson en veille -> fbJoinHunt (index.html:4538)
await doit("alice rejoint la chasse, exactement comme fbJoinHunt (index.html:4538)", async () => {
  const pos = { lat: _coarse(LAT_VRAI), lng: _coarse(LNG_VRAI) };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(alice, "hunts", "7");
  const commun = { drinkName: "Mountain Dew Spark", emoji: "\u{1F7E2}", updatedAt: serverTimestamp() };
  try {
    const maj = Object.assign({}, commun); maj["seekers.alice"] = moi;
    await updateDoc(ref, maj);                       // 1er essai : le doc n'existe pas
  } catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers.alice.lat"] = pos.lat; bouge["seekers.alice.lng"] = pos.lng;
      await updateDoc(ref, bouge);                   // 2e essai : idem
    } catch (e2) {
      await setDoc(ref, Object.assign({ drinkId: 7, seekers: { alice: moi } }, commun));
    }
  }
  const verif = await getDoc(ref);
  if (!verif.exists() || !(verif.data().seekers || {}).alice) throw new Error("alice non inscrite");
});

// ── 3. Un inconnu, SANS AUCUN COMPTE, ouvre la console de son navigateur.
let seekers = null, profil = null;
await doit("un visiteur SANS COMPTE liste TOUTE la collection hunts (rules:1086)", async () => {
  const snap = await getDocs(collection(anon, "hunts"));   // pas de filtre, pas de limite
  if (snap.empty) throw new Error("rien lu");
  seekers = snap.docs[0].data().seekers;
  note("moisson brute, sans compte : " + JSON.stringify(snap.docs[0].data().seekers));
});

await doit("le meme visiteur ouvre users/{uid} avec l'uid recolte (rules:140)", async () => {
  const u = await getDoc(doc(anon, "users", Object.keys(seekers)[0]));
  if (!u.exists()) throw new Error("profil illisible");
  profil = u.data();
  note("uid " + Object.keys(seekers)[0] + " -> pseudo \"" + profil.pseudo + "\"");
});

// ── 4. Ce que le croisement donne vraiment, chiffre.
await doit("le croisement livre une personne NOMMEE, situee et datee", async () => {
  const s = seekers[Object.keys(seekers)[0]];
  if (!profil.pseudo) throw new Error("pas de pseudo");
  if (s.lat == null || s.at == null) throw new Error("pas de position/date");
  // Taille reelle de la case, a la latitude d'Alice.
  const kmLat = 0.1 * 111.32;
  const kmLng = 0.1 * 111.32 * Math.cos(s.lat * Math.PI / 180);
  note("case de position : " + kmLat.toFixed(1) + " km x " + kmLng.toFixed(1) + " km "
     + "(arrondi assume, index.html:4497-4505)");
  note("horodatage public : " + new Date(s.at).toISOString() + " (milliseconde exacte)");
  note("fiche publique liee : pseudo=" + profil.pseudo
     + " favs=" + JSON.stringify(profil.favs)
     + " recent=" + JSON.stringify(profil.recent));
});

// ── 5. Le commentaire des regles (1053) dit « agregees, sans noms ». On verifie
//    les deux mots, un par un, sur le document que le visiteur a REELLEMENT lu.
await doitEchouer("« agregees » : le document ne porterait qu'un COMPTE, pas la liste des chercheurs", async () => {
  const snap = await getDocs(collection(anon, "hunts"));
  const d = snap.docs[0].data();
  const parIndividu = d.seekers && typeof d.seekers === "object"
                   && Object.keys(d.seekers).length > 0;
  if (parIndividu) throw new Error("le document est nominatif, pas agrege");
});
await doitEchouer("« sans noms » : l'uid public ne remonterait a aucun pseudo", async () => {
  const snap = await getDocs(collection(anon, "hunts"));
  const uid = Object.keys(snap.docs[0].data().seekers)[0];
  const u = await getDoc(doc(anon, "users", uid));
  if (u.exists() && u.data().pseudo) throw new Error("l'uid remonte au pseudo " + u.data().pseudo);
});

// ── 6. Contre-epreuve : hunts apporte-t-il vraiment quelque chose a l'inconnu,
//    ou users/ suffisait-il deja ? (si users/ donnait deja le lieu, la
//    trouvaille sur hunts n'ajouterait rien)
await doit("la fiche users/ seule NE contient AUCUNE coordonnee : hunts est bien le seul lien public uid -> lieu", async () => {
  const u = await getDoc(doc(anon, "users", "alice"));
  const d = u.data() || {};
  if ("lat" in d || "lng" in d) throw new Error("users/ porte deja une position");
});
await doitEchouer("le visiteur sans compte lit la position fine du battement de coeur (presence/)", async () => {
  await getDoc(doc(anon, "presence", "alice"));
});


/* ── 7. LA VRAIE QUESTION D'IMPACT ────────────────────────────────────────
   index.html:967 PROMET a la personne : « pour les chasses partagees, qui
   sont le seul endroit public, elle est volontairement arrondie a environ
   11 km ». Cette promesse tient-elle dans la BASE, ou seulement dans la page ?
   Le meme fichier de regles argumente ailleurs (a propos de l'e-mail, vers la
   ligne 120) que ce que seule la page garantit ne tient pas : « un vieux cache
   de service worker, une console de navigateur, une version future ecrite sans
   y penser ». On applique cet argument-la aux coordonnees. */
const bob = env.authenticatedContext("bob").firestore();
await doitEchouer("les regles REFUSENT une position fine dans une chasse (la promesse des ~11 km d'index.html:967)", async () => {
  await setDoc(doc(bob, "hunts", "999"), {
    drinkId: 999, drinkName: "Test", emoji: "x", updatedAt: serverTimestamp(),
    seekers: { bob: { lat: 50.82753, lng: 4.37219, at: Date.now() } }  // GPS brut, au metre
  });
});
await doit("mesure de ce qu'un visiteur sans compte lirait alors", async () => {
  const s = await getDoc(doc(anon, "hunts", "999"));
  if (!s.exists()) { note("position fine refusee par les regles : la promesse est tenue en base"); return; }
  const g = s.data().seekers.bob;
  const kmLat = 0.00001 * 111.32;
  note("position fine ACCEPTEE et publique : " + g.lat + "," + g.lng
     + " — soit une case d'environ " + (kmLat * 1000).toFixed(0) + " m, pas 11 km");
});

await bilan(env);
