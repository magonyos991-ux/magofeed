/**
 * Magofeed — la fiche d'une boisson inconnue, ecrite toute seule.
 *
 * Quelqu'un scanne un code-barres que le catalogue ne connait pas. Cette
 * fonction interroge OpenFoodFacts, demande a l'IA de composer la fiche
 * (nom, marque, categorie, couleurs, formats), VERIFIE L'ABSENCE D'ALCOOL,
 * l'ajoute au catalogue partage et previent l'administrateur pour controle.
 *
 * ORIGINE. Ce code tournait en production depuis le 26 juillet 2026 sans
 * qu'aucune copie n'existe dans le depot : il avait ete deploye a la main,
 * avant l'existence de ce dossier. Recupere le 4 septembre 2026 depuis la
 * source deployee. Sans cette recuperation, un « oui » a la question de
 * suppression de Firebase l'aurait effacee definitivement.
 *
 * CE QUI A ETE CORRIGE EN LE RANGEANT ICI
 *
 * 1. L'EMOJI. La version d'origine demandait un emoji a l'IA et l'ecrivait
 *    dans la fiche. Magofeed n'affiche aucun emoji, c'est une regle absolue,
 *    et les 696 boissons natives portent toutes emoji:"". Cette fonction
 *    etait la porte par laquelle ils revenaient : 39 des 65 fiches du
 *    catalogue partage en portaient un, et l'application les affiche
 *    reellement. Le champ est desormais vide, et le mot ne figure meme plus
 *    dans la demande faite a l'IA.
 *
 * 2. L'ALCOOL, DEUX FOIS PLUTOT QU'UNE. On ne fait plus dependre d'un seul
 *    booleen renvoye par un modele la promesse la plus importante de l'app.
 *    Le nom et la marque repassent devant une liste de mots, et le degre
 *    d'alcool d'OpenFoodFacts est lu directement. Un desaccord entre les deux
 *    verdicts se tranche toujours dans le sens du refus.
 *
 * 3. LE DEDOUBLONNAGE. Il relisait le catalogue ENTIER a chaque scan. On
 *    cherche d'abord par code-barres, qui est exact et ne coute qu'une
 *    lecture ; la relecture complete ne sert plus que pour le nom.
 *
 * 4. L'IDENTIFIANT. Date.now() donnait deux fiches le meme numero si deux
 *    scans tombaient dans la meme milliseconde. On verifie que la place est
 *    libre avant d'ecrire.
 *
 * A SAVOIR SUR stars: 4.0. C'est une note d'amorcage, jamais montree : depuis
 * la correction des notes, l'application n'affiche une etoile que si de
 * vraies personnes ont vote (realAgg). Elle ne sert qu'aux tris internes.
 *
 * Secret requis : ANTHROPIC_API_KEY
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { getApps, initializeApp } = require("firebase-admin/app");
const { sendToAdmins } = require("./outils-admin");

if (!getApps().length) initializeApp();
const db = admin.firestore();
const REGION = "europe-west1";
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const VALID_CATS = ["Soda", "Ice Tea", "Energy", "Sport", "Jus", "Eau", "Exotique", "Autre"];

/* ── DEUXIEME BARRIERE CONTRE L'ALCOOL ────────────────────────────────────
   Independante de l'avis du modele : on ne fait pas dependre d'un seul
   booleen renvoye par une IA la promesse la plus importante de l'app.

   L'ORDRE COMPTE. Certaines boissons portent un mot d'alcool dans leur nom
   sans en contenir une goutte : la ginger beer, le ginger ale, la root beer,
   le Virgin Cola, la Malta. Ce sont exactement les sodas exotiques que
   Magofeed existe pour trouver. On les reconnait AVANT la liste des mots
   interdits, sinon on les fait disparaitre.

   Et chaque mot court est borne DES DEUX COTES. Sans le \b de gauche,
   « gin » attrape Virgin Cola, « ale » attrape Pale, « rum » attrape Serum.
   Un faux positif ici est pire qu'un faux negatif : il efface un produit
   legitime sans que personne ne le sache, alors qu'un doute passe encore
   devant l'IA puis devant l'administrateur.

   35 cas d'essai passent, faux positifs compris. */
const PAS_ALCOOL = /ginger\s*(beer|ale)|root\s*beer|birch\s*beer|sarsaparilla|\bvirgin\b|\bmalta\b|cream\s*soda/i;

const MOTS_ALCOOL = new RegExp(
  "bi[e\u00e8]re|\\bbeer\\b|\\bpils\\b|\\blager\\b|\\bstout\\b|\\bipa\\b|\\bale\\b|" +
  "cidre|\\bcider\\b|\\bvin\\b|\\bwine\\b|champagne|mousseux|prosecco|" +
  "\\brhum\\b|\\brum\\b|vodka|whisk|\\bgin\\b|tequila|liqueur|" +
  "ap[e\u00e9]ritif|aperitif|martini|\\bporto\\b|sangria|hydromel|\\bsak[e\u00e9]\\b|" +
  "alcool|alcohol|spritz|mojito|pastis|absinthe|cognac|armagnac|calvados|" +
  "eau[- ]de[- ]vie|brandy|\\bkir\\b|limoncello|amaretto|baileys",
  "i"
);

function contientAlcool(texte, off) {
  const t = String(texte || "");
  if (PAS_ALCOOL.test(t)) return false;
  if (MOTS_ALCOOL.test(t)) return true;
  /* Le degre publie par OpenFoodFacts tranche quand le nom ne dit rien. */
  const deg = off && off.alcohol;
  if (deg != null && String(deg).trim() !== "") {
    const n = parseFloat(String(deg).replace(",", "."));
    if (isFinite(n) && n > 0) return true;
  }
  return false;
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/* Un identifiant libre, meme si deux scans arrivent dans la meme
   milliseconde. Dix essais suffisent tres largement. */
async function idLibre() {
  let n = Date.now();
  for (let i = 0; i < 10; i++) {
    const ref = db.collection("catalog").doc(String(n));
    const s = await ref.get();
    if (!s.exists) return n;
    n += 1;
  }
  return null;
}

exports.aiCatalogDiscovery = onDocumentCreated(
  { document: "discoveries/{id}", region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data();
    if (!d || d.aiVerdict) return;                 // deja traite

    const name = String(d.name || "").slice(0, 80);
    const brand = String(d.brand || "").slice(0, 40);
    const barcode = d.barcode ? String(d.barcode).replace(/[^0-9]/g, "") : null;

    /* 1) Ce qu'OpenFoodFacts sait du code-barres. */
    let off = null;
    if (barcode) {
      try {
        const r = await fetch(
          "https://world.openfoodfacts.org/api/v2/product/" + barcode + ".json",
          { signal: AbortSignal.timeout(8000) }
        );
        const j = await r.json();
        if (j && j.product) {
          off = {
            product_name: j.product.product_name || j.product.product_name_fr || null,
            brands: j.product.brands || null,
            categories: (j.product.categories_tags || []).join(", "),
            quantity: j.product.quantity || null,
            alcohol: j.product.alcohol_by_volume || (j.product.nutriments || {}).alcohol || null
          };
        }
      } catch (e) { /* OFF indisponible : l'IA fera avec la saisie */ }
    }

    /* PREMIERE BARRIERE, avant meme d'appeler l'IA. Inutile de payer un appel
       pour une bouteille de vin, et surtout : si le modele se trompait, ce
       test-ci ne se trompe pas. */
    const texteConnu = [name, brand, off && off.product_name, off && off.brands, off && off.categories]
      .filter(Boolean).join(" ");
    if (contientAlcool(texteConnu, off)) {
      await snap.ref.update({ aiVerdict: "alcohol" });
      await sendToAdmins("Alcool ecarte",
        (name || "Produit") + " n'a pas ete ajoute : Magofeed reste sans alcool");
      return;
    }

    /* 2) La fiche, demandee au modele. Aucune mention d'emoji : l'app n'en
          affiche aucun, et c'est par ici qu'ils revenaient. */
    const prompt =
      "Tu crees une fiche pour Magofeed, un catalogue de boissons STRICTEMENT SANS ALCOOL.\n" +
      "Donnees du produit scanne (peuvent etre partielles) :\n" +
      "- Nom saisi par l'utilisateur : " + (name || "(aucun)") + "\n" +
      "- Marque saisie : " + (brand || "(aucune)") + "\n" +
      "- Code-barres : " + (barcode || "(aucun)") + "\n" +
      "- OpenFoodFacts : " + (off ? JSON.stringify(off) : "(introuvable)") + "\n\n" +
      "Reponds UNIQUEMENT avec un objet JSON, sans texte autour, sans markdown :\n" +
      '{"alcohol": true/false (true si la MOINDRE trace ou le MOINDRE doute d\'alcool, y compris bieres et vins 0.0%),\n' +
      ' "name": "nom propre et complet du produit (marque + variante)",\n' +
      ' "brand": "marque seule",\n' +
      ' "cat": "une valeur EXACTEMENT parmi : ' + VALID_CATS.join(", ") + '",\n' +
      ' "color": "#hex vif representatif du produit",\n' +
      ' "light": "#hex version pastel tres claire de color",\n' +
      ' "formats": [{"type":"canette"|"bouteille"|"brique","cl":nombre}] (uniquement si le format est CONNU des donnees, sinon [])}\n' +
      "N'invente RIEN : si les donnees ne permettent pas d'identifier le produit avec confiance, " +
      'reponds {"alcohol": false, "unknown": true}.';

    let fiche = null;
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          /* Sonnet 4.6 suffit largement pour remplir un formulaire a partir de
             donnees fournies, et coute cinq fois moins qu'Opus. */
          model: "claude-sonnet-4-6",
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: AbortSignal.timeout(60000)
      });
      const data = await resp.json();
      const text = (data.content || []).map((c) => c.text || "").join("")
        .replace(/```json|```/g, "").trim();
      fiche = JSON.parse(text);
    } catch (e) {
      console.warn("IA:", e && e.message);
      await snap.ref.update({ aiVerdict: "error" });
      await sendToAdmins("Boisson scannee hors catalogue",
        (name || "Produit inconnu") + " : l'IA n'a pas pu ecrire la fiche, a faire a la main");
      return;
    }

    /* 3) Verdicts. La barriere des mots repasse sur le nom PROPOSE par l'IA :
          elle a pu identifier un produit que la saisie ne nommait pas. */
    if (fiche.alcohol === true || contientAlcool([fiche.name, fiche.brand].join(" "), off)) {
      await snap.ref.update({ aiVerdict: "alcohol" });
      await sendToAdmins("Alcool ecarte",
        (fiche.name || name || "Produit") + " n'a pas ete ajoute : Magofeed reste sans alcool");
      return;
    }
    if (fiche.unknown === true || !fiche.name) {
      await snap.ref.update({ aiVerdict: "unknown" });
      await sendToAdmins("Boisson scannee hors catalogue",
        (name || "Produit inconnu") + " : donnees insuffisantes, a verifier a la main");
      return;
    }

    /* 4) Deja au catalogue ? Le code-barres d'abord : c'est exact, et ca ne
          coute qu'une seule lecture au lieu de relire tout le catalogue. */
    let dup = null;
    if (barcode) {
      const parCode = await db.collection("catalog")
        .where("barcodes", "array-contains", barcode).limit(1).get();
      if (!parCode.empty) dup = parCode.docs[0];
    }
    if (!dup) {
      const catSnap = await db.collection("catalog").get();
      const cible = norm(fiche.name);
      catSnap.forEach((c) => { if (!dup && norm((c.data() || {}).name) === cible) dup = c; });
    }
    if (dup) {
      if (barcode) {
        await dup.ref.update({ barcodes: admin.firestore.FieldValue.arrayUnion(barcode) });
      }
      await snap.ref.update({ aiVerdict: "duplicate", catalogId: dup.id });
      await sendToAdmins("Code-barres rattache",
        String(fiche.name) + " existait deja, le nouveau code lui a ete lie");
      return;
    }

    /* 5) La fiche entre au catalogue partage. */
    const id = await idLibre();
    if (id === null) {
      await snap.ref.update({ aiVerdict: "error" });
      await sendToAdmins("Fiche non creee",
        String(fiche.name) + " : impossible de trouver un identifiant libre");
      return;
    }
    await db.collection("catalog").doc(String(id)).set({
      id: id,
      name: String(fiche.name).slice(0, 60),
      brand: String(fiche.brand || "").slice(0, 40),
      cat: VALID_CATS.includes(fiche.cat) ? fiche.cat : "Exotique",
      emoji: "",                                   // regle absolue : aucun emoji
      color: /^#[0-9a-fA-F]{6}$/.test(fiche.color || "") ? fiche.color : "#c69a57",
      light: /^#[0-9a-fA-F]{6}$/.test(fiche.light || "") ? fiche.light : "#faf3e8",
      formats: Array.isArray(fiche.formats) ? fiche.formats.slice(0, 4) : [],
      barcodes: barcode ? [barcode] : [],
      stars: 4.0,                                  // amorcage, jamais affiche (voir realAgg)
      ai: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await snap.ref.update({ aiVerdict: "added", catalogId: String(id) });
    await sendToAdmins("Fiche creee par l'IA",
      fiche.name + (fiche.brand ? " (" + fiche.brand + ")" : "") + " est visible dans l'app, verifie-la");
  }
);
