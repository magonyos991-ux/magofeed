/**
 * Magofeed — Scan de frigo par IA (une photo -> TOUTES les boissons visibles).
 *
 * CE QUE ÇA FAIT : l'admin (plus tard : le gérant vérifié) photographie le
 * frigo d'un magasin ; Claude regarde l'image et liste chaque boisson
 * DISTINCTE qu'il reconnaît (nom, marque, catégorie, confiance). L'app fait
 * ensuite correspondre cette liste au catalogue et ajoute les boissons au
 * magasin en un geste — 30 boissons en une photo au lieu de 30 saisies.
 * C'est l'outil d'embarquement des night shops.
 *
 * Sécurité intégrée : l'alcool détecté est ÉCARTÉ côté serveur (jamais
 * renvoyé au client), la nourriture/snacks est ignorée, quota 10 scans par
 * jour et par utilisateur (les photos de frigo sont plus lourdes à analyser
 * que les photos produit).
 *
 * ── DÉPLOIEMENT (dans ton dossier functions/, comme reconnaissance-ia) ──
 *  1. Copier ce fichier dans functions/
 *  2. Ajouter dans functions/index.js :
 *        exports.identifyFridge = require("./scan-frigo").identifyFridge;
 *  3. Déployer :  firebase deploy --only functions:identifyFridge
 *  (Le secret ANTHROPIC_API_KEY et le SDK sont déjà en place depuis
 *   reconnaissance-ia — rien d'autre à installer.)
 *
 * COÛT : ~3-5 centimes par frigo analysé (image plus grande, réponse plus
 * longue). Le quota borne le pire cas à ~50 c/jour/utilisateur.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const Anthropic = require("@anthropic-ai/sdk");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const CATS = ["Soda", "Ice Tea", "Energy", "Sport", "Jus", "Eau", "Exotique", "Lacté", "Café", "Snacks", "Autre"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["drinks"],
  properties: {
    drinks: {
      type: "array",
      maxItems: 45,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "brand", "category", "isAlcohol", "confidence"],
        properties: {
          name: { type: "string", description: "Nom commercial du produit, variante incluse (ex: 'Ice Tea Pêche', 'Ginger Beer Original')" },
          brand: { type: "string", description: "La marque (ex: 'Lipton', 'Old Jamaica'). Chaîne vide si illisible." },
          category: { type: "string", enum: CATS },
          isAlcohol: { type: "boolean", description: "true si alcoolisée OU version 0.0% d'une marque d'alcool (bière 0.0 incluse)" },
          confidence: { type: "integer", description: "0-100 : certitude sur CE produit précis (étiquette lisible = haut ; deviné à la couleur = bas)" }
        }
      }
    }
  }
};

exports.identifyFridge = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], memory: "512MiB", timeoutSeconds: 120 },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");

    const dataUrl = String((req.data && req.data.image) || "");
    const m = dataUrl.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new HttpsError("invalid-argument", "Image manquante ou format invalide.");
    if (m[2].length > 600000) throw new HttpsError("invalid-argument", "Image trop lourde.");

    // Quota dédié : 10 frigos par jour et par utilisateur (champ séparé du
    // quota photo-produit pour ne pas se marcher dessus).
    const day = new Date().toISOString().slice(0, 10);
    const qRef = db.collection("aiQuota").doc(uid);
    const quota = await db.runTransaction(async (t) => {
      const snap = await t.get(qRef);
      const d = snap.exists ? snap.data() : {};
      const count = d.fday === day ? (d.fcount || 0) : 0;
      if (count >= 10) return { blocked: true };
      t.set(qRef, { fday: day, fcount: count + 1 }, { merge: true });
      return { blocked: false };
    });
    if (quota.blocked) return { ok: false, reason: "quota" };

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    let resp;
    try {
      resp = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 9000, // longue liste + réflexion du modèle dans le même plafond
        output_config: {
          effort: "medium", // un frigo entier demande plus d'attention qu'un produit seul
          format: { type: "json_schema", schema: SCHEMA }
        },
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/" + m[1], data: m[2] } },
            {
              type: "text",
              text: "Voici la photo du frigo d'un magasin. Liste CHAQUE boisson DISTINCTE que tu reconnais pour l'app Magofeed (annuaire communautaire de boissons SANS alcool). " +
                "Règles : une entrée par PRODUIT distinct (Fanta Orange et Fanta Cassis = 2 entrées ; 10 canettes identiques = 1 entrée). " +
                "Uniquement les produits VISIBLES dans le frigo — ignore les listes de prix collées sur la vitre, la nourriture, les snacks et les objets. " +
                "'confidence' = certitude sur CE produit précis : étiquette lisible = 80+, deviné à la silhouette/couleur = 50 ou moins. Ne devine JAMAIS un produit que tu ne vois pas. " +
                "'isAlcohol' = true pour tout alcool ET toute version 0.0% d'une marque d'alcool. Le ginger beer classique (Old Jamaica...) est un SODA sans alcool."
            }
          ]
        }]
      });
    } catch (e) {
      console.warn("identifyFridge API error:", e && e.message);
      throw new HttpsError("internal", "Analyse indisponible.");
    }

    if (resp.stop_reason === "refusal") return { ok: false, reason: "refused" };

    let out = null;
    try {
      const txt = (resp.content.find(function (b) { return b.type === "text"; }) || {}).text || "";
      out = JSON.parse(txt);
    } catch (e) {
      return { ok: false, reason: "parse" };
    }

    // Garde serveur : l'alcool ne SORT jamais de cette fonction.
    const raw = Array.isArray(out.drinks) ? out.drinks : [];
    let alcoholExcluded = 0;
    const drinks = [];
    raw.slice(0, 45).forEach(function (d) {
      if (!d || typeof d !== "object") return;
      if (d.isAlcohol) { alcoholExcluded++; return; }
      drinks.push({
        name: String(d.name || "").slice(0, 60),
        brand: String(d.brand || "").slice(0, 30),
        category: CATS.indexOf(d.category) !== -1 ? d.category : "Autre",
        confidence: Math.max(0, Math.min(100, Number(d.confidence) || 0))
      });
    });

    return { ok: true, drinks: drinks, alcoholExcluded: alcoholExcluded };
  }
);
