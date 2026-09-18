/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   ESSAI : LE SIGNALEMENT, LES POINTS, LA PROPOSITION, LES AMIS
   ----------------------------------------------------------------------------
   POURQUOI. Ces quatre chemins se sont deja casses en silence, et le meme
   defaut est revenu sous trois formes : l'application ecrit quelque part que
   personne ne lit, ou annonce quelque chose que le serveur ne fera pas.

     - un signalement fait a plus de 500 m n'ecrivait pas `confirmations`. Or
       la carte ne charge meme plus `drinks` (MAGO_CHAMPS_LEGER) et les
       magasins importes d'OpenStreetMap n'affichent que ce qui est confirme
       (_stripAutoDrinks). Le signalement partait donc dans la base et
       n'apparaissait nulle part — ni pour les autres, ni pour son auteur.
     - l'app annoncait « +3 pts » alors que le serveur ne payait rien au-dela
       de 500 m, ou sans position connue. Des profils restaient a zero apres
       deux contributions, sans que rien ne l'explique.
     - une proposition nee d'une PHOTO prend pour identifiant le code-barre qui
       vient d'echouer au scan, mais ne portait pas de champ `barcode` : on
       rescannait la canette qu'on venait de proposer et l'app redemandait son
       nom.
     - une demande d'ami ne se voyait que sur un ecran qu'on n'a aucune raison
       d'ouvrir.

   COMMENT. Deux niveaux. Ce qui vit dans le script de module (il n'est pas
   execute ici : il importe le SDK depuis un CDN) est verifie SUR LA SOURCE.
   Le reste est joue dans un vrai navigateur, avec des doublures a la place des
   ecritures reseau : on regarde ce qui est ECRIT et ce qui est DIT.

   Lancer :  node outils/essai-signalement.mjs
   ============================================================================ */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.log("playwright n'est pas installe — essai saute (npm i -D playwright)"); process.exit(0); }

const NAVIGATEUR = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

const etapes = [];
const dit = (nom, ok, note) => etapes.push([!!ok, nom, note || ""]);

/* ── 1. CE QUI SE LIT SUR LA SOURCE ────────────────────────────────────────
   Le script de module ne s'execute pas sans reseau. Ces regles-la sont donc
   verifiees dans le fichier, comme le fait deja essai-navigateur.mjs. */
const src = await readFile(join(process.cwd(), "index.html"), "utf8");

{
  const bloc = (src.match(/window\.fbAddDrinkToStore = async function[\s\S]*?\n};/) || [""])[0];
  dit("fbAddDrinkToStore existe", bloc.length > 0);
  dit("la confirmation part dans tous les cas, sans condition de distance",
    /updates\["confirmations\." \+ drinkId\] = increment\(1\)/.test(bloc) && !/if \(vu\)/.test(bloc),
    "une garde sur la distance ici rend le signalement invisible");
  dit("l'heure de l'observation part avec elle",
    /updates\["seenAt\." \+ drinkId\]/.test(bloc) && /updates\["confirmedBy\." \+ drinkId\]/.test(bloc));
}
{
  const m = src.match(/var MAGO_CHAMPS_LEGER = ([^;]+);/);
  dit("la carte demande les confirmations", !!m && /"confirmations"/.test(m[1]),
    "sans elles, rien de ce qui est signale ne s'affiche");
}
dit("l'outil de reparation par magasin existe", /window\.fbReparerVisibilite = async function/.test(src));
dit("il est reserve a l'administrateur",
  /fbReparerVisibilite[\s\S]{0,400}admins[\s\S]{0,200}Reserve a l'administrateur/.test(src));
dit("il POSE la confirmation au lieu de l'incrementer",
  /patch\["confirmations\." \+ did\] = 1;/.test(src), "rejouer ne doit jamais gonfler un compteur");
dit("aucun toast ne promet trois points hors de portee du serveur",
  !/Not\\u00E9 comme probable[\s\S]{0,200}\+3 pts/.test(src));

/* Ce que le serveur fait, lu dans les fonctions a deployer. */
const pts = await readFile(join(process.cwd(), "functions-a-deployer/points-et-parrainage.js"), "utf8");
dit("un « je l'ai vue » invérifiable rapporte quelque chose",
  /const MONTANT_DE_MEMOIRE = 1;/.test(pts) && /crediter\(rep\.by, MONTANT_DE_MEMOIRE, rep\.type\)/.test(pts));
dit("une rupture declaree de loin ne rapporte toujours rien",
  /if \(rep\.type !== "stock"\)[\s\S]{0,200}raison: "trop loin"/.test(pts));
dit("le rattrapage des points est reserve a l'administrateur",
  /exports\.rattraperSignalements[\s\S]{0,600}Reserve a l'administrateur/.test(pts));
dit("le rattrapage ne peut pas payer deux fois",
  /if \(r\.raison !== "trop loin"\) return;/.test(pts) && /raison: "de memoire"/.test(pts));

const ia = await readFile(join(process.cwd(), "functions-a-deployer/reconnaissance-ia.js"), "utf8");
dit("une fiche creee par l'IA emporte le code-barre qui a echoue au scan",
  /const codeLie = \/\^\[0-9\]\{8,14\}\$\/\.test\(discId\)/.test(ia) && /barcodes: codeLie \? \[codeLie\] : \[\]/.test(ia),
  "sans lui, la boisson reste introuvable au scan, a vie");
dit("un code deja connu ne cree pas une deuxieme fiche",
  /array-contains", codeLie[\s\S]{0,300}deja: true/.test(ia));

const push = await readFile(join(process.cwd(), "functions-a-deployer/messages-push.js"), "utf8");
dit("une demande d'ami reveille le telephone", /exports\.notifierDemandeAmi = onDocumentWritten/.test(push));
dit("un refus de demande ne notifie personne", /} else \{\n      return;\n    \}/.test(push));

const deploi = await readFile(join(process.cwd(), "DEPLOIEMENT-SECURITE.md"), "utf8");
dit("le fichier des notifications figure dans la commande de deploiement",
  /"messages-push\.js"/.test(deploi), "sinon les notifications ne montent jamais");

/* ── 2. CE QUI SE JOUE DANS UN VRAI NAVIGATEUR ────────────────────────────*/
const srv = createServer(async (q, r) => {
  try {
    const u = decodeURIComponent(q.url.split("?")[0]);
    const f = join(process.cwd(), u === "/" ? "/index.html" : u);
    const b = await readFile(f);
    r.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    r.end(b);
  } catch { r.writeHead(404); r.end("non"); }
});
await new Promise((ok) => srv.listen(8101, ok));

let nav;
try { nav = await chromium.launch({ executablePath: NAVIGATEUR }); }
catch (e) {
  console.log("aucun navigateur utilisable (" + String(e.message).slice(0, 90) + ") — partie navigateur sautee");
  srv.close();
  let ko0 = 0;
  for (const [ok, nom, note] of etapes) { if (!ok) ko0++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (!ok && note ? " — " + note : "")); }
  console.log("\n" + (etapes.length - ko0) + "/" + etapes.length + " conformes");
  process.exit(ko0 ? 1 : 0);
}

const page = await nav.newPage();
const plantages = [];
page.on("pageerror", (e) => plantages.push(String(e).slice(0, 160)));
await page.route("**://*.openfoodfacts.org/**", (r) => r.abort());
await page.goto("http://localhost:8101/index.html", { waitUntil: "load" });
await page.waitForTimeout(2500);

const vu = await page.evaluate(() => {
  const out = {};

  /* Un signalement, quelle que soit la distance : ce qui est ECRIT et ce qui est DIT. */
  const essai = (dist) => {
    let envoye = null; const paroles = [];
    window.fbAddDrinkToStore = (id, did) => { envoye = { id, did }; return Promise.resolve(); };
    window.toast = (m) => paroles.push(String(m));
    try { localStorage.removeItem("magoAwards"); } catch (e) {}
    const st = { id: "s" + dist, fbId: "s" + dist, name: "Magasin", lat: 50.8, lng: 4.3, dist,
                 drinks: [], confirmations: {} };
    window.STORES = [st];
    try { _ecrireRattachement(st, { drinkId: 1, from: "fiche" }); } catch (e) {}
    return { envoye: !!envoye, conf: st.confirmations[1] || 0, rayon: (st.drinks || []).length,
             dit: paroles.join(" | ") };
  };
  out.dansLeMagasin = essai(120);
  out.deLoin = essai(9000);
  out.sansPosition = essai(null);
  out.aLautreBout = essai(9000000);
  out.portee = {
    dedans: _regimeSignalement({ dist: 10 }).ok,
    memeVille: _regimeSignalement({ dist: 9000 }).ok,
    autreBout: _regimeSignalement({ dist: 9000000 }).ok,
    inconnue: _regimeSignalement({}).ok
  };
  out.points = {
    dedans: _surPlaceSignalement({ dist: 120 }),
    loin: _surPlaceSignalement({ dist: 9000 }),
    sansGPS: _surPlaceSignalement({})
  };

  /* Rescanner une proposition nee d'une photo : son identifiant EST le code. */
  const CODE = "5901234123457";                       // EAN-13 valide
  const rejoue = (decouverte) => {
    DISCOVERIES.length = 0;
    if (decouverte) DISCOVERIES.push(decouverte);
    const paroles = [];
    window.toast = (m) => paroles.push(String(m));
    window._scanVotes = { code: null, count: 0 };
    try { for (let i = 0; i < 3; i++) onBarcodeDetected({ codeResult: { code: CODE } }); } catch (e) {}
    return paroles.join(" | ");
  };
  out.propositionPhoto = rejoue({ id: CODE, name: "Dragon Punch", votes: 1 });
  out.propositionAncienne = rejoue({ id: "x1", barcode: CODE, name: "Ancienne", votes: 1 });
  out.propositionRejetee = rejoue({ id: CODE, name: "Rejetee", votes: 1, rejected: true });

  /* Une demande d'ami doit sonner. */
  const MOI = "moi", ELLE = "elle";
  window._fbUser = { uid: MOI };
  MSG.uid = MOI;
  MSG.users[ELLE] = { pseudo: "Cobra Supreme" };
  const envoyer = (rows) => {
    window.fbAmis = { liens: rows, parUid: {} };
    window.dispatchEvent(new CustomEvent("fbAmisChanged", { detail: rows }));
  };
  const lien = (state, by) => [{ pid: "p1", members: [ELLE, MOI], state, requestBy: by, at: 1 }];
  envoyer([]);
  out.amiAvant = _activity.filter((a) => a.type === "ami").length;
  envoyer(lien("request", ELLE));
  const dem = _activity.find((a) => a.type === "ami");
  out.amiDemande = dem ? dem.title + " >" + (dem.action && dem.action.kind) : null;
  envoyer(lien("request", ELLE));
  out.amiPasDeDoublon = _activity.filter((a) => a.type === "ami").length === 1;
  envoyer([]); envoyer(lien("request", MOI)); envoyer(lien("ok", MOI));
  const acc = _activity.find((a) => a.type === "amiOk");
  out.amiAccepte = acc ? acc.title + " >" + (acc.action && acc.action.kind) : null;
  out.amiPastille = typeof majPastilleAmis === "function";

  /* Un magasin importe n'expose que ce qui est confirme. */
  const osm = { id: "o1", name: "Proxy Delhaize", drinks: [1, 2], confirmations: { 1: 1 } };
  _stripAutoDrinks(osm);
  out.gardeImport = { garde: osm.drinks.indexOf(1) !== -1, jette: osm.drinks.indexOf(2) === -1 };
  const perso = { id: "abc", name: "Night shop", drinks: [2], confirmations: {} };
  _stripAutoDrinks(perso);
  out.gardeCommunautaire = perso.drinks.length === 1;
  return out;
});

await nav.close();
srv.close();

const publie = (e) => e.envoye && e.conf === 1 && e.rayon === 1;
dit("dans le magasin : publie, et trois points annonces", publie(vu.dansLeMagasin) && /\+3 pts/.test(vu.dansLeMagasin.dit));
dit("a neuf kilometres : publie quand meme", publie(vu.deLoin), vu.deLoin.dit);
dit("sans position : publie quand meme", publie(vu.sansPosition), vu.sansPosition.dit);
dit("a neuf kilometres, on ne promet pas les trois points", !/\+3 pts/.test(vu.deLoin.dit));
dit("et on dit que ca sert a tout le monde", /visible par tout le monde/.test(vu.deLoin.dit), vu.deLoin.dit);
dit("a neuf mille kilometres : refuse", !vu.aLautreBout.envoye && vu.aLautreBout.rayon === 0 && /Trop loin/.test(vu.aLautreBout.dit));
dit("la portee ne refuse que l'absurde",
  vu.portee.dedans && vu.portee.memeVille && vu.portee.inconnue && !vu.portee.autreBout);
dit("la distance ne decide que des points", vu.points.dedans && !vu.points.loin && !vu.points.sansGPS);

dit("rescanner une proposition nee d'une photo la retrouve", /Dragon Punch/.test(vu.propositionPhoto), vu.propositionPhoto);
dit("l'ancienne forme (champ barcode) marche toujours", /Ancienne/.test(vu.propositionAncienne));
dit("une proposition rejetee ne revient pas", !/Rejetee/.test(vu.propositionRejetee));

dit("le premier chargement des amis ne sonne pas", vu.amiAvant === 0);
dit("une demande d'ami sonne et mene a l'ecran des amis",
  /Cobra Supreme veut devenir ton ami >amis/.test(vu.amiDemande || ""), vu.amiDemande);
dit("le meme etat ne sonne pas deux fois", vu.amiPasDeDoublon);
dit("une acceptation sonne et ouvre le fil",
  /Cobra Supreme a accepté ta demande >conv/.test(vu.amiAccepte || ""), vu.amiAccepte);
dit("la pastille des demandes existe toujours", vu.amiPastille);

dit("un magasin importe ne montre que ce qui est confirme", vu.gardeImport.garde && vu.gardeImport.jette);
dit("un magasin cree par la communaute n'est jamais rogne", vu.gardeCommunautaire);
dit("aucun plantage pendant l'essai", plantages.length === 0, plantages.join(" ; "));

let ko = 0;
console.log("");
for (const [ok, nom, note] of etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (!ok && note ? " — " + note : "")); }
console.log("\n" + (etapes.length - ko) + "/" + etapes.length + " conformes");
process.exit(ko ? 1 : 0);
