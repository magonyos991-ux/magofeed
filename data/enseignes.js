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
  carrefour:{marques:[],ids:[2,8,16,101,102,901,10004,10056,10065,10066,10068,10089,11004,11031,11214,11251,14599,14851,14852,14853,14854,14859,14861,14890,14892,14903,14905,14909,14921,14922,14923,14925,14927,14928,14929,14930,14935,14936,14942,14951,14982,14983,14984,14987,14997,15133,15134,15135,15179,15201,15204,15205,15216,15253,15256,15267,15278,15280,15448,15450,15461,15495,15591,15592,15593,15594,15595,15598,15607,15616,15620,15621,15631,15794,15806,15826,15833,15837,15839,15845,15861,15892,15909]},
  delhaize:{marques:["alpro","arla","chocomel","emmi","fristi","innocent","inza","joyvalle","materne","minute maid","nesquik","oasis","oatly","ocean spray","yop"],ids:[9,101,3300,4400,4401,10034,10035,11031,11142,11151,11257,11430,14008,14157,14180,14315,14322,14333,14335,14544,14692,14696,14698,14699,14722,14785,14786,14787,14792,14798,14799,14859,14922,14923,14925,14929,15004,15089,15090,15096,15144,15146,15148,15195,15198,15253,15254,15257,15258,15273,15318,15350,15351,15352,15354,15355,15356,15495,15544,15546,15547,15548,15549,15550,15551,15587,15588,15729,15892]},
  colruyt:{marques:["alpro","campina","chocomel","granini","innocent","materne","minute maid","oasis","oatly"],ids:[1,2,8,9,101,902,2101,3300,3800,3801,4201,10003,10019,10021,10024,10026,10032,10034,10035,10043,10056,10060,10065,10066,10067,10070,10083,11031,11220,11282,11348,11412,11430,11440,12007,14001,14003,14004,14005,14006,14009,14012,14013,14014,14015,14016,14020,14022,14024,14025,14030,14037,14093,14116,14119,14156,14157,14160,14163,14164,14170,14172,14174,14303,14304,14309,14324,14325,14326,14333,14337,14340,14341,14536,14537,14687,14689,14692,14698,14699,14862,14864,14865,14892,14899,14906,14928,14940,15089,15093,15194,15200,15253,15349,15350,15351,15387,15588,15729,15850,15851]},
  auchan:{marques:["actimel","alpro","andros","arla","bjorg","cecemel","chocomel","innocent","joker","materne","nesquik","oasis","oatly","ocean spray","pago","pressade","sojasun","tropicana","yop"],ids:[8,101,901,10065,10088,14851,14852,14856,14864,14927,14930,14935,14936,14947,14982,14985,15207,15254,15482,15485,15489,15490,15494,15591,15592,15607,15616,15792,15793,15796]},
  leclerc:{marques:[],ids:[8,10035,10065,10066,11031,14857,14859,14909,14922,14923,14925,14927,14928,14929,14942,14948,14951,15135,15204,15252,15256,15262,15386,15448,15736,15892,15895]},
  intermarche:{marques:[],ids:[10089,14861,14890,14930,14953,14954,14955,14956,14957,14958,14959,14960,14961,14962,14963,14964,15286,15470,15471,15474,15475,15476,15477,15478,15479,15481,15741,15742,15744,15745,15746,15747,15748,15749,15750,15751,15752,15753,15755,15757,15758,15760,15763,15764,15765,15766,15767,15768,15769,15772,15773,15775,15793,15807,15808,15810,15811,15812,15861]},
  monoprix:{marques:[],ids:[8,11005,15254,15271,15356,15357,15495,15552,15555,15559,15567,15793,15794]},
  coursesu:{marques:[],ids:[8,16,101,901,10065,11031,11214,11251,14713,14867,14890,14900,14909,14921,14923,14925,14927,14928,14929,14930,14931,14935,14936,14952,14982,14983,14984,14986,14988,14996,15198,15204,15252,15253,15254,15256,15278,15279,15284,15354,15355,15356,15448,15450,15451,15452,15591,15592,15593,15594,15595,15598,15607,15616,15621,15649,15794,15795,15845,15855,15892]},
  cora:{marques:[],ids:[11214,14856,14925,14940,15254,15257,15264,15283,15359,15360,15362,15363,15365,15366,15368,15371,15373,15376,15377,15378,15380,15381,15390,15448,15452,15861]},
  franprix:{marques:[],ids:[11251,14924,14928,14930,15203]},
  albertheijn:{marques:[],ids:[14943,15092,15622,15636]},
  okay:{marques:[],ids:[9]},
  jumbo:{marques:["actimel","alpro","arla","campina","chocomel","emmi","fristi","innocent","minute maid","nesquik","oasis","oatly","ocean spray","pfanner","rude health","yakult"],ids:[11220,11414,14156,14163,14172,14695,15636]},
};
/* Sources (septembre 2026) :
   carrefour : communaute OpenFoodFacts « vendu chez » : 83 fiches
   delhaize : delhaize.be recherche par marque (96 produits) : arla, chocomel, emmi, fristi, innocent, inza, joyvalle, alpro, materne, minute maid, nesquik, oasis, oatly, ocean spray, yop ; delhaize.be rapprochement par nom : 25 fiches ; communaute OpenFoodFacts « vendu chez » : 45 fiches
   colruyt : colruyt.be (catalogue complet, 12674 produits, 99 fiches par GTIN) ; colruyt.be marques >= 3 boissons : granini, alpro, minute maid, campina, materne, oasis, chocomel, innocent, oatly ; communaute OpenFoodFacts « vendu chez » : 4 fiches
   auchan : auchan.fr recherche par marque : alpro, oatly, bjorg, sojasun, innocent, tropicana, pago, materne, oasis, joker, pressade, andros, ocean spray, cecemel, chocomel, arla, nesquik, actimel, yop ; communaute OpenFoodFacts « vendu chez » : 30 fiches
   leclerc : communaute OpenFoodFacts « vendu chez » : 27 fiches
   intermarche : communaute OpenFoodFacts « vendu chez » : 59 fiches
   monoprix : communaute OpenFoodFacts « vendu chez » : 13 fiches
   coursesu : communaute OpenFoodFacts « vendu chez » : 61 fiches
   cora : communaute OpenFoodFacts « vendu chez » : 26 fiches
   franprix : communaute OpenFoodFacts « vendu chez » : 5 fiches
   albertheijn : communaute OpenFoodFacts « vendu chez » : 4 fiches
   okay : communaute OpenFoodFacts « vendu chez » : 1 fiches
   jumbo : jumbo.com recherche par marque : alpro, oatly, rude health, innocent, oasis, minute maid, pfanner, ocean spray, chocomel, fristi, yakult, campina, emmi, arla, nesquik, actimel ; jumbo.com EAN lus dans les images : 4 fiches ; communaute OpenFoodFacts « vendu chez » : 3 fiches
*/
