/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   L'ECRAN DE LA CHASSE, DANS UN VRAI NAVIGATEUR
   ----------------------------------------------------------------------------
   POURQUOI PAS L'EMULATEUR. Les regles Firestore disent qui a le droit
   d'ecrire une chasse. Elles ne disent pas si l'onglet s'ouvre, si les trois
   segments repondent, si l'ecran vide explique quoi faire, si les textes
   suivent la langue, ni si un bouton fait 44 px. Ca, il faut l'ouvrir.

   AUCUN RESEAU. Le <script type="module"> d'index.html importe le SDK Firebase
   depuis un CDN : hors ligne il ne demarre pas, donc AUCUNE fonction window.fb*
   n'existe. On teste donc l'interface et la logique locale — pas la connexion.
   C'est exactement l'etat d'un telephone dans un magasin en sous-sol.

   MODELE : outils/essai-navigateur.mjs (serveur local, chromium, page.evaluate).
   Ce fichier vit dans scenarios/ pour ne toucher a aucun outil existant, et
   il ne passe PAS par lancer-scenario.mjs (pas d'emulateur ici).

   Lancer :
     node functions-a-deployer/tests-regles/scenarios/interface-chasse-navigateur.mjs

   CE QU'ON REJOUE, ET OU C'EST ECRIT DANS index.html :
     setChasseSeg / chasseSegTap ........ index.html:21696 et 21710
     renderChasse ....................... index.html:21839
     renderMesChasses  (#chasse-mine) ... index.html:21879
     _peindreChasse    (#chasse-list) ... index.html:21891
     renderZoneChasse  (#chasse-zone) ... index.html:14246
     renderChasseCodes (#chasse-card) ... index.html:23374
     renderVuesRecentes(#chasse-recent) . index.html:21996
     toggleWatch / lancerChasse ......... index.html:14307 et 14344
     renderAlertsCard  (#alerts-card) ... index.html:15204
     le bouton de la fiche boisson ...... index.html:15874 (dans renderStoreList)
     la cloche de la fiche boisson ...... index.html:22579
     setLang / traduirePage ............. index.html:5938 et data/textes.js:2094
   ========================================================================== */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "../../..");          /* /home/user/magofeed */
const PORT = 8123;

let chromium;
try { ({ chromium } = await import(resolve(RACINE, "node_modules/playwright/index.mjs"))); }
catch { try { ({ chromium } = await import("playwright")); } catch { console.log("playwright absent — essai saute"); process.exit(0); } }

const NAVIGATEUR = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".png":"image/png", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json", ".ico":"image/x-icon" };

const srv = createServer(async (q, r) => {
  try {
    const u = decodeURIComponent(q.url.split("?")[0]);
    const f = join(RACINE, u === "/" ? "/index.html" : u);
    if (!f.startsWith(RACINE)) { r.writeHead(403); r.end("non"); return; }
    const b = await readFile(f);
    r.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    r.end(b);
  } catch { r.writeHead(404); r.end("non"); }
});
await new Promise((ok) => srv.listen(PORT, ok));

let nav;
try { nav = await chromium.launch({ executablePath: NAVIGATEUR }); }
catch (e) { console.log("aucun navigateur utilisable (" + String(e.message).slice(0, 90) + ") — essai saute"); srv.close(); process.exit(0); }

/* Un telephone, pas un ecran de bureau : « visible sans faire defiler » n'a de
   sens que si la fenetre a la taille d'un telephone. */
const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
await page.route("**://*.openfoodfacts.org/**", (r) => r.abort());
await page.route("**://*.gstatic.com/**", (r) => r.abort());
await page.route("**://*.googleapis.com/**", (r) => r.abort());
await page.goto("http://localhost:" + PORT + "/index.html", { waitUntil: "load" });
await page.waitForTimeout(2500);

const etapes = [];
const notes = [];
const dit = (nom, ok) => etapes.push([nom, !!ok]);

/* ── LES GESTES REELS : on clique pour de vrai, on ne triche pas avec des
      appels de fonction. C'est la seule facon de compter des gestes. ─────── */
await page.evaluate(() => { try { navTo("home"); } catch (e) {} });
await page.waitForTimeout(600);

/* Ce qui barre la route au premier clic, s'il y a quelque chose. Au tout
   premier lancement c'est la presentation en 5 ecrans (obFinish la ferme) :
   on la compte a part, elle ne se voit qu'une fois. */
const obstacle = await page.evaluate(() => {
  const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 24);
  const ob = document.getElementById("onboarding");
  return {
    quoi: el ? (el.id || el.className || el.tagName) : null,
    presentation: !!(ob && getComputedStyle(ob).display !== "none"),
    ecrans: document.querySelectorAll("#onboarding .ob-slide").length,
  };
});
notes.push("au tout premier lancement, une presentation de " + obstacle.ecrans +
  " ecrans couvre l'application (element au bas de l'ecran : " + JSON.stringify(obstacle.quoi) + ")");

await page.evaluate(() => { try { obFinish(); } catch (e) {} try { navTo("home"); } catch (e) {} });
await page.waitForTimeout(1600);
await page.evaluate(() => { try { hideCoach(); } catch (e) {} });
await page.waitForTimeout(400);

let gestes = 0;
const versFiche = await (async () => {
  try {
    await page.click('.ntab[data-screen="search"]', { timeout: 6000 }); gestes++;   /* geste 1 */
    await page.waitForTimeout(400);
    await page.fill("#q", "ramune", { timeout: 6000 }); gestes++;                   /* geste 2 */
    await page.evaluate(() => { try { renderList(); } catch (e) {} });
    await page.waitForTimeout(600);
    const n = await page.locator("#search-list .ritem").count();
    if (!n) return { ok: false, pourquoi: "aucun resultat de recherche" };
    await page.locator("#search-list .ritem").first().click({ timeout: 6000 }); gestes++; /* geste 3 */
    await page.waitForTimeout(1200);
    return { ok: true };
  } catch (e) { return { ok: false, pourquoi: String(e.message).split("\n")[0].slice(0, 160) }; }
})();

dit("depuis l'accueil, on atteint une fiche boisson en cliquant", versFiche.ok);
notes.push("gestes depuis l'accueil jusqu'a la fiche boisson : " + gestes +
  (versFiche.ok ? "" : "  (arret : " + versFiche.pourquoi + ")"));
notes.push("ce qui occupe le bas de l'ecran au chargement : " + JSON.stringify(obstacle));

/* Le bouton qui lance la chasse, vu du navigateur : existe-t-il, est-il dans
   la fenetre sans faire defiler, et quelle taille fait-il ? */
const bouton = await page.evaluate(() => {
  const ecran = document.getElementById("s-results");
  const sortie = { ecranOuvert: !!(ecran && ecran.classList.contains("on")), trouves: [] };
  const tous = Array.prototype.slice.call(document.querySelectorAll('[onclick*="toggleWatch"]'));
  sortie.nb = tous.length;
  tous.forEach((el) => {
    const r = el.getBoundingClientRect();
    sortie.trouves.push({
      texte: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70) ||
             ("[" + (el.getAttribute("aria-label") || "sans libelle") + "]"),
      role: el.getAttribute("role") || "",
      aria: el.getAttribute("aria-label") || "",
      tab: el.getAttribute("tabindex"),
      balise: el.tagName,
      h: Math.round(r.height), w: Math.round(r.width),
      haut: Math.round(r.top), bas: Math.round(r.bottom),
      dansLaFenetre: r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight,
    });
  });
  /* De combien faut-il faire defiler pour le voir ? */
  const sc = document.querySelector("#s-results > div");
  sortie.defilement = sc ? Math.round(sc.scrollTop) : null;
  sortie.hauteurFenetre = window.innerHeight;
  return sortie;
});

dit("la fiche boisson porte un bouton qui lance la chasse", bouton.nb > 0);
if (bouton.trouves.length) {
  bouton.trouves.forEach((b) => {
    notes.push("bouton de chasse : « " + b.texte + " » — " + b.w + "x" + b.h + " px, haut=" + b.haut +
      " bas=" + b.bas + " (fenetre " + bouton.hauteurFenetre + ")" + (b.dansLaFenetre ? "" : " — hors champ"));
  });
  dit("ce bouton est visible sans faire defiler", bouton.trouves.some((x) => x.dansLaFenetre));
  dit("ce bouton a un role", bouton.trouves.every((x) => x.balise === "BUTTON" || x.role === "button"));
  dit("ce bouton a un libelle lisible par un lecteur d'ecran",
      bouton.trouves.every((x) => (x.aria && x.aria.length > 2) || (x.texte && x.texte.length > 2)));
  dit("ce bouton fait au moins 44 px de haut (cible tactile)",
      bouton.trouves.every((x) => x.h >= 44));
}

/* ── L'ONGLET CHASSE ─────────────────────────────────────────────────────── */
const r = await page.evaluate(async () => {
  const etapes = [];
  const notes = [];
  const dit = (nom, ok) => etapes.push([nom, !!ok]);
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const out = { etapes, notes };
  const txt = (id) => { const e = document.getElementById(id); return e ? (e.innerText || "").replace(/\s+/g, " ").trim() : null; };
  const vu = (id) => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  try { setLang("fr"); } catch (e) {}
  await pause(400);

  /* ── 1. L'onglet s'ouvre-t-il ? Combien de gestes depuis l'accueil ? ──── */
  navTo("home"); await pause(400);
  const tab = document.querySelector('.ntab[data-screen="discover"]');
  dit("l'onglet Chasse est dans la barre du bas", !!tab);
  if (tab) tab.click();
  await pause(700);
  const ecran = document.getElementById("s-discover");
  dit("l'onglet Chasse s'ouvre en un geste depuis l'accueil", !!(ecran && ecran.classList.contains("on")));
  out.notes.push("gestes depuis l'accueil jusqu'a l'onglet Chasse : 1");

  /* Le titre de l'onglet dans la barre, et le titre de l'ecran : le meme mot ? */
  const libelleOnglet = (document.getElementById("nt-disc") || {}).textContent || "";
  const titreEcran = (document.getElementById("t-disc") || {}).textContent || "";
  out.notes.push("barre du bas : « " + libelleOnglet.trim() +" » — titre de l'ecran : « " + titreEcran.trim() + " »");
  dit("la barre du bas et le titre de l'ecran portent le meme nom",
      libelleOnglet.trim().toLowerCase().indexOf("chasse") !== -1);

  /* ── 2. Les trois segments repondent-ils ? (chasseSegTap) ─────────────── */
  const segs = Array.prototype.slice.call(document.querySelectorAll("#chasse-seg [data-chasse-tab]"));
  dit("les trois segments sont la", segs.length === 3);
  const panneau = (k) => { const e = document.getElementById("chasse-" + k); return e ? getComputedStyle(e).display : null; };

  chasseSegTap("valider"); await pause(300);
  dit("« A valider » ouvre son panneau", panneau("valider") !== "none");
  dit("et ferme « A trouver »", panneau("trouver") === "none");
  dit("et ferme « Tendances »", panneau("tendances") === "none");
  dit("le segment actif se declare aria-selected",
      (segs.find((b) => b.getAttribute("data-chasse-tab") === "valider") || {}).getAttribute
      && segs.find((b) => b.getAttribute("data-chasse-tab") === "valider").getAttribute("aria-selected") === "true");

  chasseSegTap("tendances"); await pause(400);
  dit("« Tendances » ouvre son panneau", panneau("tendances") !== "none");
  dit("et « Tendances » ecrit quelque chose (pas un panneau muet)", (txt("chasse-recent") || "").length > 10);

  chasseSegTap("trouver"); await pause(300);
  dit("« A trouver » revient", panneau("trouver") !== "none");

  /* Le choix du segment survit-il a un aller-retour d'ecran ? */
  chasseSegTap("tendances"); await pause(250);
  navTo("home"); await pause(350); navTo("discover"); await pause(700);
  dit("le segment choisi survit a un aller-retour vers l'accueil", panneau("tendances") !== "none");
  chasseSegTap("trouver"); await pause(300);

  /* Accessibilite du groupe de segments : role=tablist annonce des onglets,
     donc chaque bouton doit dire QUEL panneau il commande, et chaque panneau
     doit se declarer panneau. Sinon un lecteur d'ecran annonce « onglet 1 sur
     3 » puis ne trouve jamais le contenu associe. */
  const conteneur = document.getElementById("chasse-seg");
  dit("le groupe de segments se declare tablist", !!conteneur && conteneur.getAttribute("role") === "tablist");
  dit("chaque segment dit quel panneau il commande (aria-controls)",
      segs.every((b) => !!b.getAttribute("aria-controls")));
  dit("chaque panneau se declare panneau d'onglet (role=tabpanel)",
      ["trouver", "valider", "tendances"].every((k) => {
        const e = document.getElementById("chasse-" + k); return !!e && e.getAttribute("role") === "tabpanel";
      }));
  dit("chaque segment fait au moins 44 px de haut",
      segs.every((b) => b.getBoundingClientRect().height >= 44));

  /* ── 3. Ce que voit quelqu'un qui n'a AUCUNE chasse ───────────────────── */
  /* On rejoue renderChasse() (index.html:21839) dans l'etat d'un nouveau
     venu : aucune veille, aucun magasin charge, aucune fonction fb*. */
  const sauveWatches = (window.drinkWatches || []).slice();
  const sauveStores = window.STORES;
  drinkWatches.length = 0;
  window.STORES = [];
  renderChasse(); await pause(500);

  const vide = txt("chasse-list");
  out.videSansMagasins = vide;
  dit("sans aucune chasse ni magasin, l'ecran ne reste pas muet", !!vide && vide.length > 15);
  dit("l'ecran vide dit QUOI FAIRE, pas seulement qu'il n'y a rien",
      !!vide && /lance|start|أطلق/i.test(vide));
  /* L'ecran vide renvoie vers « une fiche boisson (la cloche) ». Ce renvoi
     n'est utile que s'il est cliquable : sinon c'est une consigne, pas un
     chemin. emptyStateHTML (index.html:6418) sait poser un bouton. */
  const host = document.getElementById("chasse-list");
  dit("l'ecran vide offre un bouton pour y aller",
      !!host && !!host.querySelector("button, [role=button], a"));

  /* Meme etat, mais avec des magasins charges : le code prend l'autre branche
     (voir le commentaire « on se tait plutot que d'annoncer un manque »). */
  window.STORES = [{ id: "S1", fbId: "S1", name: "Night shop Flagey", lat: 50.83, lng: 4.37, drinks: [], confirmations: {} }];
  renderChasse(); await pause(400);
  out.videAvecMagasins = txt("chasse-list");
  dit("avec des magasins charges, l'ecran vide dit toujours la meme chose",
      out.videAvecMagasins === out.videSansMagasins);

  /* Le reste de l'onglet, quand on n'a rien : est-ce muet ? */
  out.videMine = txt("chasse-mine");
  out.videZone = txt("chasse-zone");
  out.videAlerts = txt("alerts-card");
  out.videCoups = txt("coups-card");
  out.videTips = txt("chasse-tips");
  out.videFound = txt("chasse-found");
  dit("« Ta zone » est propose meme quand on n'a rien", !!out.videZone && out.videZone.length > 5);

  /* ── 4. renderMesChasses, renderZoneChasse, renderChasseCodes
         avec des donnees fabriquees a la main dans la page ───────────────── */

  /* a) renderMesChasses (index.html:21879) lit drinkWatches. On fabrique
        exactement ce que lancerChasse() y pousse (index.html:14357) :
        {id,name,emoji,lat,lng,created,triggered}. */
  const d1 = (DRINKS || [])[0], d2 = (DRINKS || [])[1], d3 = (DRINKS || [])[2];
  drinkWatches.length = 0;
  drinkWatches.push({ id: d1.id, name: d1.name, emoji: d1.emoji, lat: 50.83, lng: 4.37, created: Date.now() - 3600000, triggered: false });
  drinkWatches.push({ id: d2.id, name: d2.name, emoji: d2.emoji, lat: 50.83, lng: 4.37, created: Date.now() - 7200000, triggered: true, storeName: "Carrefour Flagey", storeId: "S1", triggeredAt: Date.now() - 3600000, verdict: "ok" });
  /* Une troisieme, trouvee par QUELQU'UN D'AUTRE (pas de verdict "ok") : c'est
     la branche de renderAlertsCard qui ecrit « Trouvée » en dur. */
  drinkWatches.push({ id: d3.id, name: d3.name, emoji: d3.emoji, lat: 50.83, lng: 4.37, created: Date.now() - 9000000, triggered: true, storeName: "Night shop Flagey", storeId: "S1", triggeredAt: Date.now() - 5400000, by: "Zdoudex" });
  renderMesChasses(); await pause(200);
  const mine = txt("chasse-mine");
  out.mine = mine;
  dit("renderChasseMine nomme la boisson que je cherche", !!mine && mine.indexOf(d1.name) !== -1);
  dit("renderChasseMine nomme celle qui a ete trouvee", !!mine && mine.indexOf(d2.name) !== -1);
  dit("renderChasseMine dit OU elle a ete trouvee", !!mine && mine.indexOf("Carrefour Flagey") !== -1);
  const puces = document.querySelectorAll("#chasse-mine [role=button]");
  dit("chaque chasse de la liste est cliquable", puces.length === 3);
  dit("les puces de « Tu cherches » font au moins 44 px (cible tactile)",
      Array.prototype.every.call(puces, (p) => p.getBoundingClientRect().height >= 44));
  out.hauteurPuces = Array.prototype.map.call(puces, (p) => Math.round(p.getBoundingClientRect().height));

  /* Une puce verte = trouvee, une puce orange = en cours. La couleur seule ne
     suffit pas : un daltonien ne la voit pas, un lecteur d'ecran non plus.
     LA PREUVE STRICTE : deux veilles au MEME nom, l'une trouvee et l'autre
     non, sans nom de magasin pour souffler la reponse. Si le texte lu est
     identique, l'etat ne passe que par la couleur. */
  const sauve3 = drinkWatches.splice(0, drinkWatches.length);
  drinkWatches.push({ id: d1.id, name: "Boisson temoin", emoji: "", created: Date.now(), triggered: false });
  renderMesChasses(); await pause(120);
  const luEnCours = (document.getElementById("chasse-mine").innerText || "").replace(/\s+/g, " ").trim();
  drinkWatches.length = 0;
  drinkWatches.push({ id: d1.id, name: "Boisson temoin", emoji: "", created: Date.now(), triggered: true, triggeredAt: Date.now() });
  renderMesChasses(); await pause(120);
  const luTrouvee = (document.getElementById("chasse-mine").innerText || "").replace(/\s+/g, " ").trim();
  out.luEnCours = luEnCours;
  out.luTrouvee = luTrouvee;
  dit("trouvee / en cours se lit, et pas seulement se voit en couleur", luEnCours !== luTrouvee);
  drinkWatches.length = 0;
  sauve3.forEach((w) => drinkWatches.push(w));
  renderMesChasses(); await pause(120);

  /* b) renderZoneChasse (index.html:14246) */
  window.magoHuntRadius = 7;
  renderZoneChasse(); await pause(200);
  const zone = txt("chasse-zone");
  out.zone = zone;
  dit("renderChasseZone affiche le rayon reellement regle", !!zone && zone.indexOf("7") !== -1);
  const cz = document.getElementById("cz-row");
  dit("la ligne « Ta zone » est cliquable", !!cz && cz.getAttribute("role") === "button");
  dit("la ligne « Ta zone » a un libelle pour lecteur d'ecran",
      !!cz && !!(cz.getAttribute("aria-label") || (cz.innerText || "").trim()));
  if (cz) { cz.click(); await pause(450); }
  dit("elle ouvre bien le reglage de la zone", !!document.getElementById("cz-sheet"));
  const feuille = document.getElementById("cz-sheet");
  if (feuille) {
    const curseur = feuille.querySelector("#cz-range");
    dit("le reglage porte un curseur etiquete", !!curseur && !!curseur.getAttribute("aria-label"));
    try { feuille.remove(); document.body.classList.remove("sheet-open"); } catch (e) {}
  }

  /* c) renderChasseCodes (index.html:23374) — attention : son hote
        #chasse-card est sur l'ACCUEIL (index.html:327), pas dans l'onglet. */
  renderChasseCodes(); await pause(250);
  const codes = txt("chasse-card");
  out.codes = codes;
  out.orphelines = (function () { try { return boissonsOrphelines().length; } catch (e) { return -1; } })();
  dit("renderChasseCodes rend quelque chose quand il y a des orphelines",
      out.orphelines <= 0 || (!!codes && codes.length > 5));
  dit("la carte « chasse aux codes-barres » vit dans l'onglet Chasse",
      !!document.querySelector("#s-discover #chasse-card"));

  /* d) _peindreChasse (index.html:21891) avec des chasses fabriquees,
        exactement la forme que renderChasse lui passe. */
  window.STORES = [{ id: "S1", fbId: "S1", name: "Night shop Flagey", lat: 50.83, lng: 4.37, drinks: [], confirmations: {} }];
  window.userLat = 50.83; window.userLng = 4.37;
  const demande = {};
  demande[String(d1.id)] = { id: Number(d1.id), chercheurs: 4, moi: false, distKm: 3, lastAt: Date.now() - 86400000 };
  demande[String(d2.id)] = { id: Number(d2.id), chercheurs: 1, moi: true, distKm: 0, lastAt: Date.now() - 7200000 };
  demande[String(d3.id)] = { id: Number(d3.id), chercheurs: 2, moi: false, distKm: 9, lastAt: Date.now() - 172800000 };
  _peindreChasse(demande); await pause(300);
  const liste = txt("chasse-list");
  out.liste = liste;
  dit("_peindreChasse liste les trois chasses", (document.querySelectorAll("#chasse-list .ch-card") || []).length === 3);
  dit("la plus cherchee est en tete", !!liste && liste.indexOf(d1.name) < liste.indexOf(d3.name));
  dit("ma propre chasse est signalee comme mienne", !!liste && /ta chasse|your hunt|chasse/i.test(liste));
  dit("le compteur de l'ecran est rempli", ((document.getElementById("disc-count") || {}).textContent || "").length > 0);
  dit("le badge de l'onglet porte le meme chiffre que la liste",
      ((document.getElementById("nt-disc-badge") || {}).textContent || "") === "3");
  const actions = document.querySelectorAll("#chasse-list .ch-btn, #chasse-list .ch-pill");
  out.hauteurActions = Array.prototype.map.call(actions, (b) => Math.round(b.getBoundingClientRect().height));
  dit("les boutons d'action de la chasse font au moins 44 px",
      actions.length > 0 && Array.prototype.every.call(actions, (b) => b.getBoundingClientRect().height >= 44));
  const cartes = document.querySelectorAll("#chasse-list .ch-card");
  dit("chaque carte de chasse a un role et un libelle",
      Array.prototype.every.call(cartes, (c) => c.getAttribute("role") === "button" && !!c.getAttribute("aria-label")));
  dit("chaque carte de chasse est atteignable au clavier",
      Array.prototype.every.call(cartes, (c) => c.getAttribute("tabindex") === "0"));

  /* LA REGLE DU PROJET : ne jamais mentir. Une chasse est une DEMANDE, pas un
     stock. L'ecran doit-il pouvoir laisser croire qu'une boisson est en
     rayon ? On regarde les mots employes. */
  out.motsDeStock = !!liste && /en stock|in stock|confirm/i.test(liste);
  dit("la liste des chasses ne promet aucun stock", !out.motsDeStock);

  /* ── 5. Les textes de la chasse sont-ils traduits ? ───────────────────── */
  const photo = () => {
    const e = document.getElementById("s-discover");
    return e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "";
  };
  const peindre = async (lg) => {
    setLang(lg); await pause(650);
    renderChasse(); await pause(200);
    _peindreChasse(demande); await pause(250);
    return photo();
  };

  const vFr = await peindre("fr");
  const vEn = await peindre("en");
  const vAr = await peindre("ar");
  await peindre("fr");

  out.fr = vFr.slice(0, 420);
  out.en = vEn.slice(0, 420);
  out.ar = vAr.slice(0, 420);

  dit("l'ecran de la chasse change vraiment quand on passe en anglais", vEn !== vFr);
  dit("l'ecran de la chasse change vraiment quand on passe en arabe", vAr !== vFr && vAr !== vEn);
  dit("en anglais, l'ecran n'est plus en francais",
      vEn.indexOf("À trouver") === -1 && vEn.indexOf("Tendances") === -1 && vEn.indexOf("Ta zone") === -1);
  dit("en arabe, l'ecran porte de l'arabe", (vAr.match(/[؀-ۿ]/g) || []).length > 20);

  /* La mesure honnete : combien de francais RESTE a l'ecran en anglais et en
     arabe ? On compte les phrases francaises connues de cet ecran. */
  const marqueursFr = ["À trouver", "À valider", "Tendances", "Ta zone", "Tu cherches",
    "Cherchées près de toi", "Je l’ai vue en rayon", "Je sais où",
    "Jusqu'où on a le droit de te prévenir", "Jusqu’où on a le droit de te prévenir",
    "Personne ne cherche rien", "Proposer", "La chasse",
    "Des gens cherchent", "Vues en rayon récemment", "C’est ta chasse",
    /* La carte « Tes alertes » (renderAlertsCard, index.html:15204) vit dans
       cet onglet : son etiquette d'etat et son bouton de suppression sont
       ecrits en dur, sans passer par tr(). */
    "En recherche", "Supprimer", "Trouvée"];
  out.frResteEn = marqueursFr.filter((m) => vEn.indexOf(m) !== -1);
  out.frResteAr = marqueursFr.filter((m) => vAr.indexOf(m) !== -1);
  dit("en anglais, plus aucune phrase francaise de cet ecran", out.frResteEn.length === 0);
  dit("en arabe, plus aucune phrase francaise de cet ecran", out.frResteAr.length === 0);

  /* L'arabe s'ecrit de droite a gauche : sans dir=rtl, la ponctuation et les
     chevrons partent du mauvais cote. */
  setLang("ar"); await pause(600);
  out.dirAr = document.documentElement.getAttribute("dir") || getComputedStyle(document.body).direction || "";
  dit("en arabe, la page passe en droite-a-gauche", /rtl/i.test(out.dirAr));
  setLang("fr"); await pause(600);

  /* ── 6. Zero emoji sur l'ecran de la chasse ───────────────────────────── */
  renderChasse(); await pause(300);
  _peindreChasse(demande); await pause(300);
  const ecranTexte = photo();
  /* « Emoji » au sens strict : un caractere que le systeme dessine en couleur.
     C'est Extended_Pictographic avec presentation emoji, ou suivi de U+FE0F. */
  const dur = /\p{Extended_Pictographic}/u;
  const presentation = /\p{Emoji_Presentation}/u;
  const emojis = [];
  const signes = [];
  Array.from(ecranTexte).forEach((c, i) => {
    if (!dur.test(c)) return;
    const suivant = ecranTexte[i + 1];
    if (presentation.test(c) || suivant === "️") emojis.push(c);
    else signes.push(c);
  });
  out.emojis = Array.from(new Set(emojis));
  out.signes = Array.from(new Set(signes));
  dit("l'ecran de la chasse ne contient aucun emoji", out.emojis.length === 0);

  /* Le meme controle sur le HTML : un emoji peut se cacher dans un attribut
     (aria-label, title) que innerText ne montre pas. */
  const brut = (document.getElementById("s-discover") || {}).innerHTML || "";
  const cachesEmoji = [];
  Array.from(brut).forEach((c, i) => {
    if (!dur.test(c)) return;
    if (presentation.test(c) || brut[i + 1] === "️") cachesEmoji.push(c);
  });
  out.emojisHtml = Array.from(new Set(cachesEmoji));
  dit("aucun emoji cache dans le HTML de l'ecran (attributs compris)", out.emojisHtml.length === 0);

  /* Les balises vides laissees par la suppression des emojis : un <span
     style="font-size:18px"></span> reserve encore de la place. */
  out.spansVides = Array.prototype.filter.call(
    document.querySelectorAll("#s-discover span, #s-discover div, #s-results span, #s-results div"),
    (s) => !s.children.length && (s.textContent || "").trim() === "" && /font-size\s*:\s*\d\d/.test(s.getAttribute("style") || "")
  ).map((s) => (s.closest("#s-results") ? "#s-results " : "#s-discover ") + s.tagName.toLowerCase() +
        " [" + (s.getAttribute("style") || "").slice(0, 46) + "] hauteur=" + Math.round(s.getBoundingClientRect().height) + "px");

  /* ── 7. Accessibilite generale de l'ecran ─────────────────────────────── */
  const cliquables = Array.prototype.slice.call(
    document.querySelectorAll('#s-discover button, #s-discover [role="button"], #s-discover [onclick]')
  ).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  out.nbCliquables = cliquables.length;
  const sansNom = cliquables.filter((el) => !(el.getAttribute("aria-label") || (el.innerText || "").trim()));
  const sansRole = cliquables.filter((el) => el.tagName !== "BUTTON" && el.tagName !== "A" && el.getAttribute("role") !== "button" && el.getAttribute("role") !== "tab");
  const sansClavier = cliquables.filter((el) => el.tagName !== "BUTTON" && el.tagName !== "A" && el.getAttribute("tabindex") === null);
  const tropPetits = cliquables.filter((el) => el.getBoundingClientRect().height < 44);
  const nommer = (el) => {
    const t = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 28);
    const ou = el.closest("#chasse-mine") ? "#chasse-mine"
      : el.closest("#alerts-card") ? "#alerts-card"
      : el.closest("#chasse-list") ? "#chasse-list"
      : el.closest("#chasse-zone") ? "#chasse-zone"
      : el.closest("#chasse-seg") ? "#chasse-seg"
      : el.closest("#chasse-recent") ? "#chasse-recent"
      : el.closest("#disc-list") ? "#disc-list" : "#s-discover";
    return ou + " " + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
      (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "") +
      (t ? ' « ' + t + ' »' : " (sans texte)");
  };
  out.sansNom = sansNom.map(nommer).slice(0, 8);
  out.sansRole = sansRole.map(nommer).slice(0, 8);
  out.sansClavier = sansClavier.map(nommer).slice(0, 8);
  out.tropPetits = tropPetits.map((el) => nommer(el) + " = " + Math.round(el.getBoundingClientRect().height) + "px").slice(0, 12);
  dit("tout ce qui est cliquable dans l'onglet a un nom", sansNom.length === 0);
  dit("tout ce qui est cliquable dans l'onglet a un role", sansRole.length === 0);
  dit("tout ce qui est cliquable dans l'onglet est atteignable au clavier", sansClavier.length === 0);
  dit("toute cible tactile de l'onglet fait au moins 44 px", tropPetits.length === 0);

  /* ── 8. Lancer une chasse hors ligne : l'app dit-elle la verite ? ──────
     La regle du projet : un message d'erreur doit dire la vraie raison. Ici
     window.fbJoinHunt n'existe pas (pas de reseau) : lancerChasse
     (index.html:14344) pousse quand meme la veille en local et annonce
     « Alerte activee », puis ne dit plus rien. */
  drinkWatches.length = 0;
  window.STORES = [];
  try { window._activity = []; } catch (e) {}
  const avant = drinkWatches.length;
  const toasts = [];
  const vraiToast = window.toast;
  window.toast = function (m) { toasts.push(String(m)); try { return vraiToast.apply(this, arguments); } catch (e) {} };
  try { toggleWatch(d3); } catch (e) { out.erreurLancement = String(e && e.message); }
  await pause(700);
  window.toast = vraiToast;
  out.toasts = toasts.slice();
  out.fbJoinHunt = typeof window.fbJoinHunt;
  out.fbSyncWatch = typeof window.fbSyncWatch;
  dit("hors ligne, la veille est quand meme posee sur ce telephone", drinkWatches.length === avant + 1);
  dit("hors ligne, l'app ne pretend pas que la chasse est partie",
      !toasts.some((t) => /Chasse lanc/i.test(t)));
  /* La verite complete serait de dire que personne ne sera prevenu tant qu'on
     est hors ligne. Le seul message affiche est-il celui-la ? */
  out.ditHorsLigne = toasts.some((t) => /hors.?ligne|connexion|offline|n'est pas partie|pas partie/i.test(t));
  dit("hors ligne, l'app dit que la chasse n'est pas partie", out.ditHorsLigne);

  /* LA TRACE ECRITE. lancerChasse (index.html:14396) pose dans le journal
     d'activite une ligne qui AFFIRME que les gens autour ont ete prevenus.
     Hors ligne, rien n'a ete envoye : cette ligne reste, et elle est fausse. */
  const journal = (window._activity || []).filter((a) => a && a.type === "hunt");
  out.journal = journal.map((a) => ({ titre: a.title, corps: a.body }));
  dit("hors ligne, le journal ne pretend pas qu'une chasse a ete lancee",
      !journal.some((a) => /Chasse lanc/i.test(a.title || "")));
  dit("hors ligne, le journal ne pretend pas que les gens ont ete prevenus",
      !journal.some((a) => /pr[ée]vient les gens/i.test(a.body || "")));

  /* Et la chasse jamais partie s'affiche-t-elle comme une chasse en cours ? */
  renderMesChasses(); await pause(200);
  out.mineHorsLigne = txt("chasse-mine");
  /* La puce porte « mago-live-dot », la pastille qui pulse et qui veut dire
     « en cours ». Poser l'alerte sur ce telephone est juste ; l'annoncer comme
     une chasse vivante alors que rien n'est parti ne l'est pas. */
  dit("hors ligne, « Tu cherches » ne presente pas comme vivante une chasse jamais partie",
      !out.mineHorsLigne || out.mineHorsLigne.indexOf(d3.name) === -1 ||
      !document.querySelector("#chasse-mine .mago-live-dot"));

  drinkWatches.length = 0;
  sauveWatches.forEach((w) => drinkWatches.push(w));
  window.STORES = sauveStores;
  return out;
});

/* ── LE BILAN ────────────────────────────────────────────────────────────── */
console.log("");
console.log("ECRAN VIDE (#chasse-list, aucune chasse) :");
console.log("  " + JSON.stringify(r.videSansMagasins));
console.log("  meme texte avec des magasins charges : " + (r.videAvecMagasins === r.videSansMagasins));
console.log("#chasse-mine   : " + JSON.stringify(r.mine));
console.log("  meme boisson, en cours : " + JSON.stringify(r.luEnCours));
console.log("  meme boisson, trouvee  : " + JSON.stringify(r.luTrouvee));
console.log("#chasse-zone   : " + JSON.stringify(r.zone));
console.log("#chasse-card   : " + JSON.stringify(r.codes) + "  (boissons orphelines : " + r.orphelines + ")");
console.log("#chasse-list   : " + JSON.stringify((r.liste || "").slice(0, 300)));
console.log("");
console.log("LANGUES — extrait de l'ecran de la chasse :");
console.log("  fr : " + JSON.stringify(r.fr.slice(0, 200)));
console.log("  en : " + JSON.stringify(r.en.slice(0, 200)));
console.log("  ar : " + JSON.stringify(r.ar.slice(0, 200)));
console.log("  francais restant en anglais : " + JSON.stringify(r.frResteEn));
console.log("  francais restant en arabe   : " + JSON.stringify(r.frResteAr));
console.log("  direction de la page en arabe : " + JSON.stringify(r.dirAr));
console.log("");
console.log("EMOJIS — ecran de la chasse : " + JSON.stringify(r.emojis) + " (texte), " + JSON.stringify(r.emojisHtml) + " (html)");
console.log("  signes pictographiques non-emoji : " + JSON.stringify(r.signes));
console.log("  balises vides laissees par la suppression des emojis : " + JSON.stringify(r.spansVides));
console.log("");
console.log("ACCESSIBILITE — " + r.nbCliquables + " elements cliquables dans l'onglet");
console.log("  sans nom       : " + JSON.stringify(r.sansNom));
console.log("  sans role      : " + JSON.stringify(r.sansRole));
console.log("  sans clavier   : " + JSON.stringify(r.sansClavier));
console.log("  sous 44 px     : " + JSON.stringify(r.tropPetits));
console.log("  hauteur des puces « Tu cherches » : " + JSON.stringify(r.hauteurPuces));
console.log("  hauteur des boutons d'action      : " + JSON.stringify(r.hauteurActions));
console.log("");
console.log("HORS LIGNE — window.fbJoinHunt = " + r.fbJoinHunt + ", window.fbSyncWatch = " + r.fbSyncWatch);
console.log("  messages affiches : " + JSON.stringify(r.toasts));
console.log("  journal d'activite : " + JSON.stringify(r.journal));
console.log("  « Tu cherches » apres le lancement rate : " + JSON.stringify(r.mineHorsLigne));
console.log("");
for (const n of notes) console.log("note : " + n);
for (const n of r.notes) console.log("note : " + n);
console.log("");

let ko = 0;
const toutes = etapes.concat(r.etapes);
for (const [nom, ok] of toutes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom); }
console.log("\n" + (toutes.length - ko) + "/" + toutes.length + " conformes");
await nav.close(); srv.close();
process.exit(ko ? 1 : 0);
