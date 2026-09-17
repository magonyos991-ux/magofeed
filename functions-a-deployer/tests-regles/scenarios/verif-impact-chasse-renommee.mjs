/* ============================================================================
   LENTILLE « IMPACT » — « n'importe quel compte connecte peut renommer ou
   repointer la chasse de quelqu'un d'autre » (firestore.rules:1086-1097).

   La question n'est pas « la regle est-elle laxiste » mais « QU'EST-CE QUE CA
   CHANGE POUR QUELQU'UN ». On suit donc trois personnes reelles :

     Alice  lance une chasse sur la boisson 7 (« Barbican Mangue »), a Bruxelles.
     Bob    compte ordinaire (l'app ouvre une session ANONYME toute seule,
            index.html:1598 — donc « connecte » coute un chargement de page).
     Chloe  quelqu'un d'autre dans la zone, qui devrait voir la chasse d'Alice.

   Fonctions rejouees a l'identique (numeros de ligne) :
     window.fbJoinHunt          index.html:4545-4590
     window.fbLeaveHunt         index.html:4595-4604
     window.fbLoadNearbyHunts   index.html:4616-4661
     renderChasse (fusion)      index.html:21847-21872
     _peindreChasse (filtre)    index.html:21892-21905
     _peindreBoard (commercant) index.html:17197-17212
     notifyHuntNearby (corps + centre + data)
                                functions-a-deployer/notifications-push.js:153-206, 285-291
     crediterEntraide (lecture) functions-a-deployer/points-et-parrainage.js:329

   L'ecriture de Bob n'est PAS une fonction de l'app : aucun bouton ne la
   propose. C'est une ecriture directe (console Firebase / REST), telle que les
   regles la recoivent. C'est bien pour cela qu'on interroge les regles.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
         serverTimestamp } from "firebase/firestore";

const env = await banc("verif-impact-chasse-renommee");
const ALICE = "alice", BOB = "bob", CHLOE = "chloe";
const alice = env.authenticatedContext(ALICE).firestore();
const bob   = env.authenticatedContext(BOB).firestore();
const chloe = env.authenticatedContext(CHLOE).firestore();

/* Extrait FIDELE de data/drinks.js (4599 boissons ; 999 n'existe pas, 7 et 12 oui) */
const DRINKS = [
  { id: 7,  name: "Barbican Mangue",   emoji: "" },
  { id: 12, name: "Rani Float Mangue", emoji: "" },
];
const BOISSON = 7, NOM = "Barbican Mangue";
const BXL = { lat: 50.8676, lng: 4.3436 };   // Alice et Chloe, meme quartier
const POISON = "PIRATE — appelle le 0900";

/* index.html:4515 */
const _coarse = (x) => Math.round(x * 10) / 10;
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* index.html:4545-4590 — window.fbJoinHunt, copie conforme (sans le cache) */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName || "").slice(0, 60),
                   emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun); maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); return "updateDoc direct"; }
  catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); return "updateDoc imbrique";
    } catch (e2) {
      await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
        seekers: (() => { const o = {}; o[uid] = moi; return o; })() }, commun));
      return "setDoc creation";
    }
  }
}

/* index.html:4595-4604 — window.fbLeaveHunt */
async function fbLeaveHunt(db, uid, drinkId) {
  const patch = {}; patch["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), patch);
}

/* index.html:4616-4661 — window.fbLoadNearbyHunts (cache de 20 s retire :
   un seul tir par appel ici, comme apres un vidage window._huntsCache) */
async function fbLoadNearbyHunts(db, myUid, lat, lng, radiusKm) {
  const snap = await getDocs(query(collection(db, "hunts"), limit(200)));
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100, fresh = Date.now() - 365 * 86400000;
  snap.forEach((d) => {
    const h = d.data(), seekers = h.seekers || {};
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
                             seekers: near, mine, distKm, lastAt });
  });
  out.sort((a, b) => b.seekers - a.seekers);
  return out;
}

/* index.html:21847-21872 + 21892-21905 — ce que l'onglet « La chasse » AFFICHE.
   `watches` = les alertes locales de CE telephone (drinkWatches). Le filtre
   magasinProcheAvec() est neutre ici : aucun magasin ne porte la boisson. */
function ecranChasse(hunts, watches) {
  const demande = {};
  (watches || []).forEach((w) => {
    if (w.triggered) return;
    demande[String(w.id)] = { id: Number(w.id), chercheurs: 1, moi: true, distKm: 0, lastAt: w.created || null };
  });
  (hunts || []).forEach((h) => {
    const k = String(h.drinkId), n = h.seekers || 0;
    if (demande[k]) {
      demande[k].chercheurs = Math.max(demande[k].chercheurs, n);
      demande[k].moi = demande[k].moi || !!h.mine;
      if (h.lastAt && (!demande[k].lastAt || h.lastAt > demande[k].lastAt)) demande[k].lastAt = h.lastAt;
    } else demande[k] = { id: Number(h.drinkId), chercheurs: n, moi: !!h.mine,
                          distKm: (h.distKm != null ? h.distKm : null), lastAt: h.lastAt || null };
  });
  return Object.keys(demande).map((k) => demande[k])
    .filter((x) => {
      const d = DRINKS.find((y) => Number(y.id) === Number(x.id));
      if (!d) return false;                 // index.html:21896 — fiche inconnue
      x.d = d; return true;
    })
    .map((x) => ({ nom: x.d.name, chercheurs: x.chercheurs, moi: x.moi, distKm: x.distKm }));
}

/* notifications-push.js:153-206 + 285-291 — ce que le serveur ENVERRAIT,
   calcule a partir de l'etat AVANT/APRES une ecriture sur hunts/{id}. */
function poussee(avant, apres) {
  const bSeek = (avant && avant.seekers) || {}, aSeek = (apres && apres.seekers) || {};
  const nouveaux = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);
  if (!nouveaux.length) return { envoi: false, raison: "aucun nouveau chercheur" };
  let center = null;
  nouveaux.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoi: false, raison: "sans position" };
  const name = String(apres.drinkName || "une boisson").slice(0, 40);
  return { envoi: true,
           corps: "Quelqu'un cherche « " + name + " ». Si tu la vois en magasin, signale-la et gagne des points.",
           data_drinkId: String(apres.drinkId || "") };
}

const lire = async (db) => (await getDoc(doc(db, "hunts", String(BOISSON)))).data();

/* ══ 1. ALICE LANCE SA CHASSE ═══════════════════════════════════════════ */
let avantBob = null;
await doit("Alice lance la chasse sur « " + NOM + " » (index.html:14356)", async () => {
  const chemin = await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  verifier(chemin === "setDoc creation", "chemin inattendu : " + chemin);
  avantBob = await lire(alice);
  verifier(avantBob.drinkId === 7 && avantBob.drinkName === NOM, "document mal ecrit");
});

await doit("Chloe voit la chasse d'Alice dans l'onglet La chasse", async () => {
  const lignes = ecranChasse(await fbLoadNearbyHunts(chloe, CHLOE, BXL.lat, BXL.lng, 10), []);
  verifier(lignes.length === 1 && lignes[0].nom === NOM, "Chloe voit : " + JSON.stringify(lignes));
});

/* ══ 2. BOB, COMPTE ORDINAIRE, TOUCHE LA CHASSE D'ALICE ═════════════════ */
await doitEchouer("Bob ne renomme pas la chasse d'Alice", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkName: POISON });
});
await doitEchouer("Bob ne repointe pas la chasse d'Alice sur une autre boisson", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkId: 999 });
});
await doitEchouer("Bob ne change pas l'emoji de la chasse d'Alice", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { emoji: "☠" });
});
await doitEchouer("Bob n'efface pas le chercheur Alice", async () => {
  const p = {}; p["seekers." + ALICE] = null;
  await updateDoc(doc(bob, "hunts", String(BOISSON)), p);
});

const apresBob = await lire(alice);
note("hunts/7 apres Bob : drinkId=" + JSON.stringify(apresBob.drinkId)
     + " drinkName=" + JSON.stringify(apresBob.drinkName)
     + " seekers=" + Object.keys(apresBob.seekers || {}).join(","));

/* ══ 3. CE QUE CHACUN VOIT MAINTENANT ═══════════════════════════════════ */
await doit("IMPACT — la chasse d'Alice est encore visible par Chloe", async () => {
  const lignes = ecranChasse(await fbLoadNearbyHunts(chloe, CHLOE, BXL.lat, BXL.lng, 10), []);
  verifier(lignes.length === 1, "l'onglet La chasse de Chloe affiche " + lignes.length
    + " ligne(s) : " + JSON.stringify(lignes));
});

await doit("IMPACT — Alice voit encore combien de gens cherchent avec elle", async () => {
  // Alice a l'alerte en local (drinkWatches) : sa ligne « tu la cherches » survit
  // toujours. Ce qu'on mesure, c'est le chiffre venu de la base.
  const lignes = ecranChasse(await fbLoadNearbyHunts(alice, ALICE, BXL.lat, BXL.lng, 10),
                             [{ id: 7, name: NOM, created: Date.now(), triggered: false }]);
  verifier(lignes.length === 1 && lignes[0].moi === true,
    "Alice voit : " + JSON.stringify(lignes));
});

await doit("IMPACT — le tableau du commercant compte encore cette demande", async () => {
  // _peindreBoard : meme filtre DRINKS.find(id) (index.html:17201-17203)
  const hunts = await fbLoadNearbyHunts(chloe, CHLOE, BXL.lat, BXL.lng, 25);
  const retenues = (hunts || []).filter((h) => DRINKS.find((x) => Number(x.id) === Number(h.drinkId)));
  verifier(retenues.length === 1, "le commercant voit " + retenues.length + " demande(s) au lieu de 1");
});

/* ══ 4. LA POUSSEE : QUE DIT-ELLE AU PROCHAIN CHERCHEUR ? ═══════════════ */
let apresChloe = null;
await doit("IMPACT — quand Chloe rejoint, la poussee annonce la VRAIE boisson", async () => {
  const avant = await lire(alice);
  const chemin = await fbJoinHunt(chloe, CHLOE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  apresChloe = await lire(alice);
  const p = poussee(avant, apresChloe);
  note("  chemin de Chloe : " + chemin + " | poussee : " + JSON.stringify(p));
  verifier(p.envoi === true, "aucune poussee : " + p.raison);
  verifier(p.corps.indexOf(POISON) === -1, "la poussee diffuse le texte de Bob : " + p.corps);
  verifier(p.corps.indexOf(NOM) !== -1, "la poussee n'annonce pas la boisson : " + p.corps);
});

note("hunts/7 apres l'arrivee de Chloe : drinkId=" + JSON.stringify(apresChloe.drinkId)
     + " drinkName=" + JSON.stringify(apresChloe.drinkName)
     + " | data.drinkId de la poussee = " + JSON.stringify(String(apresChloe.drinkId || "")));

await doit("IMPACT — un chercheur qui arrive REPARE le champ drinkId", async () => {
  verifier(Number(apresChloe.drinkId) === BOISSON,
    "drinkId vaut toujours " + JSON.stringify(apresChloe.drinkId)
    + " : le passage d'un vrai chercheur ne le remet pas a " + BOISSON);
});

/* ══ 5. ALICE PEUT-ELLE REPARER, AVEC CE QUE L'APP LUI PROPOSE ? ════════ */
await doit("IMPACT — Alice repare en arretant puis relancant sa chasse", async () => {
  await fbLeaveHunt(alice, ALICE, BOISSON);                       // bouton « arreter »
  const chemin = await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng); // relance
  const d = await lire(alice);
  verifier(Number(d.drinkId) === BOISSON,
    "apres arret + relance (" + chemin + "), drinkId vaut encore " + JSON.stringify(d.drinkId));
});

const fin = await lire(alice);
note("hunts/7 a la fin : drinkId=" + JSON.stringify(fin.drinkId)
     + " drinkName=" + JSON.stringify(fin.drinkName)
     + " seekers=" + Object.keys(fin.seekers || {}).filter((u) => fin.seekers[u]).join(","));
note("crediterEntraide lit hunts/" + BOISSON + " PAR NUMERO DE DOCUMENT "
     + "(points-et-parrainage.js:329) : les points d'entraide, eux, ne dependent pas du champ drinkId.");

/* ══ 6. LE MENSONGE : REPOINTER SUR UNE BOISSON QUI EXISTE ══════════════ */
await doitEchouer("Bob ne fait pas passer la chasse pour une autre boisson du catalogue", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkId: 12, drinkName: "Rani Float Mangue" });
});
{
  const lignes = ecranChasse(await fbLoadNearbyHunts(chloe, CHLOE, BXL.lat, BXL.lng, 10), []);
  note("ce que l'onglet La chasse de Chloe affiche alors : " + JSON.stringify(lignes));
}

/* ══ 7. LA FICHE DE LA BOISSON, ELLE, N'A RIEN VU ═══════════════════════ */
/* index.html:4606-4615 — window.fbHuntSeekers lit hunts/{id} PAR NUMERO DE
   DOCUMENT : le compteur de la fiche boisson ignore le champ drinkId. */
async function fbHuntSeekers(db, uid, drinkId) {
  const s = await getDoc(doc(db, "hunts", String(drinkId)));
  if (!s.exists()) return 0;
  const seekers = s.data().seekers || {};
  let n = 0; const fresh = Date.now() - 30 * 86400000;
  Object.keys(seekers).forEach((u) => { const x = seekers[u]; if (x && x.at && x.at >= fresh && u !== uid) n++; });
  return n;
}
note("fiche « " + NOM + " » chez Chloe (index.html:6822) : « "
     + (await fbHuntSeekers(chloe, CHLOE, BOISSON)) + " autre(s) personne(s) la cherche(nt) » "
     + "— pendant que l'onglet La chasse n'en montre aucune. L'app se contredit d'un ecran a l'autre.");

/* ══ 8. LE TEXTE DE LA POUSSEE N'A PAS BESOIN DE LA CHASSE D'ALICE ══════ */
/* Contre-mesure de la these « renommer la chasse d'autrui empoisonne la
   poussee » : Bob obtient exactement le meme texte sur SON PROPRE document,
   que la regle `create` autorise (aucun controle du catalogue). */
await doit("Bob cree sa propre chasse 999 au nom qu'il veut (regle create)", async () => {
  const avant = {};
  await setDoc(doc(bob, "hunts", "999"), {
    drinkId: 999, drinkName: POISON, emoji: "", updatedAt: serverTimestamp(),
    seekers: { [BOB]: { lat: _coarse(BXL.lat), lng: _coarse(BXL.lng), at: Date.now() } },
  });
  const apres = (await getDoc(doc(bob, "hunts", "999"))).data();
  const p = poussee(avant, apres);
  verifier(p.envoi === true, "pas de poussee : " + p.raison);
  note("  poussee depuis le document de Bob : " + p.corps);
});

await bilan(env);
