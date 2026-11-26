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

/* MAGO_RACINE : pour essayer une copie de travail (worktree) sans toucher au
   script ; sinon le fichier du dossier courant. */
const fichier = process.argv[2] || (process.env.MAGO_RACINE ? process.env.MAGO_RACINE + "/index.html" : "index.html");
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

/* ── Overpass : une requete par zone IMMOBILE, pas par coup de pouce ──────
   Mesure de l'audit : autoOsmForArea partait a CHAQUE moveend de la carte
   Explorer, avec une memoire « zone vue » d'une cellule de 0,01° (~1 km)
   pour une boite interrogee de 5 km : 1 requete par cellule nouvelle, 5 sur
   une rafale de 5 glissements ; et exploreLoadStores() relancait toute la
   requete Firestore pour montrer les nouveaux. Depuis : zoom 14 au moins,
   deux secondes d'immobilite, toute la boite marquee a la reponse, nouveaux
   pousses dans _exploreRawList puis exploreLoadStores(true).
   On fait tourner LE CODE DU FICHIER (de « var AUTO_OSM » a la fin de
   autoOsmForArea), avec des doublures pour ce qui sort du perimetre :
   reseau, Firestore, carte, localStorage. */
{
  const a = src.indexOf("var AUTO_OSM=true;");
  const b = src.indexOf("\nfunction openAvatarPicker(){", a);
  if (a === -1 || b === -1) throw new Error("bloc autoOsm introuvable dans " + fichier);
  const bloc = src.slice(a, b);
  const doublures = `
    var window = globalThis;
    var journal = { fetchs: [], charges: [], ls: {} };
    var localStorage = { getItem: function (k) { return journal.ls[k] == null ? null : journal.ls[k]; },
                         setItem: function (k, v) { journal.ls[k] = String(v); } };
    var hoteOuvert = true;
    var document = { getElementById: function () { return { classList: { contains: function () { return hoteOuvert; } } }; } };
    var OSM_SHOP_TYPES = "supermarket|convenience";
    var STORES = [];
    var reponse = { elements: [] };
    function fetchWithTimeout(url) { journal.fetchs.push(url); return Promise.resolve({ json: function () { return Promise.resolve(reponse); } }); }
    function guessStoreCat() { return null; }
    function chainIdsFor() { return null; }
    function brandIds() { return []; }
    var M4_CATS = {};
    function packDrinkIds() { return [1, 2]; }
    function osmShopEmoji() { return ""; }
    function memeMagasinOsm() { return false; }
    function normTxt(s) { return String(s || "").toLowerCase(); }
    function fuzzyIncludes() { return false; }
    function carteEncoreLa() { return true; }
    function exploreLoadStores(useCache) { journal.charges.push(useCache === true); }
    window.fbImportStores = function () { return Promise.resolve(0); };
  `;
  const o = new Function(doublures + bloc + `
    return { autoOsmForArea: autoOsmForArea, autoOsmPlanifier: autoOsmPlanifier, autoOsmAnnuler: autoOsmAnnuler,
             journal: journal, STORES: STORES, window: window, vus: function () { return _autoOsmSeen; },
             repondre: function (r) { reponse = r; }, hote: function (v) { hoteOuvert = v; } };`)();
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const carte = (lat, lng, z) => ({ getCenter: () => ({ lat: lat, lng: lng }), getZoom: () => z });

  o.autoOsmForArea(50.85, 4.35, 13);
  dit("zoom 13 : pas de requete Overpass (zone plus large que la boite)", o.journal.fetchs.length === 0);

  o.window._exploreRawList = [];
  o.repondre({ elements: [{ type: "node", id: 777, lat: 50.851, lon: 4.351, tags: { shop: "convenience", name: "Night Shop Essai" } }] });
  o.autoOsmForArea(50.85, 4.35, 14);
  dit("zoom 14 : une requete part", o.journal.fetchs.length === 1);
  await attendre(30);
  dit("le nouveau magasin entre dans STORES", o.STORES.some((s) => s.id === "o777"));
  dit("et dans la liste que la carte Explorer repeint (_exploreRawList)", o.window._exploreRawList.some((s) => s.id === "o777"));
  dit("la carte est repeinte depuis sa liste, sans retourner a Firestore (exploreLoadStores(true))",
      o.journal.charges.length === 1 && o.journal.charges[0] === true);
  const vues = Object.keys(o.vus());
  dit("toute la boite interrogee est marquee « vue », pas une seule cellule", vues.length >= 15);
  dit("la memoire est ecrite au meme format qu'avant (lat,lng a deux decimales)",
      vues.every((k) => /^-?\d+\.\d\d,-?\d+\.\d\d$/.test(k)) && !!o.journal.ls.magoAutoOsmSeen);

  o.autoOsmForArea(50.86, 4.36, 14);
  dit("un glissement d'un kilometre dans la meme boite ne redemande rien", o.journal.fetchs.length === 1);
  o.vus()["0.00,0.00"] = Date.now() - 8 * 24 * 3600 * 1000;      /* une zone vue il y a huit jours */
  o.autoOsmForArea(50.90, 4.35, 14);
  dit("une zone a cinq kilometres, elle, est interrogee", o.journal.fetchs.length === 2);
  await attendre(30);
  dit("les zones vues depuis plus d'une semaine sont purgees de la memoire", !("0.00,0.00" in o.vus()));

  /* Le compte a rebours : trois coups de pouce en 300 ms = une seule requete,
     deux secondes apres le dernier ; un movestart (autoOsmAnnuler) l'annule ;
     une carte refermee pendant l'attente ne demande rien. */
  const avant = o.journal.fetchs.length;
  o.autoOsmPlanifier(carte(50.95, 4.35, 15)); await attendre(150);
  o.autoOsmPlanifier(carte(50.95, 4.35, 15)); await attendre(150);
  o.autoOsmPlanifier(carte(50.95, 4.35, 15));
  await attendre(1500);
  dit("1,5 s apres le dernier geste : toujours rien", o.journal.fetchs.length === avant);
  await attendre(800);
  dit("2 s d'immobilite : une seule requete pour trois gestes", o.journal.fetchs.length === avant + 1);
  await attendre(30);
  o.autoOsmPlanifier(carte(51.00, 4.35, 15)); await attendre(500); o.autoOsmAnnuler();
  await attendre(2200);
  dit("un geste qui reprend (movestart) annule le compte a rebours", o.journal.fetchs.length === avant + 1);
  o.hote(false);
  o.autoOsmPlanifier(carte(51.00, 4.35, 15)); await attendre(2300);
  dit("une carte refermee pendant l'attente n'interroge pas Overpass", o.journal.fetchs.length === avant + 1);
  o.hote(true);
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
