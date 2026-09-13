// Gabarit parametrique Coca-Cola — canette de la couleur du parfum (rouge,
// noir pour le zero, argent pour le light), le ruban blanc qui traverse, le nom
// en blanc penche par-dessus, le parfum dessous.
ART["coca-cola"]=function(d){
  var c=d.color||'#c0392b', id=d.id||0;
  var lt=shade(c,0.72), dk=shade(c,-0.45);
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Coca-Cola'),'i'),'')
        .replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim();
  var FL=(fl||'Original').toUpperCase();
  var fs=FL.length<=8?13.5:(FL.length<=12?11.5:(FL.length<=17?10:8.8));
  var fit=FL.length*fs*0.62>94?' textLength="94" lengthAdjust="spacingAndGlyphs"':'';
  /* Le nom doit tenir DANS la canette (96 px) : sans contrainte il etait
     coupe des deux cotes et se lisait « oca-Co ». */
  var nom=String(d.brand||'Coca-Cola');
  var fnom=nom.length<=6?30:(nom.length<=9?25:21);
  var fitn=nom.length*fnom*0.52>90?' textLength="90" lengthAdjust="spacingAndGlyphs"':'';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="Georgia,system-ui,serif">'
  +'<defs>'
  +'<linearGradient id="kb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.32)+'"/><stop offset="0.18" stop-color="'+shade(c,0.10)+'"/>'
  +'<stop offset="0.56" stop-color="'+c+'"/><stop offset="0.88" stop-color="'+shade(c,-0.34)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.08)+'"/></linearGradient>'
  +'<linearGradient id="kl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/><stop offset="0.5" stop-color="#aab0b8"/><stop offset="1" stop-color="#71767e"/></linearGradient>'
  +'<clipPath id="kc'+id+'"><path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"/></clipPath>'
  +'</defs>'
  +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
  +'<path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"'
  +' fill="url(#kb'+id+')" stroke="'+dk+'" stroke-width="1.6"/>'
  +'<g clip-path="url(#kc'+id+')">'
  /* Le ruban : une vague blanche qui traverse toute la canette, releve a
     droite — la signature visuelle qu'on lit meme en vignette. */
  +'<path d="M60,232 C92,200 132,258 186,204 L186,238 C134,288 94,232 60,262 Z" fill="#fff"/>'
  +'<text x="120" y="176" text-anchor="middle" font-size="'+fnom+'" font-style="italic" font-weight="700" letter-spacing="-0.6" fill="#fff"'+fitn+'>'+esc(nom)+'</text>'
  +'<text x="120" y="290" text-anchor="middle" font-family="system-ui,sans-serif" font-size="'+fs+'" font-weight="800" letter-spacing="0.7" fill="'+lt+'"'+fit+'>'+esc(FL)+'</text>'
  +'<rect x="78" y="60" width="13" height="258" rx="6" fill="#fff" opacity="0.16"/>'
  +'</g>'
  +'<path d="M77,58 C90,52 150,52 163,58 L163,66 C150,60 90,60 77,66 Z" fill="url(#kl'+id+')"/>'
  +'<ellipse cx="120" cy="58" rx="43" ry="7" fill="url(#kl'+id+')" stroke="#8d949c" stroke-width="1"/>'
  +'<ellipse cx="120" cy="58" rx="30" ry="4.2" fill="#c9ced4"/>'
  +'<path d="M75,300 C88,308 152,308 165,300 L165,306 C152,314 88,314 75,306 Z" fill="#000" opacity="0.18"/>'
  +'</svg>';
};
