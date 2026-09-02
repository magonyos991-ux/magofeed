/**
 * Magofeed — Reconnaissance de boisson par IA (photo -> nom/marque/catégorie).
 *
 * CE QUE ÇA FAIT : l'app envoie la photo d'une proposition ; Claude regarde
 * l'image et répond en JSON strict : est-ce une boisson, son nom, sa marque,
 * sa catégorie (parmi celles de Magofeed), alcoolisée ou non, et un score de
 * confiance 0-100. Si l'IA est sûre (>= 85) et que ce n'est pas de l'alcool,
 * l'app valide et ajoute la boisson au catalogue directement — sans scanner.
 *
 * Ce fichier exporte DEUX fonctions qui travaillent ensemble :
 *  - identifyDrink : regarde la photo, répond, et si elle est très sûre elle
 *    note son verdict côté serveur (collection aiVerified, invisible du client).
 *  - confirmAiDrink : appelée à l'envoi de la proposition ; elle RE-VÉRIFIE le
 *    verdict enregistré (pas de triche possible depuis le client) puis fait la
 *    promotion officielle avec l'Admin SDK : entrée catalogue + photo publique
 *    + découverte marquée "promue" (ce qui déclenche ta notification push
 *    existante) + notification in-app. Les règles Firestore restent fermées.
 *
 * ── DÉPLOIEMENT (3 étapes, une seule fois, dans ton dossier functions/) ──
 *  1. Installer le SDK :        npm install @anthropic-ai/sdk
 *  2. Enregistrer ta clé API :  firebase functions:secrets:set ANTHROPIC_API_KEY
 *     (crée la clé sur console.anthropic.com -> API Keys ; elle commence par sk-ant-)
 *  3. Copier ce fichier dans functions/ puis ajouter dans functions/index.js :
 *        exports.identifyDrink  = require("./reconnaissance-ia").identifyDrink;
 *        exports.confirmAiDrink = require("./reconnaissance-ia").confirmAiDrink;
 *     et déployer :  firebase deploy --only functions:identifyDrink,functions:confirmAiDrink
 *
 * COÛT : ~1 centime par photo analysée (modèle claude-opus-5, effort "low").
 * Le quota (25 analyses / jour / utilisateur) borne le pire cas à ~25 c/jour
 * par utilisateur. Sans la fonction déployée, l'app retombe en silence sur le
 * formulaire manuel : rien ne casse.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Anthropic = require("@anthropic-ai/sdk");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Les catégories EXACTES de l'app (VALID_CATS dans index.html) : l'IA doit
// choisir dedans pour que la promotion au catalogue fonctionne telle quelle.
const CATS = ["Soda", "Ice Tea", "Energy", "Sport", "Jus", "Eau", "Exotique", "Lacté", "Café", "Snacks", "Autre"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isDrink", "isAlcohol", "name", "brand", "category", "confidence"],
  properties: {
    isDrink: { type: "boolean", description: "true si la photo montre bien une boisson (bouteille, canette, brique...)" },
    isAlcohol: { type: "boolean", description: "true si alcoolisée OU version 0.0%/sans-alcool d'une marque d'alcool (bière 0.0 incluse)" },
    name: { type: "string", description: "Nom commercial exact du produit, sans la marque si elle est séparée (ex: 'Ramune Original', 'Inca Kola')" },
    brand: { type: "string", description: "La marque (ex: 'Sangaria', 'Coca-Cola'). Chaîne vide si inconnue." },
    category: { type: "string", enum: CATS },
    confidence: { type: "integer", description: "0-100 : certitude sur l'identification précise du produit (pas juste 'c'est un soda')" }
  }
};

/* PLAFOND GLOBAL QUOTIDIEN — la seule borne qui tienne sur la facture.
   Le quota de 25 analyses est indexe sur l'uid, or un uid s'obtient gratuitement
   et sans limite (connexion anonyme). Mille comptes jetables = vingt-cinq mille
   appels payants dans la journee. Ce compteur-la est commun a tout le monde :
   quel que soit le nombre de comptes, la depense s'arrete ici. Monte le chiffre
   quand l'app grandit — c'est un plafond de securite, pas un objectif. */
const PLAFOND_JOUR_PRODUIT = 400;
const PLAFOND_JOUR_FRIGO = 120;
async function quotaJour(db, uid, champJour, champCompte, plafondPerso, champGlobal, plafondGlobal) {
  const jour = new Date().toISOString().slice(0, 10);
  const persoRef = db.collection("aiQuota").doc(uid);
  const globalRef = db.collection("_meta").doc("aiQuotaGlobal");
  return db.runTransaction(async (t) => {
    const [p, g] = await Promise.all([t.get(persoRef), t.get(globalRef)]);
    const dp = p.exists ? p.data() : {};
    const dg = g.exists ? g.data() : {};
    const nPerso = dp[champJour] === jour ? (dp[champCompte] || 0) : 0;
    if (nPerso >= plafondPerso) return { blocked: true, raison: "quota" };
    const nGlobal = dg.jour === jour ? (dg[champGlobal] || 0) : 0;
    if (nGlobal >= plafondGlobal) return { blocked: true, raison: "quota-global" };
    const patchP = {}; patchP[champJour] = jour; patchP[champCompte] = nPerso + 1;
    const patchG = { jour: jour }; patchG[champGlobal] = nGlobal + 1;
    t.set(persoRef, patchP, { merge: true });
    t.set(globalRef, patchG, { merge: true });
    return { blocked: false };
  });
}

exports.identifyDrink = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], memory: "512MiB", timeoutSeconds: 60,
    /* Borne la vitesse de depense : sans elle, une boucle ouvre autant
       d'instances que Google en accorde, toutes facturees en parallele. */
    maxInstances: 8 },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");

    // Image : data URL jpeg/png produite par compressPhotoFile (<= ~250 Ko).
    const dataUrl = String((req.data && req.data.image) || "");
    const m = dataUrl.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new HttpsError("invalid-argument", "Image manquante ou format invalide.");
    if (m[2].length > 600000) throw new HttpsError("invalid-argument", "Image trop lourde.");

    // Anti-abus : 25 analyses par jour et par personne, ET un plafond commun.
    const quota = await quotaJour(db, uid, "day", "count", 25, "produit", PLAFOND_JOUR_PRODUIT);
    if (quota.blocked) return { ok: false, reason: quota.raison };

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    let resp;
    try {
      resp = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 3000, // marge : la réflexion du modèle compte dans ce plafond
        output_config: {
          effort: "low", // identification visuelle simple : rapide et peu coûteux
          format: { type: "json_schema", schema: SCHEMA }
        },
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/" + m[1], data: m[2] } },
            {
              type: "text",
              text: "Identifie la boisson sur cette photo pour l'app Magofeed (annuaire communautaire de boissons SANS alcool, public familial). " +
                "Règles : 'confidence' mesure ta certitude sur le PRODUIT EXACT (nom commercial précis), pas la catégorie générale — si tu vois un soda sans pouvoir lire la marque, confidence <= 50. " +
                "'isAlcohol' = true pour tout alcool ET toute version 0.0%/sans-alcool d'une marque d'alcool (bière 0.0, vin désalcoolisé...). " +
                "Si ce n'est pas une boisson (nourriture, objet, personne...), isDrink=false et confidence=0."
            }
          ]
        }]
      });
    } catch (e) {
      console.warn("identifyDrink API error:", e && e.message);
      throw new HttpsError("internal", "Analyse indisponible.");
    }

    // Les classifieurs de sécurité peuvent décliner : toujours vérifier AVANT de lire content.
    if (resp.stop_reason === "refusal") return { ok: false, reason: "refused" };

    let out = null;
    try {
      const txt = (resp.content.find(function (b) { return b.type === "text"; }) || {}).text || "";
      out = JSON.parse(txt);
    } catch (e) {
      return { ok: false, reason: "parse" };
    }

    // Garde serveur non négociable : jamais d'alcool dans Magofeed.
    const result = {
      ok: true,
      isDrink: !!out.isDrink,
      isAlcohol: !!out.isAlcohol,
      name: String(out.name || "").slice(0, 60),
      brand: String(out.brand || "").slice(0, 30),
      category: CATS.indexOf(out.category) !== -1 ? out.category : "Autre",
      confidence: Math.max(0, Math.min(100, Number(out.confidence) || 0))
    };

    // Verdict très sûr et sans alcool : on le NOTE côté serveur (le client ne
    // peut ni lire ni écrire aiVerified — règles fermées par défaut). C'est ce
    // dossier que confirmAiDrink relira à l'envoi : la validation automatique
    // ne repose jamais sur ce que le client prétend.
    if (result.isDrink && !result.isAlcohol && result.confidence >= 85) {
      try {
        /* On note l'empreinte de l'image REELLEMENT analysee. Sans elle,
           rien ne reliait le verdict a la photo : on faisait analyser un vrai
           soda, puis on deposait une TOUTE AUTRE image dans discoveryPhotos,
           et confirmAiDrink la recopiait dans drinkPhotos — collection publique
           en lecture. N'importe quelle image devenait ainsi la photo officielle
           d'une boisson du catalogue, validee « par l'IA » qui ne l'a jamais vue. */
        await db.collection("aiVerified").doc(uid).set({
          name: result.name,
          brand: result.brand,
          category: result.category,
          confidence: result.confidence,
          imgHash: require("crypto").createHash("sha256").update(m[2]).digest("hex"),
          ts: Date.now()
        });
      } catch (e) { console.warn("aiVerified save error:", e && e.message); }
    }

    return result;
  }
);

// Couleurs/fonds des catégories — copie de CAT_DEFAULTS dans index.html, pour
// que l'entrée catalogue créée ici soit identique à une promotion admin.
const CAT_STYLE = {
  "Soda":     { color: "#e67e22", light: "#fef3e2" },
  "Ice Tea":  { color: "#d68910", light: "#fdf2e3" },
  "Energy":   { color: "#d4ac0d", light: "#fcf8e3" },
  "Jus":      { color: "#f39c12", light: "#fef5e7" },
  "Eau":      { color: "#5dade2", light: "#ebf5fb" },
  "Exotique": { color: "#ec7063", light: "#fdedec" },
  "Sport":    { color: "#148f77", light: "#e8f8f5" },
  "Lacté":    { color: "#c9a978", light: "#f8f2e9" },
  "Café":     { color: "#7b5e3b", light: "#f1ebe3" },
  "Snacks":   { color: "#8d6e63", light: "#efe7e2" },
  "Autre":    { color: "#7d6b8f", light: "#f1edf6" }
};

/* Promotion automatique d'une proposition vérifiée par l'IA.
   Appelée par l'app juste après l'envoi de la découverte + sa photo.
   Sécurité : on ne fait confiance qu'au verdict aiVerified écrit par
   identifyDrink (moins de 15 minutes avant), et la découverte doit appartenir
   à l'appelant et porter le même nom que ce que l'IA a reconnu. */
exports.confirmAiDrink = onCall(
  { region: REGION, memory: "256MiB", timeoutSeconds: 30 },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");
    /* Verifier la longueur ne suffit pas : l'Admin SDK interprete une valeur
       contenant « / » comme un CHEMIN, pas comme un identifiant. .doc("a/b/c")
       vise donc discoveries/a/b/c, une sous-collection. On impose la forme. */
    const discId = String((req.data && req.data.discoveryId) || "");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(discId)) throw new HttpsError("invalid-argument", "discoveryId invalide.");

    const vRef = db.collection("aiVerified").doc(uid);
    const vSnap = await vRef.get();
    const v = vSnap.exists ? vSnap.data() : null;
    if (!v || !v.ts || Date.now() - v.ts > 15 * 60 * 1000) return { ok: false, reason: "no-verification" };

    const dRef = db.collection("discoveries").doc(discId);
    const dSnap = await dRef.get();
    if (!dSnap.exists) return { ok: false, reason: "no-discovery" };
    const disc = dSnap.data();
    if (disc.by !== uid) return { ok: false, reason: "not-owner" };
    if (disc.promoted || disc.rejected) return { ok: false, reason: "already-decided" };
    // Le nom envoyé doit être celui que l'IA a reconnu (l'utilisateur qui
    // corrige le nom repasse par la vérification communautaire normale).
    if (String(disc.name || "").trim().toLowerCase() !== String(v.name || "").trim().toLowerCase()) {
      return { ok: false, reason: "name-mismatch" };
    }

    const style = CAT_STYLE[v.category] || CAT_STYLE["Autre"];
    const entry = {
      id: Date.now(),
      name: String(v.name).slice(0, 60),
      brand: String(v.brand || "Autre").slice(0, 30),
      cat: v.category,
      emoji: "", color: style.color, light: style.light,
      tag: String(v.name).toUpperCase().slice(0, 20),
      stars: 4.0,
      barcodes: [],            // proposition photo : pas de code-barres scanné
      aiVerified: true,
      aiConfidence: v.confidence
    };

    await db.collection("catalog").doc(String(entry.id)).set(
      Object.assign({}, entry, { createdAt: FieldValue.serverTimestamp(), fromBarcode: "" })
    );

    /* La photo de la proposition devient l'image publique de la boisson —
       mais SEULEMENT si c'est bien celle que l'IA a analysee. On recalcule son
       empreinte et on la compare a celle notee dans le verdict. Si elles
       different, la boisson entre au catalogue sans photo : mieux vaut pas
       d'image qu'une image que personne n'a validee. */
    try {
      const pSnap = await db.collection("discoveryPhotos").doc(discId).get();
      const brut = pSnap.exists ? String(pSnap.data().data || "") : "";
      const b64 = (brut.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/) || [])[1] || "";
      if (b64 && v.imgHash) {
        const h = require("crypto").createHash("sha256").update(b64).digest("hex");
        if (h === v.imgHash) {
          await db.collection("drinkPhotos").doc(String(entry.id)).set({
            data: brut,
            createdAt: FieldValue.serverTimestamp()
          });
        } else {
          console.warn("photo differente de celle analysee — non publiee");
        }
      }
    } catch (e) { console.warn("Photo carry error:", e && e.message); }

    // promoted:true déclenche ta Cloud Function de push existante
    // (notifyDiscoveryPromoted) : l'auteur reçoit la notification téléphone.
    await dRef.update({ promoted: true, cat: v.category, decidedAt: FieldValue.serverTimestamp() });

    // Notification in-app (cloche) en plus du push.
    try {
      await db.collection("userNotifs").add({
        to: uid, read: false, type: "promoted",
        title: "Ta découverte est dans Magofeed !",
        body: "« " + entry.name + " » a été reconnue et validée par l'IA : elle fait déjà partie du catalogue. Merci d'agrandir la carte des boissons !",
        drinkId: entry.id, barcode: "",
        createdAt: FieldValue.serverTimestamp()
      });
    } catch (e) { console.warn("Notify error:", e && e.message); }

    await vRef.delete().catch(function () {});

    return { ok: true, entry: entry };
  }
);
