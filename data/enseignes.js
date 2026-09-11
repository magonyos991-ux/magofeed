/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. */

/* REFERENCES D'ENSEIGNE — laits vegetaux, jus et boissons lactees.
   Genere par un script (septembre 2026), a ne pas editer a la main.
   Pour chaque enseigne (memes cles que buildChainSets dans index.html) :
     marques : marques vues au catalogue en ligne de l'enseigne -> toutes
               les fiches de la marque deviennent PROBABLES dans ses magasins ;
     ids     : fiches vues une par une (code-barres au catalogue de l'enseigne,
               ou « vendu chez » de la communaute OpenFoodFacts).
   Rayon probable, jamais verifie : c'est la communaute qui confirme en rayon. */
var ENSEIGNE_REFS={
  delhaize:{marques:["alpro","arla","chocomel","emmi","fristi","innocent","inza","joyvalle","materne","minute maid","nesquik","oasis","oatly","ocean spray","yop"],ids:[9,4400,4401,10034,10035,11142,11151,11257]},
  colruyt:{marques:["alpro","campina","chocomel","granini","innocent","materne","minute maid","oasis","oatly"],ids:[1,101,3800,10021,10026,10032,10043,10067,10070,10083,11348,11430]},
  auchan:{marques:["actimel","alpro","andros","arla","bjorg","cecemel","chocomel","innocent","joker","materne","nesquik","oasis","oatly","ocean spray","pago","pressade","sojasun","tropicana","yop"],ids:[]},
  jumbo:{marques:["actimel","alpro","arla","campina","chocomel","emmi","fristi","innocent","minute maid","nesquik","oasis","oatly","ocean spray","pfanner","rude health","yakult"],ids:[]},
};
/* Sources (septembre 2026) :
   delhaize : delhaize.be recherche par marque (96 produits) : arla, chocomel, emmi, fristi, innocent, inza, joyvalle, alpro, materne, minute maid, nesquik, oasis, oatly, ocean spray, yop ; delhaize.be rapprochement par nom : 8 fiches
   colruyt : colruyt.be (catalogue complet, 12674 produits, 12 fiches par GTIN) ; colruyt.be marques >= 3 boissons : granini, alpro, minute maid, campina, materne, oasis, chocomel, innocent, oatly
   auchan : auchan.fr recherche par marque : alpro, oatly, bjorg, sojasun, innocent, tropicana, pago, materne, oasis, joker, pressade, andros, ocean spray, cecemel, chocomel, arla, nesquik, actimel, yop
   jumbo : jumbo.com recherche par marque : alpro, oatly, rude health, innocent, oasis, minute maid, pfanner, ocean spray, chocomel, fristi, yakult, campina, emmi, arla, nesquik, actimel ; jumbo.com EAN lus dans les images : 0 fiches
*/
