// Gabarit parametrique Fanta — canette de la couleur du parfum, la grande
// volute blanche en diagonale (la « swirl » qu'on reconnait de loin), le nom
// de la marque en blanc arrondi par-dessus, le parfum en dessous.
ART["fanta"]=function(d){
  var c=d.color||'#e67e22', id=d.id||0;
  var lt=shade(c,0.68), dk=shade(c,-0.42);
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Fanta'),'i'),'')
        .replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim();
  var FL=(fl||'Orange').toUpperCase();
  var fs=FL.length<=8?13.5:(FL.length<=12?11.5:(FL.length<=17?10:8.8));
  var fit=FL.length*fs*0.62>94?' textLength="94" lengthAdjust="spacingAndGlyphs"':'';
  /* Le nom de la marque doit tenir DANS la canette (96 px de large) : sans
     cette contrainte il debordait a droite et se faisait couper. */
  var nom=String(d.brand||'Fanta'), fnom=nom.length<=6?36:(nom.length<=9?29:24);
  var fitn=nom.length*fnom*0.58>92?' textLength="92" lengthAdjust="spacingAndGlyphs"':'';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  +'<linearGradient id="fb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.34)+'"/><stop offset="0.18" stop-color="'+shade(c,0.12)+'"/>'
  +'<stop offset="0.56" stop-color="'+c+'"/><stop offset="0.88" stop-color="'+shade(c,-0.32)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.08)+'"/></linearGradient>'
  +'<linearGradient id="fl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/><stop offset="0.5" stop-color="#aab0b8"/><stop offset="1" stop-color="#71767e"/></linearGradient>'
  +'<clipPath id="fc'+id+'"><path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"/></clipPath>'
  +'</defs>'
  +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
  +'<path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"'
  +' fill="url(#fb'+id+')" stroke="'+dk+'" stroke-width="1.6"/>'
  +'<g clip-path="url(#fc'+id+')">'
  /* Les deux volutes : une large en blanc, une plus fine en teinte foncee
     juste dessous, comme le tourbillon de fruit du vrai emballage. */
  +'<path d="M60,206 C96,168 128,214 178,150 L186,178 C136,246 100,196 62,232 Z" fill="#fff" opacity="0.95"/>'
  +'<path d="M60,232 C98,198 126,240 182,182 L186,196 C132,262 96,222 60,248 Z" fill="'+dk+'" opacity="0.55"/>'
  +'<text x="120" y="146" text-anchor="middle" font-size="'+fnom+'" font-weight="800" letter-spacing="-1.2" fill="#fff" stroke="'+dk+'" stroke-width="1.4" paint-order="stroke" stroke-linejoin="round"'+fitn+'>'+esc(nom)+'</text>'
  +'<text x="120" y="286" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="0.7" fill="'+lt+'"'+fit+'>'+esc(FL)+'</text>'
  +'<rect x="78" y="60" width="13" height="258" rx="6" fill="#fff" opacity="0.16"/>'
  +'</g>'
  +'<path d="M77,58 C90,52 150,52 163,58 L163,66 C150,60 90,60 77,66 Z" fill="url(#fl'+id+')"/>'
  +'<ellipse cx="120" cy="58" rx="43" ry="7" fill="url(#fl'+id+')" stroke="#8d949c" stroke-width="1"/>'
  +'<ellipse cx="120" cy="58" rx="30" ry="4.2" fill="#c9ced4"/>'
  +'<path d="M75,300 C88,308 152,308 165,300 L165,306 C152,314 88,314 75,306 Z" fill="#000" opacity="0.18"/>'
  +'</svg>';
};
