/**
 * Magofeed — IMPORT DES HORAIRES REELS (OpenStreetMap), cote serveur.
 *
 * « Je veux les horaires de tous les magasins, comme Google Maps. »
 * Les horaires existent librement dans OpenStreetMap ; ils sont moissonnes
 * pour toute la Belgique dans data/horaires-osm-be.json (publie avec le
 * site). Cette fonction telecharge ce fichier, parcourt la collection stores
 * avec l'Admin SDK, et ecrit les horaires sur chaque magasin importe d'OSM
 * (identifiants « o<id> » ou champ osm) qui n'en a pas encore. L'app affiche
 * alors Ouvert/Ferme d'apres les VRAIS horaires — l'heuristique ne reste
 * qu'en dernier recours pour les magasins ajoutes a la main.
 *
 * Deploiement (meme rituel que remplirEnseignes) :
 *   curl.exe -o importer-horaires.js https://magonyos991-ux.github.io/magofeed/functions-a-deployer/importer-horaires.js
 *   + dans index.js : Object.assign(exports, require("./importer-horaires"));
 *   firebase deploy --only functions:importerHoraires
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();

const URL_DONNEES = "https://magonyos991-ux.github.io/magofeed/data/horaires-osm-be.json";

exports.importerHoraires = onCall(
  { region: "europe-west1", timeoutSeconds: 540, memory: "512MiB" },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const adm = await db.collection("admins").doc(uid).get();
    if (!adm.exists) throw new HttpsError("permission-denied", "Réservé à l'administrateur.");

    const rep = await fetch(URL_DONNEES);
    if (!rep.ok) throw new HttpsError("unavailable", "Jeu d'horaires introuvable (" + rep.status + ").");
    const horaires = await rep.json();

    let parcourus = 0, ecrits = 0, dejaFait = 0;
    let last = null;
    for (;;) {
      let q = db.collection("stores").orderBy("__name__").limit(600);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      let batch = db.batch(), n = 0;
      for (const d of snap.docs) {
        parcourus++;
        const v = d.data() || {};
        // identifiant OSM : champ osm, ou id de document « o12345 »
        let osm = v.osm != null ? String(v.osm) : null;
        if (!osm && /^o\d+$/.test(d.id)) osm = d.id.slice(1);
        if (!osm) continue;
        const h = horaires[osm];
        if (!h) continue;
        if (v.hours === h) { dejaFait++; continue; }
        batch.update(d.ref, { hours: h });
        ecrits++;
        if (++n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
      }
      if (n) await batch.commit();
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 600) break;
    }
    console.log("importerHoraires:", parcourus, "parcourus,", ecrits, "horaires ecrits,", dejaFait, "deja a jour");
    return { parcourus, ecrits, dejaFait, dansLeJeu: Object.keys(horaires).length };
  }
);
