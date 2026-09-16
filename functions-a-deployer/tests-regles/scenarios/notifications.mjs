/* ============================================================================
   LES NOTIFICATIONS : QUI EST PREVENU, DE QUOI, ET AVEC QUEL DROIT
   ----------------------------------------------------------------------------
   Toute la chaine d'alerte de Magofeed, rejouee telle que l'application
   l'ecrit reellement. Ce fichier n'invente aucune ecriture : chaque appel
   recopie a l'identique la fonction de index.html indiquee en commentaire
   (memes collections, memes champs, meme ordre, memes valeurs), et la passe
   aux VRAIES regles du depot via l'emulateur.

   Fonctions de l'application rejouees (numeros de ligne dans index.html) :
     _coarse                    4505
     window.fbJoinHunt          4545-4592
     window.fbEnablePush        4700-4736   (la partie Firestore)
     window.fbDisablePush       4746-4751
     window.fbUpdatePushRayon   4755-4761
     window.fbUpdatePushPosition 4766-4774
     window.fbGetMyPushDoc      4847-4856
     window.fbGetMyHuntsInfo    4858-4871
     window.fbTestPush          4874-4888
     window.fbSetEmailOptIn     4930-4939
     window.fbGetMyEmailProfile 4941-4957
     window.fbSyncWatch         5007-5027
     window.fbNotifyUser        5534-5540
     window.fbLoadMyNotifs      5541-5550
     window.fbMarkNotifRead     5551-5553
     setHuntRadius / HR_MIN / HR_MAX  14182-14240

   Cote serveur, l'emulateur n'execute PAS les Cloud Functions. On rejoue donc
   leur DECISION, mot pour mot, a partir du code deploye :
     pushToUser              functions-a-deployer/notifications-push.js:38-63
     notifyHuntNearby        functions-a-deployer/notifications-push.js:153-310
       - le rayon du destinataire                              ligne 284-285
       - le centre de la vague (position du chercheur)          ligne 168-169
     notifyStockToWatchers   functions-a-deployer/notifications-push.js:314-360
       - le rayon de la veille                                  ligne 346-347
     _dist                   functions-a-deployer/notifications-push.js:147-151
     (meme clamp de rayon duplique dans emails-brevo.js:314)

   Lecture du bilan : Firestore imprime des PERMISSION_DENIED en rouge meme
   quand c'est le comportement voulu. Seules les lignes ok/ECHEC comptent.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, addDoc,
  collection, query, where, limit, serverTimestamp,
} from "firebase/firestore";

const ALICE = "alice", BOB = "bob", ADMIN = "patron";

const env = await banc("notifications");
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();
const admin = env.authenticatedContext(ADMIN).firestore();

/* Les Cloud Functions utilisent l'Admin SDK : elles ignorent les regles.
   C'est ce que reproduit withSecurityRulesDisabled. */
async function serveur(fn) {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
}

/* ── Le code de l'application, recopie ──────────────────────────────────── */

// index.html:4505
function _coarse(x) { return Math.round(x * 10) / 10; }

// index.html:14182-14185
const HR_MIN = 1, HR_MAX = 50;
let magoHuntRadius = 10;                       // valeur par defaut de l'app
function _hrClamp(km) { km = Math.round(Number(km)); if (!(km >= HR_MIN)) km = HR_MIN; if (km > HR_MAX) km = HR_MAX; return km; }

// index.html:5007 — fbSyncWatch. Le try/catch de l'original avale l'erreur
// (console.warn) ; ici on la laisse remonter, sinon le banc ne verrait rien.
async function fbSyncWatch(db, uid, add, drinkId, drinkName, lat, lng) {
  const wid = uid + "_" + drinkId;
  if (add) {
    const radius = Number(magoHuntRadius) || 10;
    await setDoc(doc(db, "watches", wid), {
      uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
      lat: lat != null ? lat : null, lng: lng != null ? lng : null,
      radius: radius,
      createdAt: serverTimestamp()
    });
  } else {
    await deleteDoc(doc(db, "watches", wid));
  }
}

// index.html:5534 — fbNotifyUser
async function fbNotifyUser(db, uid, notif) {
  return addDoc(collection(db, "userNotifs"), Object.assign(
    { to: String(uid), read: false, createdAt: serverTimestamp() }, notif || {}));
}

// index.html:5541 — fbLoadMyNotifs (limit 20, AUCUN orderBy, tri cote client)
async function fbLoadMyNotifs(db, uid) {
  const snap = await getDocs(query(collection(db, "userNotifs"), where("to", "==", uid), limit(20)));
  const rows = [];
  snap.forEach(function (d) { const x = d.data(); x.docId = d.id; rows.push(x); });
  rows.sort(function (a, b) { return (b.createdAt && b.createdAt.seconds || 0) - (a.createdAt && a.createdAt.seconds || 0); });
  return rows;
}

// index.html:5551 — fbMarkNotifRead
async function fbMarkNotifRead(db, docId) {
  return updateDoc(doc(db, "userNotifs", String(docId)), { read: true });
}

// index.html:4700-4736 — fbEnablePush, sa seule ecriture Firestore
async function fbEnablePush(db, uid, token, lat, lng) {
  const _payload = { token: token, updatedAt: serverTimestamp() };
  if (lat != null && lng != null) { _payload.lat = lat; _payload.lng = lng; }
  return setDoc(doc(db, "pushTokens", uid), _payload, { merge: true });
}
// index.html:4746 — fbDisablePush
async function fbDisablePush(db, uid) {
  return setDoc(doc(db, "pushTokens", uid), { token: null, updatedAt: serverTimestamp() }, { merge: true });
}
// index.html:4755 — fbUpdatePushRayon
async function fbUpdatePushRayon(db, uid, km) {
  const r = Math.max(1, Math.min(50, Math.round(Number(km) || 10)));
  return setDoc(doc(db, "pushTokens", uid), { rayon: r, updatedAt: serverTimestamp() }, { merge: true });
}
// index.html:4766 — fbUpdatePushPosition
async function fbUpdatePushPosition(db, uid, lat, lng) {
  const _r = Math.max(1, Math.min(50, Math.round(Number(magoHuntRadius) || 10)));
  return setDoc(doc(db, "pushTokens", uid), { lat: lat, lng: lng, rayon: _r, updatedAt: serverTimestamp() }, { merge: true });
}
// index.html:4847 — fbGetMyPushDoc
async function fbGetMyPushDoc(db, uid) {
  const s = await getDoc(doc(db, "pushTokens", uid));
  if (!s.exists()) return { exists: false, uid: uid };
  const d = s.data() || {};
  return { exists: true, uid: uid, hasToken: !!d.token, lat: (d.lat != null ? d.lat : null), lng: (d.lng != null ? d.lng : null) };
}
// index.html:4858 — fbGetMyHuntsInfo
async function fbGetMyHuntsInfo(db, uid) {
  const snap = await getDocs(query(collection(db, "hunts"), limit(200)));
  let total = 0, mineTotal = 0, mineWithPos = 0;
  snap.forEach(function (dd) {
    const h = dd.data() || {}; const seekers = h.seekers || {}; total++;
    const mine = seekers[uid];
    if (mine) { mineTotal++; if (mine.lat != null) mineWithPos++; }
  });
  return { totalHunts: total, mineTotal: mineTotal, mineWithPos: mineWithPos };
}
// index.html:4930 — fbSetEmailOptIn
async function fbSetEmailOptIn(db, uid, optIn) {
  return setDoc(doc(db, "users", uid), { emailOptIn: !!optIn }, { merge: true });
}
// index.html:4941 — fbGetMyEmailProfile, sa partie Firestore
async function fbGetMyEmailProfile(db, uid) {
  const snap = await getDoc(doc(db, "users", uid));
  const d = snap.exists() ? (snap.data() || {}) : {};
  return { exists: snap.exists(), uid: uid, optIn: d.emailOptIn === true, emailEnBase: d.email || null };
}
// index.html:4545 — fbJoinHunt : la cascade updateDoc -> chemins pointes -> setDoc
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp()
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
        seekers: (function () { const o = {}; o[uid] = moi; return o; })()
      }, commun));
    }
  }
  return pos;
}

/* ── Le code du SERVEUR, recopie ────────────────────────────────────────── */

// notifications-push.js:147-151
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}
// notifications-push.js:346 (et emails-brevo.js:314, a l'identique)
function rayonVeilleServeur(wd) {
  return (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
}
// notifications-push.js:284
function rayonChasseServeur(t) {
  return Math.max(1, Math.min(50, Number(t.rayon) || 15));
}
/* notifications-push.js:38-63 — pushToUser. Sans jeton, elle sort en silence
   et n'ecrit RIEN (« pas de token = pas de push, tant pis, l'in-app suffit »). */
async function pushToUserServeur(db, uid) {
  const snap = await db.collection("pushTokens").doc(String(uid)).get();
  const token = snap.exists && snap.data().token;
  if (!token) return { envoye: false, raison: "pas-de-jeton" };
  return { envoye: true, token: token };
}
/* notifications-push.js:314-360 — notifyStockToWatchers, sa boucle de decision. */
async function notifyStockToWatchers(db, drinkId, sLat, sLng) {
  const prevenus = [], ignores = [];
  const snap = await db.collection("watches").where("drinkId", "==", Number(drinkId) || drinkId).limit(200).get();
  for (const w of snap.docs) {
    const wd = w.data();
    if (!wd.uid || !String(w.id).startsWith(String(wd.uid) + "_")) { ignores.push({ uid: wd.uid, raison: "uid ne colle pas au nom du document" }); continue; }
    const radius = rayonVeilleServeur(wd);
    const d = _dist(sLat, sLng, wd.lat, wd.lng);
    if (sLat != null && wd.lat != null && d > radius) { ignores.push({ uid: wd.uid, raison: "trop loin", choisi: wd.radius, applique: radius, distance: d }); continue; }
    prevenus.push({ uid: wd.uid, choisi: wd.radius, applique: radius, distance: d });
  }
  return { prevenus: prevenus, ignores: ignores };
}

/* ── Le terrain ─────────────────────────────────────────────────────────── */
const ALICE_LAT = 50.8466, ALICE_LNG = 4.3528;   // Bruxelles centre
const MAG_15KM_LAT = ALICE_LAT + 0.135;          // ~15 km au nord
const MAG_8KM_LAT = ALICE_LAT + 0.072;           // ~8 km au nord
const BOISSON = 4242, BOISSON_NOM = "Fritz-Kola sans sucre";

await serveur(async (db) => {
  await db.collection("admins").doc(ADMIN).set({ ok: true });
  // Un magasin, pour que le parcours ait un lieu.
  await db.collection("stores").doc("mag-nord").set({ name: "Night Shop du Nord", lat: MAG_15KM_LAT, lng: ALICE_LNG, drinks: [] });
});

/* ══ ACTE 1 — Alice suit une boisson, Bob la repere ════════════════════════ */

magoHuntRadius = _hrClamp(50);   // setHuntRadius(50), index.html:14214
await doit("Alice met sa zone a 50 km et suit « " + BOISSON_NOM + " » (fbSyncWatch)", async () => {
  await fbSyncWatch(alice, ALICE, true, BOISSON, BOISSON_NOM, ALICE_LAT, ALICE_LNG);
});
await doit("Alice relit sa propre veille", async () => {
  const s = await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON));
  if (!s.exists()) throw new Error("veille absente");
  if (s.data().radius !== 50) throw new Error("rayon ecrit = " + s.data().radius);
});
await doitEchouer("Bob lit la veille d'Alice", async () => {
  await getDoc(doc(bob, "watches", ALICE + "_" + BOISSON));
});
await doitEchouer("Bob cree une veille au nom d'Alice", async () => {
  await setDoc(doc(bob, "watches", BOB + "_" + BOISSON), {
    uid: ALICE, drinkId: BOISSON, drinkName: BOISSON_NOM,
    lat: ALICE_LAT, lng: ALICE_LNG, radius: 10, createdAt: serverTimestamp()
  });
});
await doitEchouer("Bob repointe la veille d'Alice vers lui", async () => {
  await updateDoc(doc(bob, "watches", ALICE + "_" + BOISSON), { uid: BOB });
});
await doitEchouer("Bob efface la veille d'Alice (extinction silencieuse de son alerte)", async () => {
  await deleteDoc(doc(bob, "watches", ALICE + "_" + BOISSON));
});

/* Bob repere la boisson chez « Night Shop du Nord », a 15 km d'Alice.
   C'est notifyStockToWatchers qui decide qui est prevenu. */
let verdict15 = null;
await doit("Alice, qui a choisi 50 km, est prevenue d'une boisson reperee a 15 km", async () => {
  verdict15 = await serveur((db) => notifyStockToWatchers(db, BOISSON, MAG_15KM_LAT, ALICE_LNG));
  if (!verdict15.prevenus.length) {
    const i = verdict15.ignores[0] || {};
    throw new Error("personne n'est prevenu — rayon choisi " + i.choisi + " km, rayon applique " + i.applique + " km, distance " + (i.distance || 0).toFixed(1) + " km");
  }
});
note("notifications-push.js:346 — rayon choisi 50 km, rayon applique par le serveur "
  + rayonVeilleServeur({ radius: 50 }) + " km. Le clamp n'accepte que 1..20 ; au-dela il retombe sur 10. "
  + "Le curseur de l'app va de " + HR_MIN + " a " + HR_MAX + " km (index.html:14182).");
note("Table du rayon reellement applique : choisi 1->" + rayonVeilleServeur({ radius: 1 })
  + ", 10->" + rayonVeilleServeur({ radius: 10 })
  + ", 20->" + rayonVeilleServeur({ radius: 20 })
  + ", 21->" + rayonVeilleServeur({ radius: 21 })
  + ", 30->" + rayonVeilleServeur({ radius: 30 })
  + ", 50->" + rayonVeilleServeur({ radius: 50 })
  + " km. Choisir PLUS grand que 20 rend la zone PLUS PETITE que choisir 20.");

await doit("la meme boisson reperee a 8 km, elle, la previent bien", async () => {
  const v = await serveur((db) => notifyStockToWatchers(db, BOISSON, MAG_8KM_LAT, ALICE_LNG));
  if (!v.prevenus.length) throw new Error("personne n'est prevenu a 8 km non plus");
});

/* Le recoupement uid / nom de document (notifications-push.js:344) tient-il ? */
await doit("une veille dont le champ uid a ete repointe est ignoree par le serveur", async () => {
  await serveur(async (db) => { await db.collection("watches").doc(BOB + "_9001").set({ uid: ALICE, drinkId: 9001, drinkName: "piege", lat: ALICE_LAT, lng: ALICE_LNG, radius: 10 }); });
  const v = await serveur((db) => notifyStockToWatchers(db, 9001, ALICE_LAT, ALICE_LNG));
  if (v.prevenus.length) throw new Error("le serveur a prevenu " + v.prevenus[0].uid + " a partir d'une veille repointee");
});

/* Alice n'a PAS active les notifications push (c'est l'etat par defaut de
   l'app : il faut appuyer sur l'interrupteur). Que lui reste-t-il ? */
await doit("Alice sans jeton push retrouve quand meme l'alerte dans sa boite in-app", async () => {
  const p = await serveur((db) => pushToUserServeur(db, ALICE));
  if (p.envoye) throw new Error("jeton present : ce test doit tourner avant l'acte 5");
  // pushToUser est sortie en silence. Reste-t-il une trace lisible par Alice ?
  const rows = await fbLoadMyNotifs(alice, ALICE);
  const found = rows.filter((r) => r.type === "found");
  if (!found.length)
    throw new Error("aucun message in-app : pushToUser n'ecrit rien (notifications-push.js:44) "
      + "et aucune fonction serveur ne cree de userNotifs de type \"found\" — Alice n'apprend jamais que sa boisson a ete trouvee");
});

/* ══ ACTE 2 — La boite de notifications : qui lit quoi ═════════════════════ */

let notifAlice = null, notifBob = null;
await doit("l'administrateur previent Alice (fbNotifyUser)", async () => {
  const r = await fbNotifyUser(admin, ALICE, {
    type: "promoted", title: "Ta decouverte est dans Magofeed !",
    body: "« " + BOISSON_NOM + " » fait maintenant partie du catalogue.", drinkId: BOISSON
  });
  notifAlice = r.id;
});
await doit("l'administrateur previent Bob", async () => {
  const r = await fbNotifyUser(admin, BOB, { type: "photoRejected", title: "Photo a refaire", body: "Ta photo ne correspondait pas." });
  notifBob = r.id;
});
await doit("Alice lit ses notifications et ne voit que les siennes (fbLoadMyNotifs)", async () => {
  const rows = await fbLoadMyNotifs(alice, ALICE);
  if (rows.length !== 1) throw new Error("elle en voit " + rows.length);
  if (rows[0].to !== ALICE) throw new Error("destinataire " + rows[0].to);
});
await doitEchouer("Alice lit la boite de Bob (requete to == bob)", async () => {
  await getDocs(query(collection(alice, "userNotifs"), where("to", "==", BOB), limit(20)));
});
await doitEchouer("Alice ouvre directement le document de notification de Bob", async () => {
  await getDoc(doc(alice, "userNotifs", notifBob));
});
await doitEchouer("Alice liste toute la collection userNotifs", async () => {
  await getDocs(query(collection(alice, "userNotifs"), limit(20)));
});
await doitEchouer("un visiteur non connecte lit la boite d'Alice", async () => {
  await getDocs(query(collection(anon, "userNotifs"), where("to", "==", ALICE), limit(20)));
});

/* ══ ACTE 3 — Bob se fait-il passer pour l'application ? ═══════════════════ */

await doitEchouer("Bob ecrit une notification a Alice en se faisant passer pour Magofeed", async () => {
  await fbNotifyUser(bob, ALICE, { type: "promoted", title: "Ta decouverte est dans Magofeed !", body: "Clique ici pour reclamer tes 500 points : http://exemple" });
});
await doitEchouer("Bob s'ecrit une notification a lui-meme", async () => {
  await fbNotifyUser(bob, BOB, { type: "promoted", title: "Bravo", body: "auto-felicitation" });
});
await doitEchouer("un visiteur non connecte ecrit une notification a Alice", async () => {
  await fbNotifyUser(anon, ALICE, { type: "info", title: "x", body: "y" });
});
await doitEchouer("Bob efface une notification d'Alice", async () => {
  await deleteDoc(doc(bob, "userNotifs", notifAlice));
});
await doitEchouer("Alice efface sa propre notification", async () => {
  await deleteDoc(doc(alice, "userNotifs", notifAlice));
});

/* Longueur et forme : les regles valident-elles ce qui est ecrit ? */
let tailleAdmin = 0;
await doit("mesure : longueur maximale acceptee pour le corps d'une notification", async () => {
  const gros = "x".repeat(60000);
  const r = await fbNotifyUser(admin, ALICE, { type: "info", title: "T".repeat(5000), body: gros });
  tailleAdmin = gros.length;
  await serveur(async (db) => { await db.collection("userNotifs").doc(r.id).delete(); });
});
note("userNotifs : les regles (firestore.rules:307-312) ne verifient NI la longueur, NI la "
  + "presence de `to`/`title`/`body`, NI leur type. Un corps de " + tailleAdmin + " caracteres passe. "
  + "Seul l'administrateur peut creer, donc ce n'est pas une porte ouverte — mais rien ne borne "
  + "ce que l'app affichera.");

/* ══ ACTE 4 — Marquer une notification comme lue ═══════════════════════════ */

await doitEchouer("Bob marque lue la notification d'Alice", async () => {
  await fbMarkNotifRead(bob, notifAlice);
});
await doitEchouer("Alice marque lue la notification de Bob", async () => {
  await fbMarkNotifRead(alice, notifBob);
});
await doit("Alice marque SA notification comme lue (fbMarkNotifRead)", async () => {
  await fbMarkNotifRead(alice, notifAlice);
  const s = await getDoc(doc(alice, "userNotifs", notifAlice));
  if (s.data().read !== true) throw new Error("read = " + s.data().read);
});
await doitEchouer("Alice reecrit le texte de sa propre notification", async () => {
  await updateDoc(doc(alice, "userNotifs", notifAlice), { body: "texte remplace" });
});
await doitEchouer("Alice se redirige une notification (changement du destinataire)", async () => {
  await updateDoc(doc(alice, "userNotifs", notifAlice), { to: BOB });
});

/* ══ ACTE 5 — Vingt-cinq notifications, vingt places ═══════════════════════ */

const idsCrees = [];
await doit("l'administrateur envoie 25 notifications a Alice", async () => {
  for (let i = 1; i <= 25; i++) {
    const r = await fbNotifyUser(admin, ALICE, { type: "info", title: "Message " + i, body: "corps " + i, rang: i });
    idsCrees.push(r.id);
  }
});
let rendus = [], manquants = [], rangsRendus = [];
await doit("avec 26 notifications en boite, Alice voit bien les 20 PLUS RECENTES", async () => {
  const rows = await fbLoadMyNotifs(alice, ALICE);
  rendus = rows.map((r) => r.docId);
  rangsRendus = rows.map((r) => (r.rang == null ? 0 : r.rang));
  const vingtDernieres = idsCrees.slice(-20);
  manquants = vingtDernieres.filter((id) => rendus.indexOf(id) === -1);
  if (manquants.length)
    throw new Error(manquants.length + " des 20 dernieres notifications sont absentes de la boite "
      + "(fbLoadMyNotifs, index.html:5543 : limit(20) SANS orderBy — Firestore rend les 20 premiers "
      + "identifiants, le tri par date n'arrive qu'apres)");
});
{
  // Les 26 documents d'Alice : la notification de l'acte 2, puis les 25 de l'acte 5.
  const tous = [notifAlice].concat(idsCrees);
  const vingtPlusPetits = tous.slice().sort().slice(0, 20);
  const memeQueTriId = rendus.length === 20 && rendus.every((id) => vingtPlusPetits.indexOf(id) !== -1);
  note("Boite d'Alice : " + tous.length + " notifications en base, " + rendus.length + " rendues. "
    + "Les identifiants rendus sont-ils exactement les 20 plus petits (ordre __name__, celui que "
    + "Firestore applique a defaut d'orderBy) ? " + (memeQueTriId ? "OUI" : "NON") + ". "
    + "Rangs de creation rendus (0 = la notification de l'acte 2) : "
    + rangsRendus.slice().sort((a, b) => a - b).join(",") + ".");
  note("Notifications recentes perdues : " + manquants.length + " sur les 20 dernieres. "
    + "Une 26e notification a " + (rendus.indexOf(idsCrees[idsCrees.length - 1]) === -1 ? "DISPARU" : "survecu")
    + " — le tirage depend de l'identifiant aleatoire, pas de la date.");
}
{
  const rows = await fbLoadMyNotifs(alice, ALICE);
  const secondes = new Set(rows.map((r) => (r.createdAt && r.createdAt.seconds) || 0));
  note("Tri cote client (index.html:5547) : il compare createdAt.seconds, a la SECONDE. "
    + rows.length + " notifications rendues se partagent " + secondes.size + " valeur(s) de seconde distinctes : "
    + "celles qui tombent dans la meme seconde ne sont pas ordonnees.");
}

/* ══ ACTE 6 — Le jeton push : qui le lit, qui l'ecrit ══════════════════════ */

const JETON = "fXxAlIcEt0k3n:APA91b" + "z".repeat(120);
await doit("Alice enregistre son jeton push et sa position (fbEnablePush)", async () => {
  await fbEnablePush(alice, ALICE, JETON, ALICE_LAT, ALICE_LNG);
});
await doitEchouer("Bob lit le jeton push d'Alice (vol de jeton)", async () => {
  await getDoc(doc(bob, "pushTokens", ALICE));
});
await doitEchouer("un visiteur non connecte lit le jeton push d'Alice", async () => {
  await getDoc(doc(anon, "pushTokens", ALICE));
});
await doitEchouer("Bob liste la collection des jetons push", async () => {
  await getDocs(query(collection(bob, "pushTokens"), limit(50)));
});
await doitEchouer("Bob remplace le jeton d'Alice par le sien (detournement de ses alertes)", async () => {
  await setDoc(doc(bob, "pushTokens", ALICE), { token: "jeton-de-bob" }, { merge: true });
});
await doitEchouer("Bob efface le document push d'Alice (extinction de ses alertes)", async () => {
  await deleteDoc(doc(bob, "pushTokens", ALICE));
});
await doitEchouer("Bob deplace Alice sur la carte (ecriture de sa position)", async () => {
  await setDoc(doc(bob, "pushTokens", ALICE), { lat: 0, lng: 0 }, { merge: true });
});
await doit("Alice relit son propre document push (fbGetMyPushDoc)", async () => {
  const p = await fbGetMyPushDoc(alice, ALICE);
  if (!p.exists || !p.hasToken) throw new Error("document push incomplet : " + JSON.stringify(p));
});
await doit("l'administrateur ne peut pas lire les jetons push des membres", async () => {
  try { await getDoc(doc(admin, "pushTokens", ALICE)); }
  catch (e) { return; }
  throw new Error("l'administrateur a lu le jeton d'Alice (firestore.rules:221 dit pourtant isSelf)");
});
await doit("le bouton « Tester la notification » n'envoie qu'a soi-meme", async () => {
  // fbTestPush (index.html:4874) appelle sendTestPush, qui lit
  // pushTokens/{req.auth.uid} et rien d'autre (notifications-push.js:70-79).
  // Non rejouable ici : l'emulateur Firestore n'execute pas les Cloud Functions.
  // On verifie au moins qu'il n'existe aucun chemin Firestore pour viser autrui.
  const p = await fbGetMyPushDoc(bob, BOB);
  if (p.exists && p.hasToken) throw new Error("Bob a deja un jeton, le test perd son sens");
});

/* ══ ACTE 7 — Le rayon de la chasse de zone ════════════════════════════════ */

/* Alice n'a jamais bouge le curseur : l'app repart de sa valeur par defaut,
   window.magoHuntRadius = 10 (index.html:14183). */
magoHuntRadius = 10;

/* Alice vient d'activer le push (acte 6) sans avoir jamais bouge le curseur :
   fbEnablePush (index.html:4727-4729) ecrit token + lat/lng, mais PAS `rayon`.
   Seuls setHuntRadius (14233) et fbUpdatePushPosition (4771) le posent. */
await doit("Alice active le push sans toucher au curseur : le serveur honore ses 10 km affiches", async () => {
  const s = await getDoc(doc(alice, "pushTokens", ALICE));
  const t = s.data() || {};
  if ("rayon" in t) throw new Error("fbEnablePush a ecrit un rayon : ce test n'a plus de sens");
  const applique = rayonChasseServeur(t);
  if (applique !== 10)
    throw new Error("l'app affiche « Ta zone : 10 km » (index.html:14183) mais le serveur applique "
      + applique + " km : fbEnablePush n'ecrit pas `rayon`, et notifications-push.js:284 retombe sur 15");
});
await doit("le premier point GPS repare l'ecart (fbUpdatePushPosition ecrit le rayon)", async () => {
  await fbUpdatePushPosition(alice, ALICE, ALICE_LAT, ALICE_LNG);
  const s = await getDoc(doc(alice, "pushTokens", ALICE));
  const applique = rayonChasseServeur(s.data() || {});
  if (applique !== 10) throw new Error("rayon applique " + applique + " km au lieu de 10");
});

await doit("Alice bouge le curseur a 25 km : le serveur honore 25 km", async () => {
  magoHuntRadius = _hrClamp(25);
  await fbUpdatePushRayon(alice, ALICE, magoHuntRadius);   // setHuntRadius, index.html:14233
  const s = await getDoc(doc(alice, "pushTokens", ALICE));
  const applique = rayonChasseServeur(s.data() || {});
  if (applique !== 25) throw new Error("rayon applique " + applique + " km au lieu de 25");
});

/* Le rayon le plus fin que le curseur propose est 1 km. Le centre de la vague,
   lui, est la position ARRONDIE du chercheur (_coarse, index.html:4549). */
await doit("Alice, zone reglee sur 1 km, est prevenue d'une chasse lancee a 300 m de chez elle", async () => {
  magoHuntRadius = _hrClamp(HR_MIN);
  await fbUpdatePushRayon(alice, ALICE, magoHuntRadius);
  const bobLat = ALICE_LAT + 0.0027, bobLng = ALICE_LNG;          // ~300 m au nord
  const centre = { lat: _coarse(bobLat), lng: _coarse(bobLng) };  // ce que fbJoinHunt ecrit
  const s = await getDoc(doc(alice, "pushTokens", ALICE));
  const t = s.data() || {};
  const rayon = rayonChasseServeur(t);
  const d = _dist(centre.lat, centre.lng, t.lat, t.lng);
  if (d > rayon)
    throw new Error("Bob est a 0.3 km d'Alice, mais le centre de la vague est arrondi a "
      + centre.lat + "," + centre.lng + " — soit " + d.toFixed(2) + " km d'elle, pour un rayon de "
      + rayon + " km. Elle n'est pas prevenue.");
});
note("_coarse (index.html:4505) arrondit la position du chercheur au dixieme de degre, "
  + "soit jusqu'a " + _dist(_coarse(ALICE_LAT), _coarse(ALICE_LNG), ALICE_LAT, ALICE_LNG).toFixed(1)
  + " km d'ecart ici. Le curseur, lui, descend jusqu'a " + HR_MIN + " km (index.html:14182).");

/* ══ ACTE 8 — Bob peut-il envoyer le texte de son choix a tout le monde ? ═══ */

await doit("Alice lance une chasse sur « " + BOISSON_NOM + " » (fbJoinHunt)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, BOISSON_NOM, "🥤", ALICE_LAT, ALICE_LNG);
  const s = await getDoc(doc(alice, "hunts", String(BOISSON)));
  if (!s.exists() || !(s.data().seekers || {})[ALICE]) throw new Error("Alice n'est pas inscrite");
});
await doitEchouer("Bob renomme la chasse d'Alice sans meme y participer", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkName: "Heineken 33cl — 5% vol." });
});
let corpsPousse = "";
await doitEchouer("Bob fait partir vers les telephones alentour un texte de son choix", async () => {
  // Exactement fbJoinHunt, avec un drinkName choisi par lui.
  const texte = "Heineken 33cl a 0,89€ — promo ce soir, va voir sur pari-gagnant.example";
  await fbJoinHunt(bob, BOB, BOISSON, texte, "🍺", ALICE_LAT + 0.002, ALICE_LNG);
  const s = await serveur((db) => db.collection("hunts").doc(String(BOISSON)).get());
  const name = String((s.data() || {}).drinkName || "une boisson").slice(0, 40);   // notifications-push.js:189
  corpsPousse = "Quelqu'un cherche « " + name + " ». Si tu la vois en magasin, signale-la et gagne des points.";
});
note("Ce que la Cloud Function enverrait alors (notifications-push.js:296-297), a jusqu'a 3000 "
  + "appareils (limite de la boucle, ligne 268) : titre « Chasse pres de toi », corps « " + corpsPousse + " ».");
await doitEchouer("Bob ecrit un nom de chasse de 5000 caracteres", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkName: "A".repeat(5000) });
});
await doitEchouer("Bob eteint l'anti-spam du serveur (_meta/huntPush_u_bob)", async () => {
  await setDoc(doc(bob, "_meta", "huntPush_u_" + BOB), { at: Date.now() + 86400000 });
});
await doitEchouer("Bob ecrit _lastPush dans une chasse", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { _lastPush: Date.now() });
});
let nbChasses = 0;
await doit("mesure : combien de chasses un seul compte peut-il creer d'affilee ?", async () => {
  for (let i = 0; i < 8; i++) {
    await fbJoinHunt(bob, BOB, 7000 + i, "boisson " + i, "🥤", ALICE_LAT, ALICE_LNG);
    nbChasses++;
  }
});
note("Cote regles, un compte a cree " + nbChasses + " chasses d'affilee sans aucune limite "
  + "(firestore.rules:1085-1100). Le frein existe, mais il est cote serveur : _meta/huntPush_u_<uid>, "
  + "45 min par compte et 6 h par boisson (notifications-push.js:244-249), hors de portee du client — verifie ci-dessus.");
await doit("Alice relit le diagnostic de ses chasses (fbGetMyHuntsInfo)", async () => {
  const info = await fbGetMyHuntsInfo(alice, ALICE);
  if (info.mineTotal < 1) throw new Error("ses propres chasses sont invisibles : " + JSON.stringify(info));
});
await doit("un visiteur non connecte peut lire la liste des chercheurs et leurs positions", async () => {
  const snap = await getDocs(query(collection(anon, "hunts"), limit(200)));
  let uids = 0;
  snap.forEach((d) => { uids += Object.keys((d.data() || {}).seekers || {}).length; });
  note("hunts est en lecture publique (firestore.rules:1086) : " + snap.size + " chasse(s), "
    + uids + " entree(s) de chercheur lisibles sans compte (uid + position arrondie + date).");
});

/* ══ ACTE 9 — L'option e-mail ══════════════════════════════════════════════ */

await doit("Alice donne son consentement e-mail (fbSetEmailOptIn)", async () => {
  await fbSetEmailOptIn(alice, ALICE, true);
  const p = await fbGetMyEmailProfile(alice, ALICE);
  if (!p.optIn) throw new Error("consentement non enregistre");
});
await doitEchouer("Bob inscrit Alice aux e-mails a son insu", async () => {
  await setDoc(doc(bob, "users", ALICE), { emailOptIn: true }, { merge: true });
});
await doitEchouer("Bob desinscrit Alice des e-mails", async () => {
  await updateDoc(doc(bob, "users", ALICE), { emailOptIn: false });
});
await doitEchouer("Bob pose une adresse e-mail sur le profil public d'Alice", async () => {
  await setDoc(doc(bob, "users", ALICE), { email: "victime@exemple.be" }, { merge: true });
});
await doitEchouer("Alice pose sa propre adresse sur son profil public", async () => {
  await setDoc(doc(alice, "users", ALICE), { email: "alice@exemple.be" }, { merge: true });
});
await doit("l'adresse e-mail d'Alice n'est nulle part dans la base", async () => {
  const p = await fbGetMyEmailProfile(alice, ALICE);
  if (p.emailEnBase) throw new Error("adresse trouvee sur le profil : " + p.emailEnBase);
});
await doit("Bob ne peut pas lire l'adresse e-mail d'Alice", async () => {
  const s = await getDoc(doc(bob, "users", ALICE));   // users est en lecture publique
  const d = s.exists() ? (s.data() || {}) : {};
  if (d.email) throw new Error("Bob a lu " + d.email);
});
await doit("Alice retire son consentement (fbSetEmailOptIn(false))", async () => {
  await fbSetEmailOptIn(alice, ALICE, false);
  const p = await fbGetMyEmailProfile(alice, ALICE);
  if (p.optIn) throw new Error("consentement toujours actif");
});
{
  const s = await getDoc(doc(anon, "users", ALICE));
  const d = s.exists() ? (s.data() || {}) : {};
  note("users/{uid} est en lecture publique (firestore.rules:140, pour le classement). "
    + "Un visiteur NON CONNECTE lit donc le consentement e-mail d'Alice : emailOptIn = "
    + String(d.emailOptIn) + ". L'adresse, elle, reste dans Firebase Auth et n'est pas lisible.");
}

await bilan(env);
