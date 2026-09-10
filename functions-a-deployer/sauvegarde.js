/**
 * Magofeed — SAUVEGARDE AUTOMATIQUE DE LA BASE.
 *
 * POURQUOI C'EST LA PROTECTION LA PLUS IMPORTANTE
 * Tout le reste de la securite empeche quelqu'un d'ABIMER les donnees. Ceci
 * repare quand c'est deja fait. Une fausse manip a 2 h du matin, un bouton
 * « supprimer » tape a cote, une fonction qui tourne mal : sans sauvegarde,
 * les 30 000 magasins, les points de chaque joueur et les certifications sont
 * perdus pour toujours. Avec, on revient en arriere.
 *
 * CE QUE CA FAIT
 * Chaque nuit a 3 h (heure de Bruxelles), Firestore exporte l'integralite de
 * la base vers un dossier date dans le bucket de stockage du projet. C'est
 * l'export MANAGE de Google : il est coherent (photo instantanee de la base),
 * il ne consomme AUCUNE lecture facturee, et il se restaure avec une seule
 * commande.
 *
 * RESTAURER (a ne faire qu'en cas de vrai probleme) :
 *   gcloud firestore import gs://<TON-BUCKET>/sauvegardes/<AAAA-MM-JJ>
 * Pour ne restaurer qu'une collection :
 *   gcloud firestore import gs://<...>/sauvegardes/<date> --collection-ids=stores
 *
 * COUT : quelques centimes par mois pour une base de cette taille. Les
 * sauvegardes de plus de 30 jours sont supprimees automatiquement.
 *
 * DEPLOIEMENT
 *   1) copier ce fichier dans le dossier functions
 *   2) npm install @google-cloud/firestore  (dans le dossier functions)
 *   3) ajouter dans index.js :
 *        Object.assign(exports, require("./sauvegarde"));
 *   4) firebase deploy --only functions:sauvegardeQuotidienne,functions:sauvegarderMaintenant
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
/* CHARGEMENT PARESSEUX. Cette bibliotheque n'est pas necessaire pour DECRIRE
   les fonctions, seulement pour les EXECUTER. Or « firebase deploy » commence
   par charger tout le code dans un serveur de decouverte, avec dix secondes
   pour repondre : chaque bibliotheque lourde chargee en tete de fichier compte
   dans ce delai, sur une machine froide comme sur une machine chargee.
   Un deploiement echouait ainsi par intermittence sur « User code failed to
   load. Cannot determine backend specification. Timeout after 10000 » — un
   message qui ne nomme ni fichier, ni ligne, ni bibliotheque. On la charge
   donc au premier appel reel, et une seule fois grace au cache de require. */
let _client = null;
function clientAdmin() {
  if (!_client) {
    const { v1 } = require("@google-cloud/firestore");
    _client = new v1.FirestoreAdminClient();
  }
  return _client;
}

if (!getApps().length) initializeApp();
const db = getFirestore();

const PROJET = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
/* LE NOM DU SEAU NE SE DEVINE PLUS. Il etait ecrit en dur comme
   « <projet>.appspot.com ». C'etait vrai pour les anciens projets Firebase ;
   depuis fin 2024 le seau par defaut s'appelle « <projet>.firebasestorage.app »,
   et c'est le cas de Magofeed — sa propre configuration dit
   « magofeed-7f621.firebasestorage.app ». L'export serait donc parti vers un
   seau inexistant : Ilias aurait cru avoir des sauvegardes sans en avoir
   aucune, exactement le faux sentiment de securite que ce fichier dit vouloir
   eviter. On demande donc au SDK le seau REEL du projet, et on ne retombe sur
   un nom devine que s'il ne repond pas. Le nom retenu est journalise a chaque
   sauvegarde : en cas de doute, il est ecrit noir sur blanc. */
function seauDuProjet() {
  try {
    const b = getStorage().bucket();
    if (b && b.name) return "gs://" + b.name;
  } catch (e) { console.warn("seau par defaut introuvable:", e && e.message); }
  return "gs://" + PROJET + ".firebasestorage.app";
}
const BUCKET = seauDuProjet();
const JOURS_GARDES = 30;

/* Deux chiffres, toujours : « 2026-03-07 » et non « 2026-3-7 ». */
function jour(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}

async function exporter(motif) {
  const nom = clientAdmin().databasePath(PROJET, "(default)");
  const dossier = BUCKET + "/sauvegardes/" + jour(new Date());
  const [op] = await clientAdmin().exportDocuments({
    name: nom,
    outputUriPrefix: dossier,
    collectionIds: []      // vide = TOUTE la base
  });
  console.log("sauvegarde (" + motif + ") lancee ->", dossier, "|", op.name,
              "| seau resolu:", BUCKET);
  return { dossier, operation: op.name };
}

/* « CALLER DOES NOT HAVE PERMISSION ». C'est le refus de Google Cloud, et il ne
   dit ni QUI n'a pas le droit, ni SUR QUOI, ni comment le donner. Affiche tel
   quel dans l'ecran d'administration, il ne servait a rien : la sauvegarde
   etait rouge depuis des jours sans que personne puisse agir.

   Exporter une base Firestore demande le role « Cloud Datastore Import Export
   Admin » sur le compte de service qui execute la fonction. Les projets crees
   depuis 2024 ne le donnent plus par defaut — le code etait juste, la
   permission manquait, et rien ne le disait.

   On traduit donc le refus en instruction. Un message d'erreur qui ne dit pas
   quoi faire ne vaut guere mieux que pas de message du tout. */
function expliquer(e) {
  const brut = String((e && e.message) || e || "");

  /* LE COFFRE N'EXISTE PAS. Deuxieme panne rencontree, et elle ne ressemble en
     rien a la premiere : le droit d'exporter etait enfin accorde, mais l'espace
     de stockage vers lequel ecrire n'avait jamais ete cree. Firebase annonce un
     seau par defaut dans la configuration du projet AVANT que Storage soit
     active — le nom existe, le coffre non. On visait donc une adresse valide et
     vide, et Google repondait NOT_FOUND, ce qui se lit comme un bug de code
     alors que c'est un service a activer en deux clics. */
  if (/bucket does not exist|NOT_FOUND/i.test(brut)) {
    return "L'espace de stockage des sauvegardes n'existe pas encore. Ouvre la " +
      "console Firebase, section Storage, et clique sur Commencer pour le creer " +
      "(choisis une region en Europe, ce choix est definitif). Message d'origine : " +
      brut.slice(0, 150);
  }

  const refus = /permission|PERMISSION_DENIED|does not have|IAM/i.test(brut);
  if (!refus) return brut.slice(0, 300);
  const projet = PROJET || "le projet";
  return "Permission manquante pour exporter la base. Donne le role « Cloud " +
    "Datastore Import Export Admin » au compte de service des fonctions, dans " +
    "la console Google Cloud du projet " + projet + " (IAM). Message d'origine : " +
    brut.slice(0, 150);
}

/* LA PURGE, QUI N'EXISTAIT PAS. L'en-tete de ce fichier promettait que « les
   sauvegardes de plus de 30 jours sont supprimees automatiquement ». La
   constante JOURS_GARDES etait bien la, et aucune ligne ne s'en servait. Les
   exports se seraient accumules sans fin, et la facture avec eux — une promesse
   fausse dans un commentaire est pire qu'un silence, parce qu'on cesse d'y
   penser.

   ON EFFACE PEU ET ON EFFACE SUR : trois garde-fous, parce qu'une suppression
   ne se rattrape pas.
     1. Seuls les chemins de la forme sauvegardes/AAAA-MM-JJ/ sont touches. Tout
        autre fichier du seau est ignore, quoi qu'il arrive.
     2. On garde TOUJOURS les trois dossiers les plus recents, meme vieux. Si la
        sauvegarde automatique tombe en panne deux mois, la purge ne doit pas
        emporter les dernieres copies existantes le jour ou elle repart.
     3. La purge ne s'execute qu'apres un export REUSSI. On ne jette jamais
        l'ancien avant d'avoir le nouveau. */
async function purger() {
  try {
    const seau = getStorage().bucket();
    const [fichiers] = await seau.getFiles({ prefix: "sauvegardes/" });
    if (!fichiers.length) return 0;

    /* Le nom du dossier EST la date : rien a lire ailleurs, rien a deviner. */
    const parJour = new Map();
    for (const f of fichiers) {
      const m = /^sauvegardes\/(\d{4}-\d{2}-\d{2})\//.exec(f.name);
      if (!m) continue;                       // garde-fou 1
      if (!parJour.has(m[1])) parJour.set(m[1], []);
      parJour.get(m[1]).push(f);
    }
    const jours = [...parJour.keys()].sort();          // du plus ancien au plus recent
    const limite = new Date(Date.now() - JOURS_GARDES * 86400000).toISOString().slice(0, 10);
    const proteges = new Set(jours.slice(-3));         // garde-fou 2

    let efface = 0;
    for (const j of jours) {
      if (proteges.has(j) || j >= limite) continue;
      for (const f of parJour.get(j)) {
        try { await f.delete(); efface++; } catch (e) { console.warn("purge:", f.name, e && e.message); }
      }
      console.log("purge : dossier " + j + " supprime");
    }
    return efface;
  } catch (e) { console.warn("purge impossible:", e && e.message); return 0; }
}

/* Journal des sauvegardes, lisible depuis l'app par l'administrateur : sans
   trace visible, une sauvegarde qui echoue en silence donne un faux
   sentiment de securite — le pire des deux mondes. */
async function noter(champs) {
  try {
    /* _meta et non meta : la collection « meta » est lisible par tous, et le
       journal contient le chemin du bucket de sauvegarde — inutile de le
       publier. « _meta » est reservee a l'administrateur par les regles. */
    await db.collection("_meta").doc("sauvegardes").set({
      derniere: champs,
      majLe: new Date().toISOString()
    }, { merge: true });
  } catch (e) { console.warn("journal sauvegarde:", e && e.message); }
}

/* « LANCEE » N'EST PAS « REUSSIE ». exportDocuments ne fait que DEMARRER une
   operation longue : elle rend un identifiant, pas un resultat. Personne ne
   relisait jamais si l'export avait abouti, et le journal ne connaissait donc
   que « lancee » — un mot que l'ecran d'administration affichait en vert.
   Chaque passage verifie donc le precedent : c'est le seul moment ou l'on sait
   vraiment. Si l'operation a fini, l'etat devient « reussie » ou
   « echec-confirme » ; si on ne peut pas la relire, on ne touche a rien et on
   le dit plutot que d'inventer. */
async function verifierPrecedente() {
  try {
    const snap = await db.collection("_meta").doc("sauvegardes").get();
    const prec = snap.exists ? ((snap.data() || {}).derniere || null) : null;
    if (!prec || prec.etat !== "lancee" || !prec.operation) return;
    const [op] = await clientAdmin().operationsClient.getOperation({ name: prec.operation });
    if (!op || !op.done) return;                    // encore en cours : on attend
    await db.collection("_meta").doc("sauvegardes").set({
      derniere: Object.assign({}, prec, op.error
        ? { etat: "echec-confirme", erreur: expliquer(op.error) }
        : { etat: "reussie", finiLe: new Date().toISOString() })
    }, { merge: true });
    console.log("sauvegarde precedente :", op.error ? "ECHOUEE" : "reussie");
    /* Garde-fou 3 : on ne purge qu'apres avoir CONFIRME une reussite. */
    if (!op.error) {
      const n = await purger();
      if (n) console.log("purge : " + n + " fichier(s) de plus de " + JOURS_GARDES + " jours supprime(s)");
    }
  } catch (e) { console.warn("verification precedente impossible:", e && e.message); }
}

exports.sauvegardeQuotidienne = onSchedule(
  { schedule: "0 3 * * *", timeZone: "Europe/Brussels", region: "europe-west1",
    timeoutSeconds: 540, retryCount: 2 },
  async () => {
    await verifierPrecedente();
    try {
      const r = await exporter("automatique");
      await noter({ quand: new Date().toISOString(), dossier: r.dossier, operation: r.operation,
                    etat: "lancee", motif: "automatique" });
    } catch (e) {
      console.error("SAUVEGARDE ECHOUEE:", e && e.message);
      await noter({ quand: new Date().toISOString(), etat: "echec", erreur: expliquer(e), motif: "automatique" });
      throw e;   // pour que la nouvelle tentative se declenche
    }
  }
);

/* Sauvegarde a la demande : a lancer AVANT toute operation risquee (purge,
   remplissage massif, migration). Reservee a l'administrateur. */
exports.sauvegarderMaintenant = onCall(
  { region: "europe-west1", timeoutSeconds: 540 },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const adm = await db.collection("admins").doc(uid).get();
    if (!adm.exists) throw new HttpsError("permission-denied", "Réservé à l'administrateur.");
    await verifierPrecedente();
    let r;
    try {
      r = await exporter("manuelle");
    } catch (e) {
      /* L'echec est note AVANT d'etre relance : sinon un clic rate ne laissait
         aucune trace, et l'ecran continuait d'afficher l'etat d'avant. */
      const dit = expliquer(e);
      await noter({ quand: new Date().toISOString(), etat: "echec", erreur: dit, motif: "manuelle", par: uid });
      throw new HttpsError("failed-precondition", dit);
    }
    await noter({ quand: new Date().toISOString(), dossier: r.dossier, operation: r.operation,
                  etat: "lancee", motif: "manuelle", par: uid });
    return { dossier: r.dossier };
  }
);
