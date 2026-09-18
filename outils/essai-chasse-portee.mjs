/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   ESSAI : JUSQU'OU PORTE UNE CHASSE
   ----------------------------------------------------------------------------
   LE PROBLEME. Le rayon qui decide d'une notification est celui du
   DESTINATAIRE — c'est lui qui dit jusqu'ou on a le droit de le deranger, et
   cette promesse-la ne se brise pas. Mais la ou personne n'habite a moins de
   quinze kilometres, elle revient a supprimer la fonctionnalite : le chasseur
   lance sa chasse, rien ne se passe, jamais, et personne ne le lui dit.

   LA REGLE POSEE. Premier tour : chacun dans SA zone, inchange. Si ce tour n'a
   trouve PERSONNE — et seulement dans ce cas — second tour vers ceux qui ont
   accepte ce secours (reglage coche, ou zone poussee au maximum), les plus
   proches d'abord, jamais au-dela de 150 km, dix au maximum, et le message dit
   la distance. Si vraiment personne : le chasseur est prevenu, et la chasse est
   marquee `sansPortee`.

   COMMENT. La logique de selection vit dans une Cloud Function qu'on ne peut
   pas executer ici (Admin SDK, Firebase). On la REJOUE donc a l'identique sur
   des populations fabriquees : la ville, la campagne, et le desert.

   Lancer :  node outils/essai-chasse-portee.mjs
   ============================================================================ */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const etapes = [];
const dit = (nom, ok, note) => etapes.push([!!ok, nom, note || ""]);

const src = await readFile(join(process.cwd(), "functions-a-deployer/notifications-push.js"), "utf8");

/* ── 1. LA REGLE EST BIEN CELLE QU'ON CROIT, LUE DANS LA SOURCE ───────────── */
const MAX_KM = Number((src.match(/const SECOURS_MAX_KM = (\d+);/) || [])[1]);
const MAX_N = Number((src.match(/const SECOURS_MAX_PERSONNES = (\d+);/) || [])[1]);
dit("les deux bornes du secours sont declarees", MAX_KM === 150 && MAX_N === 10, MAX_KM + " km, " + MAX_N + " personnes");
dit("le second tour ne part QUE si le premier n'a trouve personne",
  /if \(!msgs\.length && secours\.length\)/.test(src),
  "sinon on derangerait des gens hors de leur zone alors que quelqu'un etait disponible");
dit("il ne s'adresse qu'a ceux qui l'ont accepte",
  /x\.ouvert \|\| x\.rayon >= 50/.test(src),
  "le reglage coche, ou une zone poussee au maximum");
dit("il prend les plus proches d'abord", /\.sort\(\(a2, b2\) => a2\.km - b2\.km\)/.test(src));
dit("le message dit la distance", /" km de toi\. "/.test(src),
  "on ne reveille personne sans lui dire ou c'est");
dit("le chasseur est prevenu quand rien n'a porte",
  /Ta chasse est lancee, mais personne autour/.test(src) && /sansPortee: true/.test(src),
  "une chasse muette qui reste muette, c'est l'app qui a l'air en panne");
dit("le journal de l'admin distingue les deux tours",
  /dont " \+ aideLointaine \+ " au second tour/.test(src));

/* ── 2. LA SELECTION, REJOUEE SUR DES POPULATIONS FABRIQUEES ──────────────── */
/* Reproduction fidele des deux tours tels qu'ils sont ecrits dans la fonction.
   Si la fonction change et que cette reproduction ne suit pas, les epreuves de
   la partie 1 tombent : elles lisent la vraie source. */
function diffuser(centre, gens) {
  const dist = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111;   // approx, suffit ici
  const vus = [], secours = [];
  for (const g of gens) {
    const rayon = Math.max(1, Math.min(50, Number(g.rayon) || 15));
    const km = dist(centre, g);
    if (km > rayon) { secours.push({ nom: g.nom, km: Math.round(km), rayon, ouvert: g.secours === true }); continue; }
    vus.push({ nom: g.nom, tour: 1 });
  }
  let second = [];
  if (!vus.length && secours.length) {
    second = secours
      .filter((x) => (x.ouvert || x.rayon >= 50) && x.km <= MAX_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_N);
  }
  return { tour1: vus, tour2: second, vide: !vus.length && !second.length };
}

const centre = { lat: 50.85, lng: 4.35 };                      // Bruxelles
const km = (n) => n / 111;

// La ville : du monde partout, rayons ordinaires
const ville = diffuser(centre, [
  { nom: "Ana", lat: centre.lat + km(2), lng: centre.lng, rayon: 10 },
  { nom: "Bo", lat: centre.lat + km(7), lng: centre.lng, rayon: 10 },
  { nom: "Cem", lat: centre.lat + km(40), lng: centre.lng, rayon: 50, secours: true },
]);
/* Les trois sont dans LEUR zone — y compris Cem, a 40 km, qui a choisi 50.
   C'est le premier tour qui les prend, pas le secours : quelqu'un qui a pousse
   sa zone loin n'est pas « secouru », il est simplement chez lui. */
dit("en ville, tout le monde est pris par le premier tour",
  ville.tour1.length === 3 && ville.tour2.length === 0,
  "tour 1 : " + ville.tour1.length + ", tour 2 : " + ville.tour2.length);
const villeEtroite = diffuser(centre, [
  { nom: "Ana", lat: centre.lat + km(2), lng: centre.lng, rayon: 10 },
  { nom: "Zoe (30 km, zone 10, secours)", lat: centre.lat + km(30), lng: centre.lng, rayon: 10, secours: true },
]);
dit("celui qui est hors de sa zone n'est pas derange tant qu'un autre repond",
  villeEtroite.tour1.length === 1 && villeEtroite.tour2.length === 0,
  "le secours ne sert QUE quand personne n'a repondu");

// La campagne : personne dans sa zone, deux personnes loin
const campagne = diffuser(centre, [
  { nom: "Denis (38 km, zone 15, secours coche)", lat: centre.lat + km(38), lng: centre.lng, rayon: 15, secours: true },
  { nom: "Eva (52 km, zone 50)", lat: centre.lat + km(52), lng: centre.lng, rayon: 50 },
  { nom: "Fara (60 km, zone 10, pas de secours)", lat: centre.lat + km(60), lng: centre.lng, rayon: 10 },
]);
dit("a la campagne, le second tour trouve les plus proches qui ont accepte",
  campagne.tour1.length === 0 && campagne.tour2.length === 2,
  JSON.stringify(campagne.tour2.map((x) => x.nom + " a " + x.km + " km")));
dit("il respecte l'ordre : le plus proche d'abord",
  campagne.tour2.length === 2 && campagne.tour2[0].km < campagne.tour2[1].km);
dit("celui qui n'a rien accepte n'est jamais derange",
  !campagne.tour2.some((x) => /Fara/.test(x.nom)));

// Le desert : personne, meme au second tour
const desert = diffuser(centre, [
  { nom: "Gil (400 km)", lat: centre.lat + km(400), lng: centre.lng, rayon: 50, secours: true },
]);
dit("au-dela de 150 km, on ne derange plus personne",
  desert.tour1.length === 0 && desert.tour2.length === 0 && desert.vide,
  "c'est la que le chasseur doit etre prevenu, pas quelqu'un a 400 km");

// Le cas qui compte le plus : quelqu'un dans sa zone => pas de second tour
const melange = diffuser(centre, [
  { nom: "Hana (3 km)", lat: centre.lat + km(3), lng: centre.lng, rayon: 10 },
  { nom: "Ivan (90 km, secours)", lat: centre.lat + km(90), lng: centre.lng, rayon: 50, secours: true },
]);
dit("des qu'une seule personne est dans sa zone, personne n'est derange plus loin",
  melange.tour1.length === 1 && melange.tour2.length === 0);

let ko = 0;
console.log("");
for (const [ok, nom, note] of etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (note ? "  — " + note : "")); }
console.log("\n" + (etapes.length - ko) + "/" + etapes.length + " conformes");
process.exit(ko ? 1 : 0);
