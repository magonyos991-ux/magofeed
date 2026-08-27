// Gabarit parametrique Tango — canette 33cl NOIRE, grande eclaboussure ronde
// energique de la couleur du parfum (5-6 pointes organiques) au centre,
// "TANGO" en enormes capitales blanches penchees par-dessus, le PARFUM en
// capitales couleur claire du parfum sous le nom. Couvercle aluminium.
ART["tango"]=function(d){
  var c=d.color||'#e67e22', id=d.id||0;
  var lt=shade(c,0.55), dk=shade(c,-0.5);
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  // Parfum = nom sans le prefixe de marque, sans parenthese
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Tango'),'i'),'')
        .replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim()||'Original';
  var FL=fl.toUpperCase();
  // decoupe en 2 lignes equilibrees si trop long
  var lines=[FL];
  if(FL.length>10 && FL.indexOf(' ')>-1){
    var ws=FL.split(' '), a='', b='';
    for(var i=0;i<ws.length;i++){ if(a.length<FL.length/2) a+=(a?' ':'')+ws[i]; else b+=(b?' ':'')+ws[i]; }
    if(!b){ b=a.split(' ').pop(); a=a.split(' ').slice(0,-1).join(' '); }
    lines=[a,b];
  }
  var mx=0; for(var j=0;j<lines.length;j++) if(lines[j].length>mx) mx=lines[j].length;
  var fs=mx<=6?15:(mx<=9?13:(mx<=12?11.5:10));
  function tsp(t,y){
    var est=t.length*fs*0.66;
    var fit=est>86?' textLength="86" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="0.6" fill="'+lt+'"'+fit+'>'+esc(t)+'</text>';
  }
  var flavorTxt= lines.length===1 ? tsp(lines[0],258) : tsp(lines[0],251)+tsp(lines[1],251+fs+3);
  // Eclaboussure : 6 pointes energiques, jitter deterministe par d.id,
  // arcs concaves profonds ; ecrasee en x pour tenir dans la canette
  var cx=120, cy=170, n=6, rot=((id*37)%21-10)*Math.PI/180;
  var RO=[56,49,59,52,57,50], AJ=[0.10,-0.15,0.19,-0.08,0.13,-0.17];
  var pts=[];
  for(var k=0;k<n;k++){
    var rr=RO[k]+((id*13+k*7)%9)-4;
    var a=-Math.PI/2 + k*2*Math.PI/n + AJ[k] + rot;
    pts.push([cx+rr*Math.cos(a)*0.8, cy+rr*Math.sin(a)*1.04, a]);
  }
  var sp='M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);
  for(var k2=0;k2<n;k2++){
    var p1=pts[k2], p2=pts[(k2+1)%n];
    var am=p1[2]+Math.PI/n; // angle du creux
    var rv=27+(k2%2?3:-2);
    var qx=cx+rv*Math.cos(am)*0.9, qy=cy+rv*Math.sin(am)*1.04;
    sp+=' Q'+qx.toFixed(1)+','+qy.toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);
  }
  sp+=' Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // corps noir : cylindre, reflet a gauche, bord droit sombre
  +'<linearGradient id="tb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#454549"/>'
  +'<stop offset="0.18" stop-color="#232326"/>'
  +'<stop offset="0.55" stop-color="#111113"/>'
  +'<stop offset="0.88" stop-color="#050506"/>'
  +'<stop offset="1" stop-color="#2b2b2f"/>'
  +'</linearGradient>'
  // couvercle aluminium
  +'<linearGradient id="tl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/>'
  +'<stop offset="0.5" stop-color="#aab0b8"/>'
  +'<stop offset="1" stop-color="#71767e"/>'
  +'</linearGradient>'
  // eclaboussure : radial 3+ stops de d.color
  +'<radialGradient id="ts'+id+'" cx="0.42" cy="0.36" r="0.85">'
  +'<stop offset="0" stop-color="'+shade(c,0.4)+'"/>'
  +'<stop offset="0.45" stop-color="'+shade(c,0.08)+'"/>'
  +'<stop offset="0.8" stop-color="'+c+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.28)+'"/>'
  +'</radialGradient>'
  +'<clipPath id="tc'+id+'"><path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
  // corps de la canette
  +'<path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"'
  +' fill="url(#tb'+id+')" stroke="#000" stroke-width="1.6"/>'
  +'<g clip-path="url(#tc'+id+')">'
  // eclaboussure + gouttelettes
  +'<path d="'+sp+'" fill="url(#ts'+id+')"/>'
  +'<circle cx="82" cy="121" r="4.5" fill="'+c+'"/>'
  +'<circle cx="160" cy="212" r="5" fill="'+c+'"/>'
  +'<circle cx="88" cy="228" r="3.2" fill="'+shade(c,-0.12)+'"/>'
  +'<circle cx="157" cy="109" r="3.5" fill="'+shade(c,0.15)+'"/>'
  // brillance discrete dans l\'eclaboussure
  +'<ellipse cx="106" cy="146" rx="15" ry="8" fill="#fff" opacity="0.14" transform="rotate(-18 106 146)"/>'
  +'</g>'
  // TANGO : enormes capitales blanches penchees (ombre coloree + blanc)
  +'<g transform="rotate(-8 120 178)">'
  +'<text x="122" y="181" text-anchor="middle" font-size="35" font-weight="900" font-style="italic" letter-spacing="0.5" fill="'+dk+'" textLength="98" lengthAdjust="spacingAndGlyphs">TANGO</text>'
  +'<text x="120" y="179" text-anchor="middle" font-size="35" font-weight="900" font-style="italic" letter-spacing="0.5" fill="#ffffff" textLength="98" lengthAdjust="spacingAndGlyphs">TANGO</text>'
  +'</g>'
  // PARFUM en couleur claire du parfum
  +flavorTxt
  // 33cl
  +'<text x="120" y="306" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="1.5" fill="#8b8b90">33cl</text>'
  // reflet vertical clair a gauche
  +'<rect x="79" y="76" width="8" height="230" rx="4" fill="#fff" opacity="0.16"/>'
  +'<rect x="81" y="86" width="4" height="120" rx="2" fill="#fff" opacity="0.22"/>'
  // bord droit assombri
  +'<path d="M162,72 L162,306" stroke="#000" stroke-width="7" opacity="0.35" stroke-linecap="round"/>'
  // couvercle aluminium
  +'<path d="M77,58 Q120,50 163,58 L163,63 Q120,71 77,63 Z" fill="url(#tl'+id+')" stroke="#5c6167" stroke-width="1"/>'
  +'<path d="M80,57.2 Q120,50.4 160,57.2" fill="none" stroke="#f4f6f8" stroke-width="2.4" stroke-linecap="round"/>'
  // assise en bas
  +'<path d="M84,319 Q120,326 156,319" fill="none" stroke="#7d838c" stroke-width="2.6" stroke-linecap="round"/>'
  +'</svg>';
};
