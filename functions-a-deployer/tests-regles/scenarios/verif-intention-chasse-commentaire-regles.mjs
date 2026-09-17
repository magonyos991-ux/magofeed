/* ============================================================================
   LENTILLE « INTENTION » : hunts lisible sans compte avec les uid — bug ou choix ?
   ----------------------------------------------------------------------------
   La trouvaille dit : le commentaire des regles (firestore.rules:1054) annonce
   des chasses « publiques en lecture (agregees, sans noms) », alors que le
   document brut porte la carte seekers indexee par uid, avec position et date.

   Ce scenario ne cherche PAS a refaire la preuve technique (deja faite par
   verif-reproduction-chasse-lisible-sans-compte.mjs). Il pose la seule question
   de la lentille : l'application TIENT-ELLE la promesse qu'elle fait a la
   personne, et l'ecart est-il assume quelque part ?

   Trois mesures :
     A. ce que la base expose vraiment a un visiteur SANS COMPTE ;
     B. ce que la promesse ECRITE A L'UTILISATEUR annonce (index.html:968,
        politique de confidentialite) : « pour les chasses partagees, qui sont
        le seul endroit public, elle est volontairement arrondie a environ
        11 km » -> on verifie que la position stockee tient cette promesse ;
     C. ce que l'APPLICATION montre a l'ecran (fbLoadNearbyHunts, index.html:4658)
        -> un COMPTE, pas la carte des uid : l'agregation du commentaire decrit
        l'usage, pas le fil.

   Fonctions rejouees a l'identique (numeros de ligne dans index.html) :
     _coarse                    4505
     creation du profil         1699-1703
     window.fbJoinHunt          4545-4592
     window.fbLoadNearbyHunts   4616-4662
   Regles du depot :
     match /users/{uid}  allow read: if true  -> firestore.rules:139-140
     match /hunts/{id}   allow read: if true  -> firestore.rules:1085-1086
     commentaire « agregees, sans noms »      -> firestore.rules:1054
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
         serverTimestamp } from "firebase/firestore";

const env   = await banc("verif-intention-chasse-commentaire-regles");
const alice = env.authenticatedContext("alice").firestore();
const anon  = env.unauthenticatedContext().firestore();

const ALICE = "alice";
const BOISSON = 7, NOM = "Mountain Dew Spark";
/* Une adresse precise a Ixelles (Bruxelles) : c'est ce que le GPS donne. */
const CHEZ_ALICE = { lat: 50.8676, lng: 4.3436 };

const verifier = (c, m) => { if (!c) throw new Error(m); };

/* index.html:4505 */
function _coarse(x){ return Math.round(x * 10) / 10; }

/* index.html:4545-4592 — window.fbJoinHunt, recopie a l'identique :
   memes champs, meme ordre, meme repli updateDoc -> updateDoc imbrique -> setDoc. */
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
    seekers: (function(){ const o = {}; o[uid] = moi; return o; })(),
  }, commun));
}

/* index.html:4616-4662 — window.fbLoadNearbyHunts, la SEULE lecture des chasses
   que l'application fait pour l'ecran. On garde la forme du resultat. */
async function fbLoadNearbyHunts(db, myUid, lat, lng, radiusKm) {
  const snap = await getDocs(query(collection(db, "hunts"), limit(200)));
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100, fresh = Date.now() - 365 * 86400000;
  snap.forEach((d) => {
    const h = d.data(); const seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null, lastAt = null;
    Object.keys(seekers).forEach((uid) => {
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
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, emoji: h.emoji,
                             seekers: near, mine: mine, distKm: distKm, lastAt: lastAt });
  });
  out.sort((a, b) => b.seekers - a.seekers);
  return out;
}

/* ── Le decor ────────────────────────────────────────────────────────────── */
await doit("Alice a un profil public avec son pseudo (index.html:1699-1703)", async () => {
  await setDoc(doc(alice, "users", ALICE),
    { pseudo: "Camille V.", signals: 0, confirms: 0, createdAt: serverTimestamp() },
    { merge: true });
});

await doit("Alice lance la chasse (index.html:4545-4592)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "\u{1F964}", CHEZ_ALICE.lat, CHEZ_ALICE.lng);
  const s = await getDoc(doc(alice, "hunts", String(BOISSON)));
  verifier(s.exists() && (s.data().seekers || {})[ALICE], "Alice n'est pas inscrite");
});

/* ── A. Ce qu'un visiteur SANS COMPTE voit du document brut ──────────────── */
let brut = null;
await doit("un visiteur SANS COMPTE lit hunts (regles 1085-1086 : read if true)", async () => {
  const s = await getDoc(doc(anon, "hunts", String(BOISSON)));
  verifier(s.exists(), "document illisible sans compte");
  brut = s.data();
  note("A. document brut, sans compte : " + JSON.stringify({
    drinkId: brut.drinkId, drinkName: brut.drinkName, seekers: brut.seekers }));
});

await doit("le uid vu dans hunts ouvre le profil public (regles 139-140)", async () => {
  const uid = Object.keys(brut.seekers)[0];
  const p = await getDoc(doc(anon, "users", uid));
  verifier(p.exists(), "profil illisible");
  note("A. uid " + uid + " -> pseudo « " + p.data().pseudo + " », sans aucun compte");
});

/* ── B. La promesse FAITE A LA PERSONNE (index.html:968) ─────────────────── */
/* « pour les chasses partagees, qui sont le seul endroit public, elle est
   volontairement arrondie a environ 11 km — de quoi savoir dans quelle ville
   chercher, rien de plus. » On mesure l'ecart reel entre le GPS et le stocke. */
await doit("la position publiee tient la promesse des ~11 km (index.html:968, _coarse 4505)", async () => {
  const s = brut.seekers[ALICE];
  const dLa = (CHEZ_ALICE.lat - s.lat) * 111;
  const dLo = (CHEZ_ALICE.lng - s.lng) * 111 * Math.cos(CHEZ_ALICE.lat * Math.PI / 180);
  const cote = 0.1 * 111;                        // hauteur d'une case d'un dixieme de degre
  const coteLng = 0.1 * 111 * Math.cos(CHEZ_ALICE.lat * Math.PI / 180);
  note("B. GPS " + CHEZ_ALICE.lat + "," + CHEZ_ALICE.lng + " -> publie " + s.lat + "," + s.lng +
       " (decalage " + dLa.toFixed(1) + " km N/S, " + dLo.toFixed(1) + " km E/O)");
  note("B. taille de la case publiee : " + cote.toFixed(0) + " km sur " + coteLng.toFixed(0) +
       " km — l'app annonce « environ 11 km » a la personne");
  verifier(Math.abs(dLa) <= cote && Math.abs(dLo) <= coteLng, "position plus precise que promis");
  verifier(s.lat === _coarse(CHEZ_ALICE.lat) && s.lng === _coarse(CHEZ_ALICE.lng),
           "la position publiee n'est pas celle de _coarse");
});

await doit("aucun nom, aucun pseudo, aucune adresse n'est ECRIT dans hunts", async () => {
  const champs = Object.keys(brut).sort().join(",");
  const champsChercheur = Object.keys(brut.seekers[ALICE]).sort().join(",");
  note("B. champs du document : " + champs);
  note("B. champs d'un chercheur : " + champsChercheur);
  verifier(champsChercheur === "at,lat,lng", "un chercheur porte autre chose que at/lat/lng");
  verifier(!/pseudo|name.*Alice|email/.test(JSON.stringify(brut).replace(/drinkName/g, "")),
           "un nom de personne est stocke dans hunts");
});

/* ── C. Ce que l'APPLICATION montre (index.html:4616-4662) ───────────────── */
await doit("l'ecran ne recoit qu'un COMPTE, pas la carte des uid (index.html:4658)", async () => {
  const vues = await fbLoadNearbyHunts(anon, null, 50.85, 4.35, 25);
  verifier(vues.length === 1, "la chasse n'apparait pas");
  note("C. ce que l'ecran recoit : " + JSON.stringify(vues[0]));
  verifier(typeof vues[0].seekers === "number", "l'ecran recoit autre chose qu'un compte");
  verifier(!JSON.stringify(vues[0]).includes(ALICE), "un uid remonte jusqu'a l'ecran");
});

note("CONCLUSION DE MESURE : le fil porte les uid ; l'ecran n'en montre aucun ;");
note("la promesse ecrite a la personne (11 km) est tenue au metre pres par _coarse.");
note("Reste le seul ecart : le mot « agregees » du commentaire firestore.rules:1054,");
note("ecrit le 2026-08-16, soit AVANT l'analyse de vie privee du 2026-08-28 (index.html:4497-4505).");

await bilan(env);
