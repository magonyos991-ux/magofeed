/**
 * Magofeed — LES COMMERCES DU MONDE ENTIER, quand OpenStreetMap n'en connait pas.
 *
 * LE PROBLEME
 * L'app decouvre les commerces d'une zone en interrogeant OpenStreetMap. A
 * Bruxelles, OSM connait 1 567 commerces au kilometre carre. A Filiates, en
 * Grece, il en connait UN — un salon funeraire — la ou Google Maps en montre
 * sept supermarches. Des regions entieres sont vides dans OSM : Balkans, Grece
 * rurale, Afrique, Amerique latine, Asie. Pour ces zones, l'app affichait
 * « aucun magasin », et c'etait faux.
 *
 * LA SOLUTION : OVERTURE MAPS
 * Une base ouverte de 74 millions de lieux, alimentee par Meta (les pages
 * Facebook et Instagram des commerces), Microsoft, Foursquare et les
 * localisateurs de magasins des grandes enseignes. Sa licence (CDLA Permissive
 * 2.0) autorise a STOCKER les donnees et a les afficher sur n'importe quelle
 * carte — contrairement a Google Places (affichage sur carte Google seulement,
 * stockage interdit) et a Foursquare (stockage interdit). Verifie sur
 * Filiates : Overture y connait 51 lieux, dont les deux superettes qu'on voit
 * sur Google. Reponse en sept secondes.
 *
 * COMMENT
 * Overture ne fournit pas d'API : ce sont des fichiers Parquet sur S3. Cette
 * fonction les interroge directement avec DuckDB, qui sait lire un fichier
 * distant en ne telechargeant que la partie qui couvre la zone demandee.
 * Aucun compte, aucune cle, aucun cout de lecture : le seau est public.
 *
 * CE QU'ELLE ECRIT — ET CE QU'ELLE N'ECRIT JAMAIS
 * Elle cree des magasins avec un rayon VIDE et source: "overture". Jamais de
 * drinksVerified, jamais de confirmation : personne n'a vu ce rayon. Un
 * commerce importe n'est qu'un endroit ou chercher ; ce sont les utilisateurs
 * qui diront ce qu'on y trouve. Elle refuse aussi tout ce qui vend de
 * l'alcool a titre principal (caves, magasins de biere, spiritueux) : ces
 * lieux n'entrent pas dans Magofeed.
 *
 * COUTS ET GARDE-FOUS
 * Chaque appel coute quelques secondes de calcul, pas de lecture facturee.
 * Une zone (case de 5 km) n'est interrogee qu'une fois par mois, quel que soit
 * le nombre d'utilisateurs qui l'ouvrent ; ensuite les magasins sont dans la
 * base et l'app les trouve normalement. Plafonds : 30 zones par jour et par
 * personne, 400 par jour pour toute l'app.
 *
 * DEPLOIEMENT
 *   1) copier ce fichier dans le dossier functions
 *   2) npm install @duckdb/node-api geofire-common     (dans functions)
 *   3) ajouter dans index.js :
 *        Object.assign(exports, require("./commerces-monde"));
 *   4) firebase deploy --only functions:chercherCommerces
 *   Le premier appel apres un deploiement est plus lent (DuckDB telecharge son
 *   extension de lecture distante dans /tmp) : c'est normal, une seule fois.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const geofire = require("geofire-common");

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = "europe-west1";
const OVERTURE = "s3://overturemaps-us-west-2/release/2026-08-19.0/theme=places/type=place/*";
const RAYON_KM = 2.5;
const JOURS_CACHE_ZONE = 30;
const PLAFOND_PERSO_JOUR = 30;
const PLAFOND_GLOBAL_JOUR = 400;
const MAX_LIEUX = 300;

/* Categories Overture retenues -> type affiche dans l'app. Relevees sur la
   Belgique et ses alentours, triees par frequence. Tout ce qui n'est pas ici
   est ignore ; l'alcool est EXCLU explicitement plus bas, par securite. */
const CATEGORIES = {
  grocery_store: "epicerie", supermarket: "supermarche", convenience_store: "superette",
  mini_market: "superette", kiosk: "kiosque", discount_store: "discount",
  department_store: "grand magasin", delicatessen: "epicerie fine",
  health_food_store: "bio", organic_grocery_store: "bio", ethical_grocery: "bio",
  korean_grocery_store: "epicerie asiatique", asian_grocery_store: "epicerie asiatique",
  international_grocery_store: "epicerie du monde", farmers_market: "marche",
  night_market: "marche", public_market: "marche", gas_station: "station-service",
  truck_gas_station: "station-service"
};
const ALCOOL = /liquor|wine|beer|spirit|winery|brewery|distill|cave|vinot|bar$/i;
const NON_COMMERCE = /ferment|brew|brasserie|distiller|roaster|torref|winery|vineyard|cannery|wholesale|grossist|warehouse|entrepot|\busine\b|factory|manufacture|atelier|workshop|production|logistic/i;

async function quotaJour(uid) {
  const jour = new Date().toISOString().slice(0, 10);
  const persoRef = db.collection("aiQuota").doc(uid);
  const globalRef = db.collection("_meta").doc("overtureQuota");
  return db.runTransaction(async (t) => {
    const [p, g] = await Promise.all([t.get(persoRef), t.get(globalRef)]);
    const dp = p.exists ? p.data() : {};
    const dg = g.exists ? g.data() : {};
    const nPerso = dp.ovJour === jour ? (dp.ovCount || 0) : 0;
    if (nPerso >= PLAFOND_PERSO_JOUR) return { blocked: true, raison: "quota" };
    const nGlobal = dg.jour === jour ? (dg.zones || 0) : 0;
    if (nGlobal >= PLAFOND_GLOBAL_JOUR) return { blocked: true, raison: "quota-global" };
    t.set(persoRef, { ovJour: jour, ovCount: nPerso + 1 }, { merge: true });
    t.set(globalRef, { jour: jour, zones: nGlobal + 1 }, { merge: true });
    return { blocked: false };
  });
}

/* DuckDB est charge une fois par instance et reutilise : l'extension httpfs
   se telecharge dans /tmp au premier appel (le seul dossier inscriptible d'une
   Cloud Function), et les appels suivants la retrouvent. */
let _duck = null;
async function duck() {
  if (_duck) return _duck;
  const { DuckDBInstance } = require("@duckdb/node-api");
  const inst = await DuckDBInstance.create(":memory:");
  const con = await inst.connect();
  await con.run("SET home_directory='/tmp'; SET extension_directory='/tmp/duckdb_ext';");
  await con.run("INSTALL httpfs; LOAD httpfs;");
  /* Le seau Overture est public : on lit sans identifiants. Les deux SET vides
     sont volontaires — sans eux, DuckDB peut ramasser une variable
     d'environnement AWS de l'hote et se faire refuser. */
  await con.run("SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';");
  _duck = con;
  return con;
}

function normTxt(t) {
  return String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function distanceM(aLat, aLng, bLat, bLng) {
  const dLa = (aLat - bLat) * 111000, dLo = (aLng - bLng) * 111000 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}

exports.chercherCommerces = onCall(
  { region: REGION, memory: "1GiB", timeoutSeconds: 120, maxInstances: 5 },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");

    const lat = Number(req.data && req.data.lat), lng = Number(req.data && req.data.lng);
    if (!(Number.isFinite(lat) && Number.isFinite(lng) && lat >= -85 && lat <= 85 && lng >= -180 && lng <= 180)) {
      throw new HttpsError("invalid-argument", "Position invalide.");
    }

    /* Une case de ~5 km. Interrogee une fois par mois, pour tout le monde :
       une fois les magasins ecrits dans la base, l'app les charge par la voie
       normale, il n'y a plus de raison de retourner chez Overture. */
    const cell = "z_" + Math.round(lat * 20) + "_" + Math.round(lng * 20);
    const zoneRef = db.collection("zonesOverture").doc(cell);
    const zone = await zoneRef.get();
    if (zone.exists) {
      const zd = zone.data() || {};
      const q = zd.quand;
      const ms = q && q.toMillis ? q.toMillis() : 0;
      const age = Date.now() - ms;
      /* Une marque « en-cours » de plus de trois minutes est un cadavre : la
         fonction a depasse son delai avant d'ecrire « faite » ou de retirer la
         marque. Sans ce test, la zone resterait consideree comme traitee
         pendant trente jours alors que rien n'a ete ecrit. */
      const cadavre = zd.etat === "en-cours" && age > 3 * 60000;
      if (!cadavre && age < JOURS_CACHE_ZONE * 86400000) {
        return { ok: true, deja: true, ajoutes: 0, trouves: zd.trouves || 0 };
      }
    }

    const quota = await quotaJour(uid);
    if (quota.blocked) return { ok: false, reason: quota.raison };

    /* La case est marquee AVANT la requete, avec un etat « en cours », pour
       que deux personnes ouvrant la meme ville en meme temps ne lancent pas
       deux lectures d'Overture. Si la requete echoue, la marque est retiree :
       l'echec ne condamne pas la zone (c'est exactement l'erreur que faisait
       l'app cote client avec OpenStreetMap). */
    await zoneRef.set({ quand: FieldValue.serverTimestamp(), etat: "en-cours", par: uid }, { merge: true });

    const dLat = RAYON_KM / 111, dLng = RAYON_KM / (111 * Math.cos(lat * Math.PI / 180));
    const xmin = lng - dLng, xmax = lng + dLng, ymin = lat - dLat, ymax = lat + dLat;
    const cats = Object.keys(CATEGORIES).map((c) => "'" + c + "'").join(",");

    let lieux;
    try {
      const con = await duck();
      const r = await con.runAndReadAll(`
        SELECT id, names.primary AS nom, categories.primary AS cat, confidence,
               bbox.ymin AS lat, bbox.xmin AS lon
        FROM read_parquet('${OVERTURE}', hive_partitioning=1)
        WHERE bbox.xmin >= ${xmin} AND bbox.xmax <= ${xmax}
          AND bbox.ymin >= ${ymin} AND bbox.ymax <= ${ymax}
          AND categories.primary IN (${cats})
          AND confidence >= 0.5
        ORDER BY confidence DESC
        LIMIT ${MAX_LIEUX}
      `);
      lieux = r.getRowObjects();
    } catch (e) {
      await zoneRef.delete().catch(() => {});
      console.error("overture:", e && e.message);
      throw new HttpsError("unavailable", "La source de commerces ne repond pas. Reessaie dans un moment.");
    }

    /* Filtres : un nom, pas d'alcool, pas de producteur ou d'entrepot. */
    const candidats = lieux.map((l) => ({
      id: "ov" + String(l.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 40),
      name: String(l.nom || "").trim().slice(0, 60),
      cat: String(l.cat || ""),
      lat: Number(l.lat), lng: Number(l.lon),
      confidence: Number(l.confidence) || 0
    })).filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng)
      && !ALCOOL.test(c.cat) && !ALCOOL.test(c.name) && !NON_COMMERCE.test(c.name));

    /* Dedoublonnage contre ce qui existe deja dans la zone (import OSM, ajouts
       communautaires) : meme nom a moins de 60 m, ou meme identifiant. */
    const bounds = geofire.geohashQueryBounds([lat, lng], (RAYON_KM + 0.5) * 1000);
    const existants = [];
    for (const b of bounds) {
      const snap = await db.collection("stores").orderBy("geohash").startAt(b[0]).endAt(b[1]).limit(2000).get();
      snap.forEach((d) => { const x = d.data() || {}; existants.push({ id: d.id, name: x.name || "", lat: x.lat, lng: x.lng }); });
    }
    const neufs = candidats.filter((c) => !existants.some((s) => {
      if (s.id === c.id) return true;
      if (typeof s.lat !== "number") return false;
      const proche = distanceM(s.lat, s.lng, c.lat, c.lng) < 60;
      if (!proche) return false;
      const a = normTxt(s.name), b = normTxt(c.name);
      return a === b || (a.length > 3 && b.includes(a)) || (b.length > 3 && a.includes(b));
    }));

    /* Ecriture par lots. Rayon VIDE, aucune verification : un endroit ou
       chercher, rien de plus. */
    let batch = db.batch(), n = 0, ecrits = 0;
    for (const c of neufs) {
      batch.set(db.collection("stores").doc(c.id), {
        name: c.name,
        emoji: "",
        lat: c.lat, lng: c.lng,
        geohash: geofire.geohashForLocation([c.lat, c.lng]),
        type: CATEGORIES[c.cat] || "commerce",
        source: "overture",
        sourceLicence: "CDLA-Permissive-2.0",
        sourceConfiance: Math.round(c.confidence * 100) / 100,
        drinks: [], confirmations: {},
        createdAt: FieldValue.serverTimestamp()
      }, { merge: true });
      ecrits++;
      if (++n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n) await batch.commit();

    await zoneRef.set({
      quand: FieldValue.serverTimestamp(), etat: "faite",
      trouves: candidats.length, ajoutes: ecrits, par: uid
    }, { merge: true });

    console.log("overture", cell, "trouves", candidats.length, "ajoutes", ecrits);
    return { ok: true, deja: false, trouves: candidats.length, ajoutes: ecrits };
  }
);
