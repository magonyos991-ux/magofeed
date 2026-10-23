/**
 * Magofeed — IMPORT DES HORAIRES OPENSTREETMAP : DEBRANCHE, ET POURQUOI.
 *
 * CE QU'ELLE PROMETTAIT : « ecrit les horaires sur chaque magasin importe
 * d'OSM qui n'en a pas encore ». CE QU'ELLE FAISAIT : elle ecrivait des que la
 * valeur differait. Son seul garde-fou etait une egalite de chaine, jamais un
 * test « ce magasin a-t-il deja un horaire ». La boite de dialogue
 * d'administration repetait la meme promesse a l'ecran. Un clic, et les
 * horaires qu'un commercant avait saisis lui-meme partaient sans retour, sur
 * une base de 169 comptes reels.
 *
 * ET ELLE NE SERVAIT A RIEN. L'application lit deja data/horaires-osm-be.json
 * A L'AFFICHAGE, en chargement paresseux : chargerHorairesOSM + osmIdDe +
 * horairesReels font la jointure par identifiant OpenStreetMap au moment ou la
 * fiche s'ouvre. Ecrire ces memes horaires dans Firestore n'ajoutait aucun
 * affichage.
 *
 * PIRE, CELA RENDAIT LE RAFRAICHISSEMENT HEBDOMADAIRE INERTE. openInfo essaie
 * s.hours EN PREMIER ; des que le champ est rempli, horairesReels n'est plus
 * jamais consulte pour ce magasin. Publier un fichier plus frais la semaine
 * suivante n'aurait donc rien corrige sur les magasins touches par l'import —
 * l'inverse exact de ce qui etait demande.
 *
 * ET LE FICHIER N'EST PAS CE QUE SON NOM DIT. Ses cles sont des identifiants
 * OpenStreetMap NUS, qui melangent nœuds et chemins dans un seul espace de
 * noms. Un meme nombre peut designer les deux : 8112413 est a la fois un nœud
 * supprime et un chemin vivant — un Kaufland d'Aix-la-Chapelle, en ALLEMAGNE,
 * dont l'horaire est bien celui inscrit dans le fichier. Le fichier contient
 * donc de l'etranger, et la jointure par nombre nu est ambigue par
 * construction. Figer cela dans 34 786 documents de production aurait grave
 * des horaires faux en les presentant comme des faits.
 *
 * CE QUI EST FAIT A LA PLACE : le champ `hours` reste reserve aux horaires
 * d'origine HUMAINE, le fichier sert l'affichage, et son rafraichissement est
 * un simple remplacement de fichier qui ne touche aucun document.
 *
 * ELLE RESTE ICI, CORRIGEE, PLUTOT QUE SUPPRIMEE : si quelqu'un la rebranche
 * un jour, elle doit etre incapable de detruire. Le garde-fou ci-dessous
 * refuse tout magasin qui porte deja un horaire, et la lecture de
 * l'identifiant couvre enfin le champ osmId que le client lit depuis
 * longtemps. Elle n'est PAS exportee : voir le bloc « PAS ENCORE BRANCHE »
 * de index.js.
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

    let parcourus = 0, ecrits = 0, dejaFait = 0, proteges = 0;
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
        // identifiant OSM : champ osm, champ osmId, ou id de document « o12345 »
        // Meme ordre que osmIdDe cote client : les trois formes coexistent en base.
        let osm = null;
        if (v.osm != null && /^\d+$/.test(String(v.osm))) osm = String(v.osm);
        else if (v.osmId != null && /^\d+$/.test(String(v.osmId))) osm = String(v.osmId);
        else if (/^o\d+$/.test(d.id)) osm = d.id.slice(1);
        if (!osm) continue;
        const h = horaires[osm];
        if (!h) continue;
        if (v.hours === h) { dejaFait++; continue; }
        // JAMAIS par-dessus un horaire existant. On ne sait pas qui l'a ecrit :
        // il peut venir d'un commercant, et rien dans la base ne le dit.
        if (v.hours != null && String(v.hours).trim() !== "") { proteges++; continue; }
        batch.update(d.ref, { hours: h });
        ecrits++;
        if (++n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
      }
      if (n) await batch.commit();
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 600) break;
    }
    console.log("importerHoraires:", parcourus, "parcourus,", ecrits, "ecrits,", dejaFait, "deja a jour,", proteges, "proteges");
    return { parcourus, ecrits, dejaFait, proteges, dansLeJeu: Object.keys(horaires).length };
  }
);
