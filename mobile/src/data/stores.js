/* Magasins autour d'une position — même mécanique que le web : les documents
   "stores" portent un champ geohash, on interroge par plages. geofire-common
   est la version officielle de l'algorithme recopié dans index.html. */
import { collection, getDocs, orderBy, query, startAt, endAt, limit } from "firebase/firestore";
import { geohashQueryBounds, distanceBetween } from "geofire-common";
import { db } from "../firebase";

export async function magasinsAutour(lat, lng, rayonKm) {
  const bounds = geohashQueryBounds([lat, lng], rayonKm * 1000);
  const snaps = await Promise.all(
    bounds.map((b) =>
      getDocs(
        query(collection(db, "stores"), orderBy("geohash"), startAt(b[0]), endAt(b[1]), limit(2000))
      )
    )
  );
  const vus = {};
  const out = [];
  snaps.forEach((snap) =>
    snap.forEach((docSnap) => {
      if (vus[docSnap.id]) return;
      vus[docSnap.id] = 1;
      const s = docSnap.data();
      if (s.lat == null || s.lng == null) return;
      const dKm = distanceBetween([lat, lng], [s.lat, s.lng]);
      if (dKm > rayonKm) return;
      out.push({
        id: docSnap.id,
        name: s.name || "Magasin",
        lat: s.lat,
        lng: s.lng,
        drinks: s.drinks || [],
        confirmations: s.confirmations || {},
        distKm: dKm,
      });
    })
  );
  out.sort((a, b) => a.distKm - b.distKm);
  return out;
}

export function vendLaBoisson(s, drinkId) {
  return (s.drinks || []).some((d) => Number(d) === Number(drinkId));
}

/* Vert = quelqu'un a VU la boisson en rayon et l'a validée. Jamais supposé. */
export function confirmee(s, drinkId) {
  return Number((s.confirmations || {})[drinkId] || 0) > 0;
}

export function texteDistance(km) {
  if (km < 1) return Math.round(km * 1000) + " m";
  return (Math.round(km * 10) / 10).toFixed(1).replace(".", ",") + " km";
}

/* Bruxelles, le cœur de la carte — position de repli quand la géoloc est
   refusée, comme DEFAULT_CENTER côté web. */
export const CENTRE_DEFAUT = { lat: 50.8466, lng: 4.3528 };
