/* ============================================================================
   PARCOURS « DECOUVERTES » — proposer, voter, promouvoir, refuser.
   ----------------------------------------------------------------------------
   Ce scenario REJOUE les ecritures exactes de l'application, recopiees depuis
   index.html :

     index.html:5644  window.fbAddDiscovery(barcode,name,brand,cat,extra)
     index.html:5678  window.fbVoteDiscovery(discoveryId)
     index.html:5592  window.fbTagDiscoveryStore(discId,storeId)
     index.html:5522  window.fbMarkDiscoveryPhoto(discId)
     index.html:2429  window.fbPromoteDiscovery(disc,entry)
     index.html:2465  window.fbRenameDiscovery(disc,newName,newBrand)
     index.html:2545  window.fbRejectDiscovery(disc)
     index.html:17717 addDiscovery(name,brand,barcode,cat)   (cote client)
     index.html:22069 voteDisc(id)                           (cote client)

   Les regles evaluees sont celles du depot : functions-a-deployer/firestore.rules
   (bloc /discoveries/{id} lignes 670-757).

   Un ECHEC ci-dessous n'est pas un scenario casse : c'est une trouvaille.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection,
  serverTimestamp, arrayUnion, increment, writeBatch,
} from "firebase/firestore";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..", "..", "..");   // /home/user/magofeed

/* ── Le lexique anti-alcool de l'app, charge tel quel ──────────────────────
   On ne reinvente pas la garde : on extrait nameLooksAlcoholic() d'index.html
   et on lui donne data/alcool.js, exactement comme le navigateur. Cela permet
   de dire si un nom accepte par les REGLES serait, ou non, refuse par le
   CLIENT — c'est toute la question de la regle produit « 100 % sans alcool ». */
const SRC = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");
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
const nameLooksAlcoholic = new Function("window",
  fs.readFileSync(path.join(RACINE, "data", "alcool.js"), "utf8") + "\n" +
  extraireFonction("normTxt") + "\n" +
  extraireFonction("nameLooksAlcoholic") + "\n" +
  "return nameLooksAlcoholic;")({});

const env = await banc("decouvertes");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const admin = env.authenticatedContext("chef").firestore();
const anon  = env.unauthenticatedContext().firestore();

/* L'administrateur, c'est un document dans /admins (firestore.rules:38). */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "admins", "chef"), { role: "fondateur" });
});

/* ══════════════════════════════════════════════════════════════════════════
   LES FONCTIONS DE L'APP, RECOPIEES A L'IDENTIQUE
   La seule difference : on ne masque pas les erreurs. L'app, elle, les avale
   (fbVoteDiscovery : `catch (e) { console.warn(...) }` — index.html:5686).
   ══════════════════════════════════════════════════════════════════════════ */

// index.html:5644
async function fbAddDiscovery(db, uid, pseudo, barcode, name, brand, cat, extra) {
  const ref = doc(db, "discoveries", String(barcode));
  const votedRef = doc(db, "discoveries", String(barcode), "votedBy", uid);
  const snap = await getDoc(ref);
  const batch = writeBatch(db);
  if (snap.exists()) {
    const existing = snap.data();
    const updates = { votes: increment(1) };
    const isGenericName = !existing.name || existing.name === ("Produit " + barcode);
    if (isGenericName && name && name !== ("Produit " + barcode)) {
      updates.name = name;
      if (brand) updates.brand = brand;
    }
    batch.update(ref, updates);
    batch.set(votedRef, { votedAt: serverTimestamp() });
    await batch.commit();
    return { isNew: false };
  }
  const data = {
    name: name, brand: brand || "", votes: 1, barcode: String(barcode), by: uid,
    byPseudo: (pseudo || "Explorateur").slice(0, 24), createdAt: serverTimestamp(),
  };
  if (cat) data.cat = cat;
  if (extra) Object.assign(data, extra);
  batch.set(ref, data);
  batch.set(votedRef, { votedAt: serverTimestamp() });
  await batch.commit();
  return { isNew: true };
}

// index.html:5678
async function fbVoteDiscovery(db, uid, discoveryId) {
  const batch = writeBatch(db);
  batch.update(doc(db, "discoveries", String(discoveryId)), { votes: increment(1) });
  batch.set(doc(db, "discoveries", String(discoveryId), "votedBy", uid), { votedAt: serverTimestamp() });
  await batch.commit();
}

// index.html:5592
async function fbTagDiscoveryStore(db, discId, storeId) {
  await updateDoc(doc(db, "discoveries", String(discId)), { foundIn: arrayUnion(String(storeId)) });
}

// index.html:5522
async function fbMarkDiscoveryPhoto(db, discId) {
  await updateDoc(doc(db, "discoveries", String(discId)), { hasPhoto: true });
}

// index.html:2465
async function fbRenameDiscovery(db, disc, newName, newBrand) {
  const ref = doc(db, "discoveries", String(disc.fbId || disc.barcode || disc.id));
  const upd = { name: String(newName) };
  if (newBrand != null) upd.brand = String(newBrand);
  await updateDoc(ref, upd);
}

// index.html:2545
async function fbRejectDiscovery(db, disc) {
  await updateDoc(doc(db, "discoveries", String(disc.fbId || disc.barcode || disc.id)),
    { rejected: true, decidedAt: serverTimestamp() });
}

// index.html:2429 — le coeur de la promotion (catalogue + drapeaux + notif).
async function fbPromoteDiscovery(db, disc, entry) {
  const data = Object.assign({}, entry, { createdAt: serverTimestamp(), fromBarcode: String(disc.barcode || "") });
  await setDoc(doc(db, "catalog", String(entry.id)), data);
  await updateDoc(doc(db, "discoveries", String(disc.fbId || disc.barcode || disc.id)), { decidedAt: serverTimestamp() });
  await updateDoc(doc(db, "discoveries", String(disc.fbId || disc.barcode || disc.id)), { promoted: true });
  if (disc.by) {
    // window.fbNotifyUser — index.html:5537
    await setDoc(doc(db, "userNotifs", "notif-" + entry.id), {
      to: String(disc.by), read: false, createdAt: serverTimestamp(),
      type: "promoted", title: "Ta découverte est dans Magofeed !",
      body: "« " + String(disc.name || "Ta boisson").slice(0, 40) + " » ...",
      drinkId: entry.id, barcode: String(disc.barcode || ""),
    });
  }
}

const votesDe = async (id) => (await getDoc(doc(anon, "discoveries", String(id)))).data().votes;

/* ══════════════════════════════════════════════════════════════════════════
   1. ALICE AJOUTE UNE DECOUVERTE APRES UN SCAN, ET ELLE SURVIT
   ══════════════════════════════════════════════════════════════════════════ */
const D1 = "5449000054227";

await doitEchouer("1a. un visiteur NON connecte ne peut pas creer une decouverte", async () => {
  await fbAddDiscovery(anon, "fantome", "Explorateur", D1, "Fanta Citron", "Fanta", "soda");
});

await doit("1b. Alice scanne un code inconnu et cree la decouverte (fbAddDiscovery)", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", D1, "Fanta Citron Zero", "Fanta", "soda");
});

await doit("1c. la decouverte EXISTE cote serveur (pas seulement en memoire du telephone)", async () => {
  const s = await getDoc(doc(anon, "discoveries", D1));
  if (!s.exists()) throw new Error("le document n'est pas sur le serveur");
  const d = s.data();
  if (d.votes !== 1) throw new Error("votes=" + d.votes + " au lieu de 1");
  if (d.by !== "alice") throw new Error("by=" + d.by);
  if (d.barcode !== D1) throw new Error("barcode=" + d.barcode);
});

await doit("1d. le vote d'Alice est trace (votedBy/alice), donc infalsifiable", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), "discoveries", D1, "votedBy", "alice"));
    if (!s.exists()) throw new Error("votedBy/alice absent");
  });
});

await doitEchouer("1e. Bob ne peut pas deposer une decouverte signee Alice (by usurpe)", async () => {
  await setDoc(doc(bob, "discoveries", "5410228142401"), {
    name: "Coca", brand: "", votes: 1, barcode: "5410228142401",
    by: "alice", byPseudo: "Bob", createdAt: serverTimestamp(),
  });
});

await doitEchouer("1f. on ne peut pas naitre avec votes:999 (le panneau admin dirait PRETE)", async () => {
  await setDoc(doc(bob, "discoveries", "5410228142402"), {
    name: "Faux", brand: "", votes: 999, barcode: "5410228142402",
    by: "bob", byPseudo: "Bob", createdAt: serverTimestamp(),
  });
});

await doitEchouer("1g. l'identifiant ne peut pas etre du HTML (il finissait dans un attribut)", async () => {
  const id = '"><img src=x onerror=alert(1)>';
  await setDoc(doc(bob, "discoveries", id), {
    name: "X", brand: "", votes: 1, barcode: id, by: "bob", byPseudo: "Bob", createdAt: serverTimestamp(),
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. BOB VOTE. UNE FOIS ? DEUX FOIS ? CENT FOIS ?
   ══════════════════════════════════════════════════════════════════════════ */

await doit("2a. Bob vote pour la decouverte d'Alice (fbVoteDiscovery)", async () => {
  await fbVoteDiscovery(bob, "bob", D1);
});

await doit("2b. le compteur monte d'EXACTEMENT un (1 -> 2)", async () => {
  const v = await votesDe(D1);
  if (v !== 2) throw new Error("votes=" + v + " au lieu de 2");
});

await doitEchouer("2c. Bob ne peut pas voter une deuxieme fois (votedBy/bob existe)", async () => {
  await fbVoteDiscovery(bob, "bob", D1);
});

await doitEchouer("2d. Bob ne peut pas voter +50 d'un coup", async () => {
  await updateDoc(doc(bob, "discoveries", D1), { votes: increment(50) });
});

await doitEchouer("2e. Bob ne peut pas voter en renommant au passage", async () => {
  await updateDoc(doc(bob, "discoveries", D1), { votes: increment(1), name: "Bob etait la" });
});

/* LE POINT CENTRAL DU PARCOURS.
   La regle voteHonnete() (firestore.rules:722) exige deux choses : +1 exactement,
   et « il n'a pas deja vote », teste par l'EXISTENCE de votedBy/{uid}. Mais rien
   n'OBLIGE a ecrire ce document : c'est l'application qui le fait gentiment, dans
   son lot. Un client qui se contente de l'increment ne cree jamais la trace, donc
   la condition « il n'a pas deja vote » reste vraie pour toujours. */
const D3 = "5410228142423";
await doit("2f. Alice depose une deuxieme decouverte (cible du test d'abus)", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", D3, "Ice Tea Peche", "Lipton", "the");
});

await doitEchouer("2g. Bob ne peut pas voter CENT fois en sautant l'ecriture de votedBy", async () => {
  for (let i = 0; i < 100; i++) {
    await updateDoc(doc(bob, "discoveries", D3), { votes: increment(1) });
  }
});
note("2h. apres les 100 tentatives de Bob, le compteur de « Ice Tea Peche » vaut " +
     (await votesDe(D3)) + " (il valait 1 ; le seuil de promotion ADMIN_VOTE_THRESHOLD est 3 — index.html:23199)");

/* ══════════════════════════════════════════════════════════════════════════
   3. ALICE PEUT-ELLE GONFLER SA PROPRE DECOUVERTE ?
   ══════════════════════════════════════════════════════════════════════════ */

await doitEchouer("3a. Alice ne peut pas voter pour sa propre decouverte (fbVoteDiscovery)", async () => {
  await fbVoteDiscovery(alice, "alice", D1);
});

const D8 = "3017620422003";
await doit("3b. Alice depose une troisieme decouverte", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", D8, "Club Mate", "Loscher", "energy");
});
await doitEchouer("3c. Alice, SEULE, ne peut pas gonfler sa decouverte jusqu'au seuil", async () => {
  await updateDoc(doc(alice, "discoveries", D8), { votes: increment(1) });
  await updateDoc(doc(alice, "discoveries", D8), { votes: increment(1) });
});
note("3d. « Club Mate » reste a " + (await votesDe(D8)) +
     " vote : l'auteur est protege parce que fbAddDiscovery pose votedBy/{auteur} " +
     "des la creation (index.html:5667). C'est exactement ce qui manque a un tiers — voir 2g.");

/* ══════════════════════════════════════════════════════════════════════════
   4. QUI PROMEUT AU CATALOGUE ?
   ══════════════════════════════════════════════════════════════════════════ */
const entree = {
  id: 90001, name: "Fanta Citron Zero", brand: "Fanta", cat: "soda",
  emoji: "🍋", color: "#f7c948", light: "#fff7e0", tag: "FANTA CITRON ZERO",
  stars: 4.0, barcodes: [D1],
};
const disc1 = { id: D1, barcode: D1, name: "Fanta Citron Zero", by: "alice", foundIn: [] };

await doitEchouer("4a. Bob (non-admin) ne peut pas promouvoir au catalogue", async () => {
  await fbPromoteDiscovery(bob, disc1, entree);
});
await doitEchouer("4b. Bob ne peut pas marquer une decouverte promoted:true", async () => {
  await updateDoc(doc(bob, "discoveries", D1), { promoted: true });
});
await doitEchouer("4c. Alice ne peut pas promouvoir SA PROPRE decouverte", async () => {
  await fbPromoteDiscovery(alice, disc1, entree);
});
await doit("4d. l'administrateur promeut : catalogue + decidedAt + promoted + notif a Alice", async () => {
  await fbPromoteDiscovery(admin, disc1, entree);
});
await doit("4e. la fiche est bien au catalogue, lisible par tout le monde", async () => {
  const s = await getDoc(doc(anon, "catalog", "90001"));
  if (!s.exists()) throw new Error("catalog/90001 absent");
  if (s.data().fromBarcode !== D1) throw new Error("fromBarcode=" + s.data().fromBarcode);
});
await doit("4f. Alice recoit la notification « ta decouverte est au catalogue »", async () => {
  const s = await getDoc(doc(alice, "userNotifs", "notif-90001"));
  if (!s.exists()) throw new Error("notification absente");
  if (s.data().to !== "alice") throw new Error("to=" + s.data().to);
});

/* ══════════════════════════════════════════════════════════════════════════
   5. RENOMMER, REFUSER, EFFACER
   ══════════════════════════════════════════════════════════════════════════ */
const D2 = "3068320123264";
await doit("5a. Alice depose une decouverte a renommer", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", D2, "AA Drink", "AA", "energy");
});
await doitEchouer("5b. Bob ne peut pas renommer la decouverte d'Alice", async () => {
  await fbRenameDiscovery(bob, { id: D2 }, "Pipi de chat", "Bob");
});
await doit("5c. l'administrateur renomme (fbRenameDiscovery, usage prevu)", async () => {
  await fbRenameDiscovery(admin, { id: D2 }, "AA Drink Pro Energy", "AA Drink");
});
await doitEchouer("5d. Bob ne peut pas refuser une decouverte", async () => {
  await fbRejectDiscovery(bob, { id: D2 });
});
await doitEchouer("5e. Bob ne peut pas effacer une decouverte", async () => {
  await deleteDoc(doc(bob, "discoveries", D2));
});
await doitEchouer("5f. Alice ne peut pas effacer SA PROPRE decouverte", async () => {
  await deleteDoc(doc(alice, "discoveries", D2));
});
await doit("5g. l'administrateur refuse une decouverte (fbRejectDiscovery)", async () => {
  await fbRejectDiscovery(admin, { id: D2 });
});
await doit("5h. l'administrateur peut effacer", async () => {
  await deleteDoc(doc(admin, "discoveries", D2));
});

/* La photo : n'importe quel connecte peut poser hasPhoto (fbMarkDiscoveryPhoto).
   Peut-il aussi la DECROCHER chez quelqu'un d'autre ? A la promotion, c'est
   hasPhoto qui decide si l'image suit la boisson (index.html:2435). */
const D9 = "5449000131805";
await doit("5i. Alice depose une decouverte avec photo", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", D9, "Fuze Tea Mangue", "Fuze", "the");
  await fbMarkDiscoveryPhoto(alice, D9);
});
await doitEchouer("5j. Bob ne peut pas decrocher la photo d'Alice (hasPhoto:false)", async () => {
  await updateDoc(doc(bob, "discoveries", D9), { hasPhoto: false });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. LA REGLE PRODUIT : 100 % SANS ALCOOL
   La garde est cote client (nameLooksAlcoholic, index.html:7919, appelee par
   addDiscovery index.html:17723). Est-elle AUSSI cote regles ?
   ══════════════════════════════════════════════════════════════════════════ */
const D5 = "5410228142450";
const NOM_ALCOOL = "Jupiler Bière Blonde 5,2% vol";
note("6a. le client REFUSE ce nom : nameLooksAlcoholic(\"" + NOM_ALCOOL + "\") = " +
     nameLooksAlcoholic(NOM_ALCOOL, "Jupiler"));
await doitEchouer("6b. les regles refusent une decouverte ALCOOLISEE", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", D5, NOM_ALCOOL, "Jupiler", "biere");
});
note("6c. dans la base, « " + NOM_ALCOOL + " » est " +
     ((await getDoc(doc(anon, "discoveries", D5))).exists() ? "PRESENTE et lisible par tous (allow read: if true)" : "absente"));

/* Le contournement PREVU par l'app elle-meme : overrideAlcohol (index.html:21661)
   pose _alcoholOverrides[code] et addDiscovery saute alors la garde. Le commentaire
   promet « ajoute aux decouvertes avec une alerte, verifie avant le catalogue ».
   Aucun champ d'alerte n'est ecrit — et la liste filtre par NOM. */
note("6d. apres overrideAlcohol, addDiscovery ecrit la decouverte SANS aucun champ " +
     "d'alerte (index.html:17723-17767) ; renderDiscoveries (22024) et le panneau " +
     "admin (23265) la retirent par nameLooksAlcoholic : elle est ecrite, jamais affichee");

/* ══════════════════════════════════════════════════════════════════════════
   7. NOMS DEMESURES, HTML, LIENS
   ══════════════════════════════════════════════════════════════════════════ */
const LONG = "A".repeat(10000);

await doitEchouer("7a. a la CREATION, un nom de 10 000 caracteres est refuse", async () => {
  await fbAddDiscovery(bob, "bob", "Bob", "5410228142460", LONG, "", "soda");
});

const D6 = "4056489012345";
await doit("7b. Alice depose une decouverte ordinaire", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", D6, "Ritter Cola", "Ritter", "soda");
});
await doitEchouer("7c. Alice ne peut pas la RENOMMER avec 10 000 caracteres", async () => {
  await fbRenameDiscovery(alice, { id: D6 }, LONG, "");
});
note("7d. apres coup, le nom stocke fait " +
     String((await getDoc(doc(anon, "discoveries", D6))).data().name).length + " caracteres");

await doitEchouer("7e. Alice ne peut pas renommer avec du HTML et un lien", async () => {
  await fbRenameDiscovery(alice, { id: D6 }, '<a href="http://arnaque.tld">Gagnez un pack</a>', "");
});
note("7f. renderDiscoveries echappe le nom (sanitize, index.html:10082/22037) : " +
     "le HTML n'est pas execute, il s'affiche en clair");

/* Le champ 'desc' est dans la liste des cles autorisees (firestore.rules:694)
   mais AUCUNE contrainte de type ni de taille ne le suit — alors que name,
   brand, cat, byPseudo et foundIn en ont une. Il est affiche tel quel dans la
   carte de decouverte (index.html:22034). */
await doitEchouer("7g. une description de 200 000 caracteres est refusee a la creation", async () => {
  await setDoc(doc(bob, "discoveries", "5410228142470"), {
    name: "Boisson piege", brand: "", desc: "Z".repeat(200000), votes: 1,
    barcode: "5410228142470", by: "bob", byPseudo: "Bob", createdAt: serverTimestamp(),
  });
});
note("7h. toutes les decouvertes sont telechargees a l'ouverture de l'app " +
     "(fbDiscoveriesLoaded -> index.html:27248)");

/* ══════════════════════════════════════════════════════════════════════════
   8. LE PARCOURS A DEUX PERSONNES QUI CASSE
   ══════════════════════════════════════════════════════════════════════════ */

/* 8.1 — « Je sais ou ! » au moment du scan.
   addDiscovery (index.html:17761-17765) appelle fbTagDiscoveryStore AVANT
   fbAddDiscovery (ligne 17780) : le magasin est pousse sur un document qui
   n'existe pas encore. C'est ce foundIn qui, a la promotion, ensemence les
   magasins (index.html:2442). */
const D7 = "5000112637922";
await doit("8a. le magasin du scan (« Je sais ou » avant l'ajout) arrive sur le serveur", async () => {
  /* Ordre REEL de addDiscovery : le tag part AVANT la creation, et son echec est
     avale sur place — index.html:17765 `.catch(function(e){console.warn(e);})`. */
  try { await fbTagDiscoveryStore(alice, D7, "store-carrefour-liege"); } catch (e) { /* console.warn */ }
  await fbAddDiscovery(alice, "alice", "Alice", D7, "Schweppes Agrum", "Schweppes", "soda"); // index.html:17780
  const d = (await getDoc(doc(anon, "discoveries", D7))).data();
  if (!d.foundIn || !d.foundIn.length) {
    throw new Error("foundIn absent du document serveur : le magasin ou Alice a vu la boisson est perdu");
  }
});
note("8b. foundIn cote serveur apres le parcours reel : " +
     JSON.stringify((await getDoc(doc(anon, "discoveries", D7))).data().foundIn ?? "champ absent") +
     " — c'est cette liste que la promotion parcourt pour ensemencer les magasins (index.html:2442)");
await doit("8c. plus tard, « Je sais ou ! » sur une decouverte deja creee fonctionne (index.html:9051)", async () => {
  await fbTagDiscoveryStore(alice, D7, "store-carrefour-liege");
});

/* 8.2 — Bob rescanne une decouverte au nom generique.
   fbAddDiscovery (index.html:5654-5660) corrige alors le nom en meme temps
   qu'il vote. Les regles n'autorisent 'name' qu'a l'AUTEUR ou a l'admin
   (firestore.rules:735-737), et le vote d'un tiers n'a droit qu'a
   ['votes','hasPhoto'] (firestore.rules:748). */
const D10 = "8710398500014";
await doit("8d. Alice cree une entree au nom vide (premier scan sans nom)", async () => {
  await fbAddDiscovery(alice, "alice", "Alice", D10, "", "", "");
});
await doit("8e. Bob rescanne et donne enfin le vrai nom : son vote compte et le nom est corrige", async () => {
  await fbAddDiscovery(bob, "bob", "Bob", D10, "Hell Watermelon", "Hell", "energy");
});
note("8f. apres le rescan de Bob : votes=" + (await votesDe(D10)) +
     ", name=" + JSON.stringify((await getDoc(doc(anon, "discoveries", D10))).data().name) +
     " — l'ecran a pourtant affiche « Deja suggeree · vote ajoute +2 pts » (index.html:17743)");

/* 8.3 — le vote sur une decouverte qui n'est pas (encore) sur le serveur.
   voteDisc (index.html:22069) incremente d'abord l'affichage et dit « +2 pts »,
   puis appelle fbVoteDiscovery qui avale toute erreur (index.html:5686). */
await doitEchouer("8g. voter pour une decouverte absente du serveur remonte une erreur visible", async () => {
  await fbVoteDiscovery(bob, "bob", "9999999999999");
});
note("8h. dans l'app cette erreur est avalee (`catch (e) { console.warn }`, index.html:5686) " +
     "alors que l'ecran a deja affiche « +2 pts ! » (index.html:22074)");

await bilan(env);
