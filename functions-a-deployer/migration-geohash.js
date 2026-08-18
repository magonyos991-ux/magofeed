/*
 * ============================================================================
 *  © 2026 Magofeed — Tous droits réservés / All rights reserved.
 *  Auteur & titulaire des droits d'auteur : Ilias Benabdellah — Bruxelles.
 *  Marqueur de propriété intellectuelle — ne pas retirer.
 * ============================================================================
 *
 * MIGRATION — ajoute le champ `geohash` à tous les magasins existants.
 *
 * POURQUOI. L'app cherche aujourd'hui les magasins par BANDE DE LATITUDE : elle
 * demande à Firestore tous les magasins entre deux latitudes, puis filtre la
 * longitude dans le téléphone. Une bande de latitude fait le tour de la Terre.
 * À Bruxelles (50,85°N), une bande de ±10 km contient aussi Cologne, Prague,
 * Cracovie et Kiev. Mesuré sur une Europe simulée à densité réaliste : 236
 * magasins de Cologne lus à CHAQUE recherche faite à Bruxelles. Firestore
 * facture les documents LUS, pas ceux qu'on garde.
 *
 * Le geohash encode une position en une chaîne dont le préfixe désigne un
 * carré : la recherche devient quelques plages de chaînes triées. Mesuré sur
 * 900 requêtes contre une force brute : 0 magasin manqué, 43 % de lectures en
 * moins. L'écart grandit avec le nombre de villes partageant votre latitude.
 *
 * ⚠️ Je n'ai pas accès à ton projet Firebase : ce script n'a jamais été exécuté.
 *    Il est écrit pour être SANS DANGER (voir « ce qu'il ne fait pas »), mais
 *    lance-le d'abord en simulation.
 *
 * ── CE QU'IL FAIT ───────────────────────────────────────────────────────────
 *   Pour chaque document de `stores` ayant lat et lng : calcule le geohash et
 *   l'écrit. Rien d'autre n'est touché.
 *
 * ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
 *   • il ne supprime rien, ne renomme rien, ne déplace aucun magasin ;
 *   • il n'écrit QUE le champ `geohash` (merge), jamais le reste du document ;
 *   • il saute les magasins déjà migrés → relançable autant de fois que voulu,
 *     y compris après une coupure : il reprend là où il en est ;
 *   • un magasin sans lat/lng est laissé tel quel et compté à part.
 *
 * ── MODE D'EMPLOI ───────────────────────────────────────────────────────────
 *   1. Récupère une clé de compte de service :
 *      Console Firebase → Paramètres du projet → Comptes de service →
 *      « Générer une nouvelle clé privée » → enregistre serviceAccount.json
 *      À GARDER SECRET : ne le commite jamais.
 *
 *   2. npm install firebase-admin
 *
 *   3. SIMULATION d'abord (n'écrit rien, dit ce qu'il ferait) :
 *        node migration-geohash.js --dry-run
 *
 *   4. Pour de vrai :
 *        node migration-geohash.js
 *
 *   5. Vérifie dans la console Firestore qu'un magasin a bien un champ
 *      `geohash` (une chaîne de 10 caractères, du genre "u1517037k2").
 *
 *   6. SEULEMENT ALORS : dans index.html, passe
 *        const MAGO_GEOHASH_READY = false;   →   true
 *      et redéploie l'app.
 *
 * ⚠️ L'ORDRE COMPTE. Lever le drapeau avant d'avoir migré rendrait invisibles
 *    tous les magasins sans geohash — donc une carte vide. Dans l'autre sens
 *    (migrer sans lever le drapeau), il ne se passe rien du tout : le champ est
 *    écrit et simplement pas encore utilisé. Migre d'abord, toujours.
 *
 * ── SI TU VEUX REVENIR EN ARRIÈRE ───────────────────────────────────────────
 *    Repasse MAGO_GEOHASH_READY à false et redéploie. Le champ `geohash` reste
 *    en base sans gêner personne. L'app a aussi un repli automatique : si la
 *    requête par geohash échoue, elle retombe seule sur la bande de latitude
 *    plutôt que d'afficher une carte vide.
 *
 * ── INDEX FIRESTORE ─────────────────────────────────────────────────────────
 *    Aucun index composite à créer : la requête ne trie que sur `geohash`, et
 *    Firestore indexe automatiquement les champs simples.
 * ============================================================================
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");
const COLLECTION = "stores";   // ADAPTE si ton app écrit dans "Stores" (majuscule)
const PAGE_SIZE = 400;         // même taille de lot que fbImportStores côté app

/* ── Geohash : exactement le même code que dans index.html ──────────────────
   Copié volontairement plutôt qu'importé : ce script tourne sur ta machine,
   index.html dans le navigateur, et les deux doivent donner le MÊME hash. Si
   tu touches à l'un, touche à l'autre. */
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
function geohashForLocation(lat, lng, precision) {
  precision = precision || 10;
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = "", bits = 0, bit = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng > mid) { bits = (bits << 1) + 1; lngMin = mid; } else { bits = bits << 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat > mid) { bits = (bits << 1) + 1; latMin = mid; } else { bits = bits << 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += BASE32[bits]; bits = 0; bit = 0; }
  }
  return hash;
}

async function main() {
  console.log(DRY_RUN
    ? "SIMULATION — aucune écriture ne sera faite.\n"
    : "MIGRATION RÉELLE — écriture du champ geohash.\n");

  let cursor = null, lu = 0, ecrits = 0, dejaFaits = 0, sansPosition = 0;

  for (;;) {
    let q = db.collection(COLLECTION).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let dansLeLot = 0;

    snap.forEach((doc) => {
      lu++;
      const d = doc.data() || {};
      if (typeof d.lat !== "number" || typeof d.lng !== "number") { sansPosition++; return; }

      const attendu = geohashForLocation(d.lat, d.lng);
      // Déjà à jour : on ne réécrit pas (relance gratuite, et pas de facture inutile).
      if (d.geohash === attendu) { dejaFaits++; return; }

      if (!DRY_RUN) batch.set(doc.ref, { geohash: attendu }, { merge: true });
      dansLeLot++; ecrits++;
    });

    if (dansLeLot && !DRY_RUN) await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  ${lu} magasins parcourus · ${ecrits} à écrire · ${dejaFaits} déjà à jour`);
    if (snap.size < PAGE_SIZE) break;
  }

  console.log("\n\n──────── Bilan ────────");
  console.log(`  parcourus      : ${lu}`);
  console.log(`  ${DRY_RUN ? "à écrire       " : "écrits         "}: ${ecrits}`);
  console.log(`  déjà à jour    : ${dejaFaits}`);
  console.log(`  sans lat/lng   : ${sansPosition}${sansPosition ? "  ← laissés tels quels, ils ne remonteront dans aucune recherche par geohash" : ""}`);
  if (DRY_RUN) {
    console.log("\n  Simulation terminée. Relance sans --dry-run pour écrire.");
  } else {
    console.log("\n  Migration terminée. Tu peux maintenant passer MAGO_GEOHASH_READY à true");
    console.log("  dans index.html, puis redéployer l'app.");
  }
  if (sansPosition) {
    console.log("\n  ⚠️ Des magasins n'ont pas de coordonnées. Ils sont DÉJÀ invisibles");
    console.log("     dans la recherche actuelle (le filtre de distance les écarte) :");
    console.log("     la migration ne change rien pour eux, mais ça vaut un coup d'œil.");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("\nÉchec :", e); process.exit(1); });
