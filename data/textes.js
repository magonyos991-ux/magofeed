/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. */

/* ============================================================================
   LES TEXTES DITS « EN PASSANT » — messages, confirmations, étiquettes
   ----------------------------------------------------------------------------
   POURQUOI CE FICHIER EXISTE À CÔTÉ DE i18n.js.

   LANGS fonctionne par clés courtes (T.badgeScan) : c'est le bon outil quand on
   écrit l'interface, parce qu'on choisit la clé au moment où on pose le texte.
   Mais l'app porte aussi des centaines de messages nés au fil du travail —
   « Déjà rattaché », « Photo trop lourde », « Merci pour ton soutien » — écrits
   directement dans le code, à 165 endroits pour les seuls toasts.

   Les convertir en clés aurait voulu dire modifier 287 lignes dans un fichier de
   21 000, une par une, sans filet. Le risque d'en casser une est bien réel, et
   le gain identique à celui d'une solution sans risque : ICI, LE TEXTE FRANÇAIS
   EST LA CLÉ. toast("Déjà rattaché") cherche « Déjà rattaché » dans cette table
   et rend la version de la langue courante. Aucun appel n'a besoin de changer.

   CE QUE ÇA COÛTE, ET QUI EST ASSUMÉ :
     - Corriger une faute de frappe française casse le lien avec ses traductions.
       C'est pourquoi outils/verifier-textes.mjs relit la table et signale toute
       entrée qui ne correspond plus à aucun texte du code.
     - Les messages composés (« Déjà rattaché à » + nom du magasin) ne sont pas
       couverts par ce mécanisme. Ils sont listés à part, et se traitent un par
       un, plus tard, avec des clés à trous.

   CE QUI RESTE EN FRANÇAIS, ET C'EST VOULU : les écrans d'administration. Un
   seul utilisateur les ouvre, et il parle français. Les traduire coûterait le
   prix du reste de l'app pour une personne.

   Langues : en ar nl es de it pt tr zh. Le français est la source, il n'est
   donc jamais répété ici.
   ============================================================================ */

var TEXTES = {};

/* Rend le texte dans la langue courante. Inconnu ou langue sans traduction :
   on rend le français d'origine. Un message dans la mauvaise langue reste
   lisible ; un message vide ne l'est pas. */
function tr(fr) {
  try {
    var s = String(fr == null ? "" : fr);
    if (!s) return s;
    var lg = (typeof curLang !== "undefined" && curLang) ? curLang : "fr";
    if (lg === "fr") return s;
    var e = TEXTES[s];
    if (!e) return s;
    return e[lg] || s;
  } catch (e) { return String(fr == null ? "" : fr); }
}
