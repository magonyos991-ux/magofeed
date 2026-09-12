/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. */

/* ============================================================================
   TROUVER UNE MARQUE AVEC UN CLAVIER QUI N'ÉCRIT PAS EN LATIN
   ----------------------------------------------------------------------------
   Quelqu'un en Chine qui cherche Coca-Cola tape 可口可乐. Il n'a pas de clavier
   latin sous la main, et l'app ne trouvait rien. Même chose pour un clavier
   arabe, japonais, coréen, cyrillique ou thaï.

   CE N'EST PAS DE LA TRADUCTION, et la distinction compte. Le nom de la marque
   ne change jamais : Coca-Cola s'appelle Coca-Cola partout et continue de
   s'afficher ainsi. On ajoute seulement des ORTHOGRAPHES qui mènent au même
   produit — une porte d'entrée de plus, pas un second nom.

   CE QUI N'EST PAS ICI, ET POURQUOI. Les marques purement locales — Looza,
   Chaudfontaine, Spa, Hamoud Boualem — n'ont pas de graphie chinoise ou
   coréenne, et en inventer une serait pire que de ne rien mettre : personne ne
   la taperait jamais, et elle encombrerait la recherche. Une liste vide est
   une réponse juste.
   ============================================================================ */

var ALIAS_MARQUES = {};

/* Les alias d'une boisson : ceux de sa marque. On passe par la marque et non
   par la boisson, parce que « Fanta Orange » et « Fanta Citron » se cherchent
   l'une comme l'autre en tapant フаンタ — c'est la marque qu'on tape, jamais
   le parfum. */
function aliasDe(d) {
  try {
    if (!d) return null;
    var m = ALIAS_MARQUES[d.brand];
    return (m && m.length) ? m : null;
  } catch (e) { return null; }
}

/* La requête tape-t-elle dans un alias de cette boisson ?
   On compare en minuscules et sans accents des deux côtés, comme le reste de
   la recherche. Une correspondance PARTIELLE suffit : quelqu'un qui tape 可乐
   (« cola ») doit trouver 可口可乐. */
function aliasTouche(d, requeteNormalisee) {
  var a = aliasDe(d);
  if (!a || !requeteNormalisee) return false;
  for (var i = 0; i < a.length; i++) {
    var x = String(a[i]).toLowerCase();
    if (x.indexOf(requeteNormalisee) !== -1) return true;
  }
  return false;
}
