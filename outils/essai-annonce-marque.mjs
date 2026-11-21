/* ══ UNE ANNONCE DE MARQUE EST UNE PAROLE, PAS UN CONSTAT ══════════════════
   « imaginons je fais une collab a une franchise de boisson, au lieu de
   selectionner chaque magasin un a un et mettre en stock, on doit avoir la
   possibilite de selectionner d'un coup plusieurs pour que ce soit plus
   rapide mais je ne sais pas comment tu comptes t'y prendre pour ne pas que
   ce soit trop » — le fondateur.

   La reponse tient en une phrase : UNE collab = UN document. Aucun des 34 137
   magasins n'est modifie. Ce controle eprouve les proprietes qui decoulent de
   ce choix, parce que ce sont elles qui rendent la fonctionnalite honnete :

     - une annonce rend un magasin « possible » et JAMAIS « vu par quelqu'un ».
       C'est magasinConfirmePour qui commande tous les verts, et il n'est pas
       touche ;
     - rien n'entre dans s.drinks. Sinon le magasin partirait dans le cache
       localStorage et une collab terminee y survivrait 24 a 48 h, affichee
       sans marque et sans date ;
     - la fenetre de dates se ferme TOUTE SEULE, sans recharger la page.
       Date.now() est relu a chaque appel ; une implementation qui memoriserait
       sa reponse (comme _cleRayon le fait pour les 22 rayons probables)
       echouerait ici, et c'est exprime ;
     - declarationPour rend un OBJET GELE portant le nom de la marque, jamais
       un booleen. Un booleen finit par etre confondu avec « il l'a » ;
     - par defaut une collab ne vise que les independants : une boisson
       exotique n'est pas au catalogue d'une centrale d'achat.

   node outils/essai-annonce-marque.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R = "/home/user/magofeed";
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const M = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer(async (q, s) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  try { const b = await readFile(join(R, u)); s.writeHead(200, { "content-type": M[extname(u)] || "application/octet-stream" }); s.end(b); }
  catch { s.writeHead(404); s.end(""); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-BE",
  geolocation: { latitude: 50.8466, longitude: 4.3528 }, permissions: ["geolocation"] });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 180)));
await pg.route("**/*", (r) => r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort());
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => window.DRINKS && DRINKS.length > 100 && typeof window.declarationPour === "function", { timeout: 40000 });

const etapes = await pg.evaluate(() => {
  const v = []; const ok = (n, c, d) => v.push([n, !!c, d || ""]);
  const JOUR = 86400000, t = Date.now();

  /* Une boisson du catalogue, et deux magasins a Bruxelles : un independant
     (night shop) et une enseigne reconnue (Delhaize). */
  const boisson = DRINKS[0];
  const did = Number(boisson.id);
  /* UN MAGASIN SANS AUCUN RAYON PROBABLE. Premiere version de ce controle :
     « Night Shop Flagey », qui recoit un rayon probable PAR TYPE
     (_cleRayon = "t:nightshop", 557 boissons supposees). magasinALaBoisson y
     repondait donc oui sans aucune annonce, et la moitie des verifications ne
     prouvait rien. Un nom neutre ne declenche ni enseigne ni type : l'annonce
     est alors la SEULE raison possible, ce qui est exactement ce qu'on veut
     eprouver. */
  const indep = { id: "N1", fbId: "N1", name: "Commerce Essai Sans Type", brand: "", type: "",
    lat: 50.8470, lng: 4.3700, dist: 900, drinks: [], drinksVerified: [], confirmations: {} };
  const enseigne = { id: "D1", fbId: "D1", name: "Delhaize Proxy Flagey", brand: "Delhaize", type: "",
    lat: 50.8471, lng: 4.3701, dist: 900, drinks: [], drinksVerified: [], confirmations: {} };
  const loin = { id: "L1", fbId: "L1", name: "Commerce Essai Anvers", brand: "", type: "",
    lat: 51.2194, lng: 4.4025, dist: 45000, drinks: [], drinksVerified: [], confirmations: {} };

  ok("l'independant n'est pas une enseigne reconnue",
    !window.chainIdsForStore(indep.name, indep.brand), "chainIdsForStore = null");
  ok("et il n'a AUCUN rayon probable",
    (window.rayonProbableIds(indep) || []).length === 0,
    "sinon « possible » serait vrai sans annonce et rien ne serait eprouve");
  ok("le Delhaize en est une", !!window.chainIdsForStore(enseigne.name, enseigne.brand), "chainIdsForStore = objet");

  /* poser() COPIE. L'etape qui ferme la fenetre mute DECLARATIONS["essai-1"],
     et sans copie elle mutait l'objet « base » lui-meme : toutes les etapes
     suivantes heritaient d'une date expiree et echouaient pour rien. */
  const poser = (d) => {
    window.DECLARATIONS = d ? { "essai-1": JSON.parse(JSON.stringify(d)) } : {};
    window.declIndexer();
  };
  const base = {
    marque: "Pales", boissons: [did],
    lat: 50.8466, lng: 4.3528, rayonKm: 8,
    sansEnseignes: true, types: null,
    du: t - JOUR, au: t + JOUR,
    contrat: "Essai automatique", par: "essai", creeLe: t, actif: true, arreteLe: null
  };

  /* ── 1. CE QUE L'ANNONCE DIT, ET CE QU'ELLE NE DIT PAS ──────────────── */
  poser(base);
  const d0 = window.declarationPour(indep, did);
  ok("l'annonce couvre l'independant", !!d0, d0 ? "marque = " + d0.marque : "null");
  ok("elle rend un OBJET, pas un booleen", d0 && typeof d0 === "object", typeof d0);
  ok("et cet objet est GELE", d0 && Object.isFrozen(d0), d0 ? "isFrozen = " + Object.isFrozen(d0) : "-");
  ok("il porte le nom de la marque", d0 && d0.marque === "Pales", d0 ? d0.marque : "-");
  ok("le magasin devient « possible »", window.magasinALaBoisson(indep, did) === true, "magasinALaBoisson = true");
  ok("il ne devient JAMAIS « vu par quelqu'un »", window.magasinConfirmePour(indep, did) === false,
    "magasinConfirmePour = false — c'est lui qui commande tous les verts");

  /* ── 2. RIEN N'ENTRE DANS LE MAGASIN ────────────────────────────────── */
  ok("rien n'est entre dans s.drinks", (indep.drinks || []).length === 0, "drinks = " + JSON.stringify(indep.drinks));
  ok("rien n'est entre dans s.drinksVerified", (indep.drinksVerified || []).length === 0,
    "drinksVerified = " + JSON.stringify(indep.drinksVerified));
  ok("aucune confirmation n'a ete fabriquee", Object.keys(indep.confirmations || {}).length === 0,
    "confirmations = {}");
  ok("et aucune cle de rayon n'a ete posee sur le magasin", indep._cleRayon === undefined || indep._cleRayon === "",
    "_cleRayon = " + JSON.stringify(indep._cleRayon));

  /* ── 3. LES BORNES : ZONE, ENSEIGNE, DATES ──────────────────────────── */
  ok("hors du rayon : rien", window.declarationPour(loin, did) === null, "Anvers, 8 km de rayon");
  ok("une enseigne reconnue : rien", window.declarationPour(enseigne, did) === null, "sansEnseignes = true");
  poser(Object.assign({}, base, { sansEnseignes: false }));
  ok("mais on peut les inclure expres", !!window.declarationPour(enseigne, did), "sansEnseignes = false");

  poser(Object.assign({}, base, { du: t + JOUR, au: t + 2 * JOUR }));
  ok("avant le premier jour : rien", window.declarationPour(indep, did) === null, "la collab commence demain");
  poser(Object.assign({}, base, { du: t - 2 * JOUR, au: t - JOUR }));
  ok("apres le dernier jour : rien", window.declarationPour(indep, did) === null, "la collab est terminee");

  /* ── 4. LA FENETRE SE FERME SANS RECHARGER ──────────────────────────── */
  /* LE CONTROLE QUI COMPTE CONTRE LA MEMORISATION : on interroge le MEME
     objet magasin deux fois, en changeant la date entre les deux. Une
     implementation qui memoriserait sa reponse — comme _cleRayon le fait
     pour les 22 rayons probables — rendrait deux fois la meme chose. */
  poser(base);
  const avant = !!window.declarationPour(indep, did);
  window.DECLARATIONS["essai-1"].au = Date.now() - 1000;
  window.declIndexer();
  const apres = !!window.declarationPour(indep, did);
  ok("la fenetre se ferme sur le MEME magasin, sans rechargement",
    avant === true && apres === false, "avant = " + avant + ", apres = " + apres);

  /* ── 5. ARRETER, ET SUPPRIMER ───────────────────────────────────────── */
  poser(Object.assign({}, base, { actif: false }));
  ok("une annonce arretee ne couvre plus rien", window.declarationPour(indep, did) === null, "actif = false");
  poser(null);
  ok("une annonce supprimee ne couvre plus rien", window.declarationPour(indep, did) === null, "table vide");
  ok("et le magasin redevient inconnu", window.magasinALaBoisson(indep, did) === false, "magasinALaBoisson = false");

  /* ── 6. LE NOM DE LA MARQUE EST BORNE ───────────────────────────────── */
  poser(Object.assign({}, base, { marque: "Une Marque Au Nom Interminable" }));
  const dLong = window.declarationPour(indep, did);
  ok("le nom de la marque est borne a 14 caracteres",
    dLong && dLong.marque.length === 14, dLong ? '"' + dLong.marque + '" (' + dLong.marque.length + ")" : "-");

  /* ── 7. LES AUTRES BOISSONS NE SONT PAS CONCERNEES ──────────────────── */
  poser(base);
  const autre = DRINKS.filter((x) => Number(x.id) !== did)[0];
  ok("une boisson hors de la collab n'est pas couverte",
    window.declarationPour(indep, Number(autre.id)) === null, autre.name);
  ok("et les identifiants declares pour ce magasin sont exactement la collab",
    JSON.stringify(window.idsDeclaresPour(indep)) === JSON.stringify([did]),
    JSON.stringify(window.idsDeclaresPour(indep)));

  window.DECLARATIONS = {}; window.declIndexer();
  return v;
});

/* ── 8. UN REFUS DE LECTURE NE SE LIT PAS COMME UNE ABSENCE ─────────────
   Les chargeurs vivent dans le module Firebase, qui ne se charge pas sans
   reseau — et ce controle coupe tout le reseau expres. On lit donc la source
   servie. Ce qui est en jeu : le fourre-tout des regles Firestore renvoie
   permission-denied, PAS du vide, et un chargeur qui avale son erreur
   laisserait l'administration afficher « aucune annonce » sur un REFUS. */
const source = (await readFile(join(R, "index.html"), "utf8")).replace(/[ \t]+/g, "");
const srcOk = (n, c, d) => etapes.push([n, !!c, d || ""]);
srcOk("un refus de lecture est garde, pas avale",
  /window\._declErreur=String/.test(source) && /window\._declLuA=Date\.now\(\)/.test(source),
  "_declErreur et _declLuA sont renseignes par fbLoadDeclarations");
srcOk("une lecture refusee ne vide pas ce qu'on avait",
  /window\._declErreur=String[\s\S]{0,200}console\.warn\("Declarations:"/.test(source),
  "la branche d'erreur ne touche pas window.DECLARATIONS");
srcOk("arreter n'est pas supprimer",
  /fbArreterDeclaration[\s\S]{0,600}actif:false,arreteLe:Date\.now\(\)/.test(source) &&
  /fbSupprimerDeclaration[\s\S]{0,300}deleteField\(\)/.test(source),
  "deux chemins distincts, et l'arret garde la reference de contrat");
srcOk("la table est chargee au demarrage",
  /window\.fbLoadDeclarations\(\);/.test(source), "appelee apres fbLoadDrinkImages");
srcOk("aucune fonction ne rend « les identifiants a ajouter »",
  !/idsAAjouter|declaredToAdd|ajouterDeclares/i.test(source),
  "le nom idsDeclaresPour dit « declares », jamais « a ajouter »");

console.log("\n  UNE ANNONCE DE MARQUE EST UNE PAROLE, PAS UN CONSTAT\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(58) + " " + d); }
console.log("\n  erreurs JavaScript non rattrapees : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && errs.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko === 0 && errs.length === 0 ? 0 : 1);
