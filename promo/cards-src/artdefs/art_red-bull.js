// Gabarit parametrique Red Bull — canette SLIM haute a la couleur de l'edition
// (les Editions sont des canettes entierement colorees), le damier bleu nuit /
// rouge en biais devant le disque dore : la marque qu'on reconnait a 3 metres.
// Le nom de l'edition est ecrit sous le damier.
ART["red bull"]=function(d){
  var c=d.color||'#1a56db', id=d.id||0;
  var clair=shade(c,0.45), fonce=shade(c,-0.45);
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Red Bull'),'i'),'')
        .replace(/\bEdition\b/ig,' ').replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim();
  var FL=(fl||'Original').toUpperCase();
  // deux lignes si le parfum est long : la canette slim est etroite
  var lignes=[FL];
  if(FL.length>11 && FL.indexOf(' ')>-1){
    var ws=FL.split(' '), a='', b='';
    for(var i=0;i<ws.length;i++){ if(a.length<FL.length/2) a+=(a?' ':'')+ws[i]; else b+=(b?' ':'')+ws[i]; }
    if(!b){ b=a.split(' ').pop(); a=a.split(' ').slice(0,-1).join(' '); }
    lignes=[a,b];
  }
  var mx=0; for(var j=0;j<lignes.length;j++) if(lignes[j].length>mx) mx=lignes[j].length;
  var fs=mx<=6?12:(mx<=9?10.5:(mx<=13?9:8));
  function tsp(t,y){
    var fit=t.length*fs*0.78>58?' textLength="58" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="0.4" fill="#ffffff"'+fit+'>'+esc(t)+'</text>';
  }
  var parfum = lignes.length===1 ? tsp(lignes[0],252) : tsp(lignes[0],246)+tsp(lignes[1],246+fs+2);
  var corps='M92,52 C88,58 87,64 87,72 L87,292 C87,304 90,311 95,316 L97,318 C99,320 102,321 107,321 L133,321 C138,321 141,320 143,318 L145,316 C150,311 153,304 153,292 L153,72 C153,64 152,58 148,52 Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  +'<linearGradient id="rb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.42)+'"/><stop offset="0.2" stop-color="'+shade(c,0.16)+'"/>'
  +'<stop offset="0.55" stop-color="'+c+'"/><stop offset="0.88" stop-color="'+shade(c,-0.35)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,0.06)+'"/></linearGradient>'
  +'<linearGradient id="rl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/><stop offset="0.5" stop-color="#aab0b8"/><stop offset="1" stop-color="#71767e"/></linearGradient>'
  +'<radialGradient id="rs'+id+'" cx="0.4" cy="0.34" r="0.85">'
  +'<stop offset="0" stop-color="#ffe98f"/><stop offset="0.7" stop-color="#f6bd27"/><stop offset="1" stop-color="#d99105"/></radialGradient>'
  +'<clipPath id="rc'+id+'"><path d="'+corps+'"/></clipPath>'
  +'</defs>'
  +'<ellipse cx="120" cy="336" rx="44" ry="7" fill="#000" opacity="0.16"/>'
  +'<path d="'+corps+'" fill="url(#rb'+id+')" stroke="'+shade(c,-0.55)+'" stroke-width="1.4"/>'
  +'<g clip-path="url(#rc'+id+')">'
  /* bandeau clair du haut : les canettes Red Bull ont le tiers superieur plus clair */
  +'<path d="M85,52 L155,52 L155,120 C140,127 100,127 85,120 Z" fill="'+clair+'" opacity="0.55"/>'
  +'<text x="120" y="98" text-anchor="middle" font-size="15" font-weight="800" letter-spacing="0.8" fill="'+fonce+'" textLength="60" lengthAdjust="spacingAndGlyphs">RED BULL</text>'
  /* le disque dore + les deux carres en biais (le taureau stylise en damier) */
  +'<circle cx="120" cy="178" r="33" fill="url(#rs'+id+')"/>'
  +'<path d="M120,140 L152,172 L120,204 L88,172 Z" fill="#0d2f7a"/>'
  +'<path d="M120,166 L152,198 L120,230 L88,198 Z" fill="#cf1226" opacity="0.92"/>'
  +parfum
  +'<rect x="92" y="54" width="9" height="262" rx="4" fill="#fff" opacity="0.34"/>'
  +'<path d="M150,60 L150,314" stroke="#000" stroke-width="6" opacity="0.22" stroke-linecap="round"/>'
  +'</g>'
  +'<path d="M92,52 C102,47 138,47 148,52 L148,60 C138,55 102,55 92,60 Z" fill="url(#rl'+id+')"/>'
  +'<ellipse cx="120" cy="52" rx="30" ry="6" fill="url(#rl'+id+')" stroke="#8d949c" stroke-width="1"/>'
  +'<ellipse cx="120" cy="52" rx="20" ry="3.4" fill="#c9ced4"/>'
  +'<path d="M96,319 Q120,325 144,319" fill="none" stroke="#7d838c" stroke-width="2.4" stroke-linecap="round"/>'
  +'</svg>';
};
