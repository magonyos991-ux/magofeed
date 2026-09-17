/* ============================================================================
   PARCOURS : SCANNER UNE BOISSON INCONNUE, LA PHOTOGRAPHIER,
              LUI RATTACHER SON CODE-BARRES
   ----------------------------------------------------------------------------
   Le fondateur demande : « d'autre scan meme avec des boissons inconnus mais
   qu'on a la possibilite de la prendre en photos pour l'analyser directement et
   rajouter ce code barre a cela, une demarche safe et securisee ».

   CE QUE CE SCENARIO REJOUE, LIGNE PAR LIGNE (aucune ecriture inventee) :
     index.html:9501   validGTIN()               la cle de controle GS1, cote client
     index.html:9980   scan d'un code inconnu    « Produit inconnu » + champ nom
     index.html:10000  le bouton « Ajouter aux decouvertes »
     index.html:17717  addDiscovery()            la creation locale + le toast
     index.html:5644   window.fbAddDiscovery()   l'ecriture Firestore, telle quelle
     index.html:17627  openDiscPhotoSheet()      « Ajoute une photo du produit »
     index.html:18536  compressPhotoFile()       JPEG <= 250 Ko, maxSide 900
     index.html:5577   window.fbSaveDiscoveryPhoto()  la photo dans Firestore (setDoc, sans merge)
     index.html:5522   window.fbMarkDiscoveryPhoto()  le drapeau hasPhoto
     index.html:5585   window.fbLoadDiscoveryPhoto()  la relecture
     index.html:9306   _scanThumbPhoto()         l'affichage de la photo chez les AUTRES (injection l.9313)
     index.html:18748  la proposition PHOTO qui recupere le code orphelin
     index.html:5559   window.fbRejectDiscoveryPhoto()  le rejet par l'admin
     index.html:2492   window.fbSetCatalogBarcodes()    coller le code au catalogue
     index.html:5459   window.fbRemoveBarcode()         retirer un code du catalogue
     index.html:2503   window.fbProposerCodeChasse()    la chasse (2 confirmations)
     firestore.rules:670   match /discoveries/{id}  (create : l.686-706 ; update : l.729-747)
     firestore.rules:765   match /discoveryPhotos/{id}  (create : l.768-769)
     firestore.rules:658   match /catalog/{id}
     firestore.rules:1254  match /chasseCodes/{barcode}
     functions-a-deployer/chasse-codes.js:103  la pose du code par le serveur

   Lancer :  cd functions-a-deployer/tests-regles
             node lancer-scenario.mjs scenarios/scanner-inconnu.mjs
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, writeBatch,
         serverTimestamp, arrayRemove, deleteDoc } from "firebase/firestore";

const env     = await banc("scanner-inconnu");
const alice   = env.authenticatedContext("alice").firestore();   // la decouvreuse
const bob     = env.authenticatedContext("bob").firestore();     // un membre quelconque
const mallory = env.authenticatedContext("mallory").firestore(); // un membre malveillant
const patron  = env.authenticatedContext("patron").firestore();  // l'administrateur
const anon    = env.unauthenticatedContext().firestore();        // pas encore connecte

/* withSecurityRulesDisabled ne renvoie pas ce que la fonction retourne : on
   recupere la valeur par la fermeture, sinon toute lecture vaut undefined. */
const godMode = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};
await godMode(async (db) => { await setDoc(doc(db, "admins", "patron"), { depuis: "manuel" }); });

/* ── Les codes-barres du scenario. Tous VALIDES au sens de validGTIN()
      (index.html:9501), sauf CODE_FAUX, dont la cle de controle est fausse. */
const CODE_INCONNU = "8712100849718";   // celui qu'Alice scanne en rayon
const CODE_SQUAT   = "5410228142348";   // celui que Mallory prend d'avance
const CODE_FAUX    = "1111111111111";   // 13 chiffres, cle de controle FAUSSE
const CODE_PRIS    = "5449000000996";   // deja pose sur la fiche catalogue 4242

/* Une photo telle que compressPhotoFile la rend : un vrai data-URL JPEG en
   base64, de la taille demandee (index.html:18545 : maxKb 250 par defaut). */
function photoBase64(octets) {
  const tete = "data:image/jpeg;base64,";
  const corps = "/9j/4AAQSkZJRgABAQEAYABgAAD".repeat(Math.ceil(octets / 27)).slice(0, Math.max(0, octets - tete.length));
  return tete + corps;
}

/* fbAddDiscovery (index.html:5644), branche « la decouverte n'existe pas
   encore » : un lot atomique = le document + le vote de son auteur. */
async function fbAddDiscovery(db, uid, barcode, name, brand, cat, extra) {
  const ref = doc(db, "discoveries", String(barcode));
  const votedRef = doc(db, "discoveries", String(barcode), "votedBy", uid);
  const data = {
    name: name, brand: brand || "", votes: 1, barcode: String(barcode),
    by: uid, byPseudo: "Explorateur", createdAt: serverTimestamp(),
  };
  if (cat) data.cat = cat;
  if (extra) Object.assign(data, extra);
  const batch = writeBatch(db);
  batch.set(ref, data);
  batch.set(votedRef, { votedAt: serverTimestamp() });
  await batch.commit();
}
/* fbSaveDiscoveryPhoto (index.html:5577) — setDoc SANS merge, tel quel. */
async function fbSaveDiscoveryPhoto(db, uid, discId, base64) {
  await setDoc(doc(db, "discoveryPhotos", String(discId)),
    { data: String(base64), by: uid, createdAt: serverTimestamp() });
}
/* fbMarkDiscoveryPhoto (index.html:5522). */
async function fbMarkDiscoveryPhoto(db, discId) {
  await updateDoc(doc(db, "discoveries", String(discId)), { hasPhoto: true });
}
/* fbSetCatalogBarcodes (index.html:2492) — setDoc merge. */
async function fbSetCatalogBarcodes(db, drinkId, barcodes) {
  await setDoc(doc(db, "catalog", String(drinkId)),
    { barcodes: (barcodes || []).map(String), updatedAt: serverTimestamp() }, { merge: true });
}
/* fbRemoveBarcode (index.html:5459). */
async function fbRemoveBarcode(db, drinkId, code) {
  await updateDoc(doc(db, "catalog", String(drinkId)), { barcodes: arrayRemove(String(code)) });
}
/* fbProposerCodeChasse (index.html:2503), branche « personne n'a encore
   propose ce code ». Le client exige un compte non anonyme ; les regles, non. */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  await setDoc(doc(db, "chasseCodes", String(barcode)), {
    drinkId: Number(drinkId) || drinkId,
    drinkName: String(drinkName).slice(0, 60),
    barcode: String(barcode),
    par: [uid], etat: "attente", createdAt: serverTimestamp(),
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   ACTE 1 — LE SCAN D'UN CODE QUE PERSONNE NE CONNAIT
   ════════════════════════════════════════════════════════════════════════════ */
await doit("1.1 Alice scanne un code inconnu, tape le nom, la decouverte part (fbAddDiscovery)", async () => {
  await fbAddDiscovery(alice, "alice", CODE_INCONNU, "Hell Watermelon", "", "");
});
await doit("1.2 la decouverte porte bien SON code-barres (barcode == id du document)", async () => {
  const s = await getDoc(doc(alice, "discoveries", CODE_INCONNU));
  if (!s.exists()) throw new Error("decouverte absente");
  if (String(s.data().barcode) !== CODE_INCONNU) throw new Error("barcode != id");
  if (s.data().votes !== 1) throw new Error("votes != 1");
});
await doitEchouer("1.3 un visiteur pas encore connecte ne cree pas de decouverte", async () => {
  await fbAddDiscovery(anon, "anonyme", "5449000000996", "Faux", "", "");
});

/* Le champ nom vient d'un <input> SANS maxlength (index.html:9986) et
   addDiscovery ne le coupe pas (index.html:17717, 17762). Les regles, elles, plafonnent
   a 60 caracteres (firestore.rules:697). L'app affiche pourtant
   « Ajoute aux decouvertes . +20 pts » (index.html:17768) puis avale l'erreur :
   fbAddDiscovery(...).catch(function(){}) — index.html:17780. */
await doit("1.4 un nom de 61 caracteres tape a l'ecran « Produit inconnu » arrive bien dans Firestore", async () => {
  await fbAddDiscovery(alice, "alice", "3560070139675", "A".repeat(61), "", "");
});

/* Le meme plafond frappe le chemin le PLUS frequent : le bouton « Ajouter aux
   decouvertes » d'un produit qu'OpenFoodFacts connait (index.html:9967 et 9289).
   offBestProduct (index.html:7949) recolle « marque + libelle » sans jamais
   couper — et les libelles d'OpenFoodFacts sont longs. promoteDiscovery, lui,
   coupe bien a 60 (index.html:24878 : String(d.name).slice(0,60)) : la coupe
   existe partout SAUF a l'endroit ou elle deciderait si l'ecriture passe. */
const NOM_OFF = "Monster Energy Juice Pipeline Punch boisson energisante 500 ml";
note("nom typique reconstruit depuis OpenFoodFacts : " + NOM_OFF.length + " caracteres");
await doit("1.5 un nom reconstruit depuis OpenFoodFacts (" + NOM_OFF.length + " caracteres) arrive bien dans Firestore", async () => {
  await fbAddDiscovery(alice, "alice", "5449000214911", NOM_OFF, "Monster", "Energy");
});
await doit("1.6 une marque OpenFoodFacts de 41 caracteres arrive bien dans Firestore", async () => {
  await fbAddDiscovery(alice, "alice", "8712100849701", "Boisson", "B".repeat(41), "Energy");
});
/* Temoins : la seule difference est le 61e caractere du nom / le 41e de la
   marque. Sans eux, on pourrait croire que 1.4-1.6 echouent pour autre chose. */
await doit("1.7 TEMOIN : le meme envoi avec un nom de 60 caracteres passe", async () => {
  await fbAddDiscovery(alice, "alice", "8712100849749", "A".repeat(60), "", "");
});
await doit("1.8 TEMOIN : le meme envoi avec une marque de 40 caracteres passe", async () => {
  await fbAddDiscovery(alice, "alice", "5449000011527", "Boisson", "B".repeat(40), "Energy");
});

/* ════════════════════════════════════════════════════════════════════════════
   ACTE 2 — LA PHOTO DU PRODUIT
   ════════════════════════════════════════════════════════════════════════════ */
await doit("2.1 Alice envoie la photo (250 Ko : ce que compressPhotoFile produit au maximum)", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", CODE_INCONNU, photoBase64(250 * 1024));
});
await doit("2.2 puis marque la decouverte « avec photo » (fbMarkDiscoveryPhoto)", async () => {
  await fbMarkDiscoveryPhoto(alice, CODE_INCONNU);
});
await doit("2.3 le code-barres reste attache : photo, vote et decouverte portent le meme identifiant", async () => {
  const d = await getDoc(doc(alice, "discoveries", CODE_INCONNU));
  const p = await getDoc(doc(alice, "discoveryPhotos", CODE_INCONNU));
  if (!d.exists() || !p.exists()) throw new Error("piece manquante");
  if (d.id !== p.id || String(d.data().barcode) !== p.id) throw new Error("identifiants desalignes");
  if (d.data().hasPhoto !== true) throw new Error("hasPhoto absent");
});

/* La proposition PHOTO d'un produit inconnu (index.html:18744) : l'identifiant
   synthetique « m + horodatage » devient le code-barres orphelin s'il a moins
   de 15 minutes. On rejoue les deux formes. */
await doit("2.4 une proposition par photo SANS code recoit un identifiant « m + horodatage »", async () => {
  await fbAddDiscovery(bob, "bob", "m1783615360754", "Golden Power", "Golden", "",
    { hasPhoto: true, manualProposal: true, aiConfidence: 91 });
  await fbSaveDiscoveryPhoto(bob, "bob", "m1783615360754", photoBase64(120 * 1024));
});
await doit("2.5 une proposition par photo faite juste apres un scan rate reprend LE code scanne", async () => {
  await fbAddDiscovery(bob, "bob", "8000000000002", "Cusa Cola Zero", "Cusa", "",
    { hasPhoto: true, manualProposal: true });
});

/* ════════════════════════════════════════════════════════════════════════════
   ACTE 3 — COMBIEN DE PHOTO TIENT DANS UN DOCUMENT FIRESTORE ?
   ════════════════════════════════════════════════════════════════════════════ */
let compteur = 0;
/* Un essai ne doit jamais bloquer le banc : au-dela de 15 s on compte « refuse ». */
function avecDelai(p, ms) {
  return Promise.race([p, new Promise((_, non) => setTimeout(() => non(new Error("delai depasse")), ms))]);
}
async function passe(octets) {
  const id = "mesure" + (compteur++);
  try { await avecDelai(fbSaveDiscoveryPhoto(alice, "alice", id, photoBase64(octets)), 15000); return true; }
  catch (e) { return false; }
}
note("compressPhotoFile vise 250 Ko au maximum (index.html:18544-18545 : maxSide 900, maxKb 250 ; boucle l.18552)");
await doit("3.1 une photo de 250 Ko passe (la taille que l'application produit reellement)", async () => {
  if (!(await passe(250 * 1024))) throw new Error("250 Ko refuses");
});
await doit("3.2 une photo de 1 Mo (1 048 576 octets) est refusee par Firestore", async () => {
  if (await passe(1024 * 1024)) throw new Error("1 Mo accepte : le plafond du document ne s'applique pas");
});
/* Recherche par dichotomie de la vraie frontiere, bornee : 1,2 Mo suffit,
   inutile d'envoyer des messages que gRPC refuserait avant Firestore. */
let bas = 250 * 1024, haut = 1200000;
while (haut - bas > 64) {
  const milieu = Math.floor((bas + haut) / 2);
  if (await passe(milieu)) bas = milieu; else haut = milieu;
}
note("3.3 plus grande photo acceptee : " + bas + " octets (" + (bas / 1024).toFixed(1) + " Ko) — refusee des " + haut + " octets");
note("3.4 marge : l'application en envoie " + (250 * 1024) + " au plus, soit " + (bas / (250 * 1024)).toFixed(2) + "x moins que ce que les regles laissent passer");

/* ════════════════════════════════════════════════════════════════════════════
   ACTE 4 — REMPLACER UNE PHOTO
   ════════════════════════════════════════════════════════════════════════════ */
await doitEchouer("4.1 Alice ne peut pas remplacer SA PROPRE photo (les regles n'autorisent que la creation)", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", CODE_INCONNU, photoBase64(30 * 1024));
});
await doitEchouer("4.2 Bob ne peut pas ecraser la photo d'Alice", async () => {
  await fbSaveDiscoveryPhoto(bob, "bob", CODE_INCONNU, photoBase64(30 * 1024));
});
await doitEchouer("4.3 Bob ne peut pas signer une photo du nom d'Alice (by = alice)", async () => {
  await fbSaveDiscoveryPhoto(bob, "alice", "9999999999994", photoBase64(10 * 1024));
});
await doitEchouer("4.4 Bob ne peut pas effacer la photo d'Alice", async () => {
  await deleteDoc(doc(bob, "discoveryPhotos", CODE_INCONNU));
});
/* fbRejectDiscoveryPhoto (index.html:5559) : l'admin efface, retire hasPhoto,
   pose photoRejected — et l'auteur peut alors en reposer une. */
await doit("4.5 l'admin refuse une mauvaise photo (fbRejectDiscoveryPhoto) et la decouverte redevient promouvable", async () => {
  await deleteDoc(doc(patron, "discoveryPhotos", CODE_INCONNU));
  await updateDoc(doc(patron, "discoveries", CODE_INCONNU), { hasPhoto: false, photoRejected: true });
});
await doit("4.6 Alice peut alors en reprendre une nette", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", CODE_INCONNU, photoBase64(90 * 1024));
  await fbMarkDiscoveryPhoto(alice, CODE_INCONNU);
});

/* Le revers de « creation seulement » : celui qui arrive LE PREMIER sur un code
   verrouille la photo pour toujours, meme s'il n'a rien decouvert. */
await doit("4.7 Mallory pose d'avance la photo d'un code qu'AUCUNE decouverte ne porte", async () => {
  await fbSaveDiscoveryPhoto(mallory, "mallory", CODE_SQUAT, photoBase64(5 * 1024));
});
await doit("4.8 Alice decouvre ensuite vraiment ce produit en rayon", async () => {
  await fbAddDiscovery(alice, "alice", CODE_SQUAT, "Cusa Cola Zero", "Cusa", "");
});
await doitEchouer("4.9 ... mais ne pourra JAMAIS poser sa photo a la place de celle de Mallory", async () => {
  await fbSaveDiscoveryPhoto(alice, "alice", CODE_SQUAT, photoBase64(90 * 1024));
});

/* ════════════════════════════════════════════════════════════════════════════
   ACTE 5 — QUI PEUT LIRE UNE PHOTO ?
   ════════════════════════════════════════════════════════════════════════════ */
await doitEchouer("5.1 un visiteur pas encore connecte ne lit aucune photo", async () => {
  const s = await getDoc(doc(anon, "discoveryPhotos", CODE_INCONNU));
  if (!s.exists()) throw new Error("absente");
});
await doit("5.2 n'importe quel membre lit la photo d'Alice (fbLoadDiscoveryPhoto)", async () => {
  const s = await getDoc(doc(bob, "discoveryPhotos", CODE_INCONNU));
  if (!s.exists() || !s.data().data) throw new Error("photo illisible");
});
await doitEchouer("5.3 personne ne peut LISTER toutes les photos (ce serait la fuite)", async () => {
  await getDocs(collection(bob, "discoveryPhotos"));
});
await doit("5.4 seul l'admin liste la collection, pour moderer", async () => {
  const s = await getDocs(collection(patron, "discoveryPhotos"));
  if (s.empty) throw new Error("liste vide");
});

/* ════════════════════════════════════════════════════════════════════════════
   ACTE 6 — RATTACHER LE CODE-BARRES A UNE FICHE DU CATALOGUE
   ════════════════════════════════════════════════════════════════════════════ */
await godMode(async (db) => {
  await setDoc(doc(db, "catalog", "4242"), { id: 4242, name: "Cusa Cola Zero", brand: "Cusa", barcodes: [CODE_PRIS] });
  await setDoc(doc(db, "catalog", "7777"), { id: 7777, name: "Golden Power", brand: "Golden", barcodes: [] });
});
await doitEchouer("6.1 un simple membre ne colle pas un code sur une fiche du catalogue (fbSetCatalogBarcodes)", async () => {
  await fbSetCatalogBarcodes(bob, "7777", [CODE_INCONNU]);
});
await doitEchouer("6.2 un simple membre ne VOLE pas le code d'une autre boisson", async () => {
  await fbSetCatalogBarcodes(mallory, "7777", [CODE_PRIS]);
});
await doitEchouer("6.3 un simple membre ne retire pas un code du catalogue (fbRemoveBarcode)", async () => {
  await fbRemoveBarcode(mallory, "4242", CODE_PRIS);
});
await doit("6.4 l'admin, lui, colle le code sur la fiche orpheline", async () => {
  await fbSetCatalogBarcodes(patron, "7777", [CODE_INCONNU]);
  const s = await getDoc(doc(patron, "catalog", "7777"));
  if ((s.data().barcodes || []).indexOf(CODE_INCONNU) === -1) throw new Error("code absent");
});
await doit("6.5 l'admin retire un code pose par erreur", async () => {
  await fbRemoveBarcode(patron, "7777", CODE_INCONNU);
});

/* La chasse (index.html:2503) est le SEUL chemin par lequel un membre fait
   bouger le catalogue partage : a deux confirmations, la Cloud Function
   poserCodeChasse pose le code avec l'Admin SDK (chasse-codes.js:103). Elle
   ne verifie PAS que le code est libre : elle lit seulement les codes de la
   fiche visee (« codes.indexOf(code) === -1 »). */
await doitEchouer("6.6 un code DEJA pose sur la fiche 4242 ne peut pas entrer en chasse pour la fiche 7777", async () => {
  await fbProposerCodeChasse(bob, "bob", 7777, "Golden Power", CODE_PRIS);
});

/* ════════════════════════════════════════════════════════════════════════════
   ACTE 7 — LA CLE DE CONTROLE EST-ELLE VERIFIEE AVANT L'ECRITURE ?
   ════════════════════════════════════════════════════════════════════════════ */
note("validGTIN (index.html:9501) rejette " + CODE_FAUX + " : cle de controle GS1 fausse");
await doitEchouer("7.1 les regles refusent une decouverte dont la cle de controle est fausse", async () => {
  await fbAddDiscovery(mallory, "mallory", CODE_FAUX, "Produit fantome", "", "");
});
await doitEchouer("7.2 les regles refusent une chasse ouverte sur un code a la cle fausse", async () => {
  await fbProposerCodeChasse(mallory, "mallory", 7777, "Golden Power", "2222222222221");
});

/* ════════════════════════════════════════════════════════════════════════════
   ACTE 8 — « SAFE ET SECURISE » : CE QU'UN MEMBRE PEUT FAIRE VOIR AUX AUTRES
   ════════════════════════════════════════════════════════════════════════════ */
/* _scanThumbPhoto (index.html:9306) recolle le champ `data` DANS DU HTML,
   ligne 9313 :
     box.insertAdjacentHTML("afterbegin", '<img src="' + s + '" alt="" ...>');
   Rien n'echappe le guillemet. Les regles (firestore.rules:765) ne verifient ni
   le type, ni la forme, ni la taille de `data`. */
const CHARGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=" onerror="alert(document.domain)';
await doitEchouer("8.1 les regles refusent un champ `data` qui n'est pas une image (guillemet + onerror)", async () => {
  await fbSaveDiscoveryPhoto(mallory, "mallory", "8000000000019", CHARGE);
});
await doitEchouer("8.2 les regles refusent des champs inventes a cote de la photo", async () => {
  await setDoc(doc(mallory, "discoveryPhotos", "8000000000026"),
    { data: "x", by: "mallory", createdAt: serverTimestamp(), charge: "A".repeat(50000), promoted: true });
});
/* hasPhoto est ouvert a TOUT connecte (firestore.rules:745, 3e branche de
   `allow update`). Consequences visibles : le libelle « Proposee en photo »
   (index.html:17792) et, cote admin, « Voir la photo envoyee » qui finit sur
   « Photo introuvable » (index.html:23304). */
await doitEchouer("8.3 un membre ne peut pas declarer « photo jointe » sur la decouverte d'un autre sans photo", async () => {
  await fbAddDiscovery(alice, "alice", "5000112548167", "Boisson sans photo", "", "");
  await fbMarkDiscoveryPhoto(mallory, "5000112548167");
});
await doit("8.4 une photo envoyee par un membre est lisible par les autres AVANT toute moderation", async () => {
  await fbSaveDiscoveryPhoto(mallory, "mallory", "5410228142324", photoBase64(20 * 1024));
  const s = await getDoc(doc(bob, "discoveryPhotos", "5410228142324"));
  if (!s.exists()) throw new Error("illisible");
  const d = await getDoc(doc(bob, "discoveries", "5410228142324"));
  if (d.exists()) throw new Error("la decouverte existe : ce n'est plus le cas teste");
});
note("aucun champ « verifiee par un humain » n'existe sur discoveryPhotos : l'app affiche l'image des qu'elle est ecrite");

await bilan(env);
