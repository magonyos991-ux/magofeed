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

var ALIAS_MARQUES = {
  "Calpico": ["カルピス", "可尔必思"],
  "Capri-Sun": ["카프리썬"],
  "Chupa Chups": ["珍宝珠", "チュッパチャプス", "츄파춥스", "Чупа-Чупс"],
  "Coca-Cola": ["可口可乐", "كوكا كولا", "コカ・コーラ", "코카콜라", "Кока-Кола", "โคคา-โคล่า"],
  "Dr Pepper": ["胡椒博士", "ドクターペッパー", "닥터페퍼", "Доктор Пеппер"],
  "Fanta": ["芬达", "فانتا", "ファンタ", "환타", "Фанта", "แฟนต้า"],
  "Gatorade": ["佳得乐", "ゲータレード", "게토레이"],
  "Hamoud Boualem": ["حمود بوعلام"],
  "Irn-Bru": ["Ирн-Брю"],
  "Lipton": ["立顿", "ليبتون", "リプトン", "립톤", "Липтон", "ลิปตัน"],
  "Maaza": ["مازا"],
  "Milkis": ["밀키스", "ミルキス", "Милкис"],
  "Mogu Mogu": ["モグモグ", "โมกุ โมกุ"],
  "Monster": ["魔爪", "مونستر", "モンスターエナジー", "몬스터 에너지"],
  "Mountain Dew": ["激浪", "ماونتن ديو", "マウンテンデュー", "마운틴듀", "Маунтин Дью"],
  "Pepsi": ["百事可乐", "بيبسي", "ペプシ", "펩시", "Пепси", "เป๊ปซี่"],
  "Perrier": ["巴黎水", "ペリエ", "페리에", "Перье"],
  "Ramune": ["ラムネ", "弹珠汽水", "라무네"],
  "Rani": ["راني"],
  "Red Bull": ["红牛", "ريد بول", "レッドブル", "레드불", "Ред Булл", "กระทิงแดง"],
  "San Pellegrino": ["圣培露", "サンペレグリノ", "산펠레그리노", "Сан-Пеллегрино"],
  "Schweppes": ["怡泉", "شويبس", "シュウェップス", "슈웹스", "Швепс"],
  "Vimto": ["فيمتو"],
};

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
