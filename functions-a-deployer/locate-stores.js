/**
 * Magofeed — Cloud Function "Localise les magasins" (remplace le faux "+0 magasins").
 *
 * Ce qu'elle fait :
 *  - Tourne sur une liste de villes (une par exécution).
 *  - Interroge OpenStreetMap (Overpass) pour les commerces à boissons.
 *  - Ajoute UNIQUEMENT les NOUVEAUX magasins dans Firestore (LOCALISATION seule,
 *    aucun stock inventé -> drinks: []). La communauté remplit le stock ensuite.
 *  - N'envoie PLUS de notif "+0". (Optionnel : notif honnête "N magasins ajoutés".)
 *
 * ⚠️ À TESTER AVANT PROD. Je (Claude) ne peux pas tester Firebase/Overpass ici.
 * ⚠️ ADAPTE les 2 constantes marquées "ADAPTE" à ton schéma réel (nom de collection, champs).
 *
 * Déploiement : voir README.md à côté de ce fichier.
 * Firebase Functions v2 (Node 18+, fetch global dispo).
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, GeoPoint } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// ── ADAPTE #1 : le nom de ta collection de magasins dans Firestore ──
const STORES_COLLECTION = "stores"; // <-- mets le vrai nom (ex: "magasins", "shops"…)

// Types OSM = mêmes que le bouton "Importer les magasins" de l'app
const OSM_SHOP_TYPES =
  "convenience|supermarket|kiosk|beverages|greengrocer|deli|newsagent|frozen_food|health_food|farm|general|food|pastry|confectionery";

// Villes à couvrir (lat,lng). Commence par TES villes de lancement, ajoute au fil du temps.
const CITIES = [
  { name: "Bruxelles", lat: 50.8503, lng: 4.3517, km: 8 },
  { name: "Charleroi", lat: 50.4114, lng: 4.4446, km: 8 },
  { name: "Liège",     lat: 50.6326, lng: 5.5797, km: 6 },
  { name: "Anvers",    lat: 51.2194, lng: 4.4025, km: 6 },
  { name: "Gand",      lat: 51.0543, lng: 3.7174, km: 6 },
  // … ajoute les villes que tu veux couvrir
];

function shopEmoji(t) {
  if (t === "supermarket") return "🛒";
  if (["greengrocer", "deli", "health_food", "farm"].includes(t)) return "🌍";
  return "🏪";
}

async function overpassShops(lat, lng, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lat - dLat},${lng - dLng},${lat + dLat},${lng + dLng}`;
  const q =
    `[out:json][timeout:60];(` +
    `node["shop"~"^(${OSM_SHOP_TYPES})$"](${bbox});` +
    `way["shop"~"^(${OSM_SHOP_TYPES})$"](${bbox}););out center 2000;`;
  const res = await fetch(
    "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q)
  );
  if (!res.ok) throw new Error("Overpass HTTP " + res.status);
  const data = await res.json();
  const els = (data && data.elements) || [];
  return els
    .map((e) => {
      const la = e.lat != null ? e.lat : e.center && e.center.lat;
      const ln = e.lon != null ? e.lon : e.center && e.center.lon;
      const name = e.tags && (e.tags.name || e.tags["name:fr"] || e.tags.brand);
      if (la == null || ln == null || !name) return null;
      return {
        osm: e.id,
        name,
        emoji: shopEmoji(e.tags.shop),
        lat: la,
        lng: ln,
        hours: (e.tags && e.tags.opening_hours) || null,
        brand: (e.tags && e.tags.brand) || null,
      };
    })
    .filter(Boolean);
}

// Dé-doublonnage : par id OSM + par proximité (<60 m) & nom proche
function isDuplicate(cand, existing) {
  return existing.some((s) => {
    if (String(s.osm) === String(cand.osm) || String(s.id) === "o" + cand.osm) return true;
    if (typeof s.lat !== "number") return false;
    const dLa = (s.lat - cand.lat) * 111000;
    const dLo = (s.lng - cand.lng) * 111000 * Math.cos((cand.lat * Math.PI) / 180);
    const dist = Math.sqrt(dLa * dLa + dLo * dLo);
    const a = (s.name || "").toLowerCase().trim();
    const b = (cand.name || "").toLowerCase().trim();
    return dist < 60 && (a === b || a.includes(b) || b.includes(a));
  });
}

// Curseur pour tourner ville par ville à chaque exécution
async function nextCityIndex() {
  const ref = db.collection("_meta").doc("locateStores");
  const snap = await ref.get();
  const i = (snap.exists && snap.data().cityIndex) || 0;
  const next = (i + 1) % CITIES.length;
  await ref.set({ cityIndex: next, lastRun: Date.now() }, { merge: true });
  return i;
}

// Exécution planifiée : toutes les 6 h (adapte le cron si tu veux)
exports.locateStores = onSchedule(
  { schedule: "every 6 hours", region: "europe-west1", timeoutSeconds: 120 },
  async () => {
    const idx = await nextCityIndex();
    const city = CITIES[idx];
    console.log("locateStores → ville:", city.name);

    let shops = [];
    try {
      shops = await overpassShops(city.lat, city.lng, city.km);
    } catch (e) {
      console.warn("Overpass KO:", e.message); // fail-safe : on ne casse rien
      return;
    }

    // Charge les magasins existants proches (grosse zone) pour dé-doublonner
    // NOTE : si tu as beaucoup de magasins, filtre par zone/geohash plutôt que tout charger.
    const existingSnap = await db.collection(STORES_COLLECTION).get();
    const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const news = shops.filter((c) => !isDuplicate(c, existing));
    console.log(`${shops.length} trouvés · ${news.length} nouveaux à ${city.name}`);

    // ── ADAPTE #2 : la forme du document magasin selon ton schéma réel ──
    let added = 0;
    for (const c of news) {
      const id = "o" + c.osm;
      await db.collection(STORES_COLLECTION).doc(id).set(
        {
          id,
          osm: c.osm,
          name: c.name,
          emoji: c.emoji,
          lat: c.lat,
          lng: c.lng,
          hours: c.hours,
          brand: c.brand,
          city: city.name,
          drinks: [],            // ← AUCUN stock inventé. La communauté remplit.
          confirmations: {},
          community: true,
          source: "osm-auto",
          createdAt: Date.now(),
          // geo: new GeoPoint(c.lat, c.lng),  // décommente si tu utilises des GeoPoint
        },
        { merge: true }
      );
      added++;
    }

    console.log(`✅ ${added} magasins ajoutés à ${city.name} (localisation seule).`);

    // (Optionnel) notif HONNÊTE au lieu du faux "+0". Décommente + branche FCM si tu veux :
    // if (added > 0) { await sendAdminNotif(`📍 ${added} magasins ajoutés à ${city.name}`); }
  }
);
