/* ============================================================================
   PARCOURS « VIE PRIVEE, POSITION, SUPPRESSION DE COMPTE »
   ----------------------------------------------------------------------------
   L'ecran Confidentialite de l'application (index.html:967) promet, mot pour
   mot :

     « ta position est enregistree (base Firebase) afin de te prevenir quand une
       boisson que tu suis est reperee pres de toi. Elle n'est alors lisible que
       par toi, et pour les "chasses" partagees, qui sont le seul endroit
       public, elle est volontairement arrondie a environ 11 km — de quoi savoir
       dans quelle ville chercher, rien de plus. »

   Et le bouton « Supprimer mon compte » (index.html:872) annonce :

     « Efface definitivement ton profil et tes donnees »

   Ce scenario REJOUE les ecritures exactes de l'application, recopiees depuis
   index.html, et mesure ce qui est REELLEMENT ecrit et ce qui reste :

     index.html:4505  _coarse(x)                    l'arrondi des chasses
     index.html:4549  window.fbJoinHunt(...)        la seule position PUBLIQUE
     index.html:4404  window.fbHeartbeat()          presence, arrondi ~1 km
     index.html:4700  window.fbEnablePush(lat,lng)  pushTokens, position BRUTE
     index.html:4772  window.fbUpdatePushPosition() pushTokens, position BRUTE
     index.html:5007  window.fbSyncWatch(...)       watches,    position BRUTE
     index.html:4280  window.fbLogSearch(e)         searchLog, anonyme
     index.html:10791 l'appelant de fbLogSearch     arrondi ~1 km
     index.html:1392  window.fbSyncUserStats(...)   users.recent (nom du MAGASIN)
     index.html:2755  window.fbOuvrirConversation() le fil
     index.html:2804  window.fbEnvoyerMessage()     message "pos", arrondi ~100 m
     index.html:4080  window.fbSubmitShopClaim()    nom + telephone
     index.html:1548  window.fbDeleteAccount()      LA suppression
     index.html:24932 deleteAccount()               ce qui est DIT a l'ecran
     index.html:1667  le menage de l'adresse e-mail

   Les regles evaluees sont celles du depot : functions-a-deployer/firestore.rules
   (users 139-184, pushTokens 221-223, blocks 333, amis 407, conversations 461,
    discoveries 670, searchLog 890, shopClaims 917, watches 1018, presence 1049,
    hunts 1085, demand 1309, refus par defaut 1319).

   Un ECHEC ci-dessous n'est pas un scenario casse : c'est une trouvaille.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where,
  limit, serverTimestamp, deleteField, writeBatch, increment, addDoc,
} from "firebase/firestore";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..", "..", "..");   // /home/user/magofeed
const SRC = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");

/* ── L'arrondi de l'application, charge TEL QUEL depuis index.html ──────────
   On ne recopie pas la formule a la main : on extrait _coarse() du fichier
   livre. Le jour ou quelqu'un change Math.round(x*10)/10, ce scenario le voit.
   (meme technique que scenarios/decouvertes.mjs) */
function extraireFonction(nom) {
  const i = SRC.indexOf("function " + nom + "(");
  if (i < 0) throw new Error("fonction introuvable dans index.html : " + nom);
  let k = SRC.indexOf("{", i), prof = 0;
  for (let j = k; j < SRC.length; j++) {
    if (SRC[j] === "{") prof++;
    else if (SRC[j] === "}") { prof--; if (prof === 0) { k = j + 1; break; } }
  }
  return SRC.slice(i, k);
}
const _coarse = new Function(extraireFonction("_coarse") + "\nreturn _coarse;")();

/* ── Geometrie : degres -> kilometres ──────────────────────────────────────
   Un degre de latitude = 2*pi*R/360 partout. Un degre de longitude retrecit
   avec le cosinus de la latitude : c'est toute la question ici. */
const KM_PAR_DEGRE = (2 * Math.PI * 6371.0088) / 360;      // 111.195 km
const kmLat = (d) => d * KM_PAR_DEGRE;
const kmLng = (d, lat) => d * KM_PAR_DEGRE * Math.cos((lat * Math.PI) / 180);
function distKm(a, b, c, d) {
  return Math.sqrt(Math.pow(kmLat(a - c), 2) + Math.pow(kmLng(b - d, (a + c) / 2), 2));
}
const r2 = (x) => Math.round(x * 100) / 100;

/* Deux villes reelles de l'aire d'usage de Magofeed. */
const BXL = { nom: "Bruxelles, Grand-Place", lat: 50.8466789, lng: 4.3527891 };
const PAR = { nom: "Paris, Notre-Dame",      lat: 48.8529682, lng: 2.3499021 };

const env = await banc("vie-privee-et-compte");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carol = env.authenticatedContext("carol").firestore();
const chef  = env.authenticatedContext("chef").firestore();
const anon  = env.unauthenticatedContext().firestore();

/* L'administrateur, c'est un document dans /admins (firestore.rules:50). */
await env.withSecurityRulesDisabled(async (ctx) => {
  const god = ctx.firestore();
  await setDoc(doc(god, "admins", "chef"), { role: "fondateur" });
  /* Un magasin reel : shopClaims exige exists(stores/{id}) (firestore.rules:922). */
  await setDoc(doc(god, "stores", "store-ixelles"), {
    name: "Delhaize Ixelles", lat: 50.8271, lng: 4.3719, addedBy: "bob",
  });
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════════════
   LES FONCTIONS DE L'APP, RECOPIEES A L'IDENTIQUE
   La seule difference : on ne masque pas les erreurs. L'app, elle, en avale
   beaucoup ici (fbHeartbeat, fbSyncWatch, fbUpdatePushPosition, fbLogSearch
   se terminent tous par un catch silencieux).
   ══════════════════════════════════════════════════════════════════════════ */

// index.html:4549 — window.fbJoinHunt(drinkId, drinkName, emoji, lat, lng)
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
  try {
    await updateDoc(ref, maj);
  } catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge);
    } catch (e2) {
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (() => { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
    }
  }
  const verif = await getDoc(ref);
  const inscrit = !!(verif.exists() && (verif.data().seekers || {})[uid]);
  return { ok: inscrit, position: pos.lat != null };
}

// index.html:4404 — window.fbHeartbeat()
async function fbHeartbeat(db, uid, pseudo, lat, lng) {
  const beat = { lastSeen: serverTimestamp(), pseudo: String(pseudo).slice(0, 24) };
  if (typeof lat === "number" && lat && typeof lng === "number") {
    beat.lat = Math.round(lat * 100) / 100;
    beat.lng = Math.round(lng * 100) / 100;
  }
  beat.tz = "Europe/Brussels";
  beat.lang = "fr-BE";
  beat.bot = false;
  await setDoc(doc(db, "presence", uid), beat, { merge: true });
}

// index.html:4700 — window.fbEnablePush(lat, lng)  (la partie qui ECRIT)
async function fbEnablePush(db, uid, token, lat, lng) {
  const _payload = { token: token, updatedAt: serverTimestamp() };
  if (lat != null && lng != null) { _payload.lat = lat; _payload.lng = lng; }
  await setDoc(doc(db, "pushTokens", uid), _payload, { merge: true });
}

// index.html:4772 — window.fbUpdatePushPosition(lat, lng)
async function fbUpdatePushPosition(db, uid, lat, lng, rayonKm) {
  if (lat == null) return;
  const _r = Math.max(1, Math.min(50, Math.round(Number(rayonKm) || 10)));
  await setDoc(doc(db, "pushTokens", uid),
    { lat: lat, lng: lng, rayon: _r, updatedAt: serverTimestamp() }, { merge: true });
}

// index.html:5007 — window.fbSyncWatch(add, drinkId, drinkName, lat, lng)
async function fbSyncWatch(db, uid, add, drinkId, drinkName, lat, lng, rayonKm) {
  const wid = uid + "_" + drinkId;
  if (add) {
    const radius = Number(rayonKm) || 10;
    await setDoc(doc(db, "watches", wid), {
      uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
      lat: lat != null ? lat : null, lng: lng != null ? lng : null,
      radius: radius, createdAt: serverTimestamp(),
    });
  } else {
    await deleteDoc(doc(db, "watches", wid));
  }
}

// index.html:4280 — window.fbLogSearch(e), appele avec l'arrondi d'index.html:10791
async function fbLogSearch(db, d, n, lat, lng, ok) {
  await addDoc(collection(db, "searchLog"), {
    d: Number(d) || 0,
    n: String(n || "").slice(0, 80),
    lat: (typeof lat === "number" && lat) ? Math.round(lat * 100) / 100 : null,
    lng: (typeof lng === "number" && lng) ? Math.round(lng * 100) / 100 : null,
    ok: ok === true,
    at: serverTimestamp(),
  });
}

// index.html:1392 — window.fbSyncUserStats(stats), la partie qui ECRIT
async function fbSyncUserStats(db, uid, pseudo, favIds, activity) {
  const typeMap = { stock: "confirm", rupture: "rupture", contrefacon: "rupture", nouveau: "disc", scan: "scan" };
  const recent = [];
  (activity || []).slice(0, 5).forEach((a) => {
    if (!a || !typeMap[a.type]) return;
    recent.push({
      t: typeMap[a.type],
      d: String((a.drink && a.drink.name) || "").slice(0, 40),
      s: String((a.store && a.store.name) || "").slice(0, 40),
      j: String(a.day || "2026-09-16").slice(0, 10),
    });
  });
  await setDoc(doc(db, "users", uid), {
    pseudo: String(pseudo).slice(0, 24),
    pseudoLower: String(pseudo).slice(0, 24).toLowerCase(),
    avatar: { type: "emoji", v: "🦊" },
    favs: favIds,
    recent: recent,
    signals: 0, confirms: 3, discAccepted: 0, streak: 4, bestStreak: 9,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// index.html:2755 — window.fbOuvrirConversation(otherUid)
async function fbOuvrirConversation(db, me, autre) {
  const cid = [me, autre].sort().join("_");
  const unread = {}; unread[me] = 0; unread[autre] = 0;
  await setDoc(doc(db, "conversations", cid), {
    members: [me, autre].sort(), createdBy: me, createdAt: serverTimestamp(),
    state: "request", requestBy: me, reqCount: 0,
    lastAt: serverTimestamp(), unread: unread,
  });
  return cid;
}

// index.html:2804 — window.fbEnvoyerMessage(cid, msg), branche "pos"
async function fbEnvoyerMessagePos(db, cid, me, autre, lat, lng, etatRequest) {
  const m = { by: me, at: serverTimestamp(), type: "pos" };
  m.lat = Math.round(lat * 1000) / 1000;      // index.html:2836
  m.lng = Math.round(lng * 1000) / 1000;
  const mref = doc(collection(db, "conversations", cid, "messages"));
  const batch = writeBatch(db);
  batch.set(mref, m);
  const maj = {
    lastAt: serverTimestamp(),
    lastMsg: { by: me, type: "pos", text: "Position", at: serverTimestamp() },
  };
  maj["unread." + autre] = increment(1);
  if (etatRequest) maj.reqCount = 1;
  batch.update(doc(db, "conversations", cid), maj);
  await batch.commit();
  return mref.id;
}

// index.html:4080 — window.fbSubmitShopClaim(store, infos)
async function fbSubmitShopClaim(db, uid, pseudo, sid, storeName, contact, role, noteTxt) {
  await setDoc(doc(db, "shopClaims", sid), {
    storeId: sid, storeName: String(storeName).slice(0, 80),
    by: uid, byPseudo: String(pseudo).slice(0, 24),
    contact: String(contact).slice(0, 80),
    role: String(role).slice(0, 40),
    note: String(noteTxt).slice(0, 300),
    status: "pending", createdAt: serverTimestamp(),
  });
}

// index.html:1548 — window.fbDeleteAccount(), a l'identique (l'ORDRE compte)
async function fbDeleteAccount(db, uid) {
  const refsAEffacer = [doc(db, "users", uid)];
  try {
    const mesDemandes = await getDocs(query(collection(db, "shopClaims"), where("by", "==", uid)));
    mesDemandes.docs.forEach((d) => refsAEffacer.push(d.ref));
  } catch (e) { /* console.warn("lecture claims:", e) */ }
  /* Ici l'app appelle deleteUser(user) : le compte d'authentification part.
     Le banc ne peut pas supprimer un compte Firebase Auth ; on note donc le
     point exact ou l'identite disparait, et la suite se joue avec le jeton
     encore en memoire — exactement comme dans l'app. */
  let restes = 0;
  for (let i = 0; i < refsAEffacer.length; i++) {
    try { await deleteDoc(refsAEffacer[i]); } catch (e3) { restes++; }
  }
  return { ok: true, restes: restes, efface: refsAEffacer.length };
}

/* ══════════════════════════════════════════════════════════════════════════
   1. L'ARRONDI DES CHASSES : LA PROMESSE DES 11 KM, MESUREE
   ══════════════════════════════════════════════════════════════════════════ */

note("1a. index.html:4505 — " + extraireFonction("_coarse").replace(/\s+/g, " "));

const DRINK = 4242;
await doit("1b. Alice rejoint une chasse depuis la Grand-Place (fbJoinHunt, index.html:4549)", async () => {
  const r = await fbJoinHunt(alice, "alice", DRINK, "Ramune Melon", "🍈", BXL.lat, BXL.lng);
  if (!r.ok) throw new Error("Alice n'est pas inscrite dans seekers");
  if (!r.position) throw new Error("la chasse est partie sans position");
});

/* On relit avec un visiteur SANS COMPTE : hunts est `allow read: if true`
   (firestore.rules:1086). C'est la definition meme de « public ». */
const huntPublic = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
const posPubliee = huntPublic.seekers.alice;

note("1c. position vraie  " + BXL.lat + ", " + BXL.lng + "  (" + BXL.nom + ")");
note("1d. position PUBLIEE dans hunts/" + DRINK + ".seekers.alice : " +
     posPubliee.lat + ", " + posPubliee.lng + " — lue SANS COMPTE");

const ecartBxl = distKm(BXL.lat, BXL.lng, posPubliee.lat, posPubliee.lng);
note("1e. ecart reel entre les deux : " + r2(ecartBxl) + " km");

/* La case de l'arrondi : 0.1 degre de cote. Sa hauteur est la meme partout,
   sa largeur retrecit avec la latitude. */
const cellLat = kmLat(0.1);
const cellLngBxl = kmLng(0.1, BXL.lat);
const cellLngPar = kmLng(0.1, PAR.lat);
note("1f. la case de l'arrondi mesure " + r2(cellLat) + " km du nord au sud, " +
     "et " + r2(cellLngBxl) + " km d'est en ouest a Bruxelles (" + r2(cellLngPar) + " km a Paris)");
note("1g. aire de la case : " + Math.round(cellLat * cellLngBxl) + " km² a Bruxelles. " +
     "Une case « d'environ 11 km » en ferait " + Math.round(11 * 11) + " ; " +
     "un disque de 11 km de rayon, " + Math.round(Math.PI * 121) + ".");

await doit("1h. la zone publiee fait au moins 11 km dans les DEUX directions, " +
           "comme l'annonce l'ecran Confidentialite (index.html:967)", async () => {
  if (cellLat < 11 || cellLngBxl < 11) {
    throw new Error(
      "mesure : " + r2(cellLat) + " km nord-sud mais seulement " + r2(cellLngBxl) +
      " km est-ouest a Bruxelles (" + r2(cellLngPar) + " km a Paris). " +
      "L'ecran promet « environ 11 km » sans dire que c'est la plus GRANDE des " +
      "deux dimensions. Le commentaire du code, lui, dit « environ 11 km sur 7 » " +
      "(index.html:4502) : c'est l'ecran qui arrondit la promesse, pas le code."
    );
  }
});

/* Le pire cas : la moitie de la diagonale de la case. C'est la distance
   maximale entre ou l'on est vraiment et le point publie. */
const pireCas = Math.sqrt(Math.pow(cellLat / 2, 2) + Math.pow(cellLngBxl / 2, 2));
/* Ecart quadratique moyen d'un point uniforme dans la case a son centre :
   sqrt((a^2 + b^2) / 12). C'est l'erreur « typique », pas le pire cas. */
const rmsCas = Math.sqrt((cellLat * cellLat + cellLngBxl * cellLngBxl) / 12);
await doit("1i. personne ne peut situer Alice a mieux que 11 km", async () => {
  if (pireCas < 11) {
    throw new Error(
      "au pire " + r2(pireCas) + " km d'ecart a Bruxelles ; ecart quadratique moyen sur " +
      "la case " + r2(rmsCas) + " km ; " + r2(ecartBxl) + " km pour le point teste. " +
      "Qui lit « arrondie a environ 11 km » croit qu'on ne peut pas l'approcher a moins " +
      "de 11 km."
    );
  }
});

note("1j. et l'arrondi se DEGRADE vers le nord : la largeur de la case vaut " +
     r2(kmLng(0.1, 43.3)) + " km a Marseille, " + r2(cellLngBxl) + " km a Bruxelles, " +
     r2(kmLng(0.1, 59.33)) + " km a Stockholm.");

/* ── L'arrondi est-il tenu par les REGLES, ou seulement par le client ? ──── */
await doitEchouer("1k. les regles refusent une position au metre pres dans hunts, " +
                  "qui est le seul document PUBLIC portant une position", async () => {
  const maj = { drinkName: "Ramune Melon", emoji: "🍈", updatedAt: serverTimestamp() };
  maj["seekers.alice"] = { lat: BXL.lat, lng: BXL.lng, at: posPubliee.at };
  await updateDoc(doc(alice, "hunts", String(DRINK)), maj);
});
const apresPrecis = (await getDoc(doc(anon, "hunts", String(DRINK)))).data().seekers.alice;
note("1l. ce qu'un visiteur sans compte lit maintenant : " + apresPrecis.lat + ", " +
     apresPrecis.lng + " — l'adresse e-mail, elle, est interdite par la REGLE " +
     "(firestore.rules:130, « on l'interdit au niveau de la base, la ou ca ne se " +
     "contourne pas »). La position publique n'a pas eu droit au meme soin.");

/* On remet la chasse dans son etat honnete pour la suite du scenario. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), "hunts", String(DRINK)),
    { "seekers.alice": posPubliee });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. QUI PEUT LIRE UNE POSITION PRECISE ?
   ══════════════════════════════════════════════════════════════════════════ */

await doit("2a. Alice active les notifications de proximite (fbEnablePush, index.html:4700)", async () => {
  await fbEnablePush(alice, "alice", "jeton-fcm-alice", BXL.lat, BXL.lng);
});
await doit("2b. le GPS repond et l'app rafraichit la position (fbUpdatePushPosition, index.html:4772)", async () => {
  await fbUpdatePushPosition(alice, "alice", BXL.lat, BXL.lng, 10);
});
await doit("2c. Alice met une boisson en veille (fbSyncWatch, index.html:5007)", async () => {
  await fbSyncWatch(alice, "alice", true, DRINK, "Ramune Melon", BXL.lat, BXL.lng, 10);
});
await doit("2d. battement de coeur (fbHeartbeat, index.html:4404)", async () => {
  await fbHeartbeat(alice, "alice", "Alice", BXL.lat, BXL.lng);
});
await doit("2e. journal de recherche anonyme (fbLogSearch, index.html:4280 + 10791)", async () => {
  await fbLogSearch(alice, DRINK, "Ramune Melon", BXL.lat, BXL.lng, false);
});

const pt = (await getDoc(doc(alice, "pushTokens", "alice"))).data();
const wt = (await getDoc(doc(alice, "watches", "alice_" + DRINK))).data();
const pr = (await getDoc(doc(chef, "presence", "alice"))).data();
note("2f. pushTokens/alice : lat=" + pt.lat + " lng=" + pt.lng + " — position BRUTE, " +
     "au " + String(pt.lat).split(".")[1].length + "e chiffre apres la virgule (" +
     Math.round(kmLat(1e-7) * 100000 * 10) / 10 + " cm de resolution)");
note("2g. watches/alice_" + DRINK + " : lat=" + wt.lat + " lng=" + wt.lng + " — position BRUTE aussi");
note("2h. presence/alice : lat=" + pr.lat + " lng=" + pr.lng + " (~1 km) AVEC le pseudo « " +
     pr.pseudo + " » — ecart reel " + r2(distKm(BXL.lat, BXL.lng, pr.lat, pr.lng)) + " km");

await doitEchouer("2i. Bob lit la position brute d'Alice (pushTokens)", async () => {
  await getDoc(doc(bob, "pushTokens", "alice"));
});
await doitEchouer("2j. Bob lit la veille d'Alice (watches, position brute)", async () => {
  await getDoc(doc(bob, "watches", "alice_" + DRINK));
});
await doitEchouer("2k. Bob lit le battement de coeur d'Alice (presence, ~1 km + pseudo)", async () => {
  await getDoc(doc(bob, "presence", "alice"));
});
await doitEchouer("2l. l'administrateur lit la position brute d'Alice (pushTokens)", async () => {
  await getDoc(doc(chef, "pushTokens", "alice"));
});
note("2m. bilan : la seule position lisible par UN AUTRE est celle des chasses (~0,1°). " +
     "Les trois positions precises (pushTokens, watches) et la position ~1 km avec pseudo " +
     "(presence) sont hors de portee des autres membres — la promesse « lisible que par toi » " +
     "est tenue par les regles.");

/* ══════════════════════════════════════════════════════════════════════════
   3. LE PROFIL PUBLIC : CE QUE L'ECRAN CONFIDENTIALITE N'ANNONCE PAS
   ══════════════════════════════════════════════════════════════════════════ */

await doit("3a. Alice synchronise son profil apres trois gestes (fbSyncUserStats, index.html:1392)", async () => {
  await fbSyncUserStats(alice, "alice", "Alice", [12, 44], [
    { type: "stock",   drink: { name: "Ramune Melon" },  store: { name: "Delhaize Ixelles" },      day: "2026-09-15" },
    { type: "rupture", drink: { name: "Mogu Mogu" },     store: { name: "Night Shop Flagey" },     day: "2026-09-14" },
    { type: "nouveau", drink: { name: "Calpis Water" },  store: { name: "Asia Market Saint-Josse" }, day: "2026-09-12" },
  ]);
});

await doit("3a-bis. Bob et Carol ont eux aussi un profil (le classement en vit)", async () => {
  await fbSyncUserStats(bob, "bob", "Bob", [7], [
    { type: "scan", drink: { name: "Pocari Sweat" }, store: { name: "Carrefour Uccle" }, day: "2026-09-16" },
  ]);
  await fbSyncUserStats(carol, "carol", "Carol", [], []);
});

const profilAnon = (await getDoc(doc(anon, "users", "alice"))).data();
note("3b. un visiteur SANS COMPTE lit users/alice (firestore.rules:140 `allow read: if true`) : " +
     "pseudo=" + JSON.stringify(profilAnon.pseudo) + ", favoris=" + JSON.stringify(profilAnon.favs) +
     ", avatar=" + JSON.stringify(profilAnon.avatar));
note("3c. et ses « derniers gestes » : " +
     profilAnon.recent.map((g) => g.j + " " + g.t + " « " + g.d + " » chez « " + g.s + " »").join(" | "));

await doit("3d. le profil public ne dit pas OU Alice fait ses courses", async () => {
  const magasins = (profilAnon.recent || []).map((g) => g.s).filter(Boolean);
  if (magasins.length) {
    throw new Error(
      "users/alice.recent nomme " + magasins.length + " magasins : " + JSON.stringify(magasins) +
      ". Lisible sans compte. Le commentaire de la regle (firestore.rules:113) refuse une " +
      "coordonnee dans ce document parce qu'elle « dirait ou la personne fait ses courses » — " +
      "le nom du magasin le dit au metre pres, bien mieux que les 11 km promis. " +
      "L'ecran Confidentialite (index.html:975) annonce le profil public pour les FAVORIS, " +
      "jamais pour les derniers gestes."
    );
  }
});

/* Pourquoi la PRODUCTION montre aujourd'hui des `recent` vides : userStats vit
   en memoire (data/state.js:20 « var userStats={...,activity:[]} »), et
   updateProfileStats() resynchronise le profil au demarrage, alors que
   activity est encore vide (index.html:7593). Le nom des magasins n'est donc
   public que de la contribution a la prochaine ouverture de l'app — mais il
   l'est vraiment, et pour tout le monde. */
await doit("3e. la relance de l'app (activity vide) reecrit recent: [] sur le profil public", async () => {
  await fbSyncUserStats(alice, "alice", "Alice", [12, 44], []);   // data/state.js:20
  const d = (await getDoc(doc(anon, "users", "alice"))).data();
  if ((d.recent || []).length) throw new Error("recent n'a pas ete vide");
  note("3e'. fenetre d'exposition : de la contribution a la prochaine ouverture. " +
       "Effet de bord : « Ses derniers gestes » (index.html:25443) est vide sur " +
       "tous les profils que les autres consultent.");
});
/* On remet les gestes pour la suite (le croisement de la section 4). */
await fbSyncUserStats(alice, "alice", "Alice", [12, 44], [
  { type: "stock", drink: { name: "Ramune Melon" }, store: { name: "Delhaize Ixelles" }, day: "2026-09-15" },
]);

/* ══════════════════════════════════════════════════════════════════════════
   4. UN NON-CONNECTE : QUE PEUT-IL LIRE, ET QU'ARRIVE-T-IL EN CROISANT ?
   ══════════════════════════════════════════════════════════════════════════ */

await doit("4a. un non-connecte LISTE toute la collection users", async () => {
  const s = await getDocs(collection(anon, "users"));
  note("4a'. " + s.size + " profil(s) rapatrie(s) sans compte, en une requete");
});
await doit("4b. un non-connecte LISTE toutes les chasses", async () => {
  const s = await getDocs(collection(anon, "hunts"));
  note("4b'. " + s.size + " chasse(s) rapatriee(s) sans compte");
});
await doitEchouer("4c. un non-connecte lit un profil de presence", async () => {
  await getDoc(doc(anon, "presence", "alice"));
});
await doitEchouer("4d. un non-connecte lit le journal des recherches", async () => {
  await getDocs(collection(anon, "searchLog"));
});

/* LE CROISEMENT. C'est exactement le scenario que decrit le commentaire des
   regles (firestore.rules:107) et la raison d'etre de l'arrondi a 0,1°. */
await doit("4e. croisement chasses -> profils : sans compte, un inconnu relie un PSEUDO a une ZONE", async () => {
  const chasses = await getDocs(collection(anon, "hunts"));
  const lignes = [];
  for (const d of chasses.docs) {
    const sk = d.data().seekers || {};
    for (const uid of Object.keys(sk)) {
      if (!sk[uid]) continue;
      const p = (await getDoc(doc(anon, "users", uid))).data() || {};
      lignes.push((p.pseudo || uid) + " cherche « " + d.data().drinkName + " » vers " +
                  sk[uid].lat + "," + sk[uid].lng +
                  (p.recent && p.recent[0] ? " · vu chez « " + p.recent[0].s + " »" : ""));
    }
  }
  if (!lignes.length) throw new Error("aucune ligne : le croisement n'aboutit pas");
  note("4e'. " + lignes.join(" || "));
});

/* ══════════════════════════════════════════════════════════════════════════
   5. CE QU'UN MEMBRE ORDINAIRE PEUT ASPIRER EN MASSE (list)
   ══════════════════════════════════════════════════════════════════════════ */

const ouvertes = ["users", "stores", "hunts", "discoveries", "catalog", "stats",
                  "meta", "drinkMerges", "chasseCodes", "annonces"];
const fermees  = ["presence", "searchLog", "demand", "feedback", "shopClaims", "abus",
                  "reports", "penalties", "refCodes", "referrals", "pushTokens",
                  "watches", "photoSuggestions", "formatSuggestions", "discoveryPhotos",
                  "crawler", "adminLog", "verifications", "dons", "merchants"];

for (const c of ouvertes) {
  await doit("5a. un membre ordinaire LISTE " + c, async () => {
    await getDocs(collection(bob, c));
  });
}
for (const c of fermees) {
  await doitEchouer("5b. un membre ordinaire LISTE " + c, async () => {
    await getDocs(collection(bob, c));
  });
}
await doit("5c. Bob liste SES veilles (requete contrainte sur uid, comme l'app)", async () => {
  await getDocs(query(collection(bob, "watches"), where("uid", "==", "bob")));
});
await doitEchouer("5d. Bob liste les veilles d'Alice en changeant le filtre", async () => {
  await getDocs(query(collection(bob, "watches"), where("uid", "==", "alice")));
});

/* ══════════════════════════════════════════════════════════════════════════
   6. L'ADRESSE E-MAIL
   ══════════════════════════════════════════════════════════════════════════ */

await doitEchouer("6a. Alice pose son adresse e-mail sur son profil PUBLIC", async () => {
  await setDoc(doc(alice, "users", "alice"), { email: "alice@exemple.be" }, { merge: true });
});
await env.withSecurityRulesDisabled(async (ctx) => {
  // Une vieille version de l'app en avait ecrit une (index.html:1663).
  await setDoc(doc(ctx.firestore(), "users", "alice"), { email: "alice@exemple.be" }, { merge: true });
});
await doit("6b. le menage d'index.html:1667 efface l'adresse laissee par l'ancienne version", async () => {
  await setDoc(doc(alice, "users", "alice"), { email: deleteField() }, { merge: true });
  const d = (await getDoc(doc(anon, "users", "alice"))).data();
  if ("email" in d) throw new Error("l'adresse est toujours sur le profil public");
});
await doit("6c. Alice depose une demande de certification avec son telephone (fbSubmitShopClaim, index.html:4080)", async () => {
  await fbSubmitShopClaim(alice, "alice", "Alice", "store-ixelles", "Delhaize Ixelles",
                          "Alice Dubois · +32 470 11 22 33", "gerante", "C'est ma boutique");
});
await doitEchouer("6d. Bob lit le nom et le telephone d'Alice (shopClaims)", async () => {
  await getDoc(doc(bob, "shopClaims", "store-ixelles"));
});
await doit("6e. Alice relit son propre dossier", async () => {
  const d = (await getDoc(doc(alice, "shopClaims", "store-ixelles"))).data();
  if (!d.contact) throw new Error("dossier illisible par son auteur");
});
note("6f. l'adresse e-mail ne vit nulle part dans Firestore : elle reste dans Firebase Auth " +
     "(index.html:4933). Le seul endroit ou un contact nominatif est stocke est " +
     "shopClaims.contact — admin + auteur.");

/* UNE ADRESSE RESTEE D'UNE ANCIENNE VERSION. Le menage d'index.html:1667 ne
   tourne qu'a la CONNEXION de la personne concernee. Celui qui ne revient
   jamais laisse son adresse sur un document que tout le monde peut lire. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "users", "absent"), {
    pseudo: "Toucan Tropical", points: 12, email: "absent@exemple.be",
  });
});
await doit("6g. un visiteur SANS COMPTE lit l'adresse restee sur le profil d'un absent", async () => {
  const d = (await getDoc(doc(anon, "users", "absent"))).data();
  if (!d.email) throw new Error("pas d'adresse sur ce profil");
  note("6g'. users/absent.email = " + JSON.stringify(d.email) + " — lu sans aucun compte");
});
await doitEchouer("6h. l'administrateur retire l'adresse du profil d'un absent", async () => {
  await setDoc(doc(chef, "users", "absent"), { email: deleteField() }, { merge: true });
});
note("6i. le seul remede cote client est d'effacer le PROFIL ENTIER (firestore.rules:167 " +
     "`allow delete: if isSelf(uid) || isAdmin()`) — donc de faire disparaitre le pseudo, " +
     "les points et le classement de quelqu'un pour retirer son adresse.");
await doit("6j. l'administrateur peut effacer le profil entier (le seul remede)", async () => {
  await deleteDoc(doc(chef, "users", "absent"));
});



/* ══════════════════════════════════════════════════════════════════════════
   7. LA MESSAGERIE : UNE POSITION A ~100 M, PARTAGEE VOLONTAIREMENT
   ══════════════════════════════════════════════════════════════════════════ */

let CID = null;
await doit("7a. Alice ouvre un fil vers Bob (fbOuvrirConversation, index.html:2755)", async () => {
  CID = await fbOuvrirConversation(alice, "alice", "bob");
});
await doit("7b. Alice partage sa position dans le fil (fbEnvoyerMessage type « pos », index.html:2836)", async () => {
  await pause(900);   // les regles imposent 700 ms (firestore.rules:604)
  await fbEnvoyerMessagePos(alice, CID, "alice", "bob", BXL.lat, BXL.lng, true);
});
const msgs = await getDocs(collection(bob, "conversations", CID, "messages"));
const msg = msgs.docs[0].data();
const ecartMsg = distKm(BXL.lat, BXL.lng, msg.lat, msg.lng);
note("7c. position partagee : " + msg.lat + ", " + msg.lng + " — arrondie au millieme de degre, " +
     "soit une case de " + Math.round(kmLat(0.001) * 1000) + " m sur " +
     Math.round(kmLng(0.001, BXL.lat) * 1000) + " m ; ecart reel " + Math.round(ecartMsg * 1000) + " m");
await doit("7d. le cercle de " + 110 + " m dessine par l'app (index.html:19787) couvre bien l'incertitude reelle", async () => {
  const pireMsg = Math.sqrt(Math.pow(kmLat(0.001) / 2, 2) + Math.pow(kmLng(0.001, BXL.lat) / 2, 2)) * 1000;
  if (pireMsg > 110) throw new Error("incertitude reelle au pire " + Math.round(pireMsg) + " m > cercle de 110 m");
});
await doitEchouer("7e. Carol, qui n'est pas du fil, lit la position partagee", async () => {
  await getDocs(collection(carol, "conversations", CID, "messages"));
});

/* ══════════════════════════════════════════════════════════════════════════
   8. LA SUPPRESSION DE COMPTE : CE QUI PART, CE QUI RESTE
   ══════════════════════════════════════════════════════════════════════════ */

await doit("8a. Alice laisse une decouverte publique avant de partir", async () => {
  await setDoc(doc(alice, "discoveries", "5410228142470"), {
    name: "Ramune Melon", brand: "Hata", cat: "soda", votes: 1,
    barcode: "5410228142470", by: "alice", byPseudo: "Alice",
    createdAt: serverTimestamp(),
  });
});

let RESULTAT = null;
await doit("8b. Alice supprime son compte (fbDeleteAccount, index.html:1548)", async () => {
  RESULTAT = await fbDeleteAccount(alice, "alice");
  if (!RESULTAT.ok) throw new Error("la suppression a echoue");
});
note("8c. fbDeleteAccount a vise " + RESULTAT.efface + " document(s) (users/alice + ses shopClaims) " +
     "et rend { ok:true, restes:" + RESULTAT.restes + " }. index.html:24937 affiche alors " +
     "« Compte supprime », sans reserve.");

/* On inventorie ce qui reste. Le compte d'authentification est parti : dans
   l'app, plus aucun jeton « alice » n'existe. On regarde donc avec les yeux
   qui restent : l'administrateur, un autre membre, un visiteur. */
const restes = [];
async function survit(libelle, lecteur, chemin) {
  try {
    const s = await getDoc(doc(lecteur, ...chemin));
    if (s.exists()) { restes.push(libelle + " -> " + JSON.stringify(s.data()).slice(0, 150)); return true; }
  } catch (e) { /* illisible par ce lecteur */ }
  return false;
}
await survit("presence/alice (pseudo + position ~1 km)", chef, ["presence", "alice"]);
await survit("pushTokens/alice (jeton + position BRUTE)", alice, ["pushTokens", "alice"]);
await survit("watches/alice_" + DRINK + " (position BRUTE)", alice, ["watches", "alice_" + DRINK]);
await survit("hunts/" + DRINK + " (uid + position ~0,1°, PUBLIC)", anon, ["hunts", String(DRINK)]);
await survit("discoveries/5410228142470 (by + byPseudo, PUBLIC)", anon, ["discoveries", "5410228142470"]);
await survit("conversations/" + CID + " (le fil)", bob, ["conversations", CID]);
note("8d. ce qui RESTE apres « Compte supprime » : " + restes.length + " document(s) —");
restes.forEach((r, i) => note("      " + (i + 1) + ". " + r));

await doit("8e. users/alice a bien disparu", async () => {
  const s = await getDoc(doc(anon, "users", "alice"));
  if (s.exists()) throw new Error("le profil est toujours la");
});
await doit("8f. le dossier de certification (nom + telephone) a bien disparu", async () => {
  const s = await getDoc(doc(chef, "shopClaims", "store-ixelles"));
  if (s.exists()) throw new Error("le nom et le telephone d'Alice sont toujours en base");
});

/* ── Et maintenant : quelqu'un peut-il encore effacer ce qui reste ? ─────── */
await doit("8g. l'administrateur peut effacer la position ~1 km + le pseudo d'un compte supprime (presence)", async () => {
  await deleteDoc(doc(chef, "presence", "alice"));
});
await doit("8h. l'administrateur peut effacer la position BRUTE d'un compte supprime (pushTokens)", async () => {
  await deleteDoc(doc(chef, "pushTokens", "alice"));
});
await doit("8i. l'administrateur peut effacer la position BRUTE d'un compte supprime (watches)", async () => {
  await deleteDoc(doc(chef, "watches", "alice_" + DRINK));
});
await doit("8j. l'administrateur peut retirer le chercheur parti SANS detruire la chasse des autres", async () => {
  await updateDoc(doc(chef, "hunts", String(DRINK)), { "seekers.alice": null });
});
await doit("8j-bis. le SEUL remede reste a l'administrateur : detruire la chasse ENTIERE, " +
           "avec les chercheurs qui, eux, n'ont rien demande", async () => {
  await deleteDoc(doc(chef, "hunts", String(DRINK)));
});
await doit("8k. l'administrateur peut effacer la decouverte d'un compte supprime", async () => {
  await deleteDoc(doc(chef, "discoveries", "5410228142470"));
});
await doit("8l. l'administrateur peut effacer le fil de conversation d'un compte supprime", async () => {
  await deleteDoc(doc(chef, "conversations", CID));
});

note("8m. rappel de ce que l'ecran promet : bouton « Supprimer mon compte · Efface " +
     "definitivement ton profil et tes donnees » (index.html:872), confirmation « Ton " +
     "pseudo, tes points, ton streak et ton classement seront effaces » (index.html:24933), " +
     "puis « Compte supprime » (index.html:24937). Aucune de ces trois phrases ne parle " +
     "de ce qui reste.");
note("8n-reserve. « personne » veut dire : aucun chemin de l'application, ni la " +
     "console d'un navigateur. L'Admin SDK et la console Firebase, eux, ignorent " +
     "ces regles — mais c'est alors une intervention manuelle du fondateur, " +
     "document par document, pour chaque compte supprime.");
note("8n. cote serveur, aucune fonction ne fait le menage : grep -rn \"deleteUser\\|onDelete\" " +
     "functions-a-deployer/*.js ne rend rien. Le seul nettoyage automatique est celui du " +
     "jeton push PERIME (notifications-push.js:58) — et il ne part jamais si le jeton a ete " +
     "vide par fbDisablePush (index.html:4748), puisque la fonction sort avant sur " +
     "`if (!token) return`.");


/* ══════════════════════════════════════════════════════════════════════════
   9. LE CORRECTIF, PROUVE SUR LE BANC
   Les regles autorisent DEJA le proprietaire a effacer ses trois documents de
   position. Il ne manque que trois lignes dans refsAEffacer (index.html:1556),
   AVANT deleteUser() — c'est l'ordre que la fonction s'impose elle-meme.
   ══════════════════════════════════════════════════════════════════════════ */
const dave = env.authenticatedContext("dave").firestore();
await doit("9a. Dave vit sa vie : profil, chasse, veille, notifications, presence", async () => {
  await fbSyncUserStats(dave, "dave", "Dave", [3], []);
  await fbJoinHunt(dave, "dave", 777, "Yakult", "🥛", PAR.lat, PAR.lng);
  await fbSyncWatch(dave, "dave", true, 777, "Yakult", PAR.lat, PAR.lng, 10);
  await fbEnablePush(dave, "dave", "jeton-fcm-dave", PAR.lat, PAR.lng);
  await fbHeartbeat(dave, "dave", "Dave", PAR.lat, PAR.lng);
});
await doit("9b. une suppression COMPLETE passe, avec le jeton encore valide : " +
           "users + shopClaims + presence + pushTokens + watches + son entree de chasse", async () => {
  await deleteDoc(doc(dave, "users", "dave"));
  await deleteDoc(doc(dave, "presence", "dave"));
  await deleteDoc(doc(dave, "pushTokens", "dave"));
  const mesVeilles = await getDocs(query(collection(dave, "watches"), where("uid", "==", "dave")));
  for (const d of mesVeilles.docs) await deleteDoc(d.ref);
  await updateDoc(doc(dave, "hunts", "777"), { "seekers.dave": null });   // index.html:4601 fbLeaveHunt
});
await doit("9c. plus rien de Dave n'est lisible", async () => {
  const reste = [];
  if ((await getDoc(doc(anon, "users", "dave"))).exists()) reste.push("users");
  if ((await getDoc(doc(chef, "presence", "dave"))).exists()) reste.push("presence");
  const h = (await getDoc(doc(anon, "hunts", "777"))).data() || {};
  if ((h.seekers || {}).dave) reste.push("hunts.seekers");
  if (reste.length) throw new Error("il reste : " + reste.join(", "));
});
note("9d. la seule difference entre Alice et Dave tient dans la liste refsAEffacer " +
     "(index.html:1556) : ajouter presence/{uid}, pushTokens/{uid}, les watches du " +
     "compte et fbLeaveHunt sur ses chasses actives suffit — les regles le permettent " +
     "deja, il faut juste le faire AVANT que deleteUser() retire l'identite.");

await bilan(env);
