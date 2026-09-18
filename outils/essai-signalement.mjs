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
{
  const enq = (src.match(/window\.fbEnqueteBoisson = async function[\s\S]*?\n};/) || [""])[0];
  dit("l'outil d'enquete existe", enq.length > 0);
  dit("il est reserve a l'administrateur",
    /admins[\s\S]{0,200}Reserve a l'administrateur/.test(enq));
  dit("il n'ecrit QUE la ou un rapport le prouve",
    /if \(!appliquer \|\| !perdus\.length\) return res;/.test(enq) &&
    /for \(const p of perdus\)/.test(enq),
    "poser une confirmation sans preuve ferait mentir l'app");
  dit("un signalement prouve vient d'un « stock », pas d'une rupture",
    /if \(r\.type !== "stock" \|\| !r\.storeId\) return;/.test(enq));
  dit("la confirmation est POSEE, jamais incrementee",
    /patch\["confirmations\." \+ did\] = 1;/.test(enq), "rejouer ne doit pas gonfler un compteur");
  dit("il distingue un magasin jamais visite d'un magasin confirme",
    /confirmationsEnTout/.test(enq) && /jamaisVisites/.test(enq),
    "un rayon de 486 boissons a zero confirmation vient d'un remplissage, pas de quelqu'un");
  dit("il ne pose plus de confirmation a l'aveugle",
    !/window\.fbReparerVisibilite/.test(src), "l'ancienne version ecrivait sur tout magasin sans confirmation");
}
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

dit("le rattrapage ne paie qu'une fois par personne, magasin, boisson et jour",
  /const vus = new Set\(\);/.test(pts) && /if \(vus\.has\(t\.cle\)\) \{ rejeux\.push\(t\); continue; \}/.test(pts),
  "l'ancienne regle refusait la distance AVANT l'anti-rejeu : tous les doublons portent « trop loin »");
dit("le plafond quotidien reporte la dette au lieu de l'effacer",
  /res\.reportes\+\+;/.test(pts) && !/credited: verse, raison: "de memoire" \}, \{ merge: true \}\);\n      res\.rendus \+= verse;\n    \}\n  \}/.test(pts.replace(/\r/g,"")),
  "marquer « de memoire » avec 0 verse rendait la dette invisible pour toujours");
dit("le rattrapage lit du plus ancien au plus recent, et pagine",
  /orderBy\("createdAt", "asc"\)/.test(pts) && /startAfter\(curseur\)/.test(pts));
dit("cibler une personne n'annule pas la fenetre en jours",
  /where\("by", "==", quiSeul\)[\s\S]{0,120}where\("createdAt", ">=", depuis\)/.test(pts));

const ia = await readFile(join(process.cwd(), "functions-a-deployer/reconnaissance-ia.js"), "utf8");
dit("une fiche creee par l'IA emporte le code-barre qui a echoue au scan",
  /const codeLie = \/\^\[0-9\]\{8,14\}\$\/\.test\(discId\)/.test(ia) && /barcodes: codeLie \? \[codeLie\] : \[\]/.test(ia),
  "sans lui, la boisson reste introuvable au scan, a vie");
dit("un code deja connu ne cree pas une deuxieme fiche",
  /array-contains", codeLie[\s\S]{0,900}deja: true/.test(ia));

/* ── « + Proposé » : ce que l'app promet, et ce qu'elle grave pour tous ──── */
{
  const sp = (src.match(/function submitProposal\(\)\{[\s\S]*?\n\}/) || [""])[0];
  dit("submitProposal existe", sp.length > 0);
  dit("le code-barre orphelin se demande avant d'etre adopte",
    /Relier le code-barre/.test(sp) && /_lastUnknownCode=null/.test(sp),
    "ce code part dans le catalogue de tout le monde : il ne peut pas etre adopte en silence");
  dit("une proposition qui n'a pas pu s'ecrire le dit",
    /Proposition non enregistr/.test(sp) && /_discOk=false/.test(sp),
    "le catch annoncait « part au vote » precisement quand rien n'etait parti");
  dit("un echec de photo ne fait pas echouer la validation IA",
    !/Promise\.all\(\[pDisc,pPhoto/.test(sp) && /Promise\.resolve\(pDisc\)/.test(sp));
  dit("le refus de photo parle francais, pas Firestore",
    /Une photo existe d/.test(sp) && !/v\\u00E9rifie la r\\u00E8gle discoveryPhotos/.test(sp));
  /* On regarde ce que l'app DIT, pas ce que les commentaires racontent. */
  const parle = (sp.match(/toast\([^;]*\)/g) || []).join(" | ");
  dit("aucun montant n'est promis pour une proposition",
    !/\+\s*\d+\s*pts?/.test(parle), "le serveur en verse 20, ou 0 si le plafond du jour est atteint : " + parle.slice(0, 120));
  dit("relier un code apres promotion passe par la chasse, pas par le lien local",
    /_lienCodeChasse=true/.test(sp),
    "un lien local ne sert qu'a son auteur : la fiche reste introuvable au scan pour les autres");
}
dit("le scanner distingue les deux portees d'un lien de code",
  /var _chasse=window\._lienCodeChasse/.test(src) && /fbProposerCodeChasse\(cible\.id,cible\.name,rawCode\)/.test(src));

const idx = await readFile(join(process.cwd(), "functions-a-deployer/index.js"), "utf8");
dit("la chasse aux codes-barres est branchee cote serveur",
  /require\("\.\/chasse-codes"\)/.test(idx),
  "sans cela les documents chasseCodes s'accumulent et le code n'entre jamais au catalogue");

const push = await readFile(join(process.cwd(), "functions-a-deployer/messages-push.js"), "utf8");
dit("une demande d'ami reveille le telephone", /exports\.notifierDemandeAmi = onDocumentWritten/.test(push));
dit("chaque notification d'ami a son identite propre",
  /tag: String\(\(data && \(data\.cid \|\| data\.pid\)\) \|\| "magofeed"\)/.test(push),
  "un tag commun fait que la deuxieme demande efface la premiere sur le telephone");
dit("un refus de demande ne notifie personne", /} else \{\n      return;\n    \}/.test(push));

dit("le jeton d'analyse IA se consomme sur tous les chemins",
  (ia.match(/vRef\.delete\(\)/g) || []).length >= 2,
  "un raccourci qui sort avant laisse le jeton rejouable : une analyse peut financer plusieurs promotions");

dit("un don de points existe, trace et reserve a l'admin",
  /exports\.offrirPoints = onCall/.test(pts) &&
  /Reserve a l'administrateur/.test(pts.slice(pts.indexOf("exports.offrirPoints"))) &&
  /collection\("pointsDons"\)\.add/.test(pts),
  "le serveur ne credite que sur preuve ; quand l'app a perdu la preuve, le don doit rester visible");
dit("les points offerts entrent dans le score officiel",
  /\+ \(d\.pointsOfferts \|\| 0\) - penalite/.test(pts));
dit("un don est plafonne", /const DON_MAX = 500;/.test(pts));

const regles = await readFile(join(process.cwd(), "functions-a-deployer/firestore.rules"), "utf8");
const banc = await readFile(join(process.cwd(), "functions-a-deployer/tests-regles/regles.test.mjs"), "utf8");
dit("le banc d'essai couvre les points offerts et leur journal",
  /pointsOfferts:1000/.test(banc) && /pointsDons/.test(banc),
  "une regle sans epreuve est une regle qui se perd");
dit("les points offerts sont infalsifiables depuis le client",
  /'pointsOfferts',/.test(regles),
  "sinon il suffit d'ouvrir la console pour s'en offrir");
dit("le journal des dons est lisible par l'admin seul, ecrit par personne",
  /match \/pointsDons\/\{did\} \{[\s\S]{0,120}allow read: if isAdmin\(\);[\s\S]{0,60}allow write: if false;/.test(regles));

const farm = await readFile(join(process.cwd(), "functions-a-deployer/anti-farm.js"), "utf8");
dit("la sanction ne coute pas dix fois ce que le geste rapporte",
  /const POINTS_RETIRES = 3;/.test(farm),
  "signaler de memoire rapporte 1 : exposer a -10 rendait le geste le plus cher de l'app");

dit("l'acceptation apres un refus previent aussi le demandeur",
  /etat === "ok" && etatAvant !== "ok"/.test(push),
  "les regles autorisent declined -> ok, et l'app emprunte ce chemin");
dit("le rattrapage compte ce qu'il a vraiment lu",
  /lus \+= lot\.size;/.test(pts) && /examines: lus,/.test(pts));

const deploi = await readFile(join(process.cwd(), "DEPLOIEMENT-SECURITE.md"), "utf8");
dit("la chasse aux codes-barres figure dans la commande de deploiement",
  /"chasse-codes\.js"/.test(deploi));
dit("le mode d'emploi n'exige plus un total de banc d'essai fige",
  !/n'affiche pas `148\/148`, \*\*ne d\u00E9ploie pas\*\*/.test(deploi) &&
  /266\/266 conformes/.test(deploi) && /moindre `ECHEC`/.test(deploi),
  "il interdisait de deployer alors que le banc affichait 260/260, tout vert");
dit("une fonction non deployee le dit au lieu d'afficher « internal »",
  /functions\/internal.{0,40}functions\/not-found/s.test(src) && /pas encore d.{0,12}ploy/.test(src),
  "« Echec : functions/internal » ne veut rien dire pour qui le lit");
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

  /* La distance est la MEME pour la portee, les points et la note du rapport. */
  window.userLat = 50.8466; window.userLng = 4.3528;          // Grand-Place
  const sansDist = { id: "p1", fbId: "p1", name: "Carrefour", lat: 50.8470, lng: 4.3530 };   // ~50 m
  const loinSansDist = { id: "p2", fbId: "p2", name: "Seoul", lat: 37.5665, lng: 126.9780 };
  out.distanceUnifiee = {
    proche: _distanceSignalement(sansDist),
    surPlaceSansDist: _surPlaceSignalement(sansDist),
    porteeLoinSansDist: _regimeSignalement(loinSansDist).ok,
    note: _provenance("essai", sansDist),
    sansRien: _distanceSignalement({ id: "p3", name: "?" })
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

  /* UNE FICHE FUSIONNEE VERS LE VIDE DISPARAIT SANS ETRE REMPLACEE.
     « Hawaï Ananas » pointait vers un identifiant qui n'a jamais existe : la
     fiche etait retiree du catalogue au chargement, et scanner son code-barre
     ne trouvait plus rien. */
  out.fusions = (function(){
    const t = window.DRINK_MERGES || {};
    const ids = new Set((DRINKS || []).map((d) => Number(d.id)));
    const orphelines = Object.keys(t).filter(function(k){
      const c = Number(t[k]);
      return !ids.has(c) && String(c).length !== 13;
    });
    const hawai = (DRINKS || []).find((d) => Number(d.id) === 11434);
    return {
      ciblesAbsentes: orphelines,
      hawaiPresente: !!hawai,
      hawaiScannable: !!(hawai && drinkForBarcode("5449000036919")),
      marquesHawai: [...new Set((DRINKS || []).filter((d) => /hawa/i.test(d.brand || "")).map((d) => d.brand))]
    };
  })();
  /* Les sept doublons a zero de tete ne doivent plus exister au catalogue. */
  out.doublonsCode = (function(){
    const vus = new Map(); const dup = [];
    (DRINKS || []).forEach(function(d){
      (d.barcodes || []).forEach(function(b){
        const c = String(b).replace(/\D/g, "").replace(/^0+/, "");
        if (vus.has(c) && vus.get(c) !== d.id) dup.push({ code: c, a: vus.get(c), b: d.id });
        else vus.set(c, d.id);
      });
    });
    return dup;
  })();

  /* LE SCENARIO EXACT QUI A COUTE DEUX SIGNALEMENTS.
     Un magasin porte la boisson dans son rayon PROBABLE (remplissage
     d'enseigne), sans aucune confirmation. Quelqu'un est devant l'etagere et
     la signale depuis « Ajouter une boisson ». Avant correction, la pastille
     « deja la » bloquait le tap et rien n'etait ecrit nulle part. */
  {
    let envoye = null;
    window.fbAddDrinkToStore = (id, did) => { envoye = { id, did }; return Promise.resolve(); };
    let rapport = null;
    window.fbAddReport = (sid, did, type, o) => { rapport = { sid, did, type, note: o && o.note }; return Promise.resolve(); };
    window.toast = () => {};
    try { localStorage.removeItem("magoAwards"); } catch (e) {}
    window.userLat = 50.8466; window.userLng = 4.3528;
    const mag = { id: "o99", fbId: "o99", name: "Proxy Delhaize", lat: 50.8470, lng: 4.3530,
                  drinks: [13200], confirmations: {} };      // rayon suppose, zero confirmation
    window.STORES = [mag];
    window.curStoreDetail = mag;
    const boisson = (DRINKS || []).find((d) => Number(d.id) === 13200);
    out.scenarioAmie = { boissonAuCatalogue: !!boisson };
    if (boisson) {
      /* On passe par L'ECRAN, pas par la fonction : c'est la pastille
         « deja la » de cette liste qui bloquait le tap, et l'appeler
         directement ne prouverait rien. */
      const hote = document.createElement("div");
      hote.id = "add-drink-list";
      document.body.appendChild(hote);
      _renderAddDrinkList(boisson.name);
      const ligne = hote.querySelector('.add-drink-row[data-id="13200"]');
      out.scenarioAmie.ligneAffichee = !!ligne;
      out.scenarioAmie.marqueeDejaLa = !!(ligne && /déjà là/.test(ligne.textContent || ""));
      if (ligne) ligne.onclick();                       // le tap de la personne
      out.scenarioAmie.ecritDansLeMagasin = !!envoye;
      out.scenarioAmie.confirmationPosee = Number(mag.confirmations[13200]) || 0;
      out.scenarioAmie.rapportEcrit = rapport && rapport.type === "stock";
      out.scenarioAmie.noteDuRapport = rapport && rapport.note;
      hote.remove();
    }
  }

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
  /* Le pseudo arrive en differe : la cloche doit finir par le porter. */
  out.nomDiffere = /window\.fbLoadUser\(uid\)\.then/.test(amisDetecterNouveaux.toString()) &&
                   /veut devenir ton ami/.test(amisDetecterNouveaux.toString());
  /* Un changement de compte repart d'une page blanche. */
  out.parCompte = /_amisEtatVuUid !== me/.test(amisDetecterNouveaux.toString());
  envoyer(lien("request", ELLE));
  const dem = _activity.find((a) => a.type === "ami");
  out.amiDemande = dem ? dem.title + " >" + (dem.action && dem.action.kind) : null;
  envoyer(lien("request", ELLE));
  out.amiPasDeDoublon = _activity.filter((a) => a.type === "ami").length === 1;
  envoyer([]); envoyer(lien("request", MOI)); envoyer(lien("ok", MOI));
  const acc = _activity.find((a) => a.type === "amiOk");
  out.amiAccepte = acc ? acc.title + " >" + (acc.action && acc.action.kind) : null;
  out.amiPastille = typeof majPastilleAmis === "function";

  /* Le rayon probable de l'enseigne doit survivre a un aller-retour :
     rayonAppliquer ne le recopie qu'une fois par objet magasin, et la garde
     anti-inventaire le retire au rendu de la liste. Si le drapeau reste leve,
     il ne revient jamais — la reponse a « quel Delhaize, justement » dispa-
     raissait au premier retour en arriere. */
  {
    const ens = { id: "o42", name: "Proxy Delhaize", brand: "Delhaize", lat: 50.85, lng: 4.35,
                  drinks: [7], confirmations: { 7: 1 } };
    const probables = (window.rayonProbableIds ? window.rayonProbableIds(ens) : []) || [];
    window.rayonAppliquer(ens);
    const ouverture = ens.drinks.length;
    _stripAutoDrinks(ens);                       // le rendu de la liste passe par la
    const retourListe = ens.drinks.length;
    window.rayonAppliquer(ens);                  // on rouvre la fiche
    out.rayonAllerRetour = { probables: probables.length, ouverture, retourListe,
                             reouverture: ens.drinks.length };
  }

  /* « Deja la » doit vouloir dire « quelqu'un l'a vue », pas « probablement ».
     rayonAppliquer recopie le rayon PROBABLE de l'enseigne dans s.drinks : un
     test de presence qui lit s.drinks refuse le signalement de quelqu'un qui
     est devant l'etagere. */
  const mag = { id: "o7", name: "Delhaize", drinks: [11, 22, 33], confirmations: { 11: 2 }, drinksVerified: [22] };
  out.vraimentEnRayon = {
    confirmee: _vraimentEnRayon(mag, 11),
    verifiee: _vraimentEnRayon(mag, 22),
    seulementProbable: _vraimentEnRayon(mag, 33),
    absente: _vraimentEnRayon(mag, 44)
  };

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

dit("un magasin sans distance prealable est quand meme mesure",
  vu.distanceUnifiee.proche !== null && vu.distanceUnifiee.proche < 500,
  "mesure : " + vu.distanceUnifiee.proche);
dit("on est donc reconnu sur place, comme le serveur le verra", vu.distanceUnifiee.surPlaceSansDist === true,
  "sinon l'app dit « tu n'es pas la » a quelqu'un que le serveur paie plein tarif");
dit("et Seoul depuis Bruxelles est refuse meme sans distance prealable",
  vu.distanceUnifiee.porteeLoinSansDist === false,
  "la garde des cent kilometres etait aveugle sur ces magasins-la");
dit("la note du rapport porte la meme mesure", /^essai\|\d+$/.test(vu.distanceUnifiee.note || ""), vu.distanceUnifiee.note);
dit("une distance vraiment inconnue reste inconnue", vu.distanceUnifiee.sansRien === null);
dit("le bareme annonce est celui du serveur",
  /var pts=\{stock:3,rupture:3,contrefacon:3,nouveau:2\};/.test(src),
  "il annoncait 10/5/15/20 pour 3/3/3/2 reels");
dit("ajouter une boisson depuis la fiche laisse la preuve attendue par le serveur",
  /fbAddReport\(s\.fbId\|\|String\(s\.id\),did,"stock",\{note:_provenance\("magasin",s\)\}\)/.test(src));
dit("la rafale laisse la sienne", /_provenance\("rafale",s\)/.test(src));
dit("la rafale ne brule plus le verrou du rattachement normal",
  /awardOnce\("rafale:"\+did\+":"\+String\(s\.id\),FOREVER\)/.test(src),
  "meme cle = un rattachement normal ne pouvait plus jamais ecrire de rapport");

dit("rescanner une proposition nee d'une photo la retrouve", /Dragon Punch/.test(vu.propositionPhoto), vu.propositionPhoto);
dit("l'ancienne forme (champ barcode) marche toujours", /Ancienne/.test(vu.propositionAncienne));
dit("une proposition rejetee ne revient pas", !/Rejetee/.test(vu.propositionRejetee));

dit("aucune fusion ne mene vers une fiche inexistante",
  vu.fusions.ciblesAbsentes.length === 0,
  "cibles absentes : " + vu.fusions.ciblesAbsentes.join(", "));
dit("« Hawaï Ananas » est revenue au catalogue et se scanne",
  vu.fusions.hawaiPresente && vu.fusions.hawaiScannable,
  "elle disparaissait au chargement, son code-barre ne trouvait rien");
dit("elle ne fabrique pas une deuxieme marque dans le rail",
  vu.fusions.marquesHawai.length === 1, JSON.stringify(vu.fusions.marquesHawai));
{
  /* Les six collisions historiques sont declarees dans le controle du
     catalogue, en attente d'une fusion depuis l'administration. Ce qu'on
     verrouille ici, c'est qu'il n'en apparaisse pas de NOUVELLE. */
  const ctl = await readFile(join(process.cwd(), "outils/controle-catalogue.mjs"), "utf8");
  const bloc = (ctl.match(/COLLISIONS_CONNUES = new Set\(\[([\s\S]*?)\]\)/) || ["", ""])[1];
  const connues = new Set([...bloc.matchAll(/"(\d+)"/g)].map((m) => m[1].replace(/^0+/, "")));
  const neuves = vu.doublonsCode.filter((x) => !connues.has(x.code));
  dit("aucun code-barre NOUVEAU ne designe deux fiches, fusions appliquees",
    neuves.length === 0,
    neuves.slice(0, 4).map((x) => x.code + " : " + x.a + " et " + x.b).join(" | "));
  dit("les collisions tolerees sont toutes declarees",
    vu.doublonsCode.length === connues.size,
    vu.doublonsCode.length + " trouvees, " + connues.size + " declarees");
}
dit("la boisson de l'histoire est bien au catalogue", vu.scenarioAmie.boissonAuCatalogue);
dit("l'ecran la propose au lieu de la dire « deja la »",
  vu.scenarioAmie.ligneAffichee === true && vu.scenarioAmie.marqueeDejaLa === false,
  "la pastille verte bloque le tap : row.onclick sort sur have[id]");
dit("signaler sur place une boisson au rayon seulement PROBABLE ecrit le magasin",
  vu.scenarioAmie.ecritDansLeMagasin === true && vu.scenarioAmie.confirmationPosee === 1,
  "c'est le geste qui ne laissait aucune trace");
dit("et laisse le rapport que le serveur attend pour payer",
  vu.scenarioAmie.rapportEcrit === true && /^magasin\|\d+$/.test(vu.scenarioAmie.noteDuRapport || ""),
  "note : " + vu.scenarioAmie.noteDuRapport);

dit("le premier chargement des amis ne sonne pas", vu.amiAvant === 0);
dit("le pseudo d'un inconnu est rattrape quand il arrive", vu.nomDiffere,
  "sinon la cloche reste sur « Un joueur veut devenir ton ami », pour toujours");
dit("changer de compte ne fait pas sonner les vieilles demandes", vu.parCompte);
dit("une demande d'ami sonne et mene a l'ecran des amis",
  /Cobra Supreme veut devenir ton ami >amis/.test(vu.amiDemande || ""), vu.amiDemande);
dit("le meme etat ne sonne pas deux fois", vu.amiPasDeDoublon);
dit("une acceptation sonne et ouvre le fil",
  /Cobra Supreme a accepté ta demande >conv/.test(vu.amiAccepte || ""), vu.amiAccepte);
dit("la pastille des demandes existe toujours", vu.amiPastille);

dit("le rayon probable d'une enseigne s'affiche a l'ouverture de la fiche",
  vu.rayonAllerRetour.probables > 10 && vu.rayonAllerRetour.ouverture > vu.rayonAllerRetour.probables - 1,
  JSON.stringify(vu.rayonAllerRetour));
dit("il revient apres un retour a la liste",
  vu.rayonAllerRetour.retourListe === 1 && vu.rayonAllerRetour.reouverture === vu.rayonAllerRetour.ouverture,
  "sans cela, un magasin n'affiche son assortiment qu'une seule fois, jamais plus");

dit("« deja la » = confirmee par quelqu'un, ou verifiee au catalogue de l'enseigne",
  vu.vraimentEnRayon.confirmee === true && vu.vraimentEnRayon.verifiee === true);
dit("une boisson seulement PROBABLE ne bloque plus le signalement",
  vu.vraimentEnRayon.seulementProbable === false && vu.vraimentEnRayon.absente === false,
  "sinon la personne devant l'etagere s'entend dire « deja dans ton rayon » et rien n'est ecrit");
dit("aucun garde de presence ne lit s.drinks",
  !/\(s\.drinks\|\|\[\]\)\.some\(function\(x\)\{return Number\(x\)===Number\(did\);\}\)\)\{\n    rafaleFlash/.test(src));

dit("un magasin importe ne montre que ce qui est confirme", vu.gardeImport.garde && vu.gardeImport.jette);
dit("un magasin cree par la communaute n'est jamais rogne", vu.gardeCommunautaire);
dit("aucun plantage pendant l'essai", plantages.length === 0, plantages.join(" ; "));

let ko = 0;
console.log("");
for (const [ok, nom, note] of etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (!ok && note ? " — " + note : "")); }
console.log("\n" + (etapes.length - ko) + "/" + etapes.length + " conformes");
process.exit(ko ? 1 : 0);
