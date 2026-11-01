#!/usr/bin/env node
/**
 * Magofeed — DE COMBIEN LA CARTE GROSSIRAIT-ELLE ? (mesure, pas intuition)
 *
 * A lancer depuis TON PC (pas depuis Claude : Overpass y est injoignable) :
 *     node growth/compter-snacks.js
 *     node growth/compter-snacks.js BE FR          (quelques pays)
 *
 * LA QUESTION. Certaines boissons rares ne se trouvent pas en epicerie mais
 * dans un snack turc, une friterie, un kebab. Faut-il les faire entrer dans
 * Magofeed ? Le risque est connu et il a ete pose clairement : l'application
 * est UN SEUL fichier HTML charge dans un navigateur, pas une application
 * compilee. Une carte surchargee n'est plus credible.
 *
 * Ce script ne tranche pas : il donne le chiffre qui permet de trancher.
 *
 * CE QU'IL COMPTE, ET POURQUOI CES QUATRE LIGNES
 *   1. L'EXISTANT        — exactement le filtre de l'app (OSM_SHOP_TYPES).
 *                          C'est la reference : +0 %.
 *   2. LES SNACKS        — amenity=fast_food. Snack, friterie, kebab,
 *                          sandwicherie : on y achete une canette au comptoir
 *                          et on repart avec. C'est le seul candidat serieux.
 *   3. LES RESTAURANTS   — pour chiffrer ce qu'on REFUSE, pas pour l'ajouter.
 *                          On y consomme sur place, a un prix sans rapport
 *                          avec celui d'une canette en rayon.
 *   4. CAFES, BARS, PUBS — meme chose, et ils servent de l'alcool : contraire
 *                          a la regle du projet. Chiffre pour memoire.
 *
 * LA COLONNE QUI COMPTE VRAIMENT EST « avec nom ». autoImportZone() jette
 * tout element sans tag name (`if(!name)return null`) : un POI anonyme
 * n'entrera JAMAIS en base. Beaucoup de friteries et de snacks sont anonymes
 * dans OpenStreetMap, donc le total brut surestime largement l'impact reel.
 *
 * « out count; » ne renvoie qu'un nombre : c'est la requete la moins couteuse
 * possible pour Overpass, qui est gratuit et partage. On l'epargne quand meme
 * en espacant les appels de 20 secondes, comme growth/compter-osm.js.
 */
const OSM_SHOP_TYPES =
  "convenience|supermarket|kiosk|beverages|greengrocer|deli|newsagent|frozen_food|health_food|farm|general|food|pastry|confectionery|variety_store|department_store|discount";

const LIGNES = [
  { cle: "existant", titre: "l'existant (filtre actuel de l'app)", filtre: `["shop"~"^(${OSM_SHOP_TYPES})$"]` },
  { cle: "snacks", titre: "snacks / friteries / kebabs", filtre: `["amenity"="fast_food"]` },
  { cle: "restaurants", titre: "restaurants (refuses)", filtre: `["amenity"="restaurant"]` },
  { cle: "bars", titre: "cafes, bars, pubs (refuses)", filtre: `["amenity"~"^(cafe|bar|pub)$"]` },
];

const PAYS = [["BE", "Belgique"], ["FR", "France"], ["NL", "Pays-Bas"]];
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const UA = "Magofeed-mesure/1.0 (application communautaire de boissons sans alcool; contact via github.com/magonyos991-ux/magofeed)";

function requete(iso, filtre, avecNom) {
  const nom = avecNom ? '["name"]' : "";
  return `[out:json][timeout:600];
area["ISO3166-1"="${iso}"]["admin_level"="2"]->.a;
(node${filtre}${nom}(area.a);
 way${filtre}${nom}(area.a););
out count;`;
}

async function compte(iso, filtre, avecNom) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: "data=" + encodeURIComponent(requete(iso, filtre, avecNom)),
  });
  if (res.status === 429 || res.status === 504) throw new Error("Overpass occupe (" + res.status + ") — relance plus tard");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  const el = (j.elements || []).find((e) => e.type === "count");
  return Number(el && el.tags && el.tags.total) || 0;
}

const dors = (ms) => new Promise((r) => setTimeout(r, ms));
const pourcent = (x, base) => (base ? ((100 * x) / base).toFixed(1) + " %" : "?");

(async () => {
  const filtre = process.argv.slice(2).map((s) => s.toUpperCase());
  const liste = filtre.length ? PAYS.filter((p) => filtre.includes(p[0])) : PAYS;
  console.log("pays;categorie;objets_osm;avec_nom_importables");
  for (const [iso, nomPays] of liste) {
    const nommes = {};
    for (const l of LIGNES) {
      try {
        const tous = await compte(iso, l.filtre, false);
        await dors(20000);
        const n = await compte(iso, l.filtre, true);
        nommes[l.cle] = n;
        console.log(`${nomPays};${l.titre};${tous};${n}`);
      } catch (e) {
        console.log(`${nomPays};${l.titre};ERREUR;${e.message}`);
      }
      await dors(20000);
    }
    const base = nommes.existant;
    if (base) {
      console.log(`\n# ${nomPays} — ce que l'app connait aujourd'hui : ${base} commerces importables.`);
      if (nommes.snacks != null) {
        console.log(`#   ajouter les SNACKS : +${nommes.snacks} (${pourcent(nommes.snacks, base)} de plus)`);
      }
      if (nommes.restaurants != null) {
        console.log(`#   ajouter les RESTAURANTS aurait fait : +${nommes.restaurants} (${pourcent(nommes.restaurants, base)} de plus)`);
      }
      if (nommes.bars != null) {
        console.log(`#   ajouter CAFES/BARS/PUBS aurait fait : +${nommes.bars} (${pourcent(nommes.bars, base)} de plus)`);
      }
      console.log(`#\n# Rappel : ces chiffres sont le PLAFOND. L'app n'importe que la zone`);
      console.log(`# regardee, jamais un pays entier, et un commerce ne montre une boisson`);
      console.log(`# que quand quelqu'un l'y a vue.\n`);
    }
  }
})();
