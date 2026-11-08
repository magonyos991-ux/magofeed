/* ══ LA RÉPÉTITION GÉNÉRALE DU COMMERÇANT ════════════════════════════════════
   Avant d'aller proposer Magofeed a un commercant, on rejoue TOUT son chemin,
   a sa place, dans un navigateur pilote — et on filme.

     1. Il ouvre l'app, cree un compte par e-mail.
     2. Il trouve sa boutique, tape « Je tiens ce magasin », remplit les trois
        preuves (numero d'entreprise, telephone, photo du code du jour), envoie.
     3. L'administrateur ouvre l'Administration, voit les preuves, certifie.
     4. Le commercant rouvre l'app : la cloche, la pastille, son tableau de
        bord, son pass, la vitrine — il publie une photo de son rayon et
        confirme une boisson que le quartier cherche.

   Rien ne touche la production : la page est servie en local et parle aux
   EMULATEURS Firebase (Firestore + Auth) grace au mode repetition de
   index.html (localStorage.magoRepetition = "1", voir le bloc du meme nom).
   Les regles Firestore sont les vraies (functions-a-deployer/firestore.rules),
   chargees dans l'emulateur : un refus de regle casse la repetition comme il
   casserait devant le commercant.

   Lancer, depuis la racine du depot :
       node outils/repetition-commercant.mjs
   Il faut Java (emulateur Firestore) et les dependances de
   functions-a-deployer/tests-regles (npm install une fois).
   Sortie : un dossier avec les captures, trois clips video (webm), le film
   assemble (mp4, si ffmpeg est la) et rapport.md / rapport.json.

   Chaque constat est classe : OK (tient), CASSE (ne marche pas), DECOIT
   (marche mais fait mauvaise impression), INFO (note sans verdict). */
import { spawn } from "node:child_process";
import { createServer as serveurHttp } from "node:http";
import { createServer as serveurNet } from "node:net";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(ICI, "..");
const TESTS = path.join(R, "functions-a-deployer", "tests-regles");
const PROJET = "magofeed-7f621";          // le meme que firebaseConfig.projectId : SDK, REST et semis parlent du meme espace
const FIREBASE = path.join(TESTS, "node_modules", ".bin", "firebase");

function portLibre(depart) {
  return new Promise((ok) => {
    const s = serveurNet();
    s.once("error", () => ok(portLibre(depart + 1)));
    s.once("listening", () => { const p = s.address().port; s.close(() => ok(p)); });
    s.listen(depart, "127.0.0.1");
  });
}

/* ─── LE LANCEUR : emulateurs, puis la scene dans leur enceinte ─────────── */
if (!process.env.MAGO_SCENE) {
  if (!fs.existsSync(FIREBASE)) {
    console.error("firebase-tools introuvable : lance « npm install » dans functions-a-deployer/tests-regles");
    process.exit(2);
  }
  const base = await portLibre(8500 + Math.floor(Math.random() * 400));
  const pAuth = await portLibre(base + 1000);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sortie = process.env.MAGO_SORTIE || path.join(os.tmpdir(), "mago-repetition-" + stamp);
  await mkdir(sortie, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mago-repetition-emul-"));
  await copyFile(path.join(R, "functions-a-deployer", "firestore.rules"), path.join(tmp, "firestore.rules"));
  await writeFile(path.join(tmp, "firebase.json"), JSON.stringify({
    firestore: { rules: "firestore.rules", port: base, websocketPort: base + 10000 },
    emulators: {
      firestore: { port: base, websocketPort: base + 10000 },
      auth: { port: pAuth },
      hub: { port: base + 20000 },
      logging: { port: base + 30000 },
      ui: { enabled: false },
    },
  }, null, 2));
  console.log("Répétition générale — Firestore :" + base + ", Auth :" + pAuth + "\n  sortie : " + sortie);
  const enfant = spawn(FIREBASE, ["emulators:exec", "--only", "firestore,auth", "--project", PROJET,
    "--config", path.join(tmp, "firebase.json"), process.execPath + " " + JSON.stringify(fileURLToPath(import.meta.url))], {
    cwd: TESTS, stdio: "inherit",
    env: Object.assign({}, process.env, { MAGO_SCENE: "1", MAGO_PORT_FS: String(base), MAGO_PORT_AUTH: String(pAuth), MAGO_SORTIE: sortie }),
  });
  enfant.on("exit", (code) => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    process.exit(code == null ? 1 : code);
  });
} else {
  await scene();
}

/* ─── LA SCÈNE ──────────────────────────────────────────────────────────── */
async function scene() {
  const F = Number(process.env.MAGO_PORT_FS), A = Number(process.env.MAGO_PORT_AUTH);
  const SORTIE = process.env.MAGO_SORTIE;
  const requireTests = createRequire(path.join(TESTS, "package.json"));
  const { initializeTestEnvironment } = requireTests("@firebase/rules-unit-testing");
  const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;

  const constats = [];
  const erreursJS = [];
  let numero = 0;
  function constat(verdict, quoi, detail) {
    constats.push({ verdict, quoi, detail: detail || "" });
    console.log("   " + verdict.padEnd(6) + " " + quoi + (detail ? "  — " + String(detail).slice(0, 160) : ""));
  }
  async function capture(page, nom) {
    numero++;
    const f = path.join(SORTIE, String(numero).padStart(2, "0") + "-" + nom + ".png");
    try { await page.screenshot({ path: f, fullPage: false }); } catch (e) {}
    return f;
  }

  /* Le decor : une boutique a Flagey, deux voisines, et un quartier qui cherche
     une boisson que la boutique a en rayon. */
  const SID = "rep-nightshop-flagey";
  const MAGASIN = { lat: 50.8275, lng: 4.3722, name: "Night Shop Flagey" };
  const POS = { latitude: 50.8271, longitude: 4.3716 };          // le commercant est derriere son comptoir
  const COMMERCANT = { email: "ahmed.flagey@example.com", mdp: "nightshop2026", pseudo: "Ahmed" };
  const ADMIN = { email: "fondateur@example.com", mdp: "magofeed-admin", pseudo: "Ilias" };
  const BCE = "0477.472.701";                                    // cle mod 97 juste
  const DRINK_CHERCHEE = 13200;                                   // Alpro Barista Cinnamon Roll

  const env = await initializeTestEnvironment({ projectId: PROJET, firestore: { host: "127.0.0.1", port: F } });
  async function sansRegles(fn) {
    let r; await env.withSecurityRulesDisabled(async (ctx) => { r = await fn(ctx.firestore()); }); return r;
  }
  async function lire(chemin) {
    return sansRegles(async (db) => { const s = await db.doc(chemin).get(); return s.exists ? s.data() : null; });
  }

  /* L'administrateur existe deja (c'est le fondateur) : on le cree par l'API de
     l'emulateur, puis on le declare dans admins/{uid} — le document que les
     regles consultent et que personne ne peut ecrire depuis l'app. */
  const rAdmin = await fetch("http://127.0.0.1:" + A + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=repetition", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.mdp, returnSecureToken: true }),
  }).then((r) => r.json());
  const ADMIN_UID = rAdmin.localId;
  if (!ADMIN_UID) throw new Error("compte admin non cree : " + JSON.stringify(rAdmin).slice(0, 200));

  await sansRegles(async (db) => {
    const maintenant = Date.now();
    const magasins = [
      Object.assign({ id: SID, type: "night shop", address: "Place Flagey 12, 1050 Ixelles", drinks: [DRINK_CHERCHEE, 2102, 3500, 10077], confirmations: {} }, MAGASIN),
      { id: "rep-carrefour-flagey", name: "Carrefour Express Flagey", lat: 50.8282, lng: 4.3730, type: "supermarché", brand: "Carrefour Express", drinks: [2102, 10066], confirmations: {} },
      { id: "rep-delhaize-ixelles", name: "Delhaize Ixelles", lat: 50.8300, lng: 4.3650, type: "supermarché", brand: "Delhaize", drinks: [2102, 3500], confirmations: {} },
    ];
    for (const m of magasins) {
      const d = Object.assign({}, m); delete d.id;
      d.geohash = geohash(m.lat, m.lng, 9);
      d.osmImport = true; d.createdAt = new Date(maintenant - 86400000 * 30);
      await db.doc("stores/" + m.id).set(d);
    }
    await db.doc("hunts/" + DRINK_CHERCHEE).set({
      drinkId: DRINK_CHERCHEE, drinkName: "Alpro Barista Cinnamon Roll", emoji: "",
      seekers: { "voisine-1": { lat: 50.8, lng: 4.4, at: maintenant - 3600000 }, "voisin-2": { lat: 50.8, lng: 4.4, at: maintenant - 7200000 } },
    });
    await db.doc("admins/" + ADMIN_UID).set({ since: new Date(maintenant - 86400000 * 200) });
    await db.doc("users/" + ADMIN_UID).set({ pseudo: ADMIN.pseudo, signals: 0, confirms: 0, createdAt: new Date(maintenant - 86400000 * 200) });
  });

  /* La page, servie en local. */
  const M = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
  const srv = serveurHttp(async (q, s) => {
    let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
    try { const b = await readFile(path.join(R, u)); s.writeHead(200, { "content-type": M[path.extname(u)] || "application/octet-stream" }); s.end(b); }
    catch { s.writeHead(404); s.end(""); }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const URL_APP = "http://127.0.0.1:" + srv.address().port + "/index.html";

  const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const videos = [];

  async function contexte(pseudo) {
    const ctx = await nav.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "fr-BE", timezoneId: "Europe/Brussels",
      geolocation: POS, permissions: ["geolocation"], hasTouch: true, isMobile: true,
      recordVideo: { dir: path.join(SORTIE, "clips"), size: { width: 390, height: 844 } },
    });
    /* Tuiles de carte et vignettes produits : des images tierces qui ne disent
       rien du chemin du commercant, et qui peuvent trainer. */
    await ctx.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|tile\.openstreetmap\.fr|images\.openfoodfacts\.org/, (r) => r.abort());
    await ctx.addInitScript(({ F, A, pseudo, POS }) => {
      try {
        localStorage.setItem("magoRepetition", "1");
        localStorage.setItem("magoRepetitionPorts", JSON.stringify({ firestore: F, auth: A, functions: 1 }));
        localStorage.setItem("magoOnboard", "1"); localStorage.setItem("magoob", "1");
        localStorage.setItem("magopseudo", pseudo);
        localStorage.setItem("magoLastPos", JSON.stringify({ lat: POS.latitude, lng: POS.longitude, ts: Date.now(), acc: 12 }));
      } catch (e) {}
    }, { F, A, pseudo, POS });
    return ctx;
  }
  async function ouvrir(ctx) {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => erreursJS.push(String(e.message).slice(0, 160)));
    page.on("dialog", (d) => {
      const m = d.message();
      if (d.type() === "prompt") d.accept(/l[ée]gende/i.test(m) ? "Alpro Barista, rayon frais" : /prix/i.test(m) ? "2,49 €" : "");
      else d.accept();
    });
    /* domcontentloaded : l'evenement load peut attendre une ressource tierce
       (police, image) qui traine ; la page, elle, est prete bien avant, et
       c'est DRINKS et le mode repetition qu'on attend vraiment juste apres. */
    await page.goto(URL_APP, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.DRINKS && DRINKS.length > 100 && window.__magoRepetition, undefined, { timeout: 60000, polling: 100 });
    await page.waitForFunction(() => !!window._fbUser, undefined, { timeout: 30000, polling: 100 });
    await brancherToasts(page);
    return page;
  }
  async function brancherToasts(page) {
    await page.evaluate(() => {
      if (window.__toastsBranches) return;
      window.__toastsBranches = true; window.__toasts = [];
      const original = window.toast;
      window.toast = function (m) { window.__toasts.push(String(m)); return original.apply(this, arguments); };
    });
  }
  async function attendreToast(page, motif, delai) {
    await page.waitForFunction((src) => (window.__toasts || []).some((t) => new RegExp(src, "i").test(t)), motif.source, { timeout: delai || 15000, polling: 100 });
    return page.evaluate((src) => (window.__toasts || []).filter((t) => new RegExp(src, "i").test(t)).pop(), motif.source);
  }
  async function texte(page, sel) { return page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, " ").trim() : null; }, sel); }
  async function visible(page, sel) {
    return page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== "none" && r.width > 0 && r.height > 0; }, sel);
  }
  async function attendre(page, fn, arg, delai) {
    await page.waitForFunction(fn, arg, { timeout: delai || 15000, polling: 100 });
  }
  /* Une photo vraisemblable, fabriquee dans le navigateur : un papier avec le
     code ecrit dessus, devant un rayon. Le JPEG passe par le vrai
     compressPhotoFile de l'app, comme une photo d'iPhone. */
  async function photoCode(ctx, code, titre) {
    const p = await ctx.newPage();
    const dataUrl = await p.evaluate(({ code, titre }) => {
      const c = document.createElement("canvas"); c.width = 1200; c.height = 900;
      const g = c.getContext("2d");
      g.fillStyle = "#6b5b4a"; g.fillRect(0, 0, 1200, 900);
      for (let i = 0; i < 9; i++) { g.fillStyle = ["#c0392b", "#2980b9", "#27ae60", "#f39c12", "#8e44ad"][i % 5]; g.fillRect(40 + i * 128, 80, 96, 300); g.fillStyle = "#f8f8f8"; g.fillRect(56 + i * 128, 160, 64, 90); }
      g.fillStyle = "#3a3028"; g.fillRect(0, 380, 1200, 40);
      g.save(); g.translate(600, 640); g.rotate(-0.06);
      g.fillStyle = "#fffdf5"; g.fillRect(-380, -190, 760, 380);
      g.strokeStyle = "#d9d2c4"; g.lineWidth = 3; g.strokeRect(-380, -190, 760, 380);
      g.fillStyle = "#1b1b1b"; g.font = "bold 170px 'Comic Sans MS', 'Marker Felt', cursive"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(code, 0, 10);
      g.font = "bold 44px sans-serif"; g.fillStyle = "#555"; g.fillText(titre, 0, 140);
      g.restore();
      return c.toDataURL("image/jpeg", 0.9);
    }, { code, titre });
    await p.close();
    return Buffer.from(dataUrl.split(",")[1], "base64");
  }
  /* Les reglages : onglet Profil, puis la roue dentee en haut a droite —
     le chemin qu'un commercant suivrait avec le pouce. */
  async function allerReglages(page) {
    await page.click('#nav .ntab[data-screen="profile"]');
    await attendre(page, () => document.getElementById("s-profile").classList.contains("on"));
    await page.click('#s-profile [aria-label="Paramètres"]');
    await attendre(page, () => document.getElementById("s-settings").classList.contains("on"));
    await page.waitForTimeout(300);
  }
  async function ligneCompte(page, motif) {
    const ok = await page.evaluate((src) => {
      const rows = Array.from(document.querySelectorAll("#compte-group .set-row"));
      const r = rows.find((x) => new RegExp(src, "i").test(x.innerText));
      if (!r) return false; r.scrollIntoView({ block: "center" }); r.click(); return true;
    }, motif.source);
    if (!ok) throw new Error("ligne de compte introuvable : " + motif);
  }
  async function creerCompte(page, qui) {
    await allerReglages(page);
    await ligneCompte(page, /Créer un compte Magofeed/);
    await attendre(page, () => { const s = document.getElementById("auth-sheet"); return s && s.style.display === "block"; });
    await page.fill("#auth-email", qui.email); await page.fill("#auth-pass", qui.mdp);
    await page.click("#auth-submit");
    await attendre(page, () => window._fbUser && !window._fbUser.isAnonymous && !!window._fbUser.email, null, 20000);
  }
  async function seConnecter(page, qui) {
    await allerReglages(page);
    await ligneCompte(page, /Créer un compte Magofeed/);
    await attendre(page, () => { const s = document.getElementById("auth-sheet"); return s && s.style.display === "block"; });
    await page.click("#auth-tab-in");
    await page.fill("#auth-email", qui.email); await page.fill("#auth-pass", qui.mdp);
    await page.click("#auth-submit");
    await attendre(page, () => window._fbUser && !window._fbUser.isAnonymous && !!window._fbUser.email, null, 20000);
  }
  async function ouvrirFiche(page) {
    /* La fiche s'ouvre depuis la liste de l'app : on attend que la boutique soit
       chargee autour de la position (c'est ce que fait l'accueil), puis on
       l'ouvre par la meme fonction que la liste et la carte. */
    await page.click('#nav .ntab[data-screen="home"]');
    await attendre(page, (sid) => (window.STORES || []).some((s) => String(s.fbId || s.id) === sid), SID, 30000);
    await page.evaluate((sid) => openStoreDetail(sid), SID);
    await attendre(page, () => document.getElementById("s-storedetail").classList.contains("on") && document.getElementById("sd-name").textContent.length > 0);
    await page.waitForTimeout(600);
  }

  console.log("\n  LA RÉPÉTITION GÉNÉRALE DU COMMERÇANT\n");
  let MARCHAND_UID = null, codeAttendu = null;

  /* ═══ ACTE 1 — LE COMMERÇANT CRÉE SON COMPTE ET DEMANDE SA BOUTIQUE ═══ */
  {
    const ctx = await contexte(COMMERCANT.pseudo);
    const page = await ouvrir(ctx);
    try {
      await page.waitForTimeout(1200);
      await capture(page, "accueil");
      constat("OK", "1. L'app s'ouvre et parle aux émulateurs", "mode répétition actif");

      /* La carte : sa boutique y est-elle ? */
      try {
        await page.click('#nav .ntab[data-screen="home"]');
        await page.evaluate(() => openExploreMap());
        await attendre(page, () => document.querySelectorAll(".leaflet-marker-icon").length >= 1, null, 30000);
        await page.waitForTimeout(1500);
        await capture(page, "carte-son-quartier");
        const n = await page.evaluate(() => document.querySelectorAll(".leaflet-marker-icon").length);
        constat("OK", "3. La carte montre les magasins du quartier", n + " pin(s)");
        await page.evaluate(() => { try { closeExploreMap(); } catch (e) { if (typeof fermerCarteExplorer === "function") fermerCarteExplorer(); } });
      } catch (e) { constat("DECOIT", "3. La carte du quartier", "pas de pin visible : " + e.message.slice(0, 100)); }

      await ouvrirFiche(page);
      await capture(page, "fiche-avant-demande");
      const claimVisible = await visible(page, "#sd-claim");
      constat(claimVisible ? "OK" : "CASSE", "4. Le bouton « Je tiens ce magasin » est sur la fiche", claimVisible ? "" : "introuvable ou caché");
      if (!claimVisible) throw new Error("pas de bouton de revendication");

      /* Le chemin le plus probable : il tape le bouton AVANT d'avoir un compte.
         La feuille doit lui demander le compte d'abord, puis se rouvrir seule. */
      await page.evaluate(() => { const b = document.getElementById("sd-claim"); b.scrollIntoView({ block: "center" }); b.click(); });
      await attendre(page, () => !!document.getElementById("claim-ov") && /Créer mon compte/.test(document.getElementById("claim-ov").innerText));
      await page.waitForTimeout(500);
      await capture(page, "demande-compte-d-abord");
      constat("OK", "2. Sans compte, la feuille demande d'abord le compte — rien à ressaisir ensuite", "");
      await page.evaluate(() => Array.from(document.querySelectorAll("#claim-ov button")).find((b) => /Créer mon compte/.test(b.textContent)).click());
      await attendre(page, () => { const s = document.getElementById("auth-sheet"); return s && s.style.display === "block"; });
      await page.fill("#auth-email", COMMERCANT.email); await page.fill("#auth-pass", COMMERCANT.mdp);
      await page.evaluate(() => authVoirMdp());
      const enClair = await page.evaluate(() => document.getElementById("auth-pass").type === "text");
      await capture(page, "compte-saisie");
      constat(enClair ? "OK" : "DECOIT", "   « Afficher le mot de passe » montre ce qu'il tape", "");
      await page.click("#auth-submit");
      await attendre(page, () => window._fbUser && !window._fbUser.isAnonymous && !!window._fbUser.email, null, 20000);
      MARCHAND_UID = await page.evaluate(() => window._fbUser.uid);
      const t = await attendreToast(page, /Compte créé/).catch(() => null);
      constat(t ? "OK" : "DECOIT", "   Création du compte par e-mail", t || "pas de message de confirmation");
      await attendre(page, () => !!document.getElementById("claim-ov") && !!document.getElementById("claim-code"), null, 10000);
      await page.waitForTimeout(500);
      codeAttendu = await texte(page, "#claim-code");
      await capture(page, "feuille-demande");
      constat("OK", "5. Le compte créé, la feuille de demande se rouvre seule, avec le code du jour", "code " + codeAttendu);

      /* Un message d'erreur du formulaire doit se VOIR par-dessus la feuille. */
      await page.fill("#claim-contact", "Ahmed Belkacem — 0470 12 34 56");
      await page.fill("#claim-bce", "0123.456.789");
      await page.evaluate(() => { document.querySelector(".claim-send").scrollIntoView({ block: "center" }); document.querySelector(".claim-send").click(); });
      await attendreToast(page, /entreprise/).catch(() => {});
      await page.waitForTimeout(250);
      const toastDevant = await page.evaluate(() => {
        const t = document.getElementById("toast"); if (!t || !t.classList.contains("show")) return "pas de toast affiché";
        /* Le toast laisse passer les doigts (pointer-events:none) : pour savoir
           qui est devant, on le rend touchable le temps du test. */
        const avant = t.style.pointerEvents; t.style.pointerEvents = "auto";
        const r = t.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        t.style.pointerEvents = avant;
        return (e === t || t.contains(e)) ? "devant" : "derrière (" + (e && (e.id || e.className)) + ")";
      });
      await capture(page, "erreur-visible");
      constat(toastDevant === "devant" ? "OK" : "CASSE", "   Un message d'erreur du formulaire est visible par-dessus la feuille", toastDevant);

      await page.fill("#claim-contact", "Ahmed Belkacem — 0470 12 34 56");
      await page.fill("#claim-role", "Gérant");
      await page.fill("#claim-note", "Ouvert 7j/7 de 17 h à 3 h, je suis là tous les soirs.");
      await page.fill("#claim-bce", BCE);
      await page.fill("#claim-phone", "02 640 12 34");
      const photo = await photoCode(ctx, codeAttendu, "Night Shop Flagey");
      await page.setInputFiles("#claim-photo", { name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: photo });
      await attendre(page, () => !!window._claimPreuve && !!document.querySelector("#claim-photo-apercu img"), null, 15000);
      const taillePreuve = await page.evaluate(() => window._claimPreuve.length);
      constat(taillePreuve <= 220000 ? "OK" : "CASSE", "6. La photo est compressée sous la borne des règles", taillePreuve + " caractères");
      await page.evaluate(() => document.querySelector(".claim-send").scrollIntoView({ block: "center" }));
      await capture(page, "demande-remplie");
      await page.click(".claim-send");
      const tEnvoi = await attendreToast(page, /Demande envoyée|réessaie|ne répond pas|déjà/, 20000).catch((e) => "aucun toast (" + e.message.slice(0, 60) + ")");
      await page.waitForTimeout(800);
      await capture(page, "demande-envoyee");
      const doc = await lire("shopClaims/" + SID);
      const bien = doc && doc.status === "pending" && doc.by === MARCHAND_UID && doc.bce === "0477472701" && typeof doc.preuve === "string" && doc.code === codeAttendu;
      constat(bien ? "OK" : "CASSE", "7. La demande est enregistrée avec ses trois preuves", bien ? ("toast : " + tEnvoi) : ("toast : " + tEnvoi + " · doc : " + JSON.stringify(doc ? Object.keys(doc) : null)));
      const traceCloche = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("magoActivity") || "[]") || []).some((a) => /certification/i.test(a.title || "")); } catch (e) { return null; } });
      constat(traceCloche ? "OK" : "INFO", "   Une trace « demande envoyée » est posée dans la cloche", traceCloche === null ? "non vérifiable" : "");
    } catch (e) {
      constat("CASSE", "Acte 1 interrompu", e.message.slice(0, 200));
      await capture(page, "acte1-echec");
    }
    const v = page.video(); await ctx.close(); if (v) videos.push(await v.path());
  }

  /* ═══ ACTE 2 — L'ADMINISTRATEUR VÉRIFIE ET CERTIFIE ═══ */
  {
    const ctx = await contexte(ADMIN.pseudo);
    const page = await ouvrir(ctx);
    try {
      await seConnecter(page, ADMIN);
      await attendre(page, () => { const r = document.getElementById("admin-row"); return r && getComputedStyle(r).display !== "none"; }, null, 20000);
      await page.waitForTimeout(400);
      await capture(page, "admin-connecte");
      constat("OK", "8. L'administrateur se connecte et voit l'entrée Administration");

      await page.evaluate(() => document.getElementById("admin-row").click());
      await attendre(page, () => document.getElementById("s-admin").classList.contains("on"));
      await attendre(page, () => !!document.querySelector("#admin-shop-claims .cl-card.hot"), null, 30000);
      await page.evaluate(() => document.querySelector("#admin-shop-claims .cl-card.hot").scrollIntoView({ block: "start" }));
      await page.waitForTimeout(600);
      await capture(page, "admin-demande-preuves");
      const carte = await texte(page, "#admin-shop-claims .cl-card.hot");
      const aBce = /0477\.472\.701/.test(carte), aTel = /02 640 12 34/.test(carte), aCode = new RegExp("Code attendu\\s*" + codeAttendu).test(carte);
      const aPhoto = await page.evaluate(() => !!document.querySelector("#admin-shop-claims .cl-card.hot img.cl-preuve"));
      const aLien = await page.evaluate(() => !!document.querySelector('#admin-shop-claims .cl-card.hot a[href*="kbopub"]'));
      constat(aBce && aTel && aCode && aPhoto && aLien ? "OK" : "DECOIT", "9. La carte de la demande montre les trois preuves et le code attendu",
        "BCE " + (aBce ? "oui" : "non") + " · tél " + (aTel ? "oui" : "non") + " · code " + (aCode ? "oui" : "non") + " · photo " + (aPhoto ? "oui" : "non") + " · fiche officielle " + (aLien ? "oui" : "non"));

      await page.evaluate(() => document.querySelector("#admin-shop-claims .cl-card.hot .cl-btn.ok").click());
      const tCert = await attendreToast(page, /certifié|Échec/, 20000).catch(() => "aucun toast");
      await attendre(page, () => !document.querySelector("#admin-shop-claims .cl-card.hot"), null, 15000).catch(() => {});
      await page.waitForTimeout(600);
      await capture(page, "admin-certifie");
      const st = await lire("stores/" + SID), me = await lire("merchants/" + MARCHAND_UID), cl = await lire("shopClaims/" + SID);
      const notifs = await sansRegles(async (db) => { const s = await db.collection("userNotifs").where("to", "==", MARCHAND_UID).get(); return s.docs.map((d) => d.data()); });
      const ok = st && st.certified === true && me && Array.isArray(me.stores) && me.stores.includes(SID) && cl && cl.status === "approved" && notifs.length >= 1;
      constat(ok ? "OK" : "CASSE", "10. Certifier écrit la pastille, le compte commerçant, la décision et la notification",
        "toast : " + tCert + " · certified=" + (st && st.certified) + " · merchants.stores=" + JSON.stringify(me && me.stores) + " · pass=" + (me && me.pass) + " · claim=" + (cl && cl.status) + " · notifs=" + notifs.length);
      constat(me && me.pass === "complet" ? "OK" : (me && me.pass ? "DECOIT" : "CASSE"), "    Le pass accordé à l'approbation", "pass=" + (me && me.pass) + " (origine " + (me && me.passOrigine) + ") — la vitrine et l'annonce exigent « complet »");

      /* Le pass se voit et se change depuis la carte, sans console Firebase. */
      try {
        await attendre(page, () => { const e = document.querySelector("#admin-shop-claims .cl-pass .cl-pass-etat"); return e && e.textContent !== "…"; }, null, 10000);
        const etat = await texte(page, "#admin-shop-claims .cl-pass");
        const allume = await page.evaluate(() => { const b = document.querySelector("#admin-shop-claims .cl-pass .cl-mini.on"); return b ? b.getAttribute("data-pass") : null; });
        await page.evaluate(() => document.querySelector("#admin-shop-claims .cl-pass").scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
        await capture(page, "admin-pass");
        constat(allume === (me && me.pass) ? "OK" : "DECOIT", "    L'administration montre le pass du gérant et permet de le changer", etat);
      } catch (e) { constat("DECOIT", "    L'administration montre le pass du gérant", "ligne absente : " + e.message.slice(0, 80)); }

      /* Ce qu'un visiteur voit maintenant. */
      await ouvrirFiche(page);
      const pastille = await visible(page, "#sd-partner");
      await capture(page, "fiche-vue-visiteur");
      constat(pastille ? "OK" : "CASSE", "11. La pastille « Tenu par son gérant » apparaît sur la fiche", "");
    } catch (e) {
      constat("CASSE", "Acte 2 interrompu", e.message.slice(0, 200));
      await capture(page, "acte2-echec");
    }
    const v = page.video(); await ctx.close(); if (v) videos.push(await v.path());
  }

  /* ═══ ACTE 3 — LE COMMERÇANT REVIENT ═══ */
  {
    const ctx = await contexte(COMMERCANT.pseudo);
    const page = await ouvrir(ctx);
    try {
      await seConnecter(page, COMMERCANT);
      await attendre(page, (sid) => typeof _mesMagasins === "object" && _mesMagasins && _mesMagasins[sid] === 1, SID, 20000)
        .then(() => constat("OK", "12. Au retour, l'app sait que la boutique est à lui", ""))
        .catch(() => constat("CASSE", "12. Au retour, l'app sait que la boutique est à lui", "_mesMagasins ne contient pas la boutique"));

      /* La cloche. */
      await page.click('#nav .ntab[data-screen="home"]');
      await page.waitForTimeout(800);
      const badge = await texte(page, "#bell-badge");
      await page.click("#bell-btn");
      await attendre(page, () => !!document.getElementById("activity-ov"));
      let cloche = null;
      try { await attendre(page, () => /certifié/i.test(document.getElementById("activity-ov").innerText), null, 8000); cloche = await texte(page, "#activity-ov"); } catch (e) { cloche = await texte(page, "#activity-ov"); }
      await page.waitForTimeout(500);
      await capture(page, "cloche");
      constat(/Ton magasin est certifié/i.test(cloche || "") ? "OK" : "DECOIT", "13. La cloche annonce la certification", (badge ? "pastille " + badge + " · " : "pas de pastille rouge · ") + String(cloche || "").slice(0, 140));
      await page.mouse.click(195, 30); await page.waitForTimeout(400);

      await ouvrirFiche(page);
      const outils = await visible(page, "#sd-owner-tools");
      const pastille = await visible(page, "#sd-partner");
      const pass = await texte(page, "#sd-pass");
      await capture(page, "fiche-gerant-haut");
      constat(outils && pastille ? "OK" : "CASSE", "14. La fiche s'ouvre en mode gérant, avec la pastille", "outils gérant " + (outils ? "oui" : "non") + " · pastille " + (pastille ? "oui" : "non"));
      constat("INFO", "    Ce que dit le panneau du pass", pass);
      const boutonVitrine = await page.evaluate(() => !!document.getElementById("sd-ph-add"));
      const annonce = await page.evaluate(() => !!document.getElementById("ann-txt"));
      constat(boutonVitrine && annonce ? "OK" : "CASSE", "15. Le gérant voit le bouton de vitrine et l'éditeur d'annonce", "vitrine " + (boutonVitrine ? "oui" : "non") + " · annonce " + (annonce ? "oui" : "non"));

      /* Le tableau de bord. */
      await attendre(page, () => { const b = document.getElementById("sd-board"); return b && b.innerText.length > 0 && !b.querySelector(".mb-load"); }, null, 20000).catch(() => {});
      await page.evaluate(() => { const b = document.getElementById("sd-board"); if (b) b.scrollIntoView({ block: "start" }); });
      await page.waitForTimeout(500);
      await capture(page, "tableau-de-bord");
      const board = await texte(page, "#sd-board");
      const cherchee = /Alpro Barista Cinnamon Roll/.test(board || "") && /personne/.test(board || "");
      constat(cherchee ? "OK" : "DECOIT", "16. Le tableau de bord montre ce que le quartier cherche", String(board || "(vide)").slice(0, 160));

      /* La vitrine : publier une photo du rayon. */
      if (boutonVitrine) {
        const rayon = await photoCode(ctx, "2,49 €", "Alpro Barista — rayon frais");
        await page.evaluate(() => document.getElementById("sd-ph-add").scrollIntoView({ block: "center" }));
        await page.setInputFiles("#sd-ph-file", { name: "IMG_2042.jpg", mimeType: "image/jpeg", buffer: rayon });
        const tPhoto = await attendreToast(page, /Photo publiée|Réservé|Échec|pleine/, 25000).catch(() => "aucun toast");
        await attendre(page, () => !!document.querySelector("#sd-vitrine img"), null, 10000).catch(() => {});
        await page.evaluate(() => { const v = document.getElementById("sd-vitrine"); if (v) v.scrollIntoView({ block: "center" }); });
        await page.waitForTimeout(600);
        await capture(page, "vitrine-publiee");
        const photos = await sansRegles(async (db) => (await db.collection("stores/" + SID + "/photos").get()).size);
        constat(/Photo publiée/.test(tPhoto) && photos === 1 ? "OK" : "CASSE", "17. Le gérant publie une photo de son rayon avec un prix", "toast : " + tPhoto + " · photos en base : " + photos);
      } else {
        constat("CASSE", "17. Le gérant publie une photo de son rayon", "pas de bouton : la vitrine lui est fermée");
      }

      /* L'annonce. */
      if (annonce) {
        await page.fill("#ann-txt", "Livraison offerte dès 20 € dans le quartier");
        await page.evaluate(() => { const b = Array.from(document.querySelectorAll("#sd-pass button")).find((x) => /Publier/.test(x.textContent)); if (b) b.click(); });
        const tAnn = await attendreToast(page, /Annonce publiée|refusée|Écris/, 15000).catch(() => "aucun toast");
        const ann = await lire("annonces/" + SID);
        await page.waitForTimeout(500);
        await capture(page, "annonce-publiee");
        constat(ann && ann.texte ? "OK" : "CASSE", "18. Le gérant publie une annonce sur sa fiche", "toast : " + tAnn);
      }

      /* Confirmer une boisson cherchée, depuis le tableau de bord. */
      const aConfirmer = await page.evaluate(() => !!document.querySelector("#sd-board .mb-go.hot"));
      if (aConfirmer) {
        await page.evaluate(() => { const b = document.querySelector("#sd-board .mb-go.hot"); b.scrollIntoView({ block: "center" }); b.click(); });
        await page.waitForTimeout(2500);
        const stApres = await lire("stores/" + SID);
        const conf = stApres && stApres.confirmations && Number(stApres.confirmations[String(DRINK_CHERCHEE)]) > 0;
        const toasts = await page.evaluate(() => (window.__toasts || []).slice(-3));
        await capture(page, "confirmation-rayon");
        constat(conf ? "OK" : "CASSE", "19. Confirmer une boisson depuis le tableau de bord l'inscrit en stock", "confirmations=" + JSON.stringify(stApres && stApres.confirmations) + " · toasts : " + toasts.join(" | "));
      } else {
        constat("DECOIT", "19. Confirmer une boisson depuis le tableau de bord", "aucun bouton « Confirmer » proposé");
      }
    } catch (e) {
      constat("CASSE", "Acte 3 interrompu", e.message.slice(0, 200));
      await capture(page, "acte3-echec");
    }
    const v = page.video(); await ctx.close(); if (v) videos.push(await v.path());
  }

  /* ═══ ACTE 4 — UN CLIENT PASSE DEVANT LA FICHE ═══ */
  {
    const ctx = await contexte("Explorateur");
    const page = await ouvrir(ctx);
    try {
      await ouvrirFiche(page);
      const pastille = await visible(page, "#sd-partner");
      const nPhotos = await page.evaluate(() => document.querySelectorAll("#sd-vitrine img").length);
      const annonce = await texte(page, "#sd-annonce");
      await capture(page, "fiche-vue-client");
      constat(pastille && nPhotos >= 1 && /Livraison offerte/.test(annonce || "") ? "OK" : "DECOIT", "20. Un client voit la pastille, la photo du rayon avec son prix, et l'annonce signée",
        "pastille " + (pastille ? "oui" : "non") + " · photos " + nPhotos + " · annonce : " + String(annonce || "(vide)").slice(0, 80));
      const claimVisible = await visible(page, "#sd-claim");
      if (claimVisible) {
        await page.evaluate(() => { const b = document.getElementById("sd-claim"); b.scrollIntoView({ block: "center" }); b.click(); });
        await attendre(page, () => !!document.getElementById("claim-ov"), null, 8000);
        await page.waitForTimeout(400);
        const txt = await texte(page, "#claim-ov");
        await capture(page, "client-deja-certifie");
        constat(/déjà certifié/.test(txt || "") && !(await page.evaluate(() => !!document.getElementById("claim-bce"))) ? "OK" : "DECOIT",
          "21. Un client qui tape « Je tiens ce magasin » sur une boutique certifiée est prévenu, sans formulaire", String(txt || "").slice(0, 120));
      } else {
        constat("OK", "21. Le bouton « Je tiens ce magasin » n'est pas proposé sur une boutique déjà certifiée", "");
      }
    } catch (e) {
      constat("CASSE", "Acte 4 interrompu", e.message.slice(0, 200));
      await capture(page, "acte4-echec");
    }
    const v = page.video(); await ctx.close(); if (v) videos.push(await v.path());
  }

  await nav.close(); srv.close(); await env.cleanup();

  /* Le film : les trois clips bout a bout, si ffmpeg est la. */
  let film = null;
  if (videos.length) {
    film = path.join(SORTIE, "repetition-commercant.mp4");
    const args = ["-y"]; videos.forEach((v) => args.push("-i", v));
    args.push("-filter_complex", videos.map((_, i) => "[" + i + ":v]").join("") + "concat=n=" + videos.length + ":v=1:a=0,fps=25,format=yuv420p[v]", "-map", "[v]", "-c:v", "libx264", "-crf", "24", "-movflags", "+faststart", film);
    const ok = await new Promise((r) => { const p = spawn("ffmpeg", args, { stdio: "ignore" }); p.on("exit", (c) => r(c === 0)); p.on("error", () => r(false)); });
    if (!ok) film = null;
  }

  const casse = constats.filter((c) => c.verdict === "CASSE").length, decoit = constats.filter((c) => c.verdict === "DECOIT").length;
  const md = ["# Répétition générale du commerçant — " + new Date().toLocaleString("fr-BE"), "",
    "Émulateurs Firebase (Firestore + Auth), vraies règles, page servie en local. Rien n'a touché la production.", "",
    "| Verdict | Étape | Détail |", "|---|---|---|"]
    .concat(constats.map((c) => "| " + c.verdict + " | " + c.quoi.replace(/\|/g, "/") + " | " + String(c.detail).replace(/\|/g, "/").replace(/\n/g, " ") + " |"))
    .concat(["", "Erreurs JavaScript : " + erreursJS.length].concat(erreursJS.slice(0, 6).map((e) => "- " + e)))
    .concat(["", film ? "Film : " + path.basename(film) : "Clips : " + videos.map((v) => path.basename(v)).join(", ")])
    .join("\n");
  await writeFile(path.join(SORTIE, "rapport.md"), md);
  await writeFile(path.join(SORTIE, "rapport.json"), JSON.stringify({ constats, erreursJS, videos, film, sortie: SORTIE }, null, 2));
  console.log("\n  " + (casse === 0 ? "RIEN NE CASSE" : casse + " ÉTAPE(S) CASSÉE(S)") + (decoit ? " · " + decoit + " déçoit" : "") + " · erreurs JavaScript : " + erreursJS.length);
  console.log("  rapport : " + path.join(SORTIE, "rapport.md") + (film ? "\n  film    : " + film : ""));
  process.exit(casse === 0 ? 0 : 1);
}

/* Geohash (base 32), la meme grille que geohashForLocation dans l'app. */
function geohash(lat, lng, precision) {
  const B = "0123456789bcdefghjkmnpqrstuvwxyz";
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, bit = 0, ch = 0, pair = true, out = "";
  while (out.length < (precision || 9)) {
    if (pair) { const mid = (lngMin + lngMax) / 2; if (lng >= mid) { ch = ch * 2 + 1; lngMin = mid; } else { ch = ch * 2; lngMax = mid; } }
    else { const mid = (latMin + latMax) / 2; if (lat >= mid) { ch = ch * 2 + 1; latMin = mid; } else { ch = ch * 2; latMax = mid; } }
    pair = !pair;
    if (++bit === 5) { out += B[ch]; bit = 0; ch = 0; }
  }
  return out;
}
