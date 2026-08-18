/**
 * Magofeed — APERÇU DE PARTAGE pour les fiches qui n'ont pas de page.
 *
 * Le problème : quand on colle un lien dans WhatsApp, Instagram ou TikTok,
 * l'application va lire la page en coulisses et fabrique sa vignette à partir
 * de balises cachées (titre, description, image). Magofeed est une application
 * en UNE page : quelle que soit la boisson partagée, c'est toujours le même
 * index.html qui est lu — donc toujours la même vignette générique.
 *
 * Les 571 boissons du catalogue du fichier ont déjà leur page pré-générée
 * (dossier f/). Mais deux choses n'en ont pas, et ce sont justement les plus
 * partageables :
 *   - les boissons ajoutées par la communauté (elles vivent dans Firestore,
 *     pas dans le fichier : impossible de leur pré-générer une page) ;
 *   - les magasins (un commerçant qui partage sa propre fiche, c'est le
 *     meilleur ambassadeur possible).
 *
 * Cette fonction fabrique la page à la demande : elle lit Firestore, renvoie
 * un vrai HTML avec les bonnes balises, et redirige l'humain vers l'app. Les
 * robots des réseaux sociaux ne suivent pas la redirection — ils lisent les
 * balises et s'arrêtent là. C'est exactement la technique des pages f/.
 *
 * Adresses :
 *   .../fiche?d=<idBoisson>   -> "Où trouver X près de toi"
 *   .../fiche?s=<idMagasin>   -> "X sur Magofeed"
 *
 * ⚠️ Après déploiement, Firebase affiche l'adresse publique de la fonction.
 *    Il faut la coller dans index.html (constante MAGO_FICHE_URL) : sans ça
 *    l'app continue de partager les liens d'avant, sans rien casser.
 *
 * Firebase Functions v2 (Node 18+). Déploiement : voir README.md.
 */
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";                                   // ADAPTE si besoin
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";     // ADAPTE si le domaine change
const IMG_DEFAUT = APP_URL + "icons/icon-512.png";

/* Échappement HTML. Les noms viennent de la communauté : sans ça, une boisson
   nommée avec des chevrons casserait la page — ou pire, y injecterait du code. */
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Photo vérifiée de la boisson : carte partagée meta/drinkImages, écrite par
   les admins. Absente = on retombe sur l'icône de l'app, jamais sur du vide
   (une vignette sans image ne donne envie à personne). */
async function photoBoisson(id) {
  try {
    const snap = await db.collection("meta").doc("drinkImages").get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    if (d.v !== 3) return null;                 // ancienne carte : on l'ignore
    const url = (d.map || {})[String(id)];
    return (typeof url === "string" && /^https:\/\//.test(url)) ? url : null;
  } catch (e) {
    console.warn("fiche: photo:", e && e.message);
    return null;
  }
}

/* La page renvoyée. Un seul modèle pour les deux cas : mêmes balises, même
   redirection, même repli lisible si le navigateur refuse de rediriger. */
function page(o) {
  const cible = esc(o.cible);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.titre)} · Magofeed</title>
<meta name="description" content="${esc(o.desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Magofeed">
<meta property="og:title" content="${esc(o.titre)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${esc(o.image)}">
<meta property="og:url" content="${cible}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.titre)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${esc(o.image)}">
<meta name="theme-color" content="#1a1714">
<link rel="icon" href="${esc(APP_URL)}icons/favicon-32.png">
<meta http-equiv="refresh" content="0;url=${cible}">
<style>
  html,body{height:100%;margin:0}
  body{background:#1a1714;color:#f6f1e9;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
       display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
  .card{max-width:360px}
  .brand{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#c69a57;margin-bottom:14px}
  h1{font-size:22px;font-weight:800;line-height:1.3;margin:0 0 10px}
  p{font-size:14px;line-height:1.6;color:#c9bfb1;margin:0 0 22px}
  a{display:inline-block;background:#c69a57;color:#1a1714;text-decoration:none;
    font-weight:800;font-size:15px;padding:13px 26px;border-radius:14px}
</style>
</head>
<body>
<div class="card">
  <div class="brand">Magofeed</div>
  <h1>${esc(o.titre)}</h1>
  <p>${esc(o.desc)}</p>
  <a href="${cible}">Ouvrir Magofeed</a>
</div>
<script>location.replace(${JSON.stringify(o.cible)});</script>
</body>
</html>`;
}

/* Page de repli : identifiant inconnu, boisson supprimée, panne de lecture.
   On renvoie TOUJOURS un 200 avec une page valide — un lien partagé qui
   affiche une erreur, c'est un lien mort dans une conversation. */
function pageGenerique() {
  return page({
    titre: "Trouve des boissons rares près de chez toi",
    desc: "Magofeed te montre les magasins qui ont la boisson que tu cherches. Gratuit, sans alcool.",
    image: IMG_DEFAUT,
    cible: APP_URL
  });
}

exports.fiche = onRequest({ region: REGION, memory: "256MiB", maxInstances: 10 }, async (req, res) => {
  // 10 min chez le visiteur, 1 h chez les robots des réseaux : une fiche ne
  // change pas toutes les minutes, et ça évite de relire Firestore à chaque
  // aperçu quand un lien tourne beaucoup.
  res.set("Cache-Control", "public, max-age=600, s-maxage=3600");
  res.set("Content-Type", "text/html; charset=utf-8");

  const d = req.query.d, s = req.query.s;
  try {
    // ── Une BOISSON de la communauté ──────────────────────────────────────
    if (d != null && String(d).length && String(d).length < 32) {
      const id = Number(d);
      if (!isFinite(id)) return res.status(200).send(pageGenerique());
      const snap = await db.collection("catalog").where("id", "==", id).limit(1).get();
      if (snap.empty) return res.status(200).send(pageGenerique());
      const x = snap.docs[0].data() || {};
      const nom = String(x.name || "cette boisson").slice(0, 70);
      const marque = String(x.brand || "").slice(0, 40);
      const cat = String(x.cat || "").slice(0, 30);
      const sousTitre = [marque, cat].filter(Boolean).join(" · ");
      return res.status(200).send(page({
        titre: "Où trouver " + nom + " près de toi",
        desc: (sousTitre ? sousTitre + " — " : "") +
              "Magofeed te montre les magasins qui l'ont en stock près de chez toi. Gratuit.",
        image: (await photoBoisson(id)) || IMG_DEFAUT,
        cible: APP_URL + "#drink=" + encodeURIComponent(id)
      }));
    }

    // ── Un MAGASIN ────────────────────────────────────────────────────────
    if (s != null && /^[A-Za-z0-9_-]{1,80}$/.test(String(s))) {
      const snap = await db.collection("stores").doc(String(s)).get();
      if (!snap.exists) return res.status(200).send(pageGenerique());
      const x = snap.data() || {};
      const nom = String(x.name || "Ce magasin").slice(0, 70);
      const n = Array.isArray(x.drinks) ? x.drinks.length : 0;
      return res.status(200).send(page({
        titre: "Ce qui est en stock chez " + nom,
        desc: (n ? n + " boisson" + (n > 1 ? "s" : "") + " référencée" + (n > 1 ? "s" : "") + " ici. " : "") +
              "Vois ce qui est en stock, et signale ce que tu trouves en rayon.",
        image: IMG_DEFAUT,
        cible: APP_URL + "#store=" + encodeURIComponent(String(s))
      }));
    }
  } catch (e) {
    console.warn("fiche:", e && e.message);
  }
  return res.status(200).send(pageGenerique());
});
