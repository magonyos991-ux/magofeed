// Gabarit parametrique Pepsi — canette 33cl de la couleur du parfum, le disque
// bicolore (rouge en haut, bleu en bas, vague blanche au milieu) au centre, le
// nom de la marque en blanc dessous, le parfum en teinte claire tout en bas.
// Dessin stylise : on cherche la silhouette et les couleurs qu'on reconnait en
// rayon, pas la reproduction d'un logo.
ART["pepsi"]=function(d){
  var c=d.color||'#1a56db', id=d.id||0;
  var lt=shade(c,0.62), dk=shade(c,-0.45);
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Pepsi'),'i'),'')
        .replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim();
  var FL=(fl||'Original').toUpperCase();
  var fs=FL.length<=7?14:(FL.length<=11?12:(FL.length<=15?10.5:9));
  var fit=FL.length*fs*0.62>92?' textLength="92" lengthAdjust="spacingAndGlyphs"':'';
  /* Le disque : deux demi-disques separes par une vague. Les couleurs sont
     celles du produit, pas celles du parfum — c'est ce qui le rend
     reconnaissable ; le parfum, lui, colore la canette. */
  var CX=120, CY=163, R=47;
  /* La vague blanche doit rester lisible a 44 px : on l'epaissit (7 px) et on
     la fait onduler nettement, sinon le disque se lit comme deux aplats colles. */
  var haut='M'+(CX-R)+','+(CY-4)+' A'+R+','+R+' 0 0 1 '+(CX+R)+','+(CY-4)+' C'+(CX+20)+','+(CY-15)+' '+(CX-18)+','+(CY+3)+' '+(CX-R)+','+(CY-4)+' Z';
  var bas ='M'+(CX-R)+','+(CY+6)+' C'+(CX-18)+','+(CY+13)+' '+(CX+20)+','+(CY-5)+' '+(CX+R)+','+(CY+6)+' A'+R+','+R+' 0 0 1 '+(CX-R)+','+(CY+6)+' Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  +'<linearGradient id="pb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.30)+'"/><stop offset="0.17" stop-color="'+shade(c,0.10)+'"/>'
  +'<stop offset="0.55" stop-color="'+c+'"/><stop offset="0.88" stop-color="'+shade(c,-0.34)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.10)+'"/></linearGradient>'
  +'<linearGradient id="pl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/><stop offset="0.5" stop-color="#aab0b8"/><stop offset="1" stop-color="#71767e"/></linearGradient>'
  +'<clipPath id="pc'+id+'"><path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"/></clipPath>'
  +'</defs>'
  +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
  +'<path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"'
  +' fill="url(#pb'+id+')" stroke="'+dk+'" stroke-width="1.6"/>'
  +'<g clip-path="url(#pc'+id+')">'
  +'<rect x="72" y="86" width="96" height="4" fill="#fff" opacity="0.10"/>'
  +'<circle cx="'+CX+'" cy="'+CY+'" r="'+(R+5)+'" fill="#fff"/>'
  +'<path d="'+haut+'" fill="#e32934"/>'
  +'<path d="'+bas+'" fill="#0a4fa0"/>'
  +'<text x="120" y="238" text-anchor="middle" font-size="34" font-weight="800" letter-spacing="-1.5" fill="#fff">'+esc((d.brand||'pepsi').toLowerCase())+'</text>'
  +'<text x="120" y="266" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="0.8" fill="'+lt+'"'+fit+'>'+esc(FL)+'</text>'
  +'<rect x="78" y="60" width="13" height="258" rx="6" fill="#fff" opacity="0.16"/>'
  +'</g>'
  +'<path d="M77,58 C90,52 150,52 163,58 L163,66 C150,60 90,60 77,66 Z" fill="url(#pl'+id+')"/>'
  +'<ellipse cx="120" cy="58" rx="43" ry="7" fill="url(#pl'+id+')" stroke="#8d949c" stroke-width="1"/>'
  +'<ellipse cx="120" cy="58" rx="30" ry="4.2" fill="#c9ced4"/>'
  +'<path d="M75,300 C88,308 152,308 165,300 L165,306 C152,314 88,314 75,306 Z" fill="#000" opacity="0.18"/>'
  +'</svg>';
};
