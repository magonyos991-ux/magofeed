#!/usr/bin/env node
/* global clearTimeout, setTimeout, AbortController */
/* ===========================================================================
 * Magofeed — couverture.js
 * « Combien de magasins existent VRAIMENT, et combien en ai-je deja ? »
 *
 * Produit UN tableau :  zone | OSM importable | deja dans Magofeed | couverture %
 *
 * A LANCER DEPUIS TON PC (Overpass est injoignable depuis l'env. d'audit) :
 *     node growth/couverture.js --dry-run     # montre les requetes, 0 reseau
 *     node growth/couverture.js --pays        # les pays seuls  (~8 min)
 *     node growth/couverture.js --villes      # les villes seules (~6 min)
 *     node growth/couverture.js               # tout (~15 min)
 *     node growth/couverture.js --csv > couverture.csv
 *     node growth/couverture.js --endpoint=https://overpass.kumi.systems/api/interpreter
 *
 * Node 18+ requis (fetch natif). AUCUNE dependance, aucun npm install.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CES BALISES-LA : c'est EXACTEMENT ce que l'app importe.
 *   index.html:9158  var OSM_SHOP_TYPES="convenience|supermarket|..."
 *   index.html:9273  (node["shop"~"^(...)$"](bbox); way["shop"~"^(...)$"](bbox););
 *   -> node ET way, PAS relation (l'app n'interroge jamais les relations).
 *   index.html:9282  var name = e.tags.name || e.tags["name:fr"] || e.tags.brand;
 *   index.html:9283  if(lat==null||lng==null||!name) return null;
 *   -> un commerce SANS name / name:fr / brand est JETE. Le compter serait
 *      mentir sur le potentiel reel. D'ou 2 colonnes : BRUT et IMPORTABLE.
 * ---------------------------------------------------------------------------
 */

// ── Ce que l'app importe (copie conforme de index.html:9158) ────────────────
const OSM_SHOP_TYPES =
  "convenience|supermarket|kiosk|beverages|greengrocer|deli|newsagent|frozen_food|health_food|farm|general|food|pastry|confectionery";

// ── Firestore (lecture publique : stores a `allow read: if true`) ───────────
const PROJECT_ID = "magofeed-7f621";                       // index.html:1632
const API_KEY    = "AIzaSyCjeQJcdpDJJdlqGX6Eb3MLKPCMP1YsNRM"; // index.html:1630
const COLLECTION = "stores";                               // minuscule = ce que l'app ecrit

const ARGS     = process.argv.slice(2);
const DRY      = ARGS.includes("--dry-run");
const CSV      = ARGS.includes("--csv");
const ENDPOINT = (ARGS.find(a => a.startsWith("--endpoint=")) || "").split("=")[1]
              || "https://overpass-api.de/api/interpreter";
const PAUSE_MS = Number((ARGS.find(a => a.startsWith("--pause=")) || "").split("=")[1] || 25000);

// ═══════════════════════════════════════════════════════════════════════════
// LES ZONES
// Villes : centre + rayon km, converti en bbox par la MEME formule que l'app
//          (index.html:9269  dLat=km/111 ; dLng=km/(111*cos(lat)))
//          -> la bbox Overpass et la bbox Firestore sont rigoureusement la
//             meme boite. C'est ce qui rend le taux de couverture honnete.
// Pays   : Overpass compte sur la frontiere administrative reelle (area
//          ISO3166-1), Firestore sur la bbox du pays -> la colonne Magofeed
//          d'une ligne PAYS est legerement SUR-estimee pres des frontieres
//          (la bbox de la Belgique mord sur Lille et Aix-la-Chapelle).
//          Marquee « ~ » dans le tableau. Les lignes VILLE, elles, sont exactes.
// ═══════════════════════════════════════════════════════════════════════════
const PAYS = [
  { iso: "BE", nom: "Belgique",      bbox: [49.49,  2.54, 51.51,  6.41] },
  { iso: "FR", nom: "France",        bbox: [41.30, -5.15, 51.10,  9.56] },
  { iso: "NL", nom: "Pays-Bas",      bbox: [50.75,  3.36, 53.56,  7.23] },
  { iso: "DE", nom: "Allemagne",     bbox: [47.27,  5.87, 55.06, 15.04] },
  { iso: "IT", nom: "Italie",        bbox: [35.49,  6.63, 47.09, 18.52] },
  { iso: "ES", nom: "Espagne",       bbox: [35.95, -9.30, 43.79,  4.33] },
  { iso: "GB", nom: "Royaume-Uni",   bbox: [49.86, -8.65, 60.86,  1.77] },
  { iso: "KR", nom: "Coree du Sud",  bbox: [33.11, 125.06, 38.61, 129.58] },
  { iso: "TR", nom: "Turquie",       bbox: [35.81, 25.66, 42.11, 44.82] },
  { iso: "MA", nom: "Maroc",         bbox: [27.66, -13.17, 35.93, -0.99] },
  { iso: "PL", nom: "Pologne",       bbox: [49.00, 14.12, 54.84, 24.15] },
  { iso: "PT", nom: "Portugal",      bbox: [36.96, -9.53, 42.15, -6.19] },
];

const VILLES = [
  { nom: "Bruxelles",  pays: "BE", lat: 50.8503, lng:   4.3517, km: 12 },
  { nom: "Anvers",     pays: "BE", lat: 51.2194, lng:   4.4025, km: 10 },
  { nom: "Gand",       pays: "BE", lat: 51.0543, lng:   3.7174, km:  8 },
  { nom: "Liege",      pays: "BE", lat: 50.6326, lng:   5.5797, km:  8 },
  { nom: "Charleroi",  pays: "BE", lat: 50.4114, lng:   4.4446, km:  8 },
  { nom: "Paris",      pays: "FR", lat: 48.8566, lng:   2.3522, km: 15 },
  { nom: "Lille",      pays: "FR", lat: 50.6292, lng:   3.0573, km: 10 },
  { nom: "Lyon",       pays: "FR", lat: 45.7640, lng:   4.8357, km: 10 },
  { nom: "Marseille",  pays: "FR", lat: 43.2965, lng:   5.3698, km: 10 },
  { nom: "Amsterdam",  pays: "NL", lat: 52.3676, lng:   4.9041, km: 10 },
  { nom: "Rotterdam",  pays: "NL", lat: 51.9244, lng:   4.4777, km: 10 },
  { nom: "Seoul",      pays: "KR", lat: 37.5665, lng: 126.9780, km: 15 },
  { nom: "Istanbul",   pays: "TR", lat: 41.0082, lng:  28.9784, km: 15 },
  { nom: "Londres",    pays: "GB", lat: 51.5074, lng:  -0.1278, km: 15 },
  { nom: "Berlin",     pays: "DE", lat: 52.5200, lng:  13.4050, km: 15 },
  { nom: "Madrid",     pays: "ES", lat: 40.4168, lng:  -3.7038, km: 12 },
  { nom: "Milan",      pays: "IT", lat: 45.4642, lng:   9.1900, km: 10 },
  { nom: "Casablanca", pays: "MA", lat: 33.5731, lng:  -7.5898, km: 12 },
  { nom: "Tokyo",      pays: "JP", lat: 35.6762, lng: 139.6503, km: 15 },
  { nom: "New York",   pays: "US", lat: 40.7128, lng: -74.0060, km: 15 },
];

// bbox exactement comme l'app la calcule (index.html:9269)
function bboxAutour(lat, lng, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos(lat * Math.PI / 180));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng]; // [S,W,N,E]
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERPASS — "out count;" ne renvoie qu'un nombre. C'est la requete la moins
// couteuse possible : aucune donnee geographique n'est transferee.
// ═══════════════════════════════════════════════════════════════════════════

/* nommes=true -> n'accepte que les elements qui portent name, name:fr OU brand,
   c.-a-d. ceux que  if(!name)return null  laisse effectivement passer.
   L'union Overpass est un ENSEMBLE : un commerce ayant name ET brand n'est
   compte qu'une fois. Pas de double comptage. */
function corps(selecteur, nommes) {
  const S = `["shop"~"^(${OSM_SHOP_TYPES})$"]`;
  if (!nommes) return `  node${S}${selecteur};\n  way${S}${selecteur};\n`;
  let out = "";
  for (const t of ["node", "way"])
    for (const k of ['["name"]', '["name:fr"]', '["brand"]'])
      out += `  ${t}${S}${k}${selecteur};\n`;
  return out;
}

function requetePays(iso, nommes) {
  return `[out:json][timeout:900];\n`
       + `area["ISO3166-1"="${iso}"]["admin_level"="2"]->.p;\n`
       + `(\n${corps("(area.p)", nommes)});\nout count;`;
}

function requeteBbox(bbox, nommes) {
  const b = bbox.map(n => n.toFixed(5)).join(",");
  return `[out:json][timeout:180];\n(\n${corps(`(${b})`, nommes)});\nout count;`;
}

const dors = ms => new Promise(r => setTimeout(r, ms));

/* overpass-api.de donne 2 creneaux par IP. On les respecte : une requete a la
   fois, et si le serveur dit « reviens dans N secondes », on attend N secondes.
   C'est un service benevole — le saturer, c'est le perdre. */
async function attendreCreneau() {
  if (!ENDPOINT.includes("overpass-api.de")) return;
  try {
    const r = await fetch(ENDPOINT.replace("/interpreter", "/status"));
    const t = await r.text();
    if (/\d+ slots available now/.test(t)) return;
    const m = t.match(/in (\d+) seconds/);
    if (m) {
      const s = Math.min(Number(m[1]) + 2, 180);
      process.stderr.write(`   … creneau Overpass occupe, attente ${s}s\n`);
      await dors(s * 1000);
    }
  } catch (e) { /* status indisponible : on continue, le backoff gere */ }
}

async function overpassCount(ql, label) {
  if (DRY) { console.log(`\n----- ${label} -----\n${ql}`); return -1; }
  for (let essai = 1; essai <= 4; essai++) {
    await attendreCreneau();
    const stop = new AbortController();
    const chrono = setTimeout(() => stop.abort(), 900000); // 15 min max
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass demande un User-Agent identifiable. C'est la regle.
          "User-Agent": "Magofeed-couverture/1.0 (contact: magonyos991@gmail.com)"
        },
        body: "data=" + encodeURIComponent(ql),
        signal: stop.signal
      });
      clearTimeout(chrono);
      if (r.status === 429 || r.status === 504 || r.status === 503) {
        const attente = 30000 * essai;
        process.stderr.write(`   ! ${label}: HTTP ${r.status}, nouvel essai dans ${attente/1000}s (${essai}/4)\n`);
        await dors(attente);
        continue;
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const el = (j.elements || []).find(e => e.type === "count");
      // total = nodes + ways deduplique par Overpass
      return Number(el && el.tags && el.tags.total) || 0;
    } catch (e) {
      clearTimeout(chrono);
      const attente = 30000 * essai;
      process.stderr.write(`   ! ${label}: ${e.message}, nouvel essai dans ${attente/1000}s (${essai}/4)\n`);
      if (essai === 4) return null;
      await dors(attente);
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRESTORE — count() en agregation. Firestore ne transfere PAS les documents :
// il renvoie un entier. Facturation : 1 lecture par tranche de 1000 entrees
// d'index balayees. Sur 30 930 magasins, tout ce script coute < 100 lectures
// sur les 50 000/jour du plan gratuit. Aucun risque de depassement.
//
// Marche sans compte ni token : la regle est  match /stores/{id} { allow read: if true; }
// (functions-a-deployer/firestore.rules)
// ═══════════════════════════════════════════════════════════════════════════
/* Deux facons de compter cote Magofeed :
 *
 *  A. MODE SCAN (par defaut, RIEN a configurer) — on aspire UNE FOIS les
 *     couples lat/lng des 30 930 magasins (31 requetes paginees, projection
 *     sur 2 champs), on les met en cache dans growth/.positions.json, puis
 *     TOUS les comptages de zone se font hors-ligne, instantanement et
 *     gratuitement. Cout : 30 930 lectures une seule fois, sur les 50 000/jour
 *     du plan gratuit. Verifie en vrai le 01/09/2026 : 30 930 positions, 0 sans
 *     coordonnees.
 *
 *  B. MODE INDEX (--index) — count() en agregation cote serveur, ne transfere
 *     aucun document. Plus propre, mais lat ET lng sont deux inegalites : Firestore
 *     EXIGE un index composite (lat,lng) qui n'existe pas aujourd'hui (verifie :
 *     HTTP 400 "The query requires an index"). Le script affiche alors l'URL de
 *     creation en un clic. Cet index sert aussi a l'app elle-meme.
 *
 * Les deux marchent sans compte ni token : match /stores/{id} { allow read: if true; }
 * (functions-a-deployer/firestore.rules)
 */
const fs = require("fs");
const CACHE_POS = __dirname + "/.positions.json";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:`;

let POSITIONS = null;

async function chargePositions() {
  if (POSITIONS) return POSITIONS;
  if (!ARGS.includes("--refresh")) {
    try {
      const c = JSON.parse(fs.readFileSync(CACHE_POS, "utf8"));
      if (Array.isArray(c) && c.length) {
        process.stderr.write(`   (cache: ${c.length} positions — --refresh pour reaspirer)\n`);
        return (POSITIONS = c);
      }
    } catch (e) { /* pas de cache */ }
  }
  process.stderr.write("   Aspiration des positions Magofeed (une fois)…\n");
  const pts = []; let cursor = null;
  for (;;) {
    const sq = {
      from: [{ collectionId: COLLECTION }],
      select: { fields: [{ fieldPath: "lat" }, { fieldPath: "lng" }] }, // 2 champs, pas le document entier
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: 1000
    };
    if (cursor) sq.startAt = { values: [{ referenceValue: cursor }], before: false };
    const r = await fetch(FS_BASE + "runQuery?key=" + API_KEY, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: sq })
    });
    if (!r.ok) throw new Error("Firestore HTTP " + r.status + " : " + (await r.text()).slice(0, 300));
    const rows = (await r.json()).filter(x => x.document);
    if (!rows.length) break;
    for (const x of rows) {
      const f = x.document.fields || {};
      const g = v => v ? Number(v.doubleValue != null ? v.doubleValue : v.integerValue) : null;
      const la = g(f.lat), lo = g(f.lng);
      if (la != null && lo != null) pts.push([la, lo]);
    }
    cursor = rows[rows.length - 1].document.name;
    process.stderr.write(`\r   … ${pts.length} positions`);
    if (rows.length < 1000) break;
  }
  process.stderr.write(`\r   ${pts.length} positions aspirees, mises en cache.\n`);
  try { fs.writeFileSync(CACHE_POS, JSON.stringify(pts)); } catch (e) {}
  return (POSITIONS = pts);
}

async function firestoreCount(bbox) {
  if (DRY) return -1;
  const [S, W, N, E] = bbox;

  if (!ARGS.includes("--index")) {                       // ── mode SCAN
    const pts = await chargePositions();
    let n = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p[0] >= S && p[0] <= N && p[1] >= W && p[1] <= E) n++;
    }
    return n;
  }

  // ── mode INDEX : count() serveur
  const f = (chemin, op, val) => ({ fieldFilter: { field: { fieldPath: chemin }, op, value: { doubleValue: val } } });
  const body = {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        where: { compositeFilter: { op: "AND", filters: [
          f("lat", "GREATER_THAN_OR_EQUAL", S), f("lat", "LESS_THAN_OR_EQUAL", N),
          f("lng", "GREATER_THAN_OR_EQUAL", W), f("lng", "LESS_THAN_OR_EQUAL", E)
        ]}}
      },
      aggregations: [{ alias: "n", count: {} }]
    }
  };
  const r = await fetch(FS_BASE + "runAggregationQuery?key=" + API_KEY, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const txt = await r.text();
  if (!r.ok) {
    const lien = (txt.match(/https:\/\/console\.firebase\.google\.com\S+?(?=["\\ ])/) || [])[0];
    if (lien) {
      console.error("\n>>> Firestore reclame l'index composite (lat, lng). Clique une fois sur :\n" + lien);
      console.error(">>> Attends ~2 min qu'il se construise, puis relance.");
      console.error(">>> Ou relance SANS --index : le mode scan ne demande aucun index.\n");
      process.exit(2);
    }
    throw new Error("Firestore HTTP " + r.status + " : " + txt.slice(0, 300));
  }
  const j = JSON.parse(txt);
  const ligne = j.find(x => x.result);
  return Number(ligne && ligne.result.aggregateFields.n.integerValue) || 0;
}

// ═══════════════════════════════════════════════════════════════════════════
const lignes = [];
function ajoute(zone, portee, brut, importable, dansBase, approx) {
  const couv = (importable > 0 && dansBase != null) ? (dansBase / importable * 100) : null;
  lignes.push({ zone, portee, brut, importable, dansBase, couv, approx });
  const n = v => v == null ? "?" : (v < 0 ? "-" : v.toLocaleString("fr-BE"));
  if (!CSV && !DRY) {
    console.log(
      "  " + zone.padEnd(20) +
      n(brut).padStart(10) + n(importable).padStart(12) +
      ((approx ? "~" : "") + n(dansBase)).padStart(11) +
      (couv == null ? "          ?" : (couv.toFixed(1) + " %").padStart(11)) +
      (importable != null && dansBase != null && importable > 0
        ? ("   manque " + n(Math.max(0, importable - dansBase))) : "")
    );
  }
}

(async () => {
  const faireP = !ARGS.includes("--villes");
  const faireV = !ARGS.includes("--pays");

  if (!CSV && !DRY) {
    console.log("\nMagofeed — couverture reelle vs OpenStreetMap");
    console.log("Balises comptees : shop=" + OSM_SHOP_TYPES.replace(/\|/g, ", "));
    console.log("Types d'objets   : node + way (pas relation) — identique a l'app");
    console.log("IMPORTABLE       : + doit porter name, name:fr ou brand (sinon l'app le jette)");
    console.log("Endpoint         : " + ENDPOINT + "\n");
    console.log("  ZONE".padEnd(22) + "OSM BRUT".padStart(10) + "IMPORTABLE".padStart(12) + "MAGOFEED".padStart(11) + "COUVERTURE".padStart(11));
    console.log("  " + "-".repeat(72));
  }

  if (faireP) {
    if (!CSV && !DRY) console.log("\n  --- PAYS (Magofeed = bbox, donc ~ sur-estime aux frontieres) ---");
    for (const p of PAYS) {
      const brut = await overpassCount(requetePays(p.iso, false), p.nom + " brut");
      if (!DRY) await dors(PAUSE_MS);
      const imp  = await overpassCount(requetePays(p.iso, true),  p.nom + " importable");
      if (!DRY) await dors(PAUSE_MS);
      const base = DRY ? -1 : await firestoreCount(p.bbox);
      ajoute(p.nom, "pays", brut, imp, base, true);
    }
  }

  if (faireV) {
    if (!CSV && !DRY) console.log("\n  --- VILLES (meme bbox des deux cotes : chiffres exacts) ---");
    for (const v of VILLES) {
      const bb = bboxAutour(v.lat, v.lng, v.km);
      const brut = await overpassCount(requeteBbox(bb, false), v.nom + " brut");
      if (!DRY) await dors(PAUSE_MS / 2); // bbox de ville = requete legere
      const imp  = await overpassCount(requeteBbox(bb, true),  v.nom + " importable");
      if (!DRY) await dors(PAUSE_MS / 2);
      const base = DRY ? -1 : await firestoreCount(bb);
      ajoute(`${v.nom} (${v.km}km)`, "ville", brut, imp, base, false);
    }
  }

  if (CSV) {
    console.log("zone;portee;osm_brut;osm_importable;dans_magofeed;couverture_pct;manque");
    for (const l of lignes)
      console.log([l.zone, l.portee, l.brut, l.importable, l.dansBase,
        l.couv == null ? "" : l.couv.toFixed(1),
        (l.importable != null && l.dansBase != null) ? Math.max(0, l.importable - l.dansBase) : ""].join(";"));
    return;
  }
  if (DRY) { console.log("\n(--dry-run : aucune requete envoyee)"); return; }

  const vil = lignes.filter(l => l.portee === "ville" && l.importable > 0);
  const manque = vil.reduce((s, l) => s + Math.max(0, l.importable - l.dansBase), 0);
  console.log("\n  " + "-".repeat(72));
  console.log(`  Manque sur ces ${vil.length} villes seulement : ${manque.toLocaleString("fr-BE")} magasins`);
  console.log(`  A 20 000 ecritures/jour (quota gratuit Spark) : ${Math.ceil(manque / 20000)} jour(s) d'import`);
  console.log(`  Poids ajoute a ~983 o/document : ${(manque * 983 / 1e6).toFixed(0)} Mo sur les 1024 Mo gratuits\n`);
})();
