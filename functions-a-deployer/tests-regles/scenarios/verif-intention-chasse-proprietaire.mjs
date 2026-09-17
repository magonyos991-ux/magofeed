/* ============================================================================
   VERIFICATION D'INTENTION — « la chasse d'Alice n'appartient qu'a Alice »
   ----------------------------------------------------------------------------
   Question posee : la regle hunts (firestore.rules:1085-1097) laisse-t-elle un
   simple compte connecte RENOMMER (drinkName) ou REPOINTER (drinkId) la chasse
   lancee par quelqu'un d'autre — et si oui, est-ce un choix documente ou un
   oubli ?

   Ce fichier ne devine rien : il rejoue les ecritures de index.html a
   l'identique.
     _coarse                  index.html:4505
     window.fbJoinHunt        index.html:4545-4593   (ecrit drinkName/emoji/
                                                      updatedAt a CHAQUE fois,
                                                      drinkId SEULEMENT a la
                                                      creation)
     window.fbLoadNearbyHunts index.html:4616-4661
     _peindreChasse (le filtre) index.html:21893-21899  `if(!d)return false`
   Cote serveur (l'emulateur n'execute pas les Cloud Functions : on rejoue leur
   decision) :
     notifyHuntNearby         notifications-push.js:157-163 (porte d'entree),
                              :189 (le nom) et :288 (le texte de la poussee)
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
         serverTimestamp } from "firebase/firestore";

const env = await banc("verif-intention-chasse-proprietaire");
const ALICE = "alice", BOB = "bob", CAMILLE = "camille";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const camille = env.authenticatedContext(CAMILLE).firestore();
const anon = env.unauthenticatedContext().firestore();
const verifier = (c, quoi) => { if (!c) throw new Error(quoi); };

const BXL = { lat: 50.8676, lng: 4.3436 };
const BOISSON = 7, NOM = "Mountain Dew Spark";
/* le catalogue local de l'appareil (data/drinks.js) : seul l'id 7 existe */
const DRINKS = [{ id: 7, name: NOM }];
const PIRATE = "PIRATE — appelle le 0900";

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4545-4593 — copie conforme (la trace en plus) */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const trace = [];
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp(),
  };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); trace.push("updateDoc direct OK"); return trace; }
  catch (e) {
    trace.push("updateDoc direct -> " + (e.code || e.message));
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); trace.push("updateDoc imbrique OK"); return trace;
    } catch (e2) {
      trace.push("updateDoc imbrique -> " + (e2.code || e2.message));
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
      trace.push("setDoc creation OK"); return trace;
    }
  }
}

/* index.html:4616-4661 */
const caches = {};
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;
  else { snap = await getDocs(query(collection(db, "hunts"), limit(200))); caches[appareil] = { at: Date.now(), snap }; }
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
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, emoji: h.emoji, seekers: near, mine, distKm, lastAt });
  });
  out.sort((a, b) => b.seekers - a.seekers);
  return out;
}

/* index.html:21893-21899 — le filtre de _peindreChasse : une chasse dont le
   drinkId est inconnu du catalogue local DISPARAIT de la liste. */
function lignesAffichees(hunts) {
  return (hunts || []).filter(function (x) {
    const d = DRINKS.find((y) => Number(y.id) === Number(x.drinkId));
    if (!d) return false;
    return true;
  });
}

/* notifications-push.js:157-163 puis :189 et :288 */
function notifyHuntNearby(before, after) {
  if (!after || !after.seekers) return { envoi: false, pourquoi: "pas de seekers" };
  const bSeek = (before && before.seekers) || {}, aSeek = after.seekers || {};
  const nouveaux = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);
  if (!nouveaux.length) return { envoi: false, pourquoi: "aucun NOUVEAU chercheur (ligne 160)" };
  let center = null;
  nouveaux.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoi: false, pourquoi: "pas de centre (ligne 173)" };
  const name = String(after.drinkName || "une boisson").slice(0, 40);   // :189
  return {
    envoi: true, nouveaux,
    texte: "Quelqu'un cherche « " + name + " ». Si tu la vois en magasin, signale-la et gagne des points.", // :288
    lien: { type: "hunt", drinkId: String(after.drinkId || "") },       // :289
    verrouBoisson: "huntPush_d_" + String(after.drinkId),               // :242
  };
}
const lire = async (db) => (await getDoc(doc(db, "hunts", String(BOISSON)))).data();

/* ══════════════════════════════════════════════════════════════════════════ */
/* 1. Alice lance sa chasse, exactement comme l'application                   */
/* ══════════════════════════════════════════════════════════════════════════ */
await doit("Alice lance la chasse sur « " + NOM + " » (fbJoinHunt, index.html:4545)", async () => {
  const t = await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  const d = await lire(anon);
  verifier(d && d.drinkName === NOM && Number(d.drinkId) === BOISSON, "etat inattendu : " + JSON.stringify(d) + " " + t.join(" | "));
});
note("champs ecrits par fbJoinHunt a la CREATION : drinkId, seekers, drinkName, emoji, updatedAt");
note("champs ecrits par fbJoinHunt a CHAQUE mise a jour : drinkName, emoji, updatedAt, seekers.<moi> — JAMAIS drinkId");

/* ══════════════════════════════════════════════════════════════════════════ */
/* 2. Bob, simple compte connecte, ne chasse rien : il reecrit le document    */
/* ══════════════════════════════════════════════════════════════════════════ */
await doitEchouer("Bob, qui ne chasse pas, ne renomme pas la chasse d'Alice (le commentaire des regles 1055-1056 le promet)", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkName: PIRATE });
});
await doitEchouer("Bob ne fait pas pointer la chasse d'Alice sur une autre boisson (meme promesse)", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkId: 999 });
});
{
  const d = await lire(anon);
  note("hunts/7 apres Bob : drinkName=" + JSON.stringify(d.drinkName) + " drinkId=" + JSON.stringify(d.drinkId)
    + " seekers=" + JSON.stringify(Object.keys(d.seekers)) + " (Bob n'est pas chercheur)");
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 3. CONSEQUENCE 1 annoncee : « le prochain chercheur diffuse le message de  */
/*    Bob ». On la met a l'epreuve, en rejouant un vrai chercheur.            */
/* ══════════════════════════════════════════════════════════════════════════ */
{
  const avant = await lire(anon);
  await fbJoinHunt(camille, CAMILLE, BOISSON, NOM, "", 50.8946, 4.3436);
  const apres = await lire(anon);
  const p = notifyHuntNearby(avant, apres);
  note("Camille rejoint apres le renommage : drinkName redevient " + JSON.stringify(apres.drinkName)
    + " (fbJoinHunt reecrit `commun` a chaque mise a jour, index.html:4552-4555)");
  note("poussee reellement envoyee a ce moment-la : " + (p.envoi ? p.texte : "aucune (" + p.pourquoi + ")"));
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 4. Le meme geste, mais fait par quelqu'un qui rejoint DANS LA MEME         */
/*    ECRITURE : la forme exacte de fbJoinHunt, avec un nom menteur.          */
/* ══════════════════════════════════════════════════════════════════════════ */
{
  const avant = await lire(anon);
  await doitEchouer("Bob ne rejoint pas la chasse d'Alice en la renommant dans la meme ecriture", async () => {
    const maj = { drinkName: PIRATE, emoji: "", updatedAt: serverTimestamp() };
    maj["seekers." + BOB] = { lat: _coarse(50.87), lng: _coarse(4.34), at: Date.now() };
    await updateDoc(doc(bob, "hunts", String(BOISSON)), maj);
  });
  const apres = await lire(anon);
  const p = notifyHuntNearby(avant, apres);
  note("poussee que notifications-push.js:288 enverrait alors : " + (p.envoi ? p.texte : "aucune (" + p.pourquoi + ")"));
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 5. CONSEQUENCE 2 annoncee : drinkId repointe, la chasse disparait.         */
/*    Se repare-t-elle toute seule quand un vrai chercheur revient ?          */
/* ══════════════════════════════════════════════════════════════════════════ */
await doitEchouer("Bob ne repointe pas la chasse une seconde fois", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkId: 999 });
});
{
  await fbJoinHunt(camille, CAMILLE, BOISSON, NOM, "", 50.8946, 4.3436);   // Camille se repositionne
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);      // Alice se repositionne
  const d = await lire(anon);
  note("hunts/7 apres le retour des DEUX vraies chercheuses : drinkId=" + JSON.stringify(d.drinkId)
    + " — aucun chemin de l'application ne reecrit drinkId sur un document existant, la valeur de Bob reste");
  delete caches.camille;
  const l = await fbLoadNearbyHunts(camille, "camille", CAMILLE, 50.8946, 4.3436, 50);
  const brut = l.find((x) => String(x.drinkId) === "999");
  note("fbLoadNearbyHunts rend a Camille : " + JSON.stringify(brut));
  const visibles = lignesAffichees(l);
  note("apres le filtre de _peindreChasse (index.html:21896-21898) : " + visibles.length + " chasse(s) affichee(s) — "
    + (visibles.length ? JSON.stringify(visibles) : "la chasse d'Alice n'apparait plus nulle part"));
  const p = notifyHuntNearby({ seekers: {} }, d);
  note("la prochaine poussee pointerait sur " + JSON.stringify(p.lien) + " et consommerait le verrou " + p.verrouBoisson
    + " (notifications-push.js:242 et :289) au lieu de ceux de la boisson 7");
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 6. Verification de securite du correctif : figer drinkId casserait-il      */
/*    un parcours honnete ? On remet 7 et on refait tout le parcours.         */
/* ══════════════════════════════════════════════════════════════════════════ */
await doit("remise en etat (n'importe quel connecte le peut aussi : la regle est symetrique)", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkId: BOISSON });
});
await doit("Camille rejoint, se repositionne, Alice se repositionne : AUCUNE de ces ecritures ne touche drinkId", async () => {
  const avant = (await lire(anon)).drinkId;
  await fbJoinHunt(camille, CAMILLE, BOISSON, NOM, "", 50.8946, 4.3436);
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  const apres = (await lire(anon)).drinkId;
  verifier(String(avant) === String(apres), "drinkId a bouge tout seul : " + avant + " -> " + apres);
});
note("consequence : une regle « !changed().hasAny(['drinkId']) » sur update ne refuserait aucune ecriture de l'application");
await doit("en revanche fbJoinHunt REECRIT drinkName a chaque passage : le figer casserait un renommage de catalogue", async () => {
  const avant = (await lire(anon)).drinkName;
  await fbJoinHunt(camille, CAMILLE, BOISSON, "Mountain Dew Spark (50 cl)", "", 50.8946, 4.3436);
  const apres = (await lire(anon)).drinkName;
  verifier(avant !== apres, "drinkName n'a pas bouge alors que fbJoinHunt l'ecrit : " + avant + " / " + apres);
  note("drinkName passe de " + JSON.stringify(avant) + " a " + JSON.stringify(apres) + " par un simple rejoin honnete");
});

await bilan(env);
