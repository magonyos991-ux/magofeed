// Gabarit parametrique Schweppes — canette a la couleur du parfum, medaillon
// ovale blanc cercle d'or au centre avec « Schweppes » en italique, le parfum
// dessous, et les bulles qui montent (l'eau petillante d'origine).
ART["schweppes"]=function(d){
  var c=d.color||'#f1c40f', id=d.id||0;
  var fonce=shade(c,-0.55);
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Schweppes'),'i'),'')
        .replace(/\bSelection\b/ig,' ').replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim();
  var FL=(fl||'Tonic').toUpperCase();
  var lignes=[FL];
  if(FL.length>11 && FL.indexOf(' ')>-1){
    var ws=FL.split(' '), a='', b='';
    for(var i=0;i<ws.length;i++){ if(a.length<FL.length/2) a+=(a?' ':'')+ws[i]; else b+=(b?' ':'')+ws[i]; }
    if(!b){ b=a.split(' ').pop(); a=a.split(' ').slice(0,-1).join(' '); }
    lignes=[a,b];
  }
  var mx=0; for(var j=0;j<lignes.length;j++) if(lignes[j].length>mx) mx=lignes[j].length;
  var fs=mx<=6?14:(mx<=9?12:(mx<=13?10.5:9));
  function tsp(t,y){
    var fit=t.length*fs*0.78>84?' textLength="84" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="0.7" fill="#ffffff"'+fit+'>'+esc(t)+'</text>';
  }
  var parfum = lignes.length===1 ? tsp(lignes[0],254) : tsp(lignes[0],248)+tsp(lignes[1],248+fs+2);
  // bulles deterministes par d.id
  var bulles='';
  for(var k=0;k<9;k++){
    var bx=84+((id*17+k*29)%72), by=96+((id*23+k*41)%196), br=1.6+((id+k*5)%4)*0.7;
    bulles+='<circle cx="'+bx+'" cy="'+by+'" r="'+br.toFixed(1)+'" fill="#fff" opacity="0.30"/>';
  }
  var corps='M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  +'<linearGradient id="sb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.4)+'"/><stop offset="0.2" stop-color="'+shade(c,0.14)+'"/>'
  +'<stop offset="0.55" stop-color="'+c+'"/><stop offset="0.88" stop-color="'+shade(c,-0.38)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,0.04)+'"/></linearGradient>'
  +'<linearGradient id="sl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/><stop offset="0.5" stop-color="#aab0b8"/><stop offset="1" stop-color="#71767e"/></linearGradient>'
  +'<clipPath id="sc'+id+'"><path d="'+corps+'"/></clipPath>'
  +'</defs>'
  +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
  +'<path d="'+corps+'" fill="url(#sb'+id+')" stroke="'+fonce+'" stroke-width="1.5"/>'
  +'<g clip-path="url(#sc'+id+')">'
  +bulles
  /* medaillon ovale : le sceau Schweppes */
  +'<ellipse cx="120" cy="168" rx="46" ry="40" fill="#ffffff" opacity="0.96"/>'
  +'<ellipse cx="120" cy="168" rx="46" ry="40" fill="none" stroke="#c9a227" stroke-width="3"/>'
  +'<ellipse cx="120" cy="168" rx="39" ry="33" fill="none" stroke="'+fonce+'" stroke-width="1.4" opacity="0.5"/>'
  +'<text x="120" y="167" text-anchor="middle" font-size="17" font-weight="800" font-style="italic" fill="'+fonce+'" textLength="76" lengthAdjust="spacingAndGlyphs">Schweppes</text>'
  +'<path d="M84,176 Q120,186 156,176" fill="none" stroke="#c9a227" stroke-width="2.2" stroke-linecap="round"/>'
  +'<text x="120" y="195" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1.2" fill="#c9a227" textLength="52" lengthAdjust="spacingAndGlyphs">DEPUIS 1783</text>'
  +parfum
  +'<rect x="79" y="76" width="8" height="230" rx="4" fill="#fff" opacity="0.28"/>'
  +'<path d="M162,72 L162,306" stroke="#000" stroke-width="7" opacity="0.2" stroke-linecap="round"/>'
  +'</g>'
  +'<path d="M77,58 Q120,50 163,58 L163,63 Q120,71 77,63 Z" fill="url(#sl'+id+')" stroke="#5c6167" stroke-width="1"/>'
  +'<path d="M80,57.2 Q120,50.4 160,57.2" fill="none" stroke="#f4f6f8" stroke-width="2.4" stroke-linecap="round"/>'
  +'<path d="M84,319 Q120,326 156,319" fill="none" stroke="#7d838c" stroke-width="2.6" stroke-linecap="round"/>'
  +'</svg>';
};
