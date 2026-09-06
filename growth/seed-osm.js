/**
 * seed-osm.js — remplace functions-a-deployer/locate-stores.js, qui ne peut PAS
 * tourner : Cloud Functions exige le plan Blaze, il ecrit dans "Stores" (majuscule)
 * alors que l'app lit "stores" (index.html:1961), et il fait un .get() sur toute la
 * collection = 30 930 lectures toutes les 6 h = 123 720 lectures/jour (quota : 50 000).
 *
 * Celui-ci tourne SUR TON PC, en Node, avec une cle de service :
 *   npm i firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=./cle.json node growth/seed-osm.js BE
 *   GOOGLE_APPLICATION_CREDENTIALS=./cle.json node growth/seed-osm.js FR --budget 18000
 *
 * - Pave le pays en tuiles de 10 km (bbox de 20x20 km).
 * - ZERO lecture Firestore : l'id du document est deterministe et l'ecriture est un
 *   set(merge:true) -> re-ecrire ne cree jamais de doublon, donc dedoublonner ne
 *   sert a rien. C'est ce qui fait tenir l'import dans le plan gratuit.
 * - S'arrete net au budget d'ecritures du jour (defaut 18 000 sur 20 000) et note
 *   ou il s'est arrete dans .seed-cursor.json : relance le lendemain, il reprend.
 */
const fs = require("fs");
/* API modulaire uniquement : admin.firestore() a ete retiree des versions
   recentes du SDK. initializeApp() sans argument lit toujours
   GOOGLE_APPLICATION_CREDENTIALS, le comportement ne change pas.
   Voir la note en tete de functions-a-deployer/outils-admin.js. */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const SHOP =
  "convenience|supermarket|kiosk|beverages|greengrocer|deli|newsagent|frozen_food|" +
  "health_food|farm|general|food|pastry|confectionery|alcohol|wine|bakery|butcher|" +
  "department_store|variety_store|chemist|dairy|grocery|discount|trade|wholesale";

const TYPE_LABEL = {
  supermarket: "supermarché", convenience: "supérette", kiosk: "kiosque",
  beverages: "boissons", greengrocer: "primeur", deli: "épicerie fine",
  newsagent: "presse", frozen_food: "surgelés", health_food: "bio", farm: "ferme",
  general: "bazar", food: "alimentation", pastry: "pâtisserie",
  confectionery: "confiserie", alcohol: "caviste", wine: "caviste",
  bakery: "boulangerie", butcher: "boucherie", department_store: "grand magasin",
  variety_store: "bazar", chemist: "droguerie", dairy: "crémerie",
  grocery: "épicerie", discount: "discount", wholesale: "gros", trade: "gros"
};

// bbox par pays : [latMin, lngMin, latMax, lngMax]
const PAYS = {
  BE: [49.49, 2.54, 51.51, 6.41],
  NL: [50.75, 3.35, 53.56, 7.23],
  FR: [41.30, -5.15, 51.10, 9.57],
  DE: [47.27, 5.86, 55.06, 15.04],
  KR: [33.10, 125.9, 38.62, 129.6],
  TR: [35.80, 25.6, 42.11, 44.83],
  IT: [36.62, 6.62, 47.10, 18.52],
  ES: [36.00, -9.30, 43.79, 3.32],
  GB: [49.90, -8.20, 58.70, 1.77],
  MA: [27.66, -13.17, 35.93, -0.99]
};

const KM = 10;                                    // demi-cote de la tuile
const iso = (process.argv[2] || "BE").toUpperCase();
const bi = process.argv.indexOf("--budget");
const BUDGET = bi > 0 ? Number(process.argv[bi + 1]) : 18000;
const CURSOR = __dirname + "/.seed-cursor.json";

if (!PAYS[iso]) { console.error("Pays inconnu :", iso, "→", Object.keys(PAYS).join(" ")); process.exit(1); }

initializeApp();
const db = getFirestore();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tuiles([latMin, lngMin, latMax, lngMax]) {
  const out = [];
  const dLat = KM / 111;
  for (let la = latMin; la < latMax; la += 2 * dLat) {
    const dLng = KM / (111 * Math.cos((la * Math.PI) / 180));
    for (let ln = lngMin; ln < lngMax; ln += 2 * dLng) {
      out.push([la, ln, Math.min(la + 2 * dLat, latMax), Math.min(ln + 2 * dLng, lngMax)]);
    }
  }
  return out;
}

async function overpass(t, cap) {
  const bbox = `${t[0]},${t[1]},${t[2]},${t[3]}`;
  const f = `["shop"~"^(${SHOP})$"]`;
  const q =
    `[out:json][timeout:90];(` +
    `node${f}(${bbox});way${f}(${bbox});relation${f}(${bbox});` +
    `node["amenity"="fuel"]["shop"](${bbox});` +
    `);out center ${cap};`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST", body: "data=" + encodeURIComponent(q),
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  if (res.status === 429 || res.status === 504) { await sleep(60000); return overpass(t, cap); }
  if (!res.ok) throw new Error("Overpass HTTP " + res.status);
  return ((await res.json()).elements) || [];
}

function mapEl(e) {
  const lat = e.lat != null ? e.lat : e.center && e.center.lat;
  const lng = e.lon != null ? e.lon : e.center && e.center.lon;
  if (lat == null || lng == null) return null;
  const t = e.tags || {};
  const lbl = TYPE_LABEL[t.shop] || (t.amenity === "fuel" ? "station" : null);
  // Le filtre "pas de tag name -> poubelle" de index.html:9285/9364/9481 jette une
  // grosse part des superettes et kiosques. Ici on retombe sur brand/operator puis
  // sur le libelle du type : le magasin existe, il merite un pin.
  const name = t.name || t["name:fr"] || t["name:en"] || t.brand || t.operator ||
    (lbl ? lbl.charAt(0).toUpperCase() + lbl.slice(1) : null);
  if (!name) return null;
  // id : node/way/relation sont TROIS sequences d'ids distinctes qui se recouvrent.
  // "o"+id pour les trois (index.html:9485) fait collisionner un way et un node.
  const id = (e.type === "way" ? "w" : e.type === "relation" ? "r" : "o") + e.id;
  const doc = { name: String(name).slice(0, 60), lat, lng, pack: "generic" };
  if (lbl) doc.type = lbl;
  if (t.brand) doc.brand = String(t.brand).slice(0, 40);
  if (t.opening_hours) doc.hours = String(t.opening_hours).slice(0, 120);
  return { id, doc };
}

(async () => {
  let curseur = {};
  try { curseur = JSON.parse(fs.readFileSync(CURSOR, "utf8")); } catch (e) {}
  const all = tuiles(PAYS[iso]);
  let i = curseur[iso] || 0;
  let ecrites = 0;
  console.log(`${iso} : ${all.length} tuiles de ${2 * KM} km · reprise a la tuile ${i} · budget ${BUDGET} ecritures`);

  for (; i < all.length && ecrites < BUDGET; i++) {
    let els;
    try { els = await overpass(all[i], 3000); }
    catch (e) { console.warn(`tuile ${i} : ${e.message} — on passe`); await sleep(5000); continue; }
    if (els.length >= 3000) console.warn(`tuile ${i} SATUREE (${els.length}) : a redecouper en 4`);

    const vus = new Set();
    const lot = [];
    for (const e of els) {
      const m = mapEl(e);
      if (m && !vus.has(m.id)) { vus.add(m.id); lot.push(m); }
    }
    for (let k = 0; k < lot.length; k += 400) {
      const b = db.batch();
      lot.slice(k, k + 400).forEach((m) => b.set(db.collection("stores").doc(m.id), m.doc, { merge: true }));
      await b.commit();
    }
    ecrites += lot.length;
    console.log(`tuile ${i + 1}/${all.length} · ${lot.length} magasins · total ${ecrites}/${BUDGET}`);
    curseur[iso] = i + 1;
    fs.writeFileSync(CURSOR, JSON.stringify(curseur, null, 2));
    await sleep(8000); // Overpass est gratuit et partage : une requete toutes les 8 s
  }
  console.log(ecrites >= BUDGET
    ? `Budget du jour atteint (${ecrites}). Relance demain : il reprendra a la tuile ${curseur[iso]}.`
    : `${iso} termine : ${ecrites} magasins ecrits.`);
  process.exit(0);
})();

/* ============================================================================
 * ⚠ ORDRE D'EXÉCUTION — AJOUTÉ APRÈS RELECTURE
 *
 * NE LANCE PAS ce script avant d'avoir corrigé la requête de proximité.
 * Aujourd'hui queryNearbyStores() interroge une BANDE DE LATITUDE entière
 * (index.html) : à Bruxelles, une ouverture de l'app lit déjà ~5 250 documents
 * pour 1 853 utiles, soit une dizaine d'ouvertures par jour avant d'épuiser le
 * quota gratuit de 50 000 lectures.
 *
 * Chaque magasin ajouté par ce script grossit cette bande. Importer un pays
 * entier AVANT le correctif rendrait l'app inutilisable pour tout le monde.
 *
 * Ordre correct :
 *   1. ajouter un champ de cellule géographique (geohash ou "50.8_4.3") aux
 *      30 930 documents existants ;
 *   2. remplacer le filtre de latitude par un where("cell","in",[9 cellules]) ;
 *   3. faire écrire ce champ cell par ce script (il ne le fait pas encore) ;
 *   4. seulement ensuite, importer pays par pays.
 *
 * Ce script n'a jamais été exécuté : il est issu d'une analyse automatique.
 * Lance-le d'abord sur un petit pays avec --budget 200 et vérifie le résultat
 * dans la console Firebase avant d'aller plus loin.
 * ==========================================================================*/
