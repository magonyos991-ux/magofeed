/* ============================================================================
   VERIFICATION DE REPRODUCTION
   « L'app annonce "✓ Stock confirme · +3 pts" meme quand l'ecriture est refusee »
   ----------------------------------------------------------------------------
   La preuve citee (scenarios/chasse-bout-en-bout.mjs) montre seulement que les
   regles REFUSENT le signalement sans compte ; la partie « l'ecran ment » y est
   une simple `note()`. Ce fichier la transforme en ASSERTION : on rejoue le
   geste complet de confirmWithPrice, on garde ce que l'ecran a dit, puis on
   compare a ce que la base contient vraiment.

   Fonctions rejouees a l'identique (numeros de ligne dans index.html) :
     confirmWithPrice          6746-6778   (l'appelant : ordre exact des lignes)
       - awardOnce             6768        (verrou anti-farm 24 h, pose AVANT l'envoi)
       - fbAddReport           6769        appel SANS await, dans un try/catch sync
       - userStats.pts += 3    6770
       - fbConfirmStock        6773        appel SANS await
       - toast("✓ Stock confirme · +3 pts") 6776
     window.fbAddReport        3316-3352   (catch -> console.warn 3350, ne renvoie rien)
     window.fbConfirmStock     2311-2336   (catch -> console.warn 2334, ne renvoie rien)
     _provenance               14858-14868 ("fiche|<metres>")
     window.fbJoinHunt         4545-4592   (le CONTRE-EXEMPLE : il renvoie un verdict)

   Regles concernees : firestore.rules 986-1005 (reports), 846-874 (stores).
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc,
  collection, query, where, serverTimestamp, increment,
} from "firebase/firestore";

const env = await banc("verif-confirmation-annoncee");

const BOB = "bob";
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── Le decor ───────────────────────────────────────────────────────────── */
const BOISSON = 7;
const MAGASIN = { id: "st-delhaize-flagey", fbId: "st-delhaize-flagey",
                  name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720, dist: 120 };
const STORES = [MAGASIN];

await serveur(async (db) => {
  await setDoc(doc(db, "stores", MAGASIN.fbId), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng,
    drinks: [BOISSON], confirmations: {}, addedBy: "graine",
  });
});

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

/* index.html:14858 */
function _provenance(src, s) {
  const d = (s && typeof s.dist === "number" && isFinite(s.dist)) ? Math.round(s.dist) : null;
  return String(src || "?") + "|" + (d == null ? "?" : d);
}

/* index.html:3316-3352 — window.fbAddReport.
   FIDELITE : le `try/catch` global avale TOUT et la fonction ne renvoie rien
   (`console.warn` ligne 3350). On rend donc `undefined` dans les deux cas —
   c'est exactement ce que l'appelant peut savoir : rien. */
async function fbAddReport(db, uid, storeId, drinkId, type, plus) {
  try {
    // uid vient de `try { var u = await ensureAuthed(); uid = u && u.uid; } catch(e) {}`
    const st = STORES.find((x) => String(x.id) === String(storeId) || String(x.fbId) === String(storeId));
    const extra = {};
    if (st) {
      if (st.name) extra.storeName = String(st.name).slice(0, 60);
      if (typeof st.lat === "number" && typeof st.lng === "number") {
        extra.lat = Math.round(st.lat * 100) / 100;
        extra.lng = Math.round(st.lng * 100) / 100;
      }
    }
    extra.tz = "Europe/Brussels";
    await addDoc(collection(db, "reports"), Object.assign({
      storeId: storeId, drinkId: drinkId, type: type, by: uid || null,
      byPseudo: "Explorateur", createdAt: serverTimestamp(),
    }, extra, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
  } catch (e) {
    CONSOLE.push("Firebase report error: " + (e.code || e.message));  // index.html:3350
  }
  return undefined;                                                   // <- rien a dire a l'appelant
}

/* index.html:2311-2336 — window.fbConfirmStock. Meme forme : catch -> warn, rien rendu. */
async function fbConfirmStock(db, storeId, drinkId, value) {
  try {
    const s = STORES.find((x) => x.id === storeId || x.fbId === storeId);
    if (!s || !s.fbId) return;
    const updates = {};
    updates["confirmations." + drinkId] = increment(value);
    const qui = "Explorateur";
    const quand = Math.floor(Date.now() / 3600000) * 3600000;
    if (value > 0) {
      updates["seenAt." + drinkId] = quand;
      updates["confirmedBy." + drinkId] = qui;
      updates["confirmedAt." + drinkId] = quand;
    } else {
      updates["absentBy." + drinkId] = qui;
      updates["absentAt." + drinkId] = quand;
    }
    await updateDoc(doc(db, "stores", s.fbId), updates);
  } catch (e) {
    CONSOLE.push("Firebase update error: " + (e.code || e.message));  // index.html:2334
  }
  return undefined;
}

/* index.html:4545-4592 — window.fbJoinHunt, LE CONTRE-EXEMPLE : meme situation
   (ecriture qui peut etre refusee), mais il RELIT la base et renvoie un verdict. */
async function fbJoinHunt(db, uid, drinkId, drinkName) {
  try {
    if (!uid) throw new Error("Connexion requise pour contribuer"); // ensureAuthed a leve
    const ref = doc(db, "hunts", String(drinkId));
    const moi = { lat: 50.9, lng: 4.3, at: Date.now() };
    const commun = { drinkName: String(drinkName || "").slice(0, 60), emoji: "", updatedAt: serverTimestamp() };
    const maj = Object.assign({}, commun); maj["seekers." + uid] = moi;
    try { await updateDoc(ref, maj); } catch (e) {
      try {
        const bouge = Object.assign({}, commun);
        bouge["seekers." + uid + ".lat"] = moi.lat; bouge["seekers." + uid + ".lng"] = moi.lng;
        await updateDoc(ref, bouge);
      } catch (e2) {
        await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
          seekers: (function () { const o = {}; o[uid] = moi; return o; })() }, commun));
      }
    }
    let verif = null; try { verif = await getDoc(ref); } catch (e0) {}
    const inscrit = !!(verif && verif.exists() && (verif.data().seekers || {})[uid]);
    return { ok: inscrit, reason: inscrit ? null : "non-inscrit" };
  } catch (e) {
    return { ok: false, reason: "auth", detail: String(e.message).slice(0, 140) };
  }
}

/* ── L'ecran, et la memoire locale de l'app ─────────────────────────────── */
let CONSOLE = [];
let ECRAN = [];
const toast = (t) => ECRAN.push(t);
const userStats = { confirms: 0, pts: 0 };
/* Le verrou anti-farm vit dans le localStorage du NAVIGATEUR (index.html:6786,
   cle "magoAwards"). Le temoin connecte et Bob-sans-compte sont deux personnes
   sur deux telephones : chacun a donc le sien, sinon le second heriterait du
   verrou du premier et ne tenterait meme pas l'envoi. */
let awardLog = {};
const nouveauTelephone = () => { awardLog = {}; };
function awardOnce(key, hours) {                       // index.html:6797
  const e = awardLog[key];
  const exp = e == null ? 0 : (typeof e === "object" ? (e.exp || 0) : e + (hours || 24) * 3600000);
  if (Date.now() < exp) return false;
  awardLog[key] = { t: Date.now(), exp: Date.now() + (hours || 24) * 3600000 };
  return true;
}

/* index.html:6746-6778 — confirmWithPrice, dans l'ORDRE EXACT du fichier.
   Le point de la trouvaille tient a cet ordre : ni fbAddReport (6769) ni
   fbConfirmStock (6773) ne sont attendus, et le toast (6776) part quoi qu'il
   arrive. On rend la promesse des deux envois UNIQUEMENT pour que le banc
   puisse attendre la fin avant de relire la base — l'app, elle, ne l'attend
   pas et ne pourrait rien en tirer (les deux fonctions rendent `undefined`). */
function confirmWithPrice(db, uid, sid, did) {
  const s = STORES.find((x) => x.id === sid || x.id === String(sid));
  if (!s) return Promise.resolve();
  if (!s.confirmations) s.confirmations = {};
  if (!s.confirmations[did]) s.confirmations[did] = 0;
  s.confirmations[did]++;                                                   // 6750
  const enVol = [];
  if (!awardOnce("conf:" + sid + ":" + did, 24)) {                          // 6768
    toast("Déjà confirmé aujourd'hui");
    return Promise.resolve();
  }
  try { enVol.push(fbAddReport(db, uid, s.fbId || sid, did, "stock",        // 6769
                               { note: _provenance("fiche", s) })); } catch (e) {}
  userStats.confirms++; userStats.pts += 3;                                 // 6770
  enVol.push(fbConfirmStock(db, sid, did, 1));                              // 6773
  toast("✓ Stock confirmé · +3 pts");                        // 6776
  return Promise.all(enVol);
}

/* ════════════════════════════════════════════════════════════════════════ */
/* 1. TEMOIN — Bob CONNECTE : le geste marche de bout en bout               */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("TEMOIN — Bob connecte confirme : l'ecran dit « ✓ Stock confirme · +3 pts » ET la base le recoit", async () => {
  ECRAN = []; CONSOLE = []; nouveauTelephone();
  await confirmWithPrice(bob, BOB, MAGASIN.id, BOISSON);
  verifier(ECRAN[0] === "✓ Stock confirmé · +3 pts", "ecran : " + JSON.stringify(ECRAN));
  const rep = await serveur((db) => getDocs(query(collection(db, "reports"), where("by", "==", BOB))));
  verifier(rep.docs.length === 1, "signalements en base : " + rep.docs.length);
  const st = await serveur((db) => getDoc(doc(db, "stores", MAGASIN.fbId)));
  verifier((st.data().confirmations || {})[BOISSON] === 1,
    "confirmations en base : " + JSON.stringify(st.data().confirmations));
  note("temoin : ecran=" + JSON.stringify(ECRAN) + " · signalements=1 · confirmations=1 · console=" + JSON.stringify(CONSOLE));
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 2. LE CAS DE LA TROUVAILLE — Bob SANS COMPTE (ensureAuthed a echoue)     */
/*    index.html:3320 `try { ... ensureAuthed ... } catch(e) {}` -> uid null */
/* ════════════════════════════════════════════════════════════════════════ */
let ecranSansCompte = [], consoleSansCompte = [], ptsAvant = 0, ptsApres = 0;
await doit("mise en place : Bob sans compte fait exactement le meme geste", async () => {
  ECRAN = []; CONSOLE = []; nouveauTelephone(); ptsAvant = userStats.pts;
  await confirmWithPrice(anon, null, MAGASIN.id, BOISSON);
  ecranSansCompte = ECRAN.slice(); consoleSansCompte = CONSOLE.slice(); ptsApres = userStats.pts;
});

await doitEchouer("les regles refusent bien le signalement non signe (regles 993 : by == request.auth.uid)", async () => {
  await addDoc(collection(anon, "reports"), {
    storeId: MAGASIN.fbId, drinkId: BOISSON, type: "stock", by: null,
    byPseudo: "Explorateur", createdAt: serverTimestamp(), note: "fiche|120",
  });
});

await doit("RIEN n'est parti : aucun signalement de plus en base", async () => {
  const rep = await serveur((db) => getDocs(collection(db, "reports")));
  verifier(rep.docs.length === 1, "signalements en base : " + rep.docs.length + " (1 attendu, celui du temoin)");
});

await doit("RIEN n'est parti non plus cote magasin : le compteur de confirmations n'a pas bouge", async () => {
  const st = await serveur((db) => getDoc(doc(db, "stores", MAGASIN.fbId)));
  verifier((st.data().confirmations || {})[BOISSON] === 1,
    "confirmations en base : " + JSON.stringify(st.data().confirmations));
});

note("ce que la console a vu (invisible pour la personne) : " + JSON.stringify(consoleSansCompte));
note("ce que L'ECRAN a dit a Bob : " + JSON.stringify(ecranSansCompte) +
     " · points credites en local : +" + (ptsApres - ptsAvant));

/* ── L'ASSERTION QUI PORTE LA TROUVAILLE ────────────────────────────────── */
await doit("L'APPLICATION NE MENT PAS : rien n'etant parti, l'ecran ne doit pas annoncer « ✓ Stock confirme · +3 pts »", async () => {
  verifier(!ecranSansCompte.includes("✓ Stock confirmé · +3 pts"),
    "l'ecran a affiche « ✓ Stock confirmé · +3 pts » alors que la base n'a rien recu (index.html:6776 apres 6769/6773 non attendus)");
});
await doit("L'APPLICATION NE MENT PAS : rien n'etant parti, les 3 points ne doivent pas etre credites", async () => {
  verifier(ptsApres - ptsAvant === 0, "+" + (ptsApres - ptsAvant) + " pts credites en local (index.html:6770) pour un envoi refuse");
});

/* ── L'AGGRAVANT : le verrou 24 h a ete consomme avant l'envoi ──────────── */
await doit("Bob peut reessayer : un envoi qui n'est jamais parti ne doit pas consommer le verrou anti-farm de 24 h (index.html:6768)", async () => {
  ECRAN = [];
  await confirmWithPrice(anon, null, MAGASIN.id, BOISSON);
  verifier(!ECRAN.includes("Déjà confirmé aujourd'hui"),
    "2e tentative : « Déjà confirmé aujourd'hui » — awardOnce (6768) a ete pose AVANT l'envoi (6769), la contribution est perdue pour 24 h");
});

/* ── LE CONTRE-EXEMPLE, dans le meme fichier ────────────────────────────── */
await doit("CONTRE-EXEMPLE fbJoinHunt (index.html:4586-4591) : la meme situation rend un verdict exploitable", async () => {
  const r = await fbJoinHunt(anon, null, 99, "Boisson test");
  verifier(r && r.ok === false && r.reason, "verdict rendu : " + JSON.stringify(r));
  note("fbJoinHunt rend " + JSON.stringify(r) + " — index.html:14369 s'en sert pour dire « La chasse n'est pas partie ». " +
       "fbAddReport (3350) et fbConfirmStock (2334) rendent `undefined` : l'appelant ne peut RIEN dire.");
});

await bilan(env);
