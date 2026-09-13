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
  carrefour:{marques:[],ids:[2,8,16,102,901,10066,10068,10089,11004,11031,11214,11251,14599,14851,14852,14853,14854,14890,14892,14903,14905,14909,14921,14922,14923,14925,14927,14928,14929,14935,14936,14942,14951,14982,14983,14984,14987,14997]},
  delhaize:{marques:["alpro","arla","chocomel","emmi","fristi","innocent","inza","joyvalle","materne","minute maid","nesquik","oasis","oatly","ocean spray","yop"],ids:[9,4400,4401,10034,10035,11031,11142,11151,11257,14008,14157,14180,14315,14322,14333,14335,14544,14692,14696,14698,14722,14785,14786,14787,14792,14798,14799,14922,14923,14925,14929,15004]},
  colruyt:{marques:["alpro","campina","chocomel","granini","innocent","materne","minute maid","oasis","oatly"],ids:[1,2,8,9,101,902,2101,3300,3800,3801,4201,10003,10019,10021,10024,10026,10032,10034,10035,10043,10056,10065,10066,10067,10070,10083,11031,11220,11282,11348,11412,11430,11440,14001,14003,14004,14005,14006,14009,14012,14013,14014,14015,14016,14020,14022,14024,14025,14030,14037,14093,14116,14119,14156,14157,14160,14163,14164,14170,14172,14174,14303,14304,14309,14324,14325,14326,14333,14337,14340,14341,14536,14537,14687,14689,14692,14698,14699,14862,14865,14892,14899,14906,14928,14940,14998]},
  auchan:{marques:["actimel","alpro","andros","arla","bjorg","cecemel","chocomel","innocent","joker","materne","nesquik","oasis","oatly","ocean spray","pago","pressade","sojasun","tropicana","yop"],ids:[8,901,10088,14851,14852,14856,14927,14935,14936,14947,14982,14985]},
  leclerc:{marques:[],ids:[8,10035,10066,11031,14857,14909,14922,14923,14925,14927,14928,14929,14942,14948,14951]},
  intermarche:{marques:[],ids:[10089,14861,14890,14930,14953,14954,14955,14956,14957,14958,14959,14960,14961,14962,14963,14964]},
  monoprix:{marques:[],ids:[8,11005]},
  coursesu:{marques:[],ids:[8,16,901,11031,11214,11251,14867,14890,14900,14909,14921,14923,14925,14927,14928,14929,14931,14935,14936,14952,14982,14983,14984,14986,14988,14996]},
  cora:{marques:[],ids:[11214,14856,14925,14940]},
  franprix:{marques:[],ids:[11251,14924,14928]},
  albertheijn:{marques:[],ids:[14943]},
  okay:{marques:[],ids:[9]},
  jumbo:{marques:["actimel","alpro","arla","campina","chocomel","emmi","fristi","innocent","minute maid","nesquik","oasis","oatly","ocean spray","pfanner","rude health","yakult"],ids:[11414,14156,14163,14172]},
};
/* Sources (septembre 2026) :
   carrefour : communaute OpenFoodFacts « vendu chez » : 41 fiches
   delhaize : delhaize.be recherche par marque (96 produits) : arla, chocomel, emmi, fristi, innocent, inza, joyvalle, alpro, materne, minute maid, nesquik, oasis, oatly, ocean spray, yop ; delhaize.be rapprochement par nom : 25 fiches ; communaute OpenFoodFacts « vendu chez » : 8 fiches
   colruyt : colruyt.be (catalogue complet, 12674 produits, 85 fiches par GTIN) ; colruyt.be marques >= 3 boissons : granini, alpro, minute maid, campina, materne, oasis, chocomel, innocent, oatly ; communaute OpenFoodFacts « vendu chez » : 3 fiches
   auchan : auchan.fr recherche par marque : alpro, oatly, bjorg, sojasun, innocent, tropicana, pago, materne, oasis, joker, pressade, andros, ocean spray, cecemel, chocomel, arla, nesquik, actimel, yop ; communaute OpenFoodFacts « vendu chez » : 13 fiches
   leclerc : communaute OpenFoodFacts « vendu chez » : 16 fiches
   intermarche : communaute OpenFoodFacts « vendu chez » : 16 fiches
   monoprix : communaute OpenFoodFacts « vendu chez » : 2 fiches
   coursesu : communaute OpenFoodFacts « vendu chez » : 27 fiches
   cora : communaute OpenFoodFacts « vendu chez » : 4 fiches
   franprix : communaute OpenFoodFacts « vendu chez » : 3 fiches
   albertheijn : communaute OpenFoodFacts « vendu chez » : 1 fiches
   okay : communaute OpenFoodFacts « vendu chez » : 1 fiches
   jumbo : jumbo.com recherche par marque : alpro, oatly, rude health, innocent, oasis, minute maid, pfanner, ocean spray, chocomel, fristi, yakult, campina, emmi, arla, nesquik, actimel ; jumbo.com EAN lus dans les images : 4 fiches
*/
