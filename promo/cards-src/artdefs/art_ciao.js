// Gabarit parametrique « Ciao » (la boisson energisante de Squeezie) : canette
// SLIM 250 ml en aluminium brosse teinte dans la couleur du parfum (d.color),
// col et pied argent. Wordmark CIAO trace en chemins (capitales geometriques
// annees 70 : C ouvert, I-feuille, A sans barre, O a l'eclat) pose en blanc
// argent le long de la canette, « ENERGY » italique en bas dans la teinte claire
// du parfum, « GOÛT <PARFUM> » vertical a gauche, petite feuille en haut a gauche.
// Pas de fruit : seule la couleur distingue les parfums, comme sur le vrai produit.
// La gamme Kombucha n'existe plus au catalogue : si une bouteille Kombucha arrive
// quand meme ici, on retombe sur le gabarit generique plutot que de planter.
ART["ciao"]=function(d){
  if(/kombucha/i.test(String(d.name||''))&&ART["generique"])return ART["generique"](d);
  // Parfum = nom sans « Ciao » ni « Energy »
  var fl=String(d.name||'').replace(/ciao/ig,'').replace(/energy/ig,'').replace(/\([^)]*\)?/g,'')
        .replace(/\s+/g,' ').trim()||'Original';
  var key=fl.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  // Teintes reelles des 6 parfums (base / teinte claire des textes) ; d.color
  // reste prioritaire pour la base, la teinte claire vient de la table ou de shade().
  var T={'double litchi':['#3B1E78','#A98BF0'],'kiwi concombre':['#0F4A3A','#46D79B'],
         'coco citron vert':['#142A66','#39B6F0'],'peche blanche':['#E24A1C','#F7B45B'],
         'pomme rhubarbe':['#B5177E','#F3A6D8'],'abricot framboise':['#A8163F','#F08CA8']};
  var t=T[key]||null;
  var c=d.color||(t?t[0]:'#3B1E78'), lt=t?t[1]:shade(c,0.55);
  var id=d.id||0, uid='ci'+id, F='system-ui,sans-serif';
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  // « GOÛT PARFUM » vertical, lu de bas en haut : 1 ou 2 lignes (GOÛT + 1er mot / reste)
  var FL=fl.toUpperCase(), ws=FL.split(' ');
  var l1='GOÛT '+ws[0], l2=ws.slice(1).join(' ');
  function vtx(s,x,y0,fs){
    var est=s.length*fs*0.7;
    var fit=est>118?' textLength="118" lengthAdjust="spacingAndGlyphs"':'';
    return '<text transform="translate('+x+','+y0+') rotate(-90)" font-family="'+F+'" font-size="'+fs+'" font-weight="800" letter-spacing="0.8" fill="'+lt+'"'+fit+'>'+esc(s)+'</text>';
  }
  var side=l2?vtx(l1,88,240,8.2)+vtx(l2,96,240,8.2):vtx(l1,92,240,8.5);
  // Brossage : fines bandes verticales claires/sombres, positions fixes (pas de hasard)
  var BW=[[84,3,0.2],[90,1.2,0.1],[97,2,0.05],[103,1,0.08],[109,3,0.04],[116,1.4,0.07],[123,2.4,0.05],
          [130,1,0.08],[136,2,0.05],[142,1.4,0.07],[148,3,0.05],[153,1.2,0.12]];
  var brush='';
  for(var i=0;i<BW.length;i++){
    brush+='<rect x="'+BW[i][0]+'" y="60" width="'+BW[i][1]+'" height="262" fill="#fff" opacity="'+BW[i][2]+'"/>';
  }
  brush+='<rect x="100" y="60" width="1.2" height="262" fill="#000" opacity="0.08"/>'
        +'<rect x="127" y="60" width="1.6" height="262" fill="#000" opacity="0.07"/>'
        +'<rect x="146" y="60" width="1.2" height="262" fill="#000" opacity="0.1"/>';
  // Wordmark CIAO en chemins (hauteur de capitale 100, ligne de base y=0)
  var C='M90.5,-20.6 A50,50 0 1 1 90.5,-79.4 L66.2,-61.8 A20,20 0 1 0 66.2,-38.2 Z';    // C ouvert a droite
  var I='M6,0 L6,-72 L34,-72 L34,0 Z M20,-76 C8,-88 10,-106 30,-112 C42,-98 38,-82 20,-76 Z';   // I : fut droit, feuille en guise de point
  var A='M0,0 L34,-100 L62,-100 L96,0 L70,0 L61,-26 L35,-26 L26,0 Z M40,-48 L48,-74 L56,-48 Z'; // A : deux jambes, barre, contre-poincon triangulaire
  var O='M50,-100 A50,50 0 1 0 50.1,-100 Z M18,-24 C28,-54 52,-76 84,-78 C74,-48 50,-26 18,-24 Z'; // O a l'eclat en feuille
  var word='<g fill="url(#'+uid+'w)">'
    +'<path d="'+C+'"/>'
    +'<path d="'+I+'" transform="translate(100,0)" fill-rule="evenodd"/>'
    +'<path d="'+A+'" transform="translate(152,0)" fill-rule="evenodd"/>'
    +'<path d="'+O+'" transform="translate(256,0)" fill-rule="evenodd"/>'
    +'</g>';
  var body='M87,58 L153,58 L161,72 L161,306 C161,313 155,317 146,318 L94,318 C85,317 79,313 79,306 L79,72 Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="'+F+'">'
  +'<defs>'
  // corps : cylindre teinte, reflet a gauche, bord droit sombre
  +'<linearGradient id="'+uid+'b" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.18)+'"/>'
  +'<stop offset="0.12" stop-color="'+shade(c,0.06)+'"/>'
  +'<stop offset="0.42" stop-color="'+c+'"/>'
  +'<stop offset="0.76" stop-color="'+shade(c,-0.2)+'"/>'
  +'<stop offset="0.93" stop-color="'+shade(c,-0.48)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.3)+'"/>'
  +'</linearGradient>'
  // aluminium argent (couvercle, pied)
  +'<linearGradient id="'+uid+'m" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#f2f3f5"/>'
  +'<stop offset="0.45" stop-color="#c3c7cd"/>'
  +'<stop offset="1" stop-color="#7c8189"/>'
  +'</linearGradient>'
  // sheen argent du wordmark
  +'<linearGradient id="'+uid+'w" x1="0" y1="0" x2="1" y2="1">'
  +'<stop offset="0" stop-color="#fff"/>'
  +'<stop offset="0.5" stop-color="#e9e9ee"/>'
  +'<stop offset="1" stop-color="#fff"/>'
  +'</linearGradient>'
  +'<clipPath id="'+uid+'c"><path d="'+body+'"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="330" rx="50" ry="7" fill="#000" opacity="0.15"/>'
  // pied argent (visible sous le corps)
  +'<path d="M83,300 L157,300 L157,316 C157,323 150,327 141,327 L99,327 C90,327 83,323 83,316 Z" fill="url(#'+uid+'m)"/>'
  +'<path d="M86,322 Q120,330 154,322" fill="none" stroke="#6d727a" stroke-width="1.2" opacity="0.6"/>'
  // corps de la canette
  +'<path d="'+body+'" fill="url(#'+uid+'b)"/>'
  +'<g clip-path="url(#'+uid+'c)">'
  +brush
  // feuille stylisee en haut a gauche
  +'<g transform="translate(91,84) scale(0.9)" fill="'+lt+'">'
  +'<path d="M0,0 C-4,-1 -8,-4 -9,-8 C-6,-9 -3,-8 0,-6 C-1,-10 0,-14 3,-17 C6,-14 7,-10 6,-6 C9,-8 12,-9 15,-8 C14,-4 10,-1 6,0 L3,4 Z"/>'
  +'</g>'
  // « + CAFÉINE GUARANA » et « faible en calories », minuscules, en teinte claire
  +'<text transform="translate(88.5,158) rotate(-90)" font-family="'+F+'" font-size="4.6" font-weight="700" letter-spacing="1" fill="'+lt+'" opacity="0.9">+ CAFÉINE GUARANA</text>'
  +'<text transform="translate(88.5,302) rotate(-90)" font-family="'+F+'" font-size="4.6" font-weight="600" letter-spacing="0.6" fill="'+lt+'" opacity="0.9">faible en calories</text>'
  // parfum vertical
  +side
  // wordmark CIAO : pose le long de la canette (lu de haut en bas), glyphes penches
  +'<g transform="translate(126,180) rotate(90) skewX(18) scale(0.56) translate(-178,50)">'+word+'</g>'
  // ENERGY italique gras en bas
  +'<text x="124" y="304" text-anchor="middle" font-family="'+F+'" font-style="italic" font-weight="900" font-size="15" letter-spacing="0.5" fill="'+lt+'" textLength="64" lengthAdjust="spacingAndGlyphs">ENERGY</text>'
  // 250ml
  +'<text x="122" y="313" text-anchor="middle" font-family="'+F+'" font-size="4.8" font-weight="500" letter-spacing="0.4" fill="#fff" opacity="0.8">250ml | Zero Bullshit</text>'
  // reflet principal a gauche + bord droit assombri
  +'<rect x="83" y="60" width="6" height="262" fill="#fff" opacity="0.18"/>'
  +'<rect x="155" y="60" width="6" height="262" fill="#000" opacity="0.22"/>'
  +'</g>'
  // col : fine bande argent sous le couvercle
  +'<path d="M87,58 L153,58 L154.5,61 L85.5,61 Z" fill="url(#'+uid+'m)"/>'
  // couvercle aluminium
  +'<ellipse cx="120" cy="58" rx="33" ry="6.5" fill="url(#'+uid+'m)" stroke="#6d727a" stroke-width="0.8"/>'
  +'<ellipse cx="120" cy="57.6" rx="26" ry="4.2" fill="#d4d7dc" stroke="#9aa0a8" stroke-width="0.7"/>'
  +'<ellipse cx="120" cy="57.6" rx="7" ry="1.8" fill="none" stroke="#9aa0a8" stroke-width="0.9"/>'
  +'<rect x="116" y="55.4" width="12" height="3.4" rx="1.7" fill="#9aa0a8"/>'
  +'</svg>';
};


