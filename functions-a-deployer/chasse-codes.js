/**
 * Magofeed — LA CHASSE AUX CODES-BARRES : la pose du lien.
 *
 * A QUOI CA SERT
 * Certaines fiches du catalogue sont nees d'une proposition PHOTO et n'ont donc
 * aucun code-barre : elles existent dans la recherche, elles ont parfois leur
 * image, mais scanner le produit qu'elles decrivent ne les trouve pas — et la
 * personne cree un doublon. La chasse demande a ceux qui font les courses de
 * les retrouver en rayon : ils ont le produit en main, c'est le seul moment ou
 * la reponse est certaine.
 *
 * POURQUOI CETTE FONCTION EXISTE PLUTOT QUE DE LAISSER LE TELEPHONE ECRIRE
 * Un code-barre FAUX est pire qu'un code absent. Une fiche sans code ne trouve
 * rien ; une fiche avec le mauvais code affirme une chose fausse, avec
 * assurance, a tout le monde, et le desaveu est individuel. Le catalogue est
 * donc en ecriture isAdmin() (firestore.rules), et c'est ici, avec l'Admin SDK,
 * qu'on pose le lien — a DEUX confirmations de personnes differentes.
 *
 * CE QUE LES REGLES GARANTISSENT DEJA
 * chasseCodes/{barcode} n'accepte qu'une chose du client : s'ajouter soi-meme,
 * une seule fois, a la liste 'par'. Ni ajouter quelqu'un d'autre, ni changer la
 * boisson visee, ni se declarer valide. A la creation, elles exigent en plus un
 * compte qui ne soit pas anonyme, un nom de document qui EST le code (chiffres,
 * sans zeros de tete, cle GS1 juste), et une fiche visee qui n'a encore aucun
 * code.
 *
 * CE QUE CETTE FONCTION VERIFIE QUAND MEME, ET POURQUOI
 * - « Deux personnes » ne veut rien dire si une personne vaut un compte : un
 *   compte e-mail se cree en dix secondes avec une adresse inventee. On exige
 *   donc la meme chose qu'anti-farm.js pour la meme raison : deux comptes lies
 *   a une vraie methode de connexion, dont au moins un vieux d'une semaine. Les
 *   regles ne connaissent pas l'age d'un compte ; ici, on le lit.
 * - Un code deja porte par une AUTRE fiche n'est pas pose : deux fiches pour
 *   un code, et chaque scan devient un tirage au sort. Les regles ne peuvent
 *   pas chercher dans le catalogue ; ici, on cherche.
 * - Les documents ecrits AVANT ces regles (champ barcode libre, compte anonyme,
 *   code sans cle de controle) passent encore par ici : on ne pose que ce que
 *   les regles d'aujourd'hui auraient laisse entrer.
 *
 * LES POINTS TOMBENT ICI, PAS AU MOMENT DE LA PROPOSITION.
 * Payer le geste plutot que le resultat, c'est installer une imprimante a
 * points : il suffirait de proposer n'importe quoi en boucle. On paie donc les
 * confirmants au moment ou le lien devient vrai — une seule fois, le verrou
 * etant l'etat du document lui-meme, et seulement ceux qui ont vraiment compte.
 *
 * DEPLOIEMENT
 *   Deja branchee dans index.js. Aucun secret. getAuth() lit les comptes avec
 *   le compte de service des fonctions, comme anti-farm.js.
 *
 * SANS CETTE FONCTION, l'app marche quand meme : les confirmations
 * s'accumulent, le lien vaut deja pour l'appareil de qui a confirme, et
 * l'administrateur peut poser le code a la main depuis « Fiches sans
 * code-barre ». La fonction ne fait qu'automatiser le dernier pas.
 */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = "europe-west1";

/* Deux personnes differentes. Pas trois : au-dela, une boisson rare — et ce
   sont justement les rares qui manquent — n'atteindrait jamais le compte, et
   la chasse ne se terminerait pas. Pas une seule : un geste distrait suffirait
   a poser un lien faux pour tout le monde. */
const CONFIRMATIONS_REQUISES = 2;
const POINTS_PAR_CONFIRMANT = 5;
/* Une semaine, comme anti-farm.js : facile pour un habitue, hors de portee
   d'un compte fabrique a l'instant. Un seul des confirmants doit l'avoir —
   l'exiger des deux fermerait la chasse aux nouveaux venus, qui sont souvent
   ceux qui ont le produit en main. */
const ANCIENNETE_MS = 7 * 86400000;

/* La forme sous laquelle l'app compare les codes partout (codeNu, index.html) :
   des chiffres, sans zeros de tete. UPC-A (12) et EAN-13 (13) du meme produit
   ne different que par ces zeros, et selon le decodeur le telephone rend l'un
   ou l'autre. Comparer les chaines brutes fabriquait des desaccords entre
   deux personnes honnetes. */
function codeNu(c) {
  return String(c == null ? "" : c).replace(/\D/g, "").replace(/^0+/, "");
}

/* La cle de controle GS1, calculee sur la forme a 14 chiffres : les zeros de
   tete ne la changent pas. Meme calcul que validGTIN (index.html). */
function cleGS1Valide(nu) {
  if (!/^[1-9]\d{5,13}$/.test(nu)) return false;
  const g = nu.padStart(14, "0");
  let somme = 0;
  for (let i = 0; i < 13; i++) somme += Number(g[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (somme % 10)) % 10 === Number(g[13]);
}

/* Toutes les ecritures qu'un meme code peut avoir dans un tableau barcodes :
   le catalogue garde les codes tels qu'ils ont ete saisis. */
function formesDuCode(nu) {
  const formes = [nu];
  for (const n of [8, 12, 13, 14]) if (nu.length <= n) formes.push(nu.padStart(n, "0"));
  return Array.from(new Set(formes));
}

/* Ce qu'on ecrit sur la fiche : la forme EAN-8, EAN-13 ou GTIN-14 complete,
   celle que rendent les lecteurs et qu'OpenFoodFacts connait. */
function formeStandard(nu) {
  if (nu.length <= 8) return nu.padStart(8, "0");
  if (nu.length <= 13) return nu.padStart(13, "0");
  return nu;
}

/* Qui compte comme une personne. Meme critere qu'anti-farm.js : un compte lie
   a une methode de connexion reelle (Google, e-mail). Un compte anonyme ne
   compte pas, un compte introuvable non plus. */
async function lireComptes(uids) {
  const parUid = new Map();
  try {
    const res = await getAuth().getUsers(uids.slice(0, 100).map((uid) => ({ uid })));
    for (const u of res.users || []) parUid.set(u.uid, u);
  } catch (e) {
    console.warn("chasse : lecture des comptes impossible:", e && e.message);
  }
  return uids.map((uid) => {
    const u = parUid.get(uid);
    const vrai = !!u && Array.isArray(u.providerData) && u.providerData.length > 0;
    const age = u ? Date.now() - Date.parse(u.metadata && u.metadata.creationTime) : 0;
    return { uid, vrai, ancien: vrai && age > ANCIENNETE_MS };
  });
}

/* Classer sans suite : la chasse est fermee, rien n'est pose, personne n'est
   paye. La raison reste sur le document, pour l'administrateur. */
async function classer(ref, raison, detail) {
  try {
    await ref.update(Object.assign({ etat: "sans-suite", raison: raison }, detail || {}));
  } catch (e) { console.warn("chasse : classement", raison, e && e.message); }
}

async function traiterChasse(ref, d, idDocument) {
  if (d.etat !== "attente") return;                    // deja pose, ou classe sans suite

  /* Le code, c'est le NOM du document, pas le champ barcode : celui-ci a
     longtemps ete libre, et deux documents pouvaient viser le meme code pour
     deux boissons differentes. */
  const code = codeNu(idDocument);
  if (d.barcode != null && codeNu(d.barcode) !== code) return classer(ref, "code-incoherent");
  if (!cleGS1Valide(code)) return classer(ref, "code-invalide");
  const drinkId = String(d.drinkId == null ? "" : d.drinkId);
  if (!drinkId) return classer(ref, "document-incomplet");

  const par = Array.isArray(d.par) ? d.par.map(String) : [];
  if (par.length < CONFIRMATIONS_REQUISES) return;     // pas encore assez

  /* Pas assez de vraies personnes : la chasse reste OUVERTE. Une confirmation
     de plus — d'un habitue — la fera aboutir ; la fermer punirait le vrai
     confirmant pour la faute d'un compte jetable. */
  const comptes = await lireComptes(par);
  const valides = comptes.filter((c) => c.vrai);
  if (valides.length < CONFIRMATIONS_REQUISES || !valides.some((c) => c.ancien)) {
    console.log("chasse : en attente d'un vrai compte ancien", code,
                valides.length + "/" + par.length + " comptes reels");
    return;
  }

  /* VERROU. Deux confirmations peuvent arriver dans la meme seconde et
     declencher deux executions : sans transaction, le code serait pose deux
     fois et les points verses deux fois. Le passage 'attente' -> 'pose' ne
     peut reussir qu'une fois. */
  const aPoser = await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    const v = s.exists ? (s.data() || {}) : {};
    if (v.etat !== "attente") return false;
    t.update(ref, { etat: "pose", poseLe: FieldValue.serverTimestamp() });
    return true;
  }).catch((e) => { console.warn("verrou chasse:", e && e.message); return false; });
  if (!aPoser) return;

  try {
    const ficheRef = db.collection("catalog").doc(drinkId);
    const fiche = await ficheRef.get();
    if (!fiche.exists) {
      /* La fiche a disparu entre la proposition et maintenant (fusion,
         suppression). On ne recree rien : on classe et on ne paie personne
         pour un lien qui ne mene nulle part. */
      await ref.update({ etat: "sans-suite", raison: "fiche-absente" });
      console.warn("chasse : fiche catalogue absente", drinkId);
      return;
    }
    /* Seul le catalogue partage est interroge : les fiches natives du fichier
       de l'app ne sont pas en base. Au scan, elles passent de toute facon
       devant les fiches communautaires. */
    const porteurs = await db.collection("catalog")
      .where("barcodes", "array-contains-any", formesDuCode(code)).get();
    const autre = porteurs.docs.find((x) => x.id !== drinkId);
    if (autre) {
      await ref.update({ etat: "sans-suite", raison: "code-deja-pris", prisPar: autre.id });
      console.warn("chasse : code", code, "deja porte par la fiche", autre.id);
      return;
    }
    const codes = (fiche.data() || {}).barcodes || [];
    if (!codes.some((c) => codeNu(c) === code)) {
      await ficheRef.set(
        { barcodes: codes.concat([formeStandard(code)]), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    console.log("chasse : code pose", code, "->", drinkId, "par", valides.length, "personnes");
  } catch (e) {
    /* La pose a echoue : on rouvre plutot que de laisser un document dit
       « pose » sur une fiche qui n'a rien recu. */
    console.error("chasse : pose du code:", e && e.message);
    try { await ref.update({ etat: "attente" }); } catch (e2) {}
    return;
  }

  /* Les points, maintenant que le lien est vrai. Chaque confirmant qui a
     compte, une fois. Un echec ici ne remet pas le lien en cause : le code est
     pose, et c'est lui qui compte. */
  for (const c of valides) {
    try {
      await db.collection("users").doc(c.uid).set(
        { pts: FieldValue.increment(POINTS_PAR_CONFIRMANT) },
        { merge: true }
      );
    } catch (e) { console.warn("chasse : points a", c.uid, e && e.message); }
  }
}

exports.poserCodeChasse = onDocumentWritten(
  { document: "chasseCodes/{barcode}", region: REGION, memory: "256MiB",
    timeoutSeconds: 60, maxInstances: 5 },
  async (event) => {
    const apres = event.data && event.data.after;
    if (!apres || !apres.exists) return;                 // suppression : rien a faire
    await traiterChasse(apres.ref, apres.data() || {}, String(event.params.barcode || ""));
  }
);
