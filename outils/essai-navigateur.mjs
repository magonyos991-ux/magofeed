/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   ESSAI DANS UN VRAI NAVIGATEUR
   ----------------------------------------------------------------------------
   POURQUOI. Les autres outils lisent la source ou la table. Ils ne peuvent pas
   dire si un bouton s'ouvre, si une carte s'affiche, si changer de langue
   change vraiment l'ecran. Un assemblage de chaines peut etre juste a la
   lecture et casser au rendu — c'est arrive : un tr() appele au moment du
   rendu figeait la langue, et l'ecran gardait le francais apres le changement.
   Ici on ouvre l'application, on clique, et on regarde ce qui est ecrit.

   AUCUN RESEAU. On ne touche ni Firebase ni OpenFoodFacts : les fonctions
   d'envoi sont remplacees par des doublures qui retiennent ce qu'on leur
   donne. On teste notre code, pas la connexion.

   Lancer :  node outils/essai-navigateur.mjs
   ============================================================================ */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.log("playwright n'est pas installe — essai saute (npm i -D playwright)"); process.exit(0); }

const NAVIGATEUR = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".png":"image/png", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json", ".ico":"image/x-icon" };

/* LU SUR LA SOURCE, PAS DANS LE NAVIGATEUR.
   La liste des champs demandes a Firestore vit dans le script de module, qui
   ne s'execute pas sans reseau (il importe le SDK depuis un CDN). On la lit
   donc dans le fichier. C'est le coeur du correctif anti-plantage : si
   « drinks » revenait dans cette projection, la carte de Paris repasserait de
   2,8 Mo a 65,7 Mo et le telephone tuerait l'onglet. */
const statiques = [];
{
  const src = await readFile(join(process.cwd(), "index.html"), "utf8");
  const m = src.match(/var MAGO_CHAMPS_LEGER = ([^;]+);/);
  const champs = m ? m[1] : "";
  statiques.push(["la projection allegee est declaree", !!m]);
  statiques.push(["elle ne demande pas les assortiments",
    !!m && !/"drinks"/.test(champs) && !/"drinksVerified"/.test(champs)]);
  statiques.push(["elle demande les confirmations", /"confirmations"/.test(champs)]);
  statiques.push(["la carte ne passe plus par le drapeau geohash jamais leve",
    !/pinsSeuls && MAGO_GEOHASH_READY/.test(src)]);
  statiques.push(["un magasin allege est complete avant d'annoncer son rayon",
    /window\.magasinCompleter/.test(src) && /window\.fbMagasinComplet/.test(src)]);
}

const srv = createServer(async (q, r) => {
  try {
    const u = decodeURIComponent(q.url.split("?")[0]);
    const f = join(process.cwd(), u === "/" ? "/index.html" : u);
    const b = await readFile(f);
    r.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    r.end(b);
  } catch { r.writeHead(404); r.end("non"); }
});
await new Promise((ok) => srv.listen(8099, ok));

let nav;
try { nav = await chromium.launch({ executablePath: NAVIGATEUR }); }
catch (e) { console.log("aucun navigateur utilisable (" + String(e.message).slice(0, 90) + ") — essai saute"); srv.close(); process.exit(0); }

const page = await nav.newPage();
/* Le catalogue va chercher des images de produits : sans reseau ici, on coupe
   court plutot que d'attendre des delais d'expiration. */
await page.route("**://*.openfoodfacts.org/**", (r) => r.abort());
await page.goto("http://localhost:8099/index.html", { waitUntil: "load" });
await page.waitForTimeout(2500);

const r = await page.evaluate(async () => {
  const etapes = [];
  const dit = (nom, ok) => etapes.push([nom, !!ok]);
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const out = { etapes };

  /* ── 1. Envoyer un magasin a quelqu'un, depuis la carte ────────────── */
  window._fbUser = { uid: "moi" };
  MSG.rows = [{ cid: "ami_moi", members: ["moi", "ami"], state: "open", unread: {}, lastAt: Date.now() }];
  MSG.users["ami"] = { pseudo: "Zdoudex" };
  MSG.blocs = [];
  let envoye = null;
  window.fbOuvrirConversation = async () => ({ ok: true, cid: "ami_moi", conv: { cid: "ami_moi", state: "open" } });
  window.fbEnvoyerMessage = async (cid, msg) => { envoye = { cid, msg }; return { ok: true }; };
  window.fbConvId = (a, b) => [a, b].sort().join("_");

  const magasin = { id: "s1", fbId: "s1", name: "WHSmith", brand: "WHSmith", lat: 50.9010, lng: 4.4844, drinks: [] };
  partagerMagasin(magasin);
  const ov = document.getElementById("share-store");
  dit("la feuille d'envoi s'ouvre", ov);
  if (ov) {
    const opts = [...ov.querySelectorAll(".msg-opt")];
    dit("l'ami est propose", opts.some((o) => o.textContent.indexOf("Zdoudex") !== -1));
    dit("le partage par lien reste propose", opts.some((o) => o.getAttribute("data-k") === "lien"));
    const ligne = opts.find((o) => o.getAttribute("data-uid") === "ami");
    if (ligne) ligne.click();
    await pause(400);
  }
  dit("un message est parti", envoye);
  if (envoye) {
    dit("le magasin y est", envoye.msg.storeId === "s1" && envoye.msg.storeName === "WHSmith");
    dit("aucune boisson inventee", !("drinkName" in envoye.msg) && !("drinkId" in envoye.msg));
    dit("les coordonnees suivent", envoye.msg.lat === 50.9010 && envoye.msg.lng === 4.4844);
  }

  /* ── 2. La carte, telle que la voit celui qui recoit ────────────────── */
  window.userLat = 50.85; window.userLng = 4.35;
  const html = msgBulleHTML({ type: "spot", storeId: "s1", storeName: "WHSmith", lat: 50.9010, lng: 4.4844, by: "ami" }, false, Date.now(), "Zdoudex");
  out.carte = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  dit("la carte nomme le magasin", html.indexOf("WHSmith") !== -1);
  dit("bouton pour y aller", html.indexOf('data-act="go"') !== -1);
  dit("bouton d'itineraire", html.indexOf('data-act="nav"') !== -1);
  dit("pas de bouton Fiche, il n'y a pas de boisson", html.indexOf('data-act="fiche"') === -1);

  /* ── 3. La feuille suit la langue ───────────────────────────────────── */
  const titreEn = (() => {
    setLang("en");
    const v = document.getElementById("share-store"); if (v) v.remove();
    partagerMagasin(magasin);
    const o = document.getElementById("share-store");
    const t = o ? (o.querySelector(".claim-title") || {}).textContent : "";
    if (o) o.remove();
    return t;
  })();
  out.titreEn = titreEn;
  dit("la feuille se traduit", titreEn === "Send this shop");

  /* ── 4. Revenir d'une fiche magasin ne doit pas perdre la boisson ───── */
  window.exploreFilter = { drinkId: 200, name: "Mountain Dew Original" };
  window._exploreFromDrink = true;
  window.storeDetailReturn = "__explore__";
  if (typeof exploreFilter !== "undefined") { try { eval("exploreFilter = window.exploreFilter"); } catch (e) {} }
  const faux = { getBounds: () => ({ getNorthEast: () => ({lat:48.9,lng:2.4}), getSouthWest: () => ({lat:48.8,lng:2.3}) }),
                 invalidateSize: () => {} };
  const vraiMap = window.exploreMap;
  try { eval("exploreMap = faux"); } catch (e) { window.exploreMap = faux; }
  /* L'hote de la carte n'existe qu'une fois la carte ouverte. On le pose ici
     pour emprunter le chemin QUI ETAIT CASSE — celui qui reaffiche la carte
     deja construite. Sans lui, le test passait par la reouverture complete,
     qui elle n'a jamais perdu le filtre : on aurait teste le mauvais chemin. */
  let hote = document.getElementById("explore-map-host"), posePourLeTest = false;
  if (!hote) { hote = document.createElement("div"); hote.id = "explore-map-host"; document.body.appendChild(hote); posePourLeTest = true; }
  closeStoreDetail();
  await pause(120);
  const apres = (typeof exploreFilter !== "undefined") ? exploreFilter : window.exploreFilter;
  dit("le filtre boisson survit au retour", !!apres && apres.drinkId === 200);
  if (posePourLeTest) hote.remove();
  dit("le nom de la boisson survit aussi", apres && apres.name === "Mountain Dew Original");
  try { eval("exploreMap = vraiMap"); } catch (e) { window.exploreMap = vraiMap; }
  try { eval("exploreFilter = null"); } catch (e) {}

  /* ── 5. « En stock » veut dire confirme, dans la liste comme sur la carte ── */
  const rattache = { drinks: [200], confirmations: {} };
  const confirme = { drinks: [200], confirmations: { 200: 2 } };
  const absent = { drinks: [], confirmations: { 200: 5 } };
  const negatif = { drinks: [200], confirmations: { 200: -1 } };
  dit("rattache seul n'est PAS en stock", magasinConfirmePour(rattache, 200) === false);
  dit("confirme EST en stock", magasinConfirmePour(confirme, 200) === true);
  dit("pas la boisson, pas de stock", magasinConfirmePour(absent, 200) === false);
  dit("signale absent, pas de stock", magasinConfirmePour(negatif, 200) === false);

  /* ── 6. Les fleches de bord pointent vers ce qu'on verra en arrivant ── */
  {
    const mapEl = document.createElement("div"); mapEl.id = "explore-map"; document.body.appendChild(mapEl);
    const sauveMap = window.exploreMap, sauveListe = window._exploreRawList, sauveChips = window._exploreChips;
    const hors = { getSize: () => ({ x: 400, y: 800 }),
                   latLngToContainerPoint: () => ({ x: 900, y: 400 }),  /* toujours hors champ */
                   setView: () => {}, getZoom: () => 14 };
    try { eval("exploreMap = hors"); } catch (e) { window.exploreMap = hors; }
    try { eval("exploreFilter = {drinkId:200,name:'Mountain Dew Original'}"); } catch (e) {}
    window._routeLayer = null;
    window._exploreRawList = [{ id: "x1", name: "Piste", lat: 48.88, lng: 2.35, brand: "", drinks: [200], confirmations: {} }];

    window._exploreChips = { instock: true };
    renderInStockArrows();
    const avecPuce = document.querySelectorAll("#explore-edge-arrows [role=button]").length;
    const bandeau = document.getElementById("explore-pistes");
    dit("puce « En stock » : aucune fleche vers un magasin non confirme", avecPuce === 0);
    dit("la carte vide s'explique au lieu de rester muette", !!bandeau && /1/.test(bandeau.textContent));

    window._exploreChips = { instock: false };
    renderInStockArrows();
    const sansPuce = document.querySelectorAll("#explore-edge-arrows [role=button]").length;
    dit("puce eteinte : la piste redevient signalee", sansPuce === 1);
    dit("et le bandeau disparait", !document.getElementById("explore-pistes"));

    try { eval("exploreMap = sauveMap"); } catch (e) { window.exploreMap = sauveMap; }
    try { eval("exploreFilter = null"); } catch (e) {}
    window._exploreRawList = sauveListe; window._exploreChips = sauveChips;
    mapEl.remove();
    const w = document.getElementById("explore-edge-arrows"); if (w) w.remove();
  }

  /* ── 7. Chercher « Bonbon » doit trouver les boutiques qui s'appellent ainsi ── */
  {
    /* Une epreuve precedente a bascule l'app en anglais. Sans remettre la
       langue, on comparerait du francais attendu a de l'anglais affiche — et
       l'echec parlerait de traduction alors qu'on teste une recherche. */
    setLang("fr"); await pause(250);
    const liste = document.createElement("div"); liste.id = "brand-picker-list"; document.body.appendChild(liste);
    const sauve = window._exploreRawList;
    window._exploreRawList = [
      { id: "b1", name: "La Bonbonnière", lat: 48.87, lng: 2.31, brand: "", drinks: [] },
      { id: "b2", name: "Bonbons De Montmarte", lat: 48.88, lng: 2.34, brand: "", drinks: [] },
      { id: "b3", name: "Carrefour City", lat: 48.86, lng: 2.35, brand: "Carrefour", drinks: [] },
    ];
    renderBrandPickerList("bonbon");
    const t = liste.textContent;
    dit("« bonbon » trouve les boutiques qui portent ce nom", t.indexOf("Bonbonnière") !== -1 && t.indexOf("Bonbons De Montmarte") !== -1);
    dit("et ne dit plus qu'il n'y a rien", t.indexOf("Aucune enseigne") === -1);
    renderBrandPickerList("carref");
    dit("une vraie enseigne reste proposee", liste.textContent.indexOf("Carrefour") !== -1);
    renderBrandPickerList("zzzzqx");
    dit("et quand il n'y a vraiment rien, on le dit", /Aucune enseigne ni magasin/.test(liste.textContent));
    window._exploreRawList = sauve;
    liste.remove();
  }

  /* ── 8. Le champ de la carte cherche aussi les MAGASINS ────────────── */
  {
    const sauve = window._exploreRawList;
    window._exploreRawList = [
      { id: "s1", fbId: "s1", name: "La Bonbonnière", lat: 48.877, lng: 2.332, brand: "", drinks: [] },
      { id: "s2", fbId: "s2", name: "Panshi Sweets", lat: 48.8785, lng: 2.3577, brand: "", drinks: [] },
      { id: "s3", fbId: "s3", name: "Carrefour City", lat: 48.86, lng: 2.35, brand: "Carrefour", drinks: [] },
    ];
    const r1 = _rechercheLocaleMagasins("bonbon").map((x) => x.name);
    dit("« bonbon » trouve « La Bonbonnière » sans accent ni majuscule", r1.indexOf("La Bonbonnière") !== -1);
    const r2 = _rechercheLocaleMagasins("sweets").map((x) => x.name);
    dit("« sweets » trouve la boutique par son nom", r2.indexOf("Panshi Sweets") !== -1);
    const r3 = _rechercheLocaleMagasins("carrefour").map((x) => x.name);
    dit("une enseigne se trouve toujours", r3.indexOf("Carrefour City") !== -1);
    dit("une frappe d'une lettre ne declenche rien", _rechercheLocaleMagasins("b").length === 0);
    const ligne = _ligneMagasinTrouve(window._exploreRawList[0]);
    dit("la ligne proposee porte le nom du magasin", ligne.indexOf("La Bonbonnière") !== -1);
    dit("et elle mene a ce magasin precis", ligne.indexOf("exploreAllerAuMagasin") !== -1 && ligne.indexOf("s1") !== -1);
    /* On ne teste PAS ici la recherche dans la base entiere : le module
       Firebase ne s'initialise pas sans reseau, donc aucune fonction fb* n'existe
       dans cet essai. L'affirmer reviendrait a tester la connexion, pas le code.
       Cette requete-la a ete verifiee directement contre la base de production. */
    window._exploreRawList = sauve;
  }

  /* ── 9. La carte allegee : un magasin sans son rayon ne ment pas ───── */
  {
    /* Le chemin allege (fbZoneLegere) charge les magasins SANS le champ
       « drinks » — 65,7 Mo contre 2,8 Mo sur Paris. Un magasin ainsi charge
       porte la reponse « il a cette boisson » dans _aBoisson, pas dans
       drinks. Tout code qui interroge drinks en direct repond « il ne l'a
       pas » a un magasin a qui on n'a rien demande : c'est le bug qui faisait
       disparaitre les pins « en stock ». */
    dit("le point unique de verite existe", typeof magasinALaBoisson === "function");
    const leger = { id: "L1", fbId: "L1", name: "Epicerie du coin", lat: 48.85, lng: 2.35,
                    _pins: true, drinks: [], confirmations: {}, _aBoisson: { 200: true } };
    dit("un magasin allege sait qu'il a la boisson", magasinALaBoisson(leger, 200) === true);
    dit("et qu'il n'a pas les autres", magasinALaBoisson(leger, 11350) === false);
    dit("sans le drapeau, il ne l'a pas", magasinALaBoisson({ drinks: [] }, 200) === false);
    dit("le tableau drinks marche toujours", magasinALaBoisson({ drinks: [200] }, 200) === true);

    dit("rattache ne veut pas dire en stock", magasinConfirmePour(leger, 200) === false);
    leger.confirmations = { 200: 1 };
    dit("une confirmation, et c'est du stock", magasinConfirmePour(leger, 200) === true);
    const verifie = { id: "L2", fbId: "L2", name: "Night shop", lat: 48.85, lng: 2.35,
                      _pins: true, drinks: [], confirmations: {}, _aBoisson: { 200: true }, _rayonVerifie: { 200: true } };
    dit("un rayon verifie compte aussi", magasinConfirmePour(verifie, 200) === true);
    dit("mais pas pour une autre boisson", magasinConfirmePour(verifie, 11350) === false);

    /* La fiche ne doit jamais annoncer « 0 boisson » a un magasin dont on n'a
       pas demande le rayon. */
    const sauveS = window.STORES;
    window.STORES = [ { id: "L3", fbId: "L3", name: "Proxy Delhaize", lat: 48.85, lng: 2.35, _pins: true, drinks: [], confirmations: {} } ];
    try { openStoreSheet("L3"); } catch (e) {}
    const txt = (document.getElementById("map-sheet-content") || {}).innerText || "";
    dit("la fiche d'un magasin allege n'annonce pas 0 boisson", txt.indexOf("0 boisson") === -1);
    try { closeStoreSheet(); } catch (e) {}
    window.STORES = sauveS;
  }

  /* ── 9 bis. Les independants ont un rayon probable, jamais un stock ── */
  {
    const coca = DRINKS.find((d) => /coca-cola/i.test(d.brand || "") && !d.imp);
    const dew = DRINKS.find((d) => /mountain dew/i.test(d.brand || "") && /original/i.test(d.name || ""));
    dit("le catalogue a bien un Coca et un Mountain Dew Original", !!coca && !!dew);

    const nuit = { id: "N1", name: "Night-Shop Flagey", brand: "", type: "", drinks: [], confirmations: {} };
    const boul = { id: "N2", name: "Boulangerie Paul", brand: "", type: "boulangerie", drinks: [], confirmations: {} };
    const muet = { id: "N3", name: "Chez M.", brand: "", type: "", drinks: [], confirmations: {} };
    const usa  = { id: "N4", name: "Randy American Market", brand: "", type: "", drinks: [], confirmations: {} };

    dit("un night shop est une piste pour le Coca", magasinALaBoisson(nuit, coca.id));
    dit("une epicerie americaine est une piste pour le Mountain Dew", magasinALaBoisson(usa, dew.id));
    dit("une boulangerie ne promet rien", !magasinALaBoisson(boul, coca.id));
    dit("un magasin dont on ne sait rien ne promet rien", !magasinALaBoisson(muet, coca.id));

    /* LE POINT CRITIQUE. Un rayon probable ne doit JAMAIS devenir un stock :
       sinon la carte promet une boisson que personne n'a vue. */
    dit("mais une piste n'est PAS un stock", !magasinConfirmePour(nuit, coca.id));
    dit("ni pour l'epicerie americaine", !magasinConfirmePour(usa, dew.id));
    nuit.confirmations = {}; nuit.confirmations[coca.id] = 1;
    dit("il faut qu'un humain l'ait vue", magasinConfirmePour(nuit, coca.id));

    /* Le rayon probable ne doit pas etre recopie dans chaque magasin : c'est
       ce qui coutait 7,2 Mo de memoire sur la seule bande parisienne.
       Des objets NEUFS : ceux du dessus ont deja ete etiquetes par les
       appels precedents, et une deuxieme etiquette ne recopie plus rien —
       on ne verrait donc pas la recopie si elle revenait. */
    const neufs = [
      { id: "M1", name: "Night-Shop Flagey", brand: "", type: "", drinks: [], confirmations: {} },
      { id: "M2", name: "Randy American Market", brand: "", type: "", drinks: [], confirmations: {} },
      { id: "M3", name: "Carrefour Market", brand: "Carrefour", type: "", drinks: [], confirmations: {} },
    ];
    neufs.forEach((x) => window.rayonProbableCle(x));
    dit("etiqueter un magasin ne lui recopie aucune boisson",
        neufs.every((x) => x.drinks.length === 0));
    dit("mais l'etiquette est bien posee",
        neufs[0]._cleRayon === "t:nightshop" && neufs[1]._cleRayon === "t:americain" && neufs[2]._cleRayon.indexOf("e:Carrefour") === 0);
    dit("et rien n'est pose sur ce qu'on ne connait pas", muet._cleRayon === "" && boul._cleRayon === "");

    /* Ouvrir une fiche, la, il faut bien lister le rayon. */
    window.rayonAppliquer(usa);
    dit("ouvrir une fiche materialise le rayon de CE magasin", usa.drinks.length > 100);
    dit("et le Mountain Dew y figure", usa.drinks.indexOf(dew.id) !== -1);
    dit("cela ne cree toujours pas de stock", !magasinConfirmePour(usa, dew.id));
  }

  /* ── 9. Le chinois : atteignable, et il change vraiment l'ecran ─────── */
  dit("le chinois est propose", Object.keys(LANGS).indexOf("zh") !== -1);
  setLang("fr"); await pause(700);
  const fr1 = document.body.innerText.slice(0, 4000);
  setLang("zh"); await pause(900);
  out.han = (document.body.innerText.slice(0, 4000).match(/[一-鿿]/g) || []).length;
  dit("l'accueil passe en chinois", out.han > 150);
  setLang("fr"); await pause(900);
  dit("le retour au francais ne perd rien", fr1 === document.body.innerText.slice(0, 4000));
  return out;
});

console.log("carte rendue : " + JSON.stringify(r.carte));
console.log("titre en anglais : " + JSON.stringify(r.titreEn));
console.log("caracteres chinois a l'ecran : " + r.han + "\n");
let ko = 0;
const toutes = statiques.concat(r.etapes);
for (const [nom, ok] of toutes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom); }
console.log("\n" + (toutes.length - ko) + "/" + toutes.length + " conformes");
await nav.close(); srv.close();
process.exit(ko ? 1 : 0);
