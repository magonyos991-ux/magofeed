/**
 * Magofeed — Combien de personnes cherchent chaque boisson.
 *
 * L'application enregistre deja chaque recherche dans la collection "demand",
 * un document par (jour, zone, boisson), une fois par appareil et par jour.
 * Mais "demand" n'est lisible que par l'admin — et c'est tres bien ainsi : ce
 * sont des donnees de frequentation, elles n'ont pas a etre ouvertes.
 *
 * Cette fonction en fabrique chaque nuit un RESUME public, dans le document
 * stats/drinkDemand, que l'application lit en UNE seule lecture par session.
 *
 * LA REGLE QUI COMPTE : on n'y ecrit QUE les boissons atteignant le seuil de
 * SEUIL personnes sur 30 jours. En dessous, la boisson est absente du document
 * et l'application n'affiche rien du tout. Un compteur qui annonce
 * « 0 personne l'a cherchee » sur presque chaque fiche ne renseigne personne,
 * et donne l'impression d'une application deserte — c'est l'inverse du but.
 *
 * COMPTE EN PERSONNES, PAS EN CLICS : le garde-fou est deja cote application
 * (une fois par appareil, par boisson et par jour). On additionne donc des
 * appareils-jours, jamais des ouvertures.
 *
 * AUCUNE donnee personnelle n'entre ici : ni identifiant, ni position precise.
 * La zone geographique presente dans "demand" (environ 5 km) n'est pas reprise
 * dans le resume — seul le total par boisson l'est.
 *
 * Firebase Functions v2 (Node 18+). Cout : une execution par nuit.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = "europe-west1";   // ADAPTE si ton projet est ailleurs
const JOURS  = 30;               // fenetre glissante
const SEUIL  = 5;                // en dessous, la boisson n'est pas publiee

exports.agregerDemande = onSchedule(
  { schedule: "17 3 * * *", timeZone: "Europe/Brussels", region: REGION, memory: "256MiB" },
  async () => {
    const limite = new Date(Date.now() - JOURS * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);

    const total = {};
    let lus = 0;
    // Lecture par pages : la collection grossit avec le temps, on ne la charge
    // jamais entierement en memoire.
    let dernier = null;
    for (;;) {
      let q = db.collection("demand").where("day", ">=", limite).orderBy("day").limit(500);
      if (dernier) q = q.startAfter(dernier);
      const lot = await q.get();
      if (lot.empty) break;
      lot.forEach((doc) => {
        const d = doc.data() || {};
        const id = d.drinkId;
        if (id === undefined || id === null) return;
        const n = Number(d.recherches) || 0;
        if (n <= 0) return;
        total[id] = (total[id] || 0) + n;
      });
      lus += lot.size;
      dernier = lot.docs[lot.docs.length - 1];
      if (lot.size < 500) break;
    }

    // Seules les boissons qui atteignent le seuil sortent d'ici.
    const publie = {};
    let retenues = 0;
    Object.keys(total).forEach((id) => {
      if (total[id] >= SEUIL) { publie[id] = total[id]; retenues++; }
    });

    // set() sans merge : une boisson repassee sous le seuil doit DISPARAITRE
    // du resume, sans quoi on afficherait eternellement un chiffre d'un autre
    // mois.
    await db.collection("stats").doc("drinkDemand").set(publie);
    console.log(
      "agregerDemande : " + lus + " documents lus, " +
      Object.keys(total).length + " boissons cherchees, " +
      retenues + " au-dessus du seuil de " + SEUIL + "."
    );
  }
);
