#!/usr/bin/env node
/* OU EST CETTE BOISSON, VRAIMENT ?
   Interroge la base de PRODUCTION et separe trois choses que l'application
   affiche parfois de la meme couleur :

     rattachee  : la boisson figure dans le champ drinks du magasin. Souvent
                  posee en masse par le remplissage d'enseignes. C'est une
                  PISTE, pas un stock.
     verifiee   : la boisson figure dans drinksVerified.
     confirmee  : quelqu'un a repondu « je l'ai vue ici » (confirmations > 0).

   Seule la troisieme est le temoignage d'un etre humain.

   node outils/ou-est-la-boisson.mjs 200
   node outils/ou-est-la-boisson.mjs 200 --ville Paris
*/
import { readFileSync } from "node:fs";

const PROJET = "magofeed-7f621";
const BASE = "https://firestore.googleapis.com/v1/projects/" + PROJET + "/databases/(default)/documents";
const VILLES = {
  paris: [48.8566, 2.3522, 20], bruxelles: [50.8466, 4.3528, 20], lille: [50.6292, 3.0573, 20],
  lyon: [45.7640, 4.8357, 20], marseille: [43.2965, 5.3698, 20], anvers: [51.2194, 4.4025, 20],
  liege: [50.6326, 5.5797, 20], gand: [51.0543, 3.7174, 20], charleroi: [50.4114, 4.4446, 20],
};
function valeur(v) {
  if (!v || typeof v !== "object") return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.booleanValue !== undefined) return !!v.booleanValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(valeur);
  if (v.mapValue !== undefined) {
    const o = {}, f = v.mapValue.fields || {};
    Object.keys(f).forEach((k) => { o[k] = valeur(f[k]); });
    return o;
  }
  return null;
}
async function requete(sq) {
  const r = await fetch(BASE + ":runQuery", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: sq }),
  });
  const rows = JSON.parse(await r.text());
  if (!Array.isArray(rows)) throw new Error("forme inattendue");
  if (rows[0] && rows[0].error) throw new Error(rows[0].error.status + " " + rows[0].error.message.slice(0, 160));
  return rows.filter((x) => x.document).map((x) => x.document);
}
/* array-contains + tri sur __name__ : aucun index composite necessaire. */
async function magasinsAvec(champ, did, champsVoulus) {
  const out = [];
  let curseur = null;
  for (let p = 0; p < 30; p++) {
    const sq = {
      from: [{ collectionId: "stores" }],
      where: { fieldFilter: { field: { fieldPath: champ }, op: "ARRAY_CONTAINS", value: { integerValue: String(did) } } },
      orderBy: [{ field: { fieldPath: "__name__" } }],
      select: { fields: champsVoulus.map((f) => ({ fieldPath: f })) },
      limit: 1000,
    };
    if (curseur) sq.startAt = { values: [{ referenceValue: curseur }], before: false };
    const lot = await requete(sq);
    out.push(...lot);
    if (lot.length < 1000) break;
    curseur = lot[lot.length - 1].name;
    await new Promise((k) => setTimeout(k, 200));
  }
  return out;
}
function km(a, b, c, d) {
  const R = 6371, r = (x) => x * Math.PI / 180;
  const dl = r(c - a), dg = r(d - b);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function nomDeLaBoisson(did) {
  try {
    const s = readFileSync("data/drinks.js", "utf8");
    const a = s.indexOf("var DRINKS"), b = s.lastIndexOf("];");
    const D = new Function(s.slice(a, b + 2) + "\nreturn DRINKS;")();
    const d = D.find((x) => Number(x.id) === Number(did));
    return d ? ((d.brand ? d.brand + " " : "") + d.name) : "(inconnue du catalogue)";
  } catch { return "(catalogue illisible)"; }
}

const args = process.argv.slice(2);
const did = Number(args[0]);
if (!did) { console.error("usage : node outils/ou-est-la-boisson.mjs <id-boisson> [--ville Paris]"); process.exit(1); }
const iv = args.indexOf("--ville");
const ville = iv !== -1 ? String(args[iv + 1] || "").toLowerCase() : null;

console.log("Boisson " + did + " : " + nomDeLaBoisson(did) + "\n");
const CH = ["name", "brand", "lat", "lng", "confirmations.`" + did + "`"];
const rattaches = await magasinsAvec("drinks", did, CH);
await new Promise((k) => setTimeout(k, 400));
const verifies = await magasinsAvec("drinksVerified", did, ["name"]);
const idsVerifies = new Set(verifies.map((d) => String(d.name).split("/").pop()));

let confirmes = 0;
const lignes = rattaches.map((d) => {
  const f = d.fields || {};
  const id = String(d.name).split("/").pop();
  const c = Number(valeur((valeur(f.confirmations) || {})[String(did)] ?? f["confirmations." + did]) || 0);
  const conf = Number(((valeur(f.confirmations) || {})[String(did)]) || 0) || c;
  if (conf > 0) confirmes++;
  return { id, nom: valeur(f.name) || "?", marque: valeur(f.brand) || "", lat: valeur(f.lat), lng: valeur(f.lng),
           conf, verifie: idsVerifies.has(id) };
});
console.log("Dans la base entiere :");
console.log("  rattachee a            " + lignes.length + " magasins");
console.log("  rayon dit verifie sur  " + lignes.filter((l) => l.verifie).length);
console.log("  CONFIRMEE par quelqu'un " + confirmes + "   <- le seul chiffre qui vient d'un humain\n");

const parPays = {};
for (const l of lignes) {
  if (typeof l.lat !== "number") { parPays["sans position"] = (parPays["sans position"] || 0) + 1; continue; }
  const p = l.lat > 49.5 && l.lng > 2.5 && l.lng < 6.4 ? "Belgique (approx.)" : "France et ailleurs (approx.)";
  parPays[p] = (parPays[p] || 0) + 1;
}
console.log("Repartition grossiere : " + JSON.stringify(parPays) + "\n");

const cibles = ville ? [[ville, VILLES[ville]]] : Object.entries(VILLES);
for (const [nom, v] of cibles) {
  if (!v) { console.log(nom + " : ville inconnue de l'outil"); continue; }
  const [la, lo, r] = v;
  const dedans = lignes.filter((l) => typeof l.lat === "number" && km(la, lo, l.lat, l.lng) <= r);
  const surs = dedans.filter((l) => l.conf > 0 || l.verifie);
  console.log(nom.padEnd(12) + " (" + r + " km) : " + String(dedans.length).padStart(4) + " magasins la rattachent, "
    + String(surs.length).padStart(4) + " l'annoncent en stock");
  for (const s of surs.slice(0, 8)) {
    console.log("     - " + s.nom + (s.marque ? " (" + s.marque + ")" : "") + " — " + (s.conf > 0 ? s.conf + " confirmation(s)" : "rayon dit verifie, personne ne l'a confirme"));
  }
}
