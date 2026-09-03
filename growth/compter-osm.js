#!/usr/bin/env node
/**
 * Magofeed — COMBIEN DE MAGASINS EXISTENT VRAIMENT ? (mesure, pas estimation)
 *
 * A lancer depuis TON PC (pas depuis Claude : Overpass y est injoignable) :
 *     node growth/compter-osm.js
 *     node growth/compter-osm.js BE FR NL          (quelques pays seulement)
 *
 * Utilise EXACTEMENT le meme filtre que l'app (OSM_SHOP_TYPES de index.html),
 * pour que le chiffre soit comparable a ta base Firestore.
 * "out count;" ne renvoie qu'un nombre : c'est la requete la moins couteuse
 * possible pour Overpass, on peut la passer sur 30 pays sans abuser.
 *
 * Colonne "avec nom" = ce que l'app peut REELLEMENT importer : osmAnalyze()
 * et autoImportZone() jettent tout element sans tag name (`if(!name)return null`).
 */
const OSM_SHOP_TYPES =
  "convenience|supermarket|kiosk|beverages|greengrocer|deli|newsagent|frozen_food|health_food|farm|general|food|pastry|confectionery";

// Tes 9 pays deja presents en base + les gros marches. Ajoute/retire librement.
const PAYS = [
  ["BE","Belgique"],   ["FR","France"],     ["NL","Pays-Bas"],  ["KR","Coree du Sud"],
  ["TR","Turquie"],    ["IT","Italie"],     ["GB","Royaume-Uni"],["ES","Espagne"],
  ["DE","Allemagne"],  ["PL","Pologne"],    ["PT","Portugal"],  ["MA","Maroc"],
  ["US","Etats-Unis"], ["BR","Bresil"],     ["JP","Japon"],     ["ID","Indonesie"],
  ["IN","Inde"],       ["RU","Russie"],     ["MX","Mexique"],   ["CA","Canada"]
];

const ENDPOINT = "https://overpass-api.de/api/interpreter";

function requete(iso, avecNom) {
  const nom = avecNom ? '["name"]' : "";
  return `[out:json][timeout:600];
area["ISO3166-1"="${iso}"]["admin_level"="2"]->.a;
(node["shop"~"^(${OSM_SHOP_TYPES})$"]${nom}(area.a);
 way["shop"~"^(${OSM_SHOP_TYPES})$"]${nom}(area.a););
out count;`;
}

async function compte(iso, avecNom) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(requete(iso, avecNom))
  });
  if (res.status === 429 || res.status === 504) throw new Error("Overpass occupe (" + res.status + ") — relance plus tard");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  const el = (j.elements || []).find(e => e.type === "count");
  return Number(el && el.tags && el.tags.total) || 0;
}

const dors = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const filtre = process.argv.slice(2).map(s => s.toUpperCase());
  const liste = filtre.length ? PAYS.filter(p => filtre.includes(p[0])) : PAYS;
  console.log("pays;iso;objets_osm;avec_nom_importables");
  let totalNom = 0;
  for (const [iso, nom] of liste) {
    try {
      const tous = await compte(iso, false);
      await dors(20000);                      // Overpass est gratuit et partage : on l'epargne
      const nommes = await compte(iso, true);
      totalNom += nommes;
      console.log(`${nom};${iso};${tous};${nommes}`);
    } catch (e) {
      console.log(`${nom};${iso};ERREUR;${e.message}`);
    }
    await dors(20000);
  }
  console.log(`\n# TOTAL importable sur ces ${liste.length} pays : ${totalNom} magasins`);
  console.log(`# A 20 000 ecritures/jour (quota gratuit) : ${Math.ceil(totalNom / 20000)} jours d'import.`);
})();
