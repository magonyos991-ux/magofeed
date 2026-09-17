/* ============================================================================
   VERIFICATION D'INTENTION — « le chercheur trop neuf ne valide rien »
   ----------------------------------------------------------------------------
   Question posee : BUG ou CHOIX ?

   Le garde-fou lui-meme est ECRIT NOIR SUR BLANC dans le depot :
     points-et-parrainage.js:308  const CHERCHEUR_AGE_MIN_J = 2;
                                  // un compte cree hier ne valide rien
     points-et-parrainage.js:341  // Un chercheur trop neuf ne valide rien :
                                  //   c'est le compte jetable du duo.
     points-et-parrainage.js:344  if (cree && Date.now() - cree < ...) return;
   Ce n'est donc pas un bug : le code fait exactement ce qui est annonce.

   Ce qui reste a mesurer, et que ce fichier mesure : ce que cette sortie
   LAISSE DERRIERE ELLE. Le depot s'est donne un journal pour ca —
   `alertesAdmin`, lu dans l'app par window.fbLireAlertesAdmin
   (index.html:4795), dont le commentaire dit : « C'est la reponse a "est-ce
   que l'evenement a seulement eu lieu ?", question qu'aucune notification
   manquante ne permettait de trancher. » Et notifications-push.js:176 et 229
   ecrivent bien une ligne a chacune de leurs sorties muettes.

   Fonctions rejouees a l'identique :
     index.html:1699-1703   creation du profil (createdAt: serverTimestamp)
     index.html:4545-4593   window.fbJoinHunt
     index.html:3316-3350   window.fbAddReport
     index.html:5129-5147   window.fbCoupsDeMain
     points-et-parrainage.js:320-385  crediterEntraide (copie INTEGRALE,
                                      branche « paire » comprise)
     points-et-parrainage.js:404-425  noterCoupDeMain
     notifications-push.js:165-181    la sortie « sans centre » de
                                      notifyHuntNearby (qui, elle, trace)
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-intention-entraide-muette");

const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

const BXL = { lat: 50.8676, lng: 4.3436 };
const BOISSON = 7, NOM = "Mountain Dew Spark";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };
const STORES = [MAGASIN];

/* ══ COPIES CONFORMES DE index.html ═════════════════════════════════════ */

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4545-4593 — window.fbJoinHunt (chemin nominal : le document
   n'existe pas encore, l'app finit par le creer avec setDoc). */
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
  try { await updateDoc(ref, maj); return "updateDoc direct"; }
  catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); return "updateDoc imbrique";
    } catch (e2) {
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
      return "setDoc creation";
    }
  }
}

/* index.html:3316-3350 — window.fbAddReport */
async function fbAddReport(db, uid, storeId, drinkId, type, plus) {
  const st = STORES.find((x) => String(x.id) === String(storeId));
  const extra = {};
  if (st) {
    if (st.name) extra.storeName = String(st.name).slice(0, 60);
    if (typeof st.lat === "number" && typeof st.lng === "number") {
      extra.lat = Math.round(st.lat * 100) / 100;
      extra.lng = Math.round(st.lng * 100) / 100;
    }
  }
  extra.tz = "Europe/Brussels";
  return await addDoc(collection(db, "reports"), Object.assign({
    storeId: storeId, drinkId: drinkId, type: type, by: uid || null,
    byPseudo: "Explorateur", createdAt: serverTimestamp(),
  }, extra, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
}

/* index.html:5129-5147 — window.fbCoupsDeMain */
async function fbCoupsDeMain(db, uid) {
  const snap = await getDocs(query(collection(db, "coupsDeMain", uid, "recus"), orderBy("at", "desc"), limit(12)));
  const out = [];
  snap.forEach((d) => { const x = d.data() || {}; out.push({ id: d.id, aidantPseudo: x.aidantPseudo || null, merci: x.merci === true }); });
  return out;
}

/* ══ COPIE CONFORME DU SERVEUR ══════════════════════════════════════════ */
/* points-et-parrainage.js:305-310 */
const POINTS_ENTRAIDE = 15, POINTS_ENTRAIDE_LOIN = 5;
const ENTRAIDE_FENETRE_J = 14, ENTRAIDE_MAX_PAIRE_30J = 3, CHERCHEUR_AGE_MIN_J = 2;
const DIST_MAX_M = 500;
/* points-et-parrainage.js:315-318 */
function surPlace(rep) {
  const m = /\|(\d+)$/.exec(String(rep.note || ""));
  const d = m ? Number(m[1]) : null;
  return d != null && d <= DIST_MAX_M;
}

/* points-et-parrainage.js:320-385 — INTEGRAL. Chaque ecriture passe par
   `ecrire`, qui la note : c'est la seule chose ajoutee au code d'origine. */
async function crediterEntraide(db, repId, journal) {
  const ecrire = async (chemin, valeurs) => { journal.push(chemin); await setDoc(doc(db, ...chemin.split("/")), valeurs, { merge: true }); };
  const repRef = doc(db, "reports", repId);
  const rep = (await getDoc(repRef)).data() || {};
  if (rep.type !== "stock" || !rep.by || !rep.storeId || rep.drinkId == null) return { sortie: "champs manquants (ligne 326)" };
  const creeA = rep.createdAt ? rep.createdAt.toMillis() : Date.now();
  const hs = await getDoc(doc(db, "hunts", String(rep.drinkId)));
  const seekers = hs.exists() ? ((hs.data() || {}).seekers || {}) : {};

  const autres = Object.keys(seekers).filter((u) =>
    seekers[u] && u !== rep.by && typeof seekers[u].at === "number" && seekers[u].at < creeA);
  if (autres.length) await ecrire("reports/" + repId, { hunt: true });

  const moi = seekers[rep.by];
  if (!moi || typeof moi.at !== "number") return { sortie: "l'auteur n'est pas chercheur (ligne 340)" };
  const u = await getDoc(doc(db, "users", rep.by));
  const cree = (u.exists() && u.data().createdAt && u.data().createdAt.toMillis) ? u.data().createdAt.toMillis() : 0;
  if (cree && Date.now() - cree < CHERCHEUR_AGE_MIN_J * 86400000) {
    return { sortie: "compte du chercheur trop neuf (ligne 344)" };
  }
  const depuis = creeA - ENTRAIDE_FENETRE_J * 86400000;
  const q = await getDocs(query(collection(db, "reports"), where("storeId", "==", rep.storeId), limit(60)));
  const aides = q.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .filter((o) => o.type === "stock" && o.hunt === true && o.by !== rep.by
      && String(o.drinkId) === String(rep.drinkId) && !o.huntCredited
      && o.createdAt && o.createdAt.toMillis() >= depuis
      && o.createdAt.toMillis() < creeA && moi.at < o.createdAt.toMillis())
    .sort((x, y) => x.createdAt.toMillis() - y.createdAt.toMillis());
  if (!aides.length) return { sortie: "aucune aide a crediter (ligne 358)" };
  const aide = aides[0];

  /* points-et-parrainage.js:361-375 — le plafond par paire */
  const paire = await getDocs(query(collection(db, "reports"),
    where("by", "==", aide.by), where("huntCreditedBy", "==", rep.by), limit(ENTRAIDE_MAX_PAIRE_30J + 2)));
  const recents = paire.docs.filter((d) => {
    const t = (d.data() || {}).huntCreditedAt;
    return t && t.toMillis() > Date.now() - 30 * 86400000;
  }).length;
  const marque = { huntCredited: true, huntCreditedBy: rep.by, huntCreditedAt: serverTimestamp() };
  if (recents >= ENTRAIDE_MAX_PAIRE_30J) {
    await ecrire("reports/" + aide.id, Object.assign({}, marque, { huntCreditedPts: 0, raison: "paire" }));
    return { sortie: "plafond par paire (ligne 372)" };
  }
  const montant = surPlace(rep) ? POINTS_ENTRAIDE : POINTS_ENTRAIDE_LOIN;
  /* crediter(), points-et-parrainage.js:139-158 */
  await ecrire("users/" + aide.by, { pointsPreuves: montant, dernierMotif: "entraide" });
  await ecrire("reports/" + aide.id, Object.assign({}, marque, { huntCreditedPts: montant }));
  /* noterCoupDeMain, points-et-parrainage.js:404-425 */
  const ua = await getDoc(doc(db, "users", aide.by));
  const da = ua.exists() ? (ua.data() || {}) : {};
  let pseudo = null;
  if (da.aideDiscrete !== true && typeof da.pseudo === "string") {
    pseudo = da.pseudo.slice(0, 24);
    if (pseudo === "Explorateur") pseudo = null;
  }
  const quand = aide.createdAt && aide.createdAt.toMillis
    ? Math.floor(aide.createdAt.toMillis() / 3600000) * 3600000
    : Math.floor(Date.now() / 3600000) * 3600000;
  await ecrire("coupsDeMain/" + rep.by + "/recus/" + aide.id, {
    aidantUid: pseudo ? String(aide.by) : null, aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId), storeId: String(aide.storeId || ""),
    at: quand, merci: false,
  });
  return { sortie: "credite (" + montant + " pts)" };
}

/* notifications-push.js:165-181 — la sortie « chasse sans position ».
   Elle aussi ne previent personne. Elle, elle laisse une ligne. */
async function notifyHuntNearby_sansCentre(db, after, journal) {
  journal.push("alertesAdmin (ligne 176)");
  await addDoc(collection(db, "alertesAdmin"), {
    titre: "Chasse « " + String(after.drinkName || "?").slice(0, 40) + " » : rien envoyé",
    corps: "La chasse a été lancée sans position (GPS pas encore prêt).",
    at: serverTimestamp(), pousseesEnvoyees: 0, jetonsTrouves: 0,
    courrielEnvoye: false, type: "hunt", drinkId: String(after.drinkId),
  });
}

/* ══ OUTIL DE MESURE : tout ce qu'un humain peut voir apres coup ═════════ */
async function etatVisible() {
  return await serveur(async (db) => {
    const lire = async (chemin) => {
      const s = await getDocs(collection(db, ...chemin.split("/")));
      return s.docs.map((d) => Object.assign({ _id: d.id }, d.data()));
    };
    const rep = await lire("reports");
    return {
      alertesAdmin: (await lire("alertesAdmin")).length,
      coupsDeMainAlice: (await lire("coupsDeMain/" + ALICE + "/recus")).length,
      userNotifs: (await lire("userNotifs")).length,
      rapports: rep.map((r) => ({
        par: r.by, type: r.type, hunt: r.hunt === true,
        huntCredited: r.huntCredited === true,
        huntCreditedPts: r.huntCreditedPts == null ? null : r.huntCreditedPts,
        raison: r.raison || null,
      })),
    };
  });
}
async function vider() {
  await serveur(async (db) => {
    for (const c of ["reports", "alertesAdmin", "userNotifs"]) {
      const s = await getDocs(collection(db, c));
      for (const d of s.docs) await deleteDoc(d.ref);
    }
    const s2 = await getDocs(collection(db, "coupsDeMain", ALICE, "recus"));
    for (const d of s2.docs) await deleteDoc(d.ref);
  });
}

/* ════════════════════════════════════════════════════════════════════════ */
/* A. LE PARCOURS REEL, AVEC DEUX COMPTES CREES AUJOURD'HUI                 */
/* ════════════════════════════════════════════════════════════════════════ */

/* index.html:1699-1703 — exactement ce que l'app ecrit a la 1re connexion. */
await doit("A1. Alice et Bob ouvrent l'app aujourd'hui : deux profils neufs (index.html:1699)", async () => {
  await setDoc(doc(alice, "users", ALICE), { pseudo: "Alice", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(bob, "users", BOB), { pseudo: "Bob", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
});

let repBob = null, repAlice = null, journalA = [];
await doit("A2. Alice lance la chasse, Bob signale, Alice confirme (le parcours du fondateur a deux telephones)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  await pause(40);
  repBob = await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "hunt|40" });
  await pause(40);
  repAlice = await fbAddReport(alice, ALICE, MAGASIN.id, BOISSON, "stock", { note: "tip|30" });
});

let verdictBob = null, verdictAlice = null;
await doit("A3. le serveur traite les deux rapports (points-et-parrainage.js:320)", async () => {
  await serveur(async (db) => {
    verdictBob = await crediterEntraide(db, repBob.id, journalA);
    verdictAlice = await crediterEntraide(db, repAlice.id, journalA);
  });
  verifier(verdictBob && verdictAlice, "le serveur n'a pas rendu de verdict");
});
note("A3. verdict sur le rapport de Bob   : " + verdictBob.sortie);
note("A3. verdict sur le rapport d'Alice  : " + verdictAlice.sortie);
note("A3. ecritures faites par le serveur : " + (journalA.length ? journalA.join(" + ") : "AUCUNE"));

const etatA = await etatVisible();
await doit("A4. le garde-fou fait ce qu'il annonce : Bob n'est pas credite (ligne 344, commentee ligne 341)", async () => {
  verifier(verdictAlice.sortie === "compte du chercheur trop neuf (ligne 344)", "autre sortie : " + verdictAlice.sortie);
  const r = etatA.rapports.find((x) => x.par === BOB);
  verifier(r && !r.huntCredited, "Bob a ete credite : " + JSON.stringify(r));
});

await doit("A5. CE QUI EST MESURE ICI : la sortie n'ecrit rien nulle part", async () => {
  verifier(etatA.alertesAdmin === 0, etatA.alertesAdmin + " ligne(s) dans alertesAdmin");
  verifier(etatA.coupsDeMainAlice === 0, "un coup de main a ete depose");
  verifier(etatA.userNotifs === 0, "une notification a ete deposee");
  const r = etatA.rapports.find((x) => x.par === BOB);
  verifier(r.raison === null && r.huntCreditedPts === null, "le rapport porte une raison : " + JSON.stringify(r));
});
note("A5. etat visible apres la sortie : alertesAdmin=" + etatA.alertesAdmin
  + " coupsDeMain(Alice)=" + etatA.coupsDeMainAlice + " userNotifs=" + etatA.userNotifs);
note("A5. rapport de Bob tel qu'un humain le lit : " + JSON.stringify(etatA.rapports.find((x) => x.par === BOB)));

/* ════════════════════════════════════════════════════════════════════════ */
/* B. TEMOIN : « personne n'a jamais confirme ». Meme trace ?               */
/* ════════════════════════════════════════════════════════════════════════ */
let etatB = null;
await doit("B1. temoin : Bob signale, et PERSONNE ne confirme jamais", async () => {
  await vider();
  await serveur(async (db) => { await setDoc(doc(db, "coupsDeMain", ALICE, "recus", "_"), { at: 0 }); await deleteDoc(doc(db, "coupsDeMain", ALICE, "recus", "_")); });
  const j = [];
  const r = await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "hunt|40" });
  await serveur(async (db) => { await crediterEntraide(db, r.id, j); });
  etatB = await etatVisible();
});
await doit("B2. les deux situations sont INDISCERNABLES dans la base", async () => {
  const a = etatA.rapports.find((x) => x.par === BOB);
  const b = etatB.rapports.find((x) => x.par === BOB);
  verifier(JSON.stringify(a) === JSON.stringify(b),
    "elles different : " + JSON.stringify(a) + " vs " + JSON.stringify(b));
});
note("B2. « refuse par le garde-fou » : " + JSON.stringify(etatA.rapports.find((x) => x.par === BOB)));
note("B2. « jamais confirme »         : " + JSON.stringify(etatB.rapports.find((x) => x.par === BOB)));

/* ════════════════════════════════════════════════════════════════════════ */
/* C. LA MEME FONCTION TRACE SON AUTRE REFUS (le plafond par paire)         */
/* ════════════════════════════════════════════════════════════════════════ */
let etatC = null, verdictC = null;
await doit("C1. comptes ages de 30 jours, trois aides deja creditees entre Bob et Alice", async () => {
  await vider();
  const vieux = new Date(Date.now() - 30 * 86400000);
  await serveur(async (db) => {
    await setDoc(doc(db, "users", ALICE), { createdAt: vieux }, { merge: true });
    await setDoc(doc(db, "users", BOB), { createdAt: vieux }, { merge: true });
    for (let i = 0; i < 3; i++) {
      await addDoc(collection(db, "reports"), {
        storeId: "autre-" + i, drinkId: 99, type: "stock", by: BOB, byPseudo: "Bob",
        createdAt: serverTimestamp(), hunt: true, huntCredited: true,
        huntCreditedBy: ALICE, huntCreditedAt: serverTimestamp(), huntCreditedPts: 15,
      });
    }
  });
});
await doit("C2. Bob signale, Alice confirme : la fonction atteint le plafond par paire (ligne 372)", async () => {
  const j = [];
  const rb = await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "hunt|40" });
  await pause(40);
  const ra = await fbAddReport(alice, ALICE, MAGASIN.id, BOISSON, "stock", { note: "tip|30" });
  await serveur(async (db) => {
    await crediterEntraide(db, rb.id, j);
    verdictC = await crediterEntraide(db, ra.id, j);
  });
  etatC = await etatVisible();
  verifier(verdictC.sortie === "plafond par paire (ligne 372)", "autre sortie : " + verdictC.sortie);
});
await doit("C3. CE REFUS-LA, LUI, s'ecrit : raison=\"paire\", huntCreditedPts=0", async () => {
  const r = etatC.rapports.find((x) => x.par === BOB && x.raison === "paire");
  verifier(r && r.huntCreditedPts === 0, "aucune trace du refus : " + JSON.stringify(etatC.rapports));
});
note("C3. rapport de Bob apres le refus « paire » : " + JSON.stringify(etatC.rapports.find((x) => x.raison === "paire")));

/* ════════════════════════════════════════════════════════════════════════ */
/* D. LA FONCTION VOISINE TRACE SA SORTIE MUETTE (notifications-push.js:176)*/
/* ════════════════════════════════════════════════════════════════════════ */
await doit("D1. notifyHuntNearby sort sans rien envoyer -> une ligne dans alertesAdmin", async () => {
  await vider();
  const j = [];
  await serveur(async (db) => { await notifyHuntNearby_sansCentre(db, { drinkId: BOISSON, drinkName: NOM }, j); });
  const e = await etatVisible();
  verifier(e.alertesAdmin === 1, "aucune ligne ecrite");
});
note("D1. index.html:4795 (window.fbLireAlertesAdmin) lit ce journal DANS l'app : "
  + "le fondateur voit la ligne de notifyHuntNearby, jamais celle de crediterEntraide.");

/* ════════════════════════════════════════════════════════════════════════ */
/* E. TEMOIN FINAL : le meme parcours avec des comptes de 30 jours          */
/* ════════════════════════════════════════════════════════════════════════ */
let verdictE = null, coupsE = null;
await doit("E1. avec des comptes de 30 jours, le parcours va au bout", async () => {
  await vider();
  await serveur(async (db) => {
    const s = await getDocs(collection(db, "reports"));
    for (const d of s.docs) await deleteDoc(d.ref);
  });
  const j = [];
  const rb = await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "hunt|40" });
  await pause(40);
  const ra = await fbAddReport(alice, ALICE, MAGASIN.id, BOISSON, "stock", { note: "tip|30" });
  await serveur(async (db) => {
    await crediterEntraide(db, rb.id, j);
    verdictE = await crediterEntraide(db, ra.id, j);
  });
  verifier(verdictE.sortie === "credite (15 pts)", "pas credite : " + verdictE.sortie);
  coupsE = await fbCoupsDeMain(alice, ALICE);
  verifier(coupsE.length === 1, "aucun coup de main chez Alice");
});
note("E1. coup de main recu par Alice : " + JSON.stringify(coupsE));
note("E1. seule difference entre A et E : l'age des deux comptes (2 jours).");

await bilan(env);
