#!/usr/bin/env node
/* ESSAI DU VRAI CODE EMBARQUE, CONTRE LA VRAIE BASE.
   L'essai navigateur tourne sans reseau : le module Firebase n'y demarre pas,
   donc fbZoneLegere n'y est jamais executee. Cet outil-ci va chercher la
   FONCTION TELLE QU'ELLE EST DANS LE FICHIER LIVRE, la fait tourner dans Node
   contre la base de production, et verifie ce qu'elle rend. On ne reecrit rien :
   une reecriture prouverait que la reecriture marche, pas l'application.

   node outils/essai-zone-reelle.mjs                  (le fichier du depot)
   node outils/essai-zone-reelle.mjs chemin/index.html  (des octets telecharges)
*/
import { readFileSync } from "node:fs";

const fichier = process.argv[2] || "index.html";
const src = readFileSync(fichier, "utf8");

function extraire(depart, finInclus) {
  const a = src.indexOf(depart);
  if (a === -1) throw new Error("introuvable dans " + fichier + " : " + depart);
  const b = src.indexOf(finInclus, a);
  if (b === -1) throw new Error("fin introuvable apres : " + depart);
  return src.slice(a, b + finInclus.length);
}
const morceaux = [
  extraire("function haversineKm(", "\n}"),
  extraire("function boundingBox(", "\n}"),
  extraire("var MAGO_CHAMPS_PIN =", "\nwindow.fbQueryZone = async function (lat, lng, radiusKm, did) {"),
];
/* Doublures minimales, et SEULEMENT pour ce qui sort du perimetre teste. */
const prelude = `
  var window = globalThis;
  var firebaseConfig = { projectId: "magofeed-7f621" };
  function normalizeStore(data, id, distKm) {
    data.fbId = id; data.id = data.id || id;
    data.drinks = data.drinks || []; data.confirmations = data.confirmations || {};
    if (distKm != null) data.dist = Math.round(distKm * 1000);
    return data;
  }
  function fusionnerRayonEnseigne(l) { return l; }   /* teste ailleurs */
`;
const code = prelude + morceaux.join("\n") + "\n};\nreturn { fbZoneLegere: window.fbZoneLegere, MAGO_CHAMPS_LEGER: MAGO_CHAMPS_LEGER, fusionnerDoublons: fusionnerDoublons };";
const { fbZoneLegere, MAGO_CHAMPS_LEGER, fusionnerDoublons } = new Function(code)();

const etapes = [];
const dit = (n, ok) => { etapes.push([n, !!ok]); };

console.log("code lu dans : " + fichier);
dit("la projection n'embarque pas les assortiments",
  MAGO_CHAMPS_LEGER.indexOf("drinks") === -1 && MAGO_CHAMPS_LEGER.indexOf("drinksVerified") === -1);

/* ── Deux fiches pour un seul magasin ─────────────────────── */
{
  /* Mesure sur la base : 981 lieux portent deux fiches au meme nom et aux
     memes coordonnees. La carte posait deux pins l'un sur l'autre. */
  const a = { id: "o254636773", fbId: "o254636773", name: "ALDI", lat: 50.880876, lng: 4.341298,
              hours: "8-20", confirmations: {}, drinks: [7] };
  const b = { id: "5DoQTbfiAVQkxMw4BFdv", fbId: "5DoQTbfiAVQkxMw4BFdv", name: "ALDI", lat: 50.880876, lng: 4.341298,
              type: "supermarché", osmId: "254636773", confirmations: { 42: 3 }, drinks: [9] };
  const loin = { id: "z", fbId: "z", name: "ALDI", lat: 50.9, lng: 4.4, confirmations: {}, drinks: [] };
  const r = fusionnerDoublons([a, b, loin]);
  dit("deux fiches au meme endroit ne font qu'un magasin", r.length === 2);
  const aldi = r.find((x) => Math.abs(x.lat - 50.880876) < 1e-6) || {};
  dit("le magasin garde ses deux identifiants",
      (aldi._idsFusionnes || []).length === 2 && (aldi._idsFusionnes || []).indexOf("o254636773") !== -1);
  dit("la confirmation humaine n'est pas perdue", Number((aldi.confirmations || {})[42]) === 3);
  dit("les horaires d'une fiche et le type de l'autre sont gardes",
      aldi.hours === "8-20" && aldi.type === "supermarché");
  dit("les rayons des deux fiches sont additionnes",
      (aldi.drinks || []).indexOf(7) !== -1 && (aldi.drinks || []).indexOf(9) !== -1);
  dit("un ALDI a un kilometre reste un magasin distinct", r.some((x) => x.id === "z"));
}

/* ── Paris, sans boisson ciblee ─────────────────────────────────────────── */
const t0 = Date.now();
const paris = await fbZoneLegere(48.8566, 2.3522, 5, null);
console.log("\nParis 5 km, sans boisson : " + paris.length + " magasins en " + (Date.now() - t0) + " ms");
dit("la zone rend des magasins", paris.length > 100);
dit("tous portent un nom et une position",
  paris.every((s) => s.name && typeof s.lat === "number" && typeof s.lng === "number"));
dit("tous sont marques comme alleges", paris.every((s) => s._pins === true));
dit("aucun n'est hors du rayon demande", paris.every((s) => s.dist <= 5000));
dit("les confirmations sont bien la", paris.every((s) => s.confirmations && typeof s.confirmations === "object"));
{
  const vus = {};
  let jumeaux = 0;
  for (const s of paris) {
    const k = String(s.name || "").trim().toLowerCase() + "@" + Number(s.lat).toFixed(5) + "," + Number(s.lng).toFixed(5);
    if (vus[k]) jumeaux++; else vus[k] = 1;
  }
  console.log("   fiches en double restantes dans la zone : " + jumeaux);
  dit("la zone ne rend plus deux fiches pour un meme magasin", jumeaux === 0);
}

/* ── Paris, Mountain Dew Original ───────────────────────────────────────── */
const t1 = Date.now();
const dew = await fbZoneLegere(48.8566, 2.3522, 5, 200);
const ont = dew.filter((s) => s._aBoisson && s._aBoisson[200]);
console.log("Paris 5 km, Mountain Dew Original : " + dew.length + " magasins, "
  + ont.length + " la rattachent, en " + (Date.now() - t1) + " ms");
dit("la meme zone rend le meme nombre de magasins", dew.length === paris.length);
dit("la question a bien ete posee a la base", dew.every((s) => s._boissonSue && s._boissonSue[200]));
dit("des magasins sont designes comme l'ayant", ont.length > 0);
console.log("   " + ont.map((s) => s.name).join(", "));
dit("ce sont bien des epiceries ou confiseries, pas des supermarches",
  ont.every((s) => !/carrefour|auchan|lidl|monoprix|franprix/i.test((s.brand || "") + " " + s.name)));
const enStock = ont.filter((s) => Number((s.confirmations || {})[200] || 0) > 0 || (s._rayonVerifie && s._rayonVerifie[200]));
console.log("   en stock (confirme ou rayon verifie) : " + enStock.length);
dit("aucun stock n'est invente", enStock.length === 0 || enStock.every((s) => s.confirmations[200] > 0));

/* ── Une boisson qui n'existe pas : l'absence doit etre une vraie absence ── */
const rien = await fbZoneLegere(48.8566, 2.3522, 2, 999999);
dit("une boisson inconnue ne designe personne", rien.every((s) => !(s._aBoisson && s._aBoisson[999999])));
dit("et la question a quand meme ete posee", rien.every((s) => s._boissonSue && s._boissonSue[999999]));

let ko = 0;
console.log("");
for (const [n, ok] of etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + n); }
console.log("\n" + (etapes.length - ko) + "/" + etapes.length + " conformes");
process.exit(ko ? 1 : 0);
