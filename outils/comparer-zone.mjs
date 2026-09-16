#!/usr/bin/env node
/* Preuve, contre la base de PRODUCTION, que le chemin allege de la carte
   (fbZoneLegere) rend EXACTEMENT les memes magasins que le chemin complet
   qu'il remplace — et combien d'octets il economise.

   Une optimisation qui perd un magasin n'est pas une optimisation : c'est une
   carte qui ment. Cet outil existe pour que ca ne puisse pas passer.

   node outils/comparer-zone.mjs            (Paris, Bruxelles)
   node outils/comparer-zone.mjs 48.85 2.35 12
*/
const PROJET = "magofeed-7f621";
const BASE = "https://firestore.googleapis.com/v1/projects/" + PROJET + "/databases/(default)/documents";
const CHAMPS_PIN = ["name","lat","lng","brand","geohash","hours","certified","type","emoji","owner"];
const CHAMPS_LEGER = CHAMPS_PIN.concat(["confirmations"]);

function boite(lat, lng, km) {
  const dLat = km / 110.574, dLng = km / (111.320 * Math.cos(lat * Math.PI / 180));
  return { latMin: lat - dLat, latMax: lat + dLat, lngMin: lng - dLng, lngMax: lng + dLng };
}
function haversineKm(a, b, c, d) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dl = r(c - a), dg = r(d - b);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function valeur(v) {
  if (!v || typeof v !== "object") return null;
  if (v.nullValue !== undefined) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.booleanValue !== undefined) return !!v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(valeur);
  if (v.mapValue !== undefined) {
    const o = {}, f = v.mapValue.fields || {};
    Object.keys(f).forEach(k => { o[k] = valeur(f[k]); });
    return o;
  }
  return null;
}
const filtresBande = (a, b) => ([
  { fieldFilter: { field: { fieldPath: "lat" }, op: "GREATER_THAN_OR_EQUAL", value: { doubleValue: a } } },
  { fieldFilter: { field: { fieldPath: "lat" }, op: "LESS_THAN_OR_EQUAL", value: { doubleValue: b } } }
]);

let octets = 0;
async function requete(sq) {
  const r = await fetch(BASE + ":runQuery", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: sq })
  });
  const t = await r.text();
  octets += t.length;
  const rows = JSON.parse(t);
  if (!Array.isArray(rows)) throw new Error("forme inattendue");
  if (rows[0] && rows[0].error) {
    const e = new Error(rows[0].error.message);
    e.statutFirestore = rows[0].error.status;
    throw e;
  }
  return rows.filter(x => x.document).map(x => x.document);
}
async function pages(sq, champs, parPage = 1000, maxPages = 20) {
  const docs = [];
  let curseur = null;
  for (let p = 0; p < maxPages; p++) {
    const page = JSON.parse(JSON.stringify(sq));
    page.orderBy = [{ field: { fieldPath: "lat" } }, { field: { fieldPath: "__name__" } }];
    if (champs) page.select = { fields: champs.map(f => ({ fieldPath: f })) };
    page.limit = parPage;
    if (curseur) page.startAt = { values: curseur, before: false };
    const lot = await requete(page);
    docs.push(...lot);
    if (lot.length < parPage) break;
    const dernier = lot[lot.length - 1];
    const la = valeur((dernier.fields || {}).lat);
    if (la == null) break;
    curseur = [{ doubleValue: la }, { referenceValue: dernier.name }];
    await new Promise(k => setTimeout(k, 250));
  }
  return docs;
}
function dansLeCercle(docs, lat, lng, km, box) {
  const out = new Map();
  for (const d of docs) {
    const f = d.fields || {};
    const la = valeur(f.lat), lo = valeur(f.lng);
    if (la == null || lo == null) continue;
    if (lo < box.lngMin || lo > box.lngMax) continue;
    if (haversineKm(lat, lng, la, lo) > km) continue;
    out.set(String(d.name).split("/").pop(), f);
  }
  return out;
}

async function zone(nom, lat, lng, km) {
  const box = boite(lat, lng, km);
  const sq = { from: [{ collectionId: "stores" }], where: { compositeFilter: { op: "AND", filters: filtresBande(box.latMin, box.latMax) } } };

  octets = 0;
  const t1 = Date.now();
  const lourds = await pages(sq, null);
  const oLourd = octets, msLourd = Date.now() - t1;
  const A = dansLeCercle(lourds, lat, lng, km, box);

  await new Promise(k => setTimeout(k, 600));
  octets = 0;
  const t2 = Date.now();
  const legers = await pages(sq, CHAMPS_LEGER);
  const oLeger = octets, msLeger = Date.now() - t2;
  const B = dansLeCercle(legers, lat, lng, km, box);

  const manquants = [...A.keys()].filter(k => !B.has(k));
  const enTrop = [...B.keys()].filter(k => !A.has(k));

  console.log("\n" + nom + "  (" + lat + ", " + lng + ", " + km + " km)");
  console.log("  bande interrogee      : " + lourds.length + " magasins ; dans le cercle : " + A.size);
  console.log("  chemin complet        : " + (oLourd / 1048576).toFixed(1) + " Mo en " + msLourd + " ms");
  console.log("  chemin allege         : " + (oLeger / 1048576).toFixed(2) + " Mo en " + msLeger + " ms   (" + (oLourd / oLeger).toFixed(1) + " fois plus leger)");
  console.log("  magasins PERDUS       : " + manquants.length + (manquants.length ? "  <<< REGRESSION" : ""));
  console.log("  magasins en trop      : " + enTrop.length + (enTrop.length ? "  <<< REGRESSION" : ""));
  return manquants.length === 0 && enTrop.length === 0 && A.size > 0;
}

const a = process.argv.slice(2);
const zones = a.length >= 3
  ? [["Zone demandee", Number(a[0]), Number(a[1]), Number(a[2])]]
  : [["Paris", 48.8566, 2.3522, 12], ["Bruxelles", 50.8466, 4.3528, 12]];
let bon = true;
for (const [n, la, lo, km] of zones) {
  try { bon = (await zone(n, la, lo, km)) && bon; }
  catch (e) { console.log("\n" + n + " : ECHEC — " + e.message); bon = false; }
}
console.log("\n" + (bon ? "OK : le chemin allege ne perd aucun magasin." : "ECHEC : difference entre les deux chemins."));
process.exit(bon ? 0 : 1);
