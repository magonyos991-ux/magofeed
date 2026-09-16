#!/usr/bin/env node
/* LA CHASSE, TESTEE SUR LE CODE LIVRE.
   ----------------------------------------------------------------------------
   Les scenarios de functions-a-deployer/tests-regles/ rejouent les ECRITURES
   contre les vraies regles Firestore. Ils ne peuvent pas tester le FILTRE de
   lecture : fbLoadNearbyHunts vit dans le script de module, qui ne demarre pas
   sans reseau, et un scenario qui recopie ce filtre a la main ne teste que sa
   propre copie.

   Cet outil-ci extrait la fonction TELLE QU'ELLE EST dans index.html et la fait
   tourner sur des chasses fabriquees. C'est ainsi qu'on sait si le voisin d'a
   cote est visible — la question qui decide si la chasse sert a quelque chose.

   node outils/essai-chasse.mjs [chemin/index.html]
*/
import { readFileSync } from "node:fs";

const fichier = process.argv[2] || "index.html";
const src = readFileSync(fichier, "utf8");
function morceau(depart, fin) {
  const a = src.indexOf(depart);
  if (a === -1) throw new Error("introuvable : " + depart);
  const b = src.indexOf(fin, a);
  if (b === -1) throw new Error("fin introuvable apres : " + depart);
  return src.slice(a, b + fin.length);
}
const code = `
  var window = globalThis;
  var auth = { currentUser: { uid: "moi" } };
  var db = null;
  function getDocs() { return Promise.resolve(window.__snap); }
  function query() { return null; } function collection() { return null; } function limit() { return null; }
  ` + morceau("function _coarse(", "\nwindow._margeArrondiKm = _margeArrondiKm;") + `
  ` + morceau("window.fbLoadNearbyHunts = async function", "\n};") + `
  return { charger: window.fbLoadNearbyHunts, coarse: _coarse, marge: _margeArrondiKm };
`;
const M = new Function(code)();

/* Un faux instantane Firestore : la fonction n'appelle que snap.forEach(d => d.data()). */
function snapshot(chasses) {
  const docs = chasses.map((c) => ({ id: c.id, data: () => c.doc }));
  return { forEach: (cb) => docs.forEach(cb) };
}
function poser(chasses) { globalThis.__snap = snapshot(chasses); globalThis._huntsCache = null; globalThis._huntsFrais = false; }

const etapes = [];
const dit = (nom, ok, note) => etapes.push([!!ok, nom, note || ""]);

const BXL = { lat: 50.8466, lng: 4.3528 };
const co = (p) => ({ lat: M.coarse(p.lat), lng: M.coarse(p.lng) });

console.log("code lu dans : " + fichier);
console.log("arrondi applique : " + BXL.lat + " -> " + M.coarse(BXL.lat) + "   marge a cette latitude : " + M.marge(BXL.lat).toFixed(1) + " km\n");

/* ── 1. LE VOISIN D'A COTE ─────────────────────────────────────────────────
   Alice lance une chasse depuis chez elle. Bob est a 200 m. Sa position a elle
   est arrondie a ~11 km. Bob doit la voir, quel que soit son reglage. */
const alice = co(BXL);
poser([{ id: "200", doc: { drinkId: 200, drinkName: "Mountain Dew Original", emoji: "",
  seekers: { alice: { lat: alice.lat, lng: alice.lng, at: Date.now() } } } }]);
for (const rayon of [1, 3, 5, 10, 15, 50]) {
  const l = await M.charger(BXL.lat + 0.002, BXL.lng + 0.002, rayon);  // Bob, 200 m plus loin
  dit("Bob a 200 m voit la chasse d'Alice avec un rayon de " + rayon + " km", l.length === 1,
      l.length ? "" : "invisible : l'arrondi de position n'est pas compense");
}

/* ── 2. ET ON NE VOIT PAS N'IMPORTE QUOI ───────────────────────────────────
   La marge elargit le rayon, elle ne doit pas l'effacer. */
for (const [nom, lat, lng, rayon, attendu] of [
  ["Anvers (44 km) reste hors d'un rayon de 3 km", 51.2194, 4.4025, 3, false],
  ["Anvers (44 km) reste hors d'un rayon de 15 km", 51.2194, 4.4025, 15, false],
  ["Anvers (44 km) entre dans un rayon de 50 km", 51.2194, 4.4025, 50, true],
  ["Paris (264 km) reste invisible meme au maximum", 48.8566, 2.3522, 50, false],
]) {
  poser([{ id: "200", doc: { drinkId: 200, drinkName: "Mountain Dew Original", emoji: "",
    seekers: { alice: { lat: alice.lat, lng: alice.lng, at: Date.now() } } } }]);
  const l = await M.charger(lat, lng, rayon);
  dit(nom, (l.length === 1) === attendu, "attendu " + (attendu ? "visible" : "invisible") + ", obtenu " + (l.length ? "visible" : "invisible"));
}

/* ── 3. LES CHASSES DE SIMULATION ──────────────────────────────────────────
   21 des 41 chasses en production viennent de fbSimulateHunt, outil retire.
   A Bruxelles, rayon 5 km, elles etaient les seules affichees. */
poser([
  { id: "simtest_1786488194316", doc: { drinkId: 13, drinkName: "Fayrouz Peche", emoji: "",
      seekers: { simseeker_1786488194316: { lat: 50.88, lng: 4.34, at: Date.now() } } } },
  { id: "200", doc: { drinkId: 200, drinkName: "Mountain Dew Original", emoji: "",
      seekers: { alice: { lat: alice.lat, lng: alice.lng, at: Date.now() } } } },
]);
{
  const l = await M.charger(BXL.lat, BXL.lng, 5);
  dit("une chasse de simulation n'est plus affichee", !l.find((x) => String(x.drinkName).indexOf("Fayrouz") !== -1));
  dit("et la vraie chasse, elle, l'est", !!l.find((x) => String(x.drinkId) === "200"));
}
poser([{ id: "77", doc: { drinkId: 77, drinkName: "Fanta Shokata", emoji: "",
  seekers: { simseeker_9: { lat: alice.lat, lng: alice.lng, at: Date.now() },
             alice: { lat: alice.lat, lng: alice.lng, at: Date.now() } } } }]);
{
  const l = await M.charger(BXL.lat, BXL.lng, 15);
  dit("un chercheur fabrique ne compte pas dans le total", l.length === 1 && l[0].seekers === 1,
      l.length ? "compte annonce : " + l[0].seekers : "chasse absente");
}

/* ── 4. CE QUI DOIT RESTER VRAI ────────────────────────────────────────────*/
poser([{ id: "200", doc: { drinkId: 200, drinkName: "Mountain Dew Original", emoji: "",
  seekers: { alice: null } } }]);
dit("un chercheur parti ne compte plus", (await M.charger(BXL.lat, BXL.lng, 50)).length === 0);
poser([{ id: "200", doc: { drinkId: 200, drinkName: "Mountain Dew Original", emoji: "",
  seekers: { alice: { lat: alice.lat, lng: alice.lng, at: Date.now() - 400 * 86400000 } } } }]);
dit("un chercheur d'il y a plus d'un an ne compte plus", (await M.charger(BXL.lat, BXL.lng, 50)).length === 0);
poser([{ id: "200", doc: { drinkId: 200, drinkName: "Mountain Dew Original", emoji: "",
  seekers: { moi: { lat: alice.lat, lng: alice.lng, at: Date.now() } } } }]);
dit("ma propre chasse est marquee comme mienne", (await M.charger(BXL.lat, BXL.lng, 50))[0].mine === true);
poser([{ id: "200", doc: { drinkId: 200, drinkName: "Mountain Dew Original", emoji: "",
  seekers: { alice: { lat: null, lng: null, at: Date.now() } } } }]);
dit("un chercheur sans position reste visible (on ne sait pas, on ne jette pas)",
    (await M.charger(BXL.lat, BXL.lng, 3)).length === 1);

let ko = 0;
console.log("");
for (const [ok, nom, note] of etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (!ok && note ? " — " + note : "")); }
console.log("\n" + (etapes.length - ko) + "/" + etapes.length + " conformes");
process.exit(ko ? 1 : 0);
