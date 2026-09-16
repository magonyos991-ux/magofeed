/* ============================================================================
   VERIFICATION D'INTENTION — « fbChargerChasseCodes n'est appelee nulle part,
   donc l'etat partage de la chasse n'est JAMAIS affiche »
   ----------------------------------------------------------------------------
   La premiere moitie de la phrase est vraie et facile a verifier :
       grep -rn "fbChargerChasseCodes" index.html  ->  2529, la definition, rien
   La seconde moitie est une DEDUCTION. Ce scenario la met a l'epreuve.

   CE QU'ON REJOUE, A L'IDENTIQUE :
     - index.html:2503   window.fbProposerCodeChasse()  — l'ecriture ET sa lecture
     - index.html:23456  proposerChasse(), branche .then() — le texte montre a l'ecran
     - index.html:2529   window.fbChargerChasseCodes()  — la fonction orpheline
     - index.html:23491  boissonsOrphelines()           — ce que la chasse liste
     - functions-a-deployer/firestore.rules:1254  match /chasseCodes/{barcode}

   LA QUESTION : le compteur partage (« il manque une confirmation », « une
   deuxieme personne l'avait deja vue ») arrive-t-il a l'utilisateur, oui ou
   non ? Et par quel chemin ?
============================================================================ */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp } from "firebase/firestore";

const env   = await banc("verif-chasse-etat-partage");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carl  = env.authenticatedContext("carl").firestore();
const anon  = env.unauthenticatedContext().firestore();

const egal = (obtenu, attendu, quoi) => {
  if (String(obtenu) !== String(attendu))
    throw new Error(quoi + " : attendu « " + attendu + " », obtenu « " + obtenu + " »");
};

/* ── index.html:2503 — window.fbProposerCodeChasse, recopiee a l'identique ──
   Seule difference : ensureAuthed() n'existe pas sur le banc, l'uid est
   passe en parametre (le contexte authentifie le porte deja). Le corps, lui,
   est mot pour mot celui de l'application. */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  var ref = doc(db, "chasseCodes", String(barcode));
  var snap = await getDoc(ref);                       // <- LA LECTURE, index.html:2507
  if (!snap.exists()) {
    await setDoc(ref, {
      drinkId: Number(drinkId) || drinkId,
      drinkName: String(drinkName).slice(0, 60),
      barcode: String(barcode),
      par: [uid],
      etat: "attente",
      createdAt: serverTimestamp()
    });
    return { nb: 1, deja: false };
  }
  var d = snap.data() || {};
  var par = Array.isArray(d.par) ? d.par : [];
  if (d.etat !== "attente") return { nb: par.length, deja: true, pose: true };
  if (par.indexOf(uid) !== -1) return { nb: par.length, deja: true };
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1, deja: false };
}

/* ── index.html:23456 — le texte que proposerChasse AFFICHE, a l'identique ── */
function texteAffiche(r) {
  return (r && r.nb >= 2)
    ? "Une deuxieme personne l'avait deja vue : le code va etre pose pour tout le monde."
    : "Il manque encore une confirmation d'une autre personne pour que le code compte pour tous. De ton cote, il marche deja.";
}

/* ── index.html:2529 — window.fbChargerChasseCodes, la fonction orpheline ─── */
async function fbChargerChasseCodes(db) {
  try {
    var snap = await getDocs(query(collection(db, "chasseCodes"), where("etat", "==", "attente")));
    var out = {};
    snap.forEach(function (d) {
      var v = d.data() || {};
      out[String(v.barcode || d.id)] = { drinkId: v.drinkId, nb: (v.par || []).length };
    });
    return out;
  } catch (e) { console.warn("chasseCodes:", e && e.message); return {}; }
}

const ID_A = 1700000000001, NOM_A = "Cusa Cola Zero";
const ID_B = 1700000000002, NOM_B = "Cusa Cola Cherry";
const CODE_A = "5449000000996";

/* ══ 1. Le compteur partage arrive-t-il a l'utilisateur ? ═══════════════════ */

await doit("1a. Alice confirme la 1re : l'app lui annonce l'etat partage (nb=1)", async () => {
  const r = await fbProposerCodeChasse(alice, "alice", ID_A, NOM_A, CODE_A);
  egal(r.nb, 1, "nb rendu par fbProposerCodeChasse");
  const vu = texteAffiche(r);
  if (!/manque encore une confirmation/.test(vu))
    throw new Error("l'ecran ne dit pas ou en est la chasse : « " + vu + " »");
  note("1a. -> a l'ecran : « " + vu + " »");
});

await doit("1b. Bob confirme la 2e : l'app lui annonce le seuil atteint (nb=2)", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", ID_A, NOM_A, CODE_A);
  egal(r.nb, 2, "nb rendu par fbProposerCodeChasse");
  const vu = texteAffiche(r);
  if (!/deuxieme personne/.test(vu))
    throw new Error("l'ecran ne dit pas que le seuil est atteint : « " + vu + " »");
  note("1b. -> a l'ecran : « " + vu + " »");
});

note("1. CONCLUSION : le compteur partage (nb) vient de fbProposerCodeChasse " +
     "(index.html:2503), qui lit le document par getDoc (index.html:2507) et renvoie " +
     "{nb}. proposerChasse l'affiche mot pour mot (index.html:23456). L'etat partage " +
     "EST donc montre a l'utilisateur — au moment ou il agit, sans passer par " +
     "fbChargerChasseCodes.");

/* ══ 2. Le renseignement du conflit est-il « jamais demande » ? ═════════════ */

await doit("2. le conflit : Carl vise la boisson B, le document dit deja A", async () => {
  /* Carl scanne le meme code en croyant confirmer une AUTRE boisson.
     On regarde ce que la lecture de fbProposerCodeChasse a sous les yeux. */
  const snap = await getDoc(doc(carl, "chasseCodes", CODE_A));
  const d = snap.data() || {};
  egal(d.drinkId, ID_A, "drinkId deja inscrit dans le document");
  if (Number(d.drinkId) === Number(ID_B))
    throw new Error("pas de conflit a observer");
  note("2. -> le getDoc de fbProposerCodeChasse (index.html:2507) a deja d.drinkId=" +
       d.drinkId + " (« " + d.drinkName + " ») en main, alors que l'appelant propose " +
       ID_B + " (« " + NOM_B + " »). Le renseignement du conflit est DEMANDE et " +
       "RECU — il est simplement jamais compare. Il n'a jamais eu besoin de " +
       "fbChargerChasseCodes.");
});

/* ══ 3. Que ferait fbChargerChasseCodes de plus, si on l'appelait ? ═════════ */

await doit("3. la fonction orpheline fonctionne et est lisible sans compte", async () => {
  const l = await fbChargerChasseCodes(anon);
  egal(Object.keys(l).length, 1, "entrees rendues");
  egal(l[CODE_A].nb, 2, "nb pour " + CODE_A);
  note("3. -> fbChargerChasseCodes rend { \"" + CODE_A + "\": { drinkId: " +
       l[CODE_A].drinkId + ", nb: " + l[CODE_A].nb + " } } : indexee par CODE-BARRE.");
});

note("3. Or l'ecran de la chasse (ouvrirChasseCodes, index.html:23390) liste des " +
     "BOISSONS ORPHELINES — c'est-a-dire, par definition (boissonsOrphelines, " +
     "index.html:23491), celles qui n'ont AUCUN code-barre. Les deux ne partagent " +
     "aucune cle : il faudrait retourner la table par drinkId pour les raccorder.");

note("4. INTENTION : la fonction est nee SANS appelant, dans le commit qui cree " +
     "toute la chasse (aeb0061, « La chasse aux codes-barres »). Ce commit decrit " +
     "en detail « CE QUE VOIT UN UTILISATEUR » : la carte d'accueil, la liste des " +
     "noms, et l'ecran de scan « Elle est dans la chasse ! ». Aucun compteur par " +
     "boisson n'y est promis. Le code n'a donc jamais perdu un appelant : il n'en " +
     "a jamais eu.");

note("5. ET SURTOUT : le commit ecrit « ils ont le produit en main, c'est le seul " +
     "moment ou la reponse est certaine ». Afficher « il ne manque qu'une " +
     "confirmation » sur une LISTE — ou personne n'a le produit en main — " +
     "inviterait a confirmer sans avoir verifie. C'est exactement le verrou n°1 " +
     "que le commentaire d'index.html:23346 protege (« un code-barre faux est PIRE " +
     "qu'un code absent »).");

await bilan(env);
