/**
 * Magofeed — Scan de frigo par IA (une photo -> TOUTES les boissons visibles).
 *
 * CE QUE ÇA FAIT : l'admin, un gérant avec pass, ou tout contributeur ayant
 * déjà une contribution créditée, photographie le frigo d'un magasin ; Claude regarde l'image et liste chaque boisson
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
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
/* CHARGEMENT PARESSEUX. Cette bibliotheque n'est pas necessaire pour DECRIRE
   les fonctions, seulement pour les EXECUTER. Or « firebase deploy » commence
   par charger tout le code dans un serveur de decouverte, avec dix secondes
   pour repondre : chaque bibliotheque lourde chargee en tete de fichier compte
   dans ce delai, sur une machine froide comme sur une machine chargee.
   Un deploiement echouait ainsi par intermittence sur « User code failed to
   load. Cannot determine backend specification. Timeout after 10000 » — un
   message qui ne nomme ni fichier, ni ligne, ni bibliotheque. On la charge
   donc au premier appel reel, et une seule fois grace au cache de require. */
function chargerAnthropic() { return require("@anthropic-ai/sdk"); }

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
  { region: REGION, secrets: [ANTHROPIC_API_KEY], memory: "512MiB", timeoutSeconds: 120,
    /* Borne la vitesse de depense : sans elle, une boucle ouvre autant
       d'instances que Google en accorde, toutes facturees en parallele. */
    maxInstances: 3 },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");

    /* CONTROLE D'ACCES. Le bouton est cache par du CSS (#sd-admin-tools est en
       display:none pour les autres), mais du CSS n'a jamais protege personne :
       un appel direct a la fonction passait, et chaque appel coute quelques
       centimes. Le serveur decide donc lui-meme : administrateur, ou gerant
       certifie du magasin vise. C'est ce que font deja sauvegarderMaintenant,
       importerHoraires et remplirEnseignes ; celle-ci avait ete oubliee. */
    const adm = await db.collection("admins").doc(uid).get();
    if (!adm.exists) {
      const storeId = String((req.data && req.data.storeId) || "");
      let autorise = false, motif = null, porte = null;
      /* Les deux lectures qui ne dependent pas l'une de l'autre partent
         ensemble : un contributeur ordinaire n'attend pas le tour des gerants. */
      const [mer, u] = await Promise.all([
        db.collection("merchants").doc(uid).get(),
        db.collection("users").doc(uid).get()
      ]);

      /* PORTE 1 — LE GERANT, sur SON magasin, avec un pass.
         OU VIT LE LIEN GERANT-MAGASIN. Il vivait dans stores/{id}.owner, champ
         public : n'importe qui reliait une boutique certifiee au profil
         personnel de celui qui la tient. Il a ete deplace dans merchants/{uid},
         lisible par son seul proprietaire. On lit donc merchants/{uid} d'abord,
         et l'ancien champ seulement en secours, pour ne priver aucun gerant
         certifie de l'ancienne epoque — ceux-la n'ont pas de document
         merchants, on leur reconnait le niveau « frigo ». */
      if (/^[A-Za-z0-9_-]{1,80}$/.test(storeId)) {
        const dm = mer.exists ? (mer.data() || {}) : {};
        const aLui = Array.isArray(dm.stores) && dm.stores.map(String).indexOf(storeId) !== -1;
        if (aLui) {
          autorise = ["frigo", "complet"].indexOf(String(dm.pass || "")) !== -1;
          if (autorise) porte = "gerant";
          else motif = "Le scan de frigo demande le pass commercant. Ouvre la fiche de ton magasin pour l'activer.";
        } else {
          const st = await db.collection("stores").doc(storeId).get();
          if (st.exists && st.data().owner === uid) { autorise = true; porte = "gerant"; }
        }
      }

      /* PORTE 2 — LE CONTRIBUTEUR, sur n'importe quel magasin.
         C'est de loin l'outil de contribution le plus puissant de l'app : une
         photo remplit un rayon entier en vingt secondes. Le reserver a
         l'administrateur, c'etait garder la carte vide. Mais chaque photo est
         un appel payant : on l'ouvre a qui a deja prouve quelque chose.
         Deux conditions, toutes deux verifiees ICI et pas dans l'app :
           - un compte connecte (Google ou e-mail), pas la session anonyme
             qu'on obtient gratuitement en ouvrant la page ;
           - au moins une contribution CREDITEE — pointsPreuves >= 1, un champ
             que seul le serveur ecrit (les regles refusent le client). Les
             compteurs signals/confirms du profil, eux, sont ecrits par l'app :
             ils ne prouvent rien.
         Le pire cas reste borne par les 10 frigos par jour et par personne et
         le plafond global de 120, juste en dessous. */
      if (!autorise) {
        const prov = req.auth.token && req.auth.token.firebase && req.auth.token.firebase.sign_in_provider;
        if (!prov || prov === "anonymous") {
          if (!motif) motif = "Connecte-toi (Google ou e-mail) pour scanner un frigo.";
        } else {
          const preuves = u.exists ? (Number((u.data() || {}).pointsPreuves) || 0) : 0;
          /* Un gerant sans pass qui a contribue passe par ici : c'est voulu.
             Ouvrir le scan aux contributeurs et le refuser au gerant de ce
             magasin-la n'aurait aucun sens. Le pass garde ce qu'il a en propre —
             la signature des boissons, l'annonce — et n'est plus l'unique cle du
             frigo. */
          if (preuves >= 1) { autorise = true; porte = "contributeur"; }
          else if (!motif) motif = "Le scan de frigo s'ouvre apres une premiere contribution : confirme un stock quelque part, puis reviens.";
        }
      }
      if (!autorise) throw new HttpsError("permission-denied", motif || "Reserve aux contributeurs et aux gerants certifies.");
      req._porteFrigo = porte;
    }

    const dataUrl = String((req.data && req.data.image) || "");
    const m = dataUrl.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new HttpsError("invalid-argument", "Image manquante ou format invalide.");
    if (m[2].length > 600000) throw new HttpsError("invalid-argument", "Image trop lourde.");

    /* DEUX PLAFONDS GLOBAUX, PAS UN. Un compte s'obtient gratuitement : le
       plafond par personne ne borne rien face a une poignee de comptes. Le
       plafond global, lui, est la vraie limite de depense — mais s'il etait
       COMMUN, une douzaine de comptes jetables l'epuisaient et l'admin comme
       les gerants trouvaient porte close jusqu'a minuit. Les contributeurs ont
       donc leur enveloppe a eux (60 frigos par jour, ~3 euros au pire) ;
       l'admin et les gerants gardent la leur (120). L'une ne peut pas vider
       l'autre.
       LU ET INCREMENTE DANS LA TRANSACTION. Avant, le compteur etait lu avant
       la transaction puis reecrit avec « valeur lue + 1 » : deux appels
       simultanes lisaient 119, passaient tous les deux, et ecrivaient tous les
       deux 120 — deux photos payees, une seule comptee. Avec trois instances
       en parallele, la seule defense contre la depense sous-comptait. */
    const PLAFOND_JOUR = { contributeur: 60, gerant: 120, admin: 120 };
    const enveloppe = adm.exists ? "admin" : (req._porteFrigo || "contributeur");
    const champGlobal = enveloppe === "contributeur" ? "frigoContrib" : "frigo";
    const jour = new Date().toISOString().slice(0, 10);
    const gRef = db.collection("_meta").doc("aiQuotaGlobal");
    const qRef = db.collection("aiQuota").doc(uid);
    const quota = await db.runTransaction(async (t) => {
      const [gSnap, qSnap] = await Promise.all([t.get(gRef), t.get(qRef)]);
      const gd = gSnap.exists ? gSnap.data() : {};
      const global = gd.jour === jour ? (gd[champGlobal] || 0) : 0;
      if (global >= PLAFOND_JOUR[enveloppe]) return { blocked: "quota-global" };
      const d = qSnap.exists ? qSnap.data() : {};
      const count = d.fday === jour ? (d.fcount || 0) : 0;
      if (count >= 10) return { blocked: "quota" };
      t.set(qRef, { fday: jour, fcount: count + 1 }, { merge: true });
      /* Nouveau jour : on repart de zero sur les deux enveloppes, sinon
         l'increment s'ajouterait a hier. */
      const patch = { jour: jour };
      if (gd.jour !== jour) { patch.frigo = 0; patch.frigoContrib = 0; patch[champGlobal] = 1; }
      else patch[champGlobal] = FieldValue.increment(1);
      t.set(gRef, patch, { merge: true });
      return { blocked: null };
    });
    if (quota.blocked) return { ok: false, reason: quota.blocked };

    const Anthropic = chargerAnthropic();
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
