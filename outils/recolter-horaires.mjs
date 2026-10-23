/* ══ LE GENERATEUR QUI MANQUAIT ═════════════════════════════════════════════
   data/horaires-osm-be.json a ete ajoute le 28 aout 2026 par un seul commit,
   et personne ne savait le refabriquer : aucun script, aucune note, et le
   message du commit qui l'apporte n'en dit pas un mot. Un fichier de 34 786
   horaires qu'on ne sait pas regenerer vieillit en silence — c'est exactement
   ce qui s'est passe pendant huit semaines.

   CE SCRIPT EST CE GENERATEUR, ET IL ECRIT SA PROPRE PROVENANCE a cote du
   fichier (data/horaires-osm-be.meta.json). La prochaine personne qui ouvre
   ce depot saura d'ou vient la donnee, quand, avec quelle requete, et sous
   quelle licence.

   CE QU'IL NE FAIT PAS, ET C'EST VOULU
   Il n'ecrit RIEN dans Firestore. L'application lit ce fichier a l'affichage
   (chargerHorairesOSM -> osmIdDe -> horairesReels), et openInfo essaie
   TOUJOURS l'horaire du commercant en premier. Remplacer ce fichier cent fois
   ne peut donc pas effacer une seule saisie : « rafraichis sans changer ceux
   qui ont ete modifies » est tenu par construction, pas par precaution.

   IL NE CHERCHE PAS NON PLUS LES HORAIRES « SUR INTERNET ». La donnee existe,
   gratuite et structuree, dans OpenStreetMap. Un modele de langage qui
   fouillerait le web pourrait se tromper de boutique et ferait passer une
   supposition pour un releve — exactement ce que cette application ne fait
   jamais. C'est deja la jurisprudence du projet, ecrite dans index.html a
   propos d'enrichStoreHours.

   DEUX GARDE-FOUS NON NEGOCIABLES. Ils distinguent « rafraichi » de
   « remplace par une recolte cassee » : le volume (une recolte qui maigrit
   d'un coup est une panne, pas une fermeture generale) et la derive (si plus
   de 5 % des horaires communs changent en une semaine, ce n'est pas la
   Belgique qui a change d'avis). En cas de doute, le script refuse d'ecrire
   et laisse le fichier precedent intact.

   UNE CLE ABSENTE N'EST PAS UNE CLE MORTE. Un hoquet d'Overpass, un retag,
   une geometrie cassee une semaine : on garde l'ancienne valeur et on compte
   les absences. Il faut huit semaines consecutives d'absence pour qu'une
   ligne disparaisse.

   Usage :
     node outils/recolter-horaires.mjs                 recolte chez Overpass
     node outils/recolter-horaires.mjs --csv f.tsv     relit un CSV deja la
     GABARIT=true node outils/recolter-horaires.mjs    premier passage
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RACINE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const FICHIER = RACINE + "/data/horaires-osm-be.json";
const META = RACINE + "/data/horaires-osm-be.meta.json";

const UA = { "User-Agent": "Magofeed-horaires/1.0 (application communautaire de boissons sans alcool; contact via github.com/magonyos991-ux/magofeed)" };
const MIROIRS = [
  "https://overpass-api.de/api",
  "https://overpass.kumi.systems/api",
  "https://overpass.private.coffee/api",
];
const ATTENTES = [30, 60, 90, 120];
const SEUIL_VOLUME = 0.95;   // une recolte sous 95 % de la precedente est une panne
const SEUIL_DERIVE = 0.05;   // plus de 5 % de valeurs changees en une semaine : on regarde
const SEMAINES_AVANT_OUBLI = 8;

/* ── LA REQUETE ────────────────────────────────────────────────────────────
   Sortie CSV, deux colonnes : l'identifiant et l'horaire. En JSON avec les
   tags et les centres, la meme reponse pese une quinzaine de megaoctets ;
   en CSV elle fait le poids du fichier publie.

   shop=* N'EST PAS RESTREINT, et surtout pas aux 17 types que la carte
   connait. La raison n'est pas un chiffre, c'est le mecanisme : l'appariement
   se fait par IDENTIFIANT, jamais par type. Restreindre retirerait des
   horaires qui s'affichent aujourd'hui pour tout magasin entre par un autre
   chemin (Overture, ajout a la main, enrichissement a l'ouverture d'une fiche).

   amenity=fuel est deliberement inclus : a 23 h en Belgique, ce qui est
   ouvert, c'est la station-service et le night shop. C'est le scenario exact
   du fondateur.

   bar, cafe, pub, restaurant et nightclub sont deliberement EXCLUS : on y
   consomme sur place, on n'y achete pas sa canette. C'est la meme regle que
   commerces-monde.js applique deja cote serveur.

   nœuds et chemins seulement, jamais de relations : l'application n'en
   demande jamais et prefixe « o » les deux autres. Une relation creerait des
   cles qui ne s'apparient a rien. */
/* UNE BOITE, PAS LA BELGIQUE ADMINISTRATIVE — ET C'EST VOULU.
   Le premier essai de ce script interrogeait area["ISO3166-1"="BE"]. Il a
   ramene 63,3 % du fichier existant, et le garde-fou de volume a refuse
   d'ecrire. Le garde-fou avait raison : ce n'etait pas la Belgique qui avait
   retreci, c'etait MA requete qui etait plus etroite que la recolte d'origine.

   Le fichier herite a ete moissonne sur la boite ci-dessous, celle que le
   depot utilise deja pour la Belgique (growth/seed-osm.js, growth/couverture.js).
   Elle deborde volontairement : growth/couverture.js le dit mot pour mot,
   « la bbox de la Belgique mord sur Lille et Aix-la-Chapelle ». Mesure sur
   400 cles tirees au hasard et resolues contre l'API OpenStreetMap : 98,5 %
   des entrees sont dans cette boite, et environ une sur dix est a moins de
   33 km du centre de Lille — plusieurs a 300 m de sa place centrale.

   Ce debordement n'est pas un defaut a corriger, c'est la reponse au besoin
   du fondateur : il cherchait un commerce ouvert A LILLE, a 23 h. Passer a la
   frontiere administrative aurait supprime cette couverture-la en silence.
   Le nom du fichier dit « be » ; son perimetre est la Belgique ET sa bande
   frontaliere. Le fichier meta le repete, pour qui lirait le nom seul. */
const BOITE = [49.49, 2.54, 51.51, 6.41];   // sud, ouest, nord, est
const REQUETE = [
  '[out:csv(::id,"opening_hours";false;"\\t")][timeout:900][bbox:' + BOITE.join(",") + "];",
  "(",
  '  node["opening_hours"]["shop"];',
  '  way ["opening_hours"]["shop"];',
  '  node["opening_hours"]["amenity"="fuel"];',
  '  way ["opening_hours"]["amenity"="fuel"];',
  '  node["opening_hours"]["amenity"="marketplace"];',
  '  way ["opening_hours"]["amenity"="marketplace"];',
  ");",
  "out;",
].join("\n");

const dors = (s) => new Promise((r) => setTimeout(r, s * 1000));
const dire = (...a) => console.log(...a);

/* Overpass sert deux creneaux par adresse IP, et les runners GitHub les
   partagent. Demander son tour plutot que de forcer, c'est la difference
   entre un service public qui dure et un service public qu'on sature. */
async function attendreCreneau(base) {
  try {
    const rep = await fetch(base + "/status", { headers: UA });
    if (!rep.ok) return;
    const txt = await rep.text();
    const m = txt.match(/(\d+)\s+slots?\s+available\s+now/i);
    if (m && Number(m[1]) > 0) return;
    const quand = txt.match(/Slot available after:.*?in\s+(\d+)\s+seconds/i);
    if (quand) {
      const s = Math.min(Number(quand[1]) + 2, 180);
      dire("  creneau Overpass dans " + s + " s, on attend");
      await dors(s);
    }
  } catch (e) {
    /* /status indisponible : on tentera la requete, elle dira elle-meme non */
  }
}

async function recolter() {
  let derniere = null;
  for (const base of MIROIRS) {
    for (let essai = 0; essai < ATTENTES.length; essai++) {
      try {
        await attendreCreneau(base);
        dire("  interrogation de " + base + " (essai " + (essai + 1) + ")");
        const rep = await fetch(base + "/interpreter", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "text/plain" }, UA),
          body: REQUETE,
        });
        if (rep.ok) {
          const txt = await rep.text();
          /* Overpass repond 200 avec un message d'erreur dans le corps quand
             la requete ne lui plait pas. Recopier SON texte, pas seulement le
             mien : sans cela on diagnostique a l'aveugle. */
          if (txt.length < 100000) throw new Error("reponse trop courte (" + txt.length + " octets). Overpass a dit : " + txt.replace(/\s+/g, " ").trim().slice(0, 400));
          dire("  recu " + txt.length + " octets");
          return { texte: txt, endpoint: base };
        }
        derniere = "HTTP " + rep.status;
      } catch (e) {
        derniere = String((e && e.message) || e);
      }
      dire("  echec (" + derniere + "), nouvelle tentative dans " + ATTENTES[essai] + " s");
      await dors(ATTENTES[essai]);
    }
  }
  throw new Error("Overpass injoignable sur les " + MIROIRS.length + " miroirs : " + derniere);
}

/* ── LECTURE DU CSV ────────────────────────────────────────────────────────
   Une valeur OpenStreetMap peut theoriquement contenir un retour a la ligne
   ou une tabulation. La ligne est alors inexploitable : on la COMPTE et on la
   jette, on ne devine pas. Un chiffre de rejets qui grimpe est un signal. */
function lireCsv(texte) {
  const horaires = Object.create(null);
  let rejetees = 0, doublons = 0, vides = 0;
  const lignes = texte.split("\n");
  for (const brute of lignes) {
    const ligne = brute.replace(/\r$/, "");
    if (!ligne) continue;
    const morceaux = ligne.split("\t");
    if (morceaux.length !== 2) { rejetees++; continue; }
    const cle = morceaux[0].trim();
    const valeur = morceaux[1].trim();
    if (!/^\d+$/.test(cle)) { rejetees++; continue; }   // en-tete, ou ligne cassee
    if (!valeur) { vides++; continue; }
    if (horaires[cle] !== undefined) { doublons++; }
    horaires[cle] = valeur;
  }
  return { horaires, rejetees, doublons, vides };
}

/* ── LA FUSION ─────────────────────────────────────────────────────────────
   « Rafraichis s'il y a un changement sans changer les autres. »
   Au niveau du fichier, cela veut dire : la recolte gagne sur ce qu'elle
   connait, et ne detruit rien de ce qu'elle ignore. */
function fusionner(ancien, nouveau, absencesAvant) {
  const sortie = Object.create(null);
  const absences = Object.create(null);
  let nouveaux = 0, modifies = 0, inchanges = 0, absents = 0, oublies = 0;

  for (const cle of Object.keys(nouveau)) {
    sortie[cle] = nouveau[cle];
    if (ancien[cle] === undefined) nouveaux++;
    else if (ancien[cle] !== nouveau[cle]) modifies++;
    else inchanges++;
  }
  for (const cle of Object.keys(ancien)) {
    if (nouveau[cle] !== undefined) continue;
    const n = (Number(absencesAvant[cle]) || 0) + 1;
    if (n >= SEMAINES_AVANT_OUBLI) { oublies++; continue; }   // huit semaines : on laisse partir
    sortie[cle] = ancien[cle];
    absences[cle] = n;
    absents++;
  }
  return { sortie, absences, nouveaux, modifies, inchanges, absents, oublies };
}

/* Une cle par ligne, triee par identifiant numerique. Le fichier reste du
   JSON strict — l'application fait fetch().then(json()) et rien d'autre —
   mais le diff hebdomadaire devient la liste lisible de ce qui a change. Sur
   une seule ligne de 1,8 Mo, git ne deltaifie pas et aucune relecture humaine
   n'est possible : c'est pourtant exactement la garantie demandee. */
function ecrireJson(obj) {
  const cles = Object.keys(obj).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
  const lignes = cles.map((k) => JSON.stringify(k) + ":" + JSON.stringify(obj[k]));
  return "{\n" + lignes.join(",\n") + "\n}\n";
}

async function principal() {
  const gabarit = String(process.env.GABARIT || "").toLowerCase() === "true";
  const iCsv = process.argv.indexOf("--csv");
  const csvLocal = iCsv !== -1 ? process.argv[iCsv + 1] : null;

  const ancien = existsSync(FICHIER) ? JSON.parse(readFileSync(FICHIER, "utf8")) : {};
  const metaAvant = existsSync(META) ? JSON.parse(readFileSync(META, "utf8")) : null;
  const absencesAvant = (metaAvant && metaAvant.absents) || {};
  dire("fichier actuel : " + Object.keys(ancien).length + " cles" + (metaAvant ? " (meta du " + metaAvant.date + ")" : " (aucun meta : premier passage)"));

  let texte, endpoint;
  if (csvLocal) {
    texte = readFileSync(csvLocal, "utf8");
    endpoint = "fichier local " + csvLocal;
    dire("lecture d'un CSV local, aucune requete reseau");
  } else {
    const r = await recolter();
    texte = r.texte;
    endpoint = r.endpoint;
  }

  const lu = lireCsv(texte);
  const nb = Object.keys(lu.horaires).length;
  dire("recolte : " + nb + " horaires, " + lu.rejetees + " lignes rejetees, " + lu.doublons + " doublons de cle, " + lu.vides + " valeurs vides");
  if (lu.doublons) dire("  ATTENTION : des doublons de cle, inconnus jusqu'ici. A regarder.");
  if (!nb) throw new Error("recolte vide : on n'ecrit rien, le fichier precedent reste en place");

  /* GARDE-FOU DE VOLUME. Calibre sur le dernier meta, pas sur une constante :
     le nombre de commerces belges bouge, le seuil doit bouger avec lui. */
  const reference = metaAvant ? Number(metaAvant.nbCles) : Object.keys(ancien).length;
  if (reference) {
    const part = nb / reference;
    dire("volume : " + nb + " contre " + reference + " la derniere fois (" + (100 * part).toFixed(1) + " %)");
    if (part < SEUIL_VOLUME) {
      if (!gabarit) throw new Error("recolte trop maigre (" + (100 * part).toFixed(1) + " % du dernier passage) : c'est une panne, pas une fermeture generale. Rien n'est ecrit.");
      dire("  GABARIT : ecart de volume accepte pour ce premier passage");
    }
  }

  /* GARDE-FOU DE DERIVE. Au premier passage le gabarit a huit semaines et
     l'ecart depassera forcement le seuil : il se relit a la main, une fois.
     Ensuite, semaine apres semaine, 5 % a du sens. */
  let communes = 0, changees = 0;
  const exemples = [];
  for (const cle of Object.keys(lu.horaires)) {
    if (ancien[cle] === undefined) continue;
    communes++;
    if (ancien[cle] !== lu.horaires[cle]) {
      changees++;
      if (exemples.length < 12) exemples.push(cle + " : « " + ancien[cle] + " » -> « " + lu.horaires[cle] + " »");
    }
  }
  const derive = communes ? changees / communes : 0;
  dire("derive : " + changees + " valeurs changees sur " + communes + " communes (" + (100 * derive).toFixed(2) + " %)");
  /* MONTRER CE QUI CHANGE, TOUJOURS. Un pourcentage de derive ne dit pas si
     la Belgique a bouge ou si la requete s'est mise a formater autrement.
     Douze exemples suffisent a trancher a l'œil, et ils coutent douze lignes
     de journal. Sans eux, « relance avec GABARIT=true » est une invitation a
     ecraser 13 000 valeurs sans les avoir regardees. */
  if (exemples.length) {
    dire("exemples de ce qui change :");
    exemples.forEach((x) => dire("  " + x));
  }
  if (communes && derive > SEUIL_DERIVE) {
    if (!gabarit) throw new Error("derive de " + (100 * derive).toFixed(2) + " % : la Belgique n'a pas change d'avis en une semaine. Rien n'est ecrit. Relis, puis relance avec GABARIT=true si c'est legitime.");
    dire("  GABARIT : derive acceptee pour ce premier passage");
  }

  const f = fusionner(ancien, lu.horaires, absencesAvant);
  dire("fusion : " + f.nouveaux + " nouveaux, " + f.modifies + " modifies, " + f.inchanges + " inchanges, " + f.absents + " absents gardes, " + f.oublies + " oublies apres " + SEMAINES_AVANT_OUBLI + " semaines");

  writeFileSync(FICHIER, ecrireJson(f.sortie));
  const meta = {
    source: "OpenStreetMap",
    endpoint: endpoint,
    requete: REQUETE,
    date: new Date().toISOString().slice(0, 19) + "Z",
    nbCles: Object.keys(f.sortie).length,
    nbRecoltes: nb,
    nbNouveaux: f.nouveaux,
    nbModifies: f.modifies,
    nbInchanges: f.inchanges,
    nbAbsentsGardes: f.absents,
    nbOublies: f.oublies,
    doublons: lu.doublons,
    lignesRejetees: lu.rejetees,
    valeursVides: lu.vides,
    deriveParMille: Math.round(derive * 1000),
    absents: f.absences,
    perimetre: "boite [sud,ouest,nord,est] = " + BOITE.join(", ") + " — la Belgique ET sa bande frontaliere (Lille, Aix-la-Chapelle, sud des Pays-Bas, Luxembourg). Le nom du fichier dit « be » ; son contenu est plus large, et c'est voulu.",
    licence: "ODbL 1.0",
    lien: "https://www.openstreetmap.org/copyright",
    note: "Les valeurs sont recopiees TELLES QUELLES. Les anomalies connues (virgule la ou OpenStreetMap attend un point-virgule) sont reparees A LA LECTURE par _reparerSeparateur dans index.html, jamais dans ce fichier : nettoyer ici viderait outils/essai-horaires.mjs de son sujet.",
  };
  writeFileSync(META, JSON.stringify(meta, null, 1) + "\n");
  dire("\necrit : " + meta.nbCles + " horaires dans data/horaires-osm-be.json, provenance dans data/horaires-osm-be.meta.json");
}

principal().catch((e) => {
  console.error("\nECHEC : " + ((e && e.message) || e));
  console.error("Le fichier precedent est intact. Une recolte partielle ne remplace jamais une recolte complete.");
  process.exit(1);
});
