// Gabarit parametrique Monster — canette haute NOIRE, les trois griffes de la
// couleur du parfum en travers (la signature qu'on reconnait de loin), le nom
// en capitales sous les griffes, le parfum en bas.
ART["monster"]=function(d){
  var c=d.color||'#39ff14', id=d.id||0;
  var lt=shade(c,0.45);
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Monster'),'i'),'')
        .replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim();
  var FL=(fl||'Energy').toUpperCase();
  var fs=FL.length<=8?13:(FL.length<=13?11:(FL.length<=18?9.5:8.4));
  var fit=FL.length*fs*0.78>86?' textLength="86" lengthAdjust="spacingAndGlyphs"':'';
  var nom=String(d.brand||'Monster').toUpperCase();
  var fnom=nom.length<=7?26:(nom.length<=10?21:17);
  var fitn=nom.length*fnom*0.78>90?' textLength="90" lengthAdjust="spacingAndGlyphs"':'';
  /* Trois griffes : des bandes effilees, legerement en biais, un peu decalees
     l'une de l'autre — dessinees en chemins pour rester nettes a 44 px. */
  function griffe(x,ep){
    return 'M'+x+',96 C'+(x+7)+',150 '+(x+3)+',196 '+(x-9)+',250 L'+(x-9+ep)+',252 C'+(x+3+ep*0.7)+',196 '+(x+7+ep*0.6)+',150 '+(x+ep)+',96 Z';
  }
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  +'<linearGradient id="mb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#3b3b40"/><stop offset="0.18" stop-color="#1c1c20"/>'
  +'<stop offset="0.55" stop-color="#0d0d10"/><stop offset="0.88" stop-color="#050506"/>'
  +'<stop offset="1" stop-color="#2a2a2e"/></linearGradient>'
  +'<linearGradient id="ml'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/><stop offset="0.5" stop-color="#aab0b8"/><stop offset="1" stop-color="#71767e"/></linearGradient>'
  +'<linearGradient id="mg'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.35)+'"/><stop offset="1" stop-color="'+shade(c,-0.2)+'"/></linearGradient>'
  +'<clipPath id="mc'+id+'"><path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"/></clipPath>'
  +'</defs>'
  +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
  +'<path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"'
  +' fill="url(#mb'+id+')" stroke="#000" stroke-width="1.6"/>'
  +'<g clip-path="url(#mc'+id+')">'
  +'<path d="'+griffe(96,13)+'" fill="url(#mg'+id+')"/>'
  +'<path d="'+griffe(120,15)+'" fill="url(#mg'+id+')"/>'
  +'<path d="'+griffe(144,13)+'" fill="url(#mg'+id+')"/>'
  +'<text x="120" y="278" text-anchor="middle" font-size="'+fnom+'" font-weight="800" letter-spacing="1.4" fill="#fff"'+fitn+'>'+esc(nom)+'</text>'
  +'<text x="120" y="298" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="0.8" fill="'+lt+'"'+fit+'>'+esc(FL)+'</text>'
  +'<rect x="78" y="60" width="12" height="258" rx="6" fill="#fff" opacity="0.10"/>'
  +'</g>'
  +'<path d="M77,58 C90,52 150,52 163,58 L163,66 C150,60 90,60 77,66 Z" fill="url(#ml'+id+')"/>'
  +'<ellipse cx="120" cy="58" rx="43" ry="7" fill="url(#ml'+id+')" stroke="#8d949c" stroke-width="1"/>'
  +'<ellipse cx="120" cy="58" rx="30" ry="4.2" fill="#c9ced4"/>'
  +'<path d="M75,300 C88,308 152,308 165,300 L165,306 C152,314 88,314 75,306 Z" fill="#000" opacity="0.22"/>'
  +'</svg>';
};
