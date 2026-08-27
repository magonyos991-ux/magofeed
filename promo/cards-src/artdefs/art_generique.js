// Gabarit generique parametrique — canette 33cl (defaut) ou bouteille
// (formats[0].type==="bouteille"). Corps/liquide = degrade de d.color,
// etiquette blanche : MARQUE en capitales grasses sombres (taille adaptee),
// PARFUM en petites capitales couleur foncee du parfum.
ART["generique"]=function(d){
  var c=d.color||'#888888', id=d.id||0;
  var isBottle=!!(d.formats&&d.formats[0]&&d.formats[0].type==="bouteille");
  var cl=(d.formats&&d.formats[0]&&d.formats[0].cl)||33;
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  // ---- textes -------------------------------------------------------------
  var brand=String(d.brand||'').trim()||'?';
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'')
        .replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim()||'Original';
  var BR=brand.toUpperCase(), FL=fl.toUpperCase();
  function split2(T,limit){
    if(T.length<=limit||T.indexOf(' ')<0) return [T];
    var ws=T.split(' '),a='',b='';
    for(var i=0;i<ws.length;i++){ if(a.length<T.length/2) a+=(a?' ':'')+ws[i]; else b+=(b?' ':'')+ws[i]; }
    if(!b){ b=a.split(' ').pop(); a=a.split(' ').slice(0,-1).join(' '); }
    return [a,b];
  }
  var maxW = isBottle? 68 : 74;             // largeur utile de l'etiquette
  var bl=split2(BR,9);
  var bmx=0; for(var i1=0;i1<bl.length;i1++) if(bl[i1].length>bmx) bmx=bl[i1].length;
  var bfs = bmx<=4?21 : bmx<=6?18 : bmx<=8?15 : bmx<=10?12.5 : bmx<=13?10.5 : 9;
  var fll=split2(FL,12);
  var fmx=0; for(var i2=0;i2<fll.length;i2++) if(fll[i2].length>fmx) fmx=fll[i2].length;
  var ffs = fmx<=8?9.5 : fmx<=12?8.5 : 7.5;
  var dkTxt='#23262b', flCol=shade(c,-0.45);
  function line(t,y,fs,w,fill,ls,mw){
    var est=t.length*(fs*0.78+ls);
    var fit=est>mw?' textLength="'+mw+'" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="'+w+'" letter-spacing="'+ls+'" fill="'+fill+'"'+fit+'>'+esc(t)+'</text>';
  }
  // bloc etiquette centre autour de yMid
  function labelBlock(yMid){
    var bh=bl.length*(bfs+2), fh=fll.length*(ffs+2);
    var total=bh+8+fh, y=yMid-total/2+bfs;
    var s='';
    for(var j=0;j<bl.length;j++){ s+=line(bl[j],y,bfs,800,dkTxt,0.5,maxW); y+=bfs+2; }
    y+=3;
    s+='<line x1="100" y1="'+(y-ffs+1)+'" x2="140" y2="'+(y-ffs+1)+'" stroke="'+c+'" stroke-width="2" stroke-linecap="round"/>';
    y+=4;
    for(var k=0;k<fll.length;k++){ s+=line(fll[k],y,ffs,700,flCol,1.1,maxW-8); y+=ffs+2; }
    return s;
  }
  var D='<defs>'
  +'<linearGradient id="gb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.45)+'"/>'
  +'<stop offset="0.16" stop-color="'+shade(c,0.15)+'"/>'
  +'<stop offset="0.5" stop-color="'+c+'"/>'
  +'<stop offset="0.86" stop-color="'+shade(c,-0.35)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.08)+'"/>'
  +'</linearGradient>'
  +'<linearGradient id="gw'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff"/>'
  +'<stop offset="0.55" stop-color="#fdfdfd"/>'
  +'<stop offset="1" stop-color="#e3e4e8"/>'
  +'</linearGradient>'
  +'<linearGradient id="gl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/>'
  +'<stop offset="0.5" stop-color="#aab0b8"/>'
  +'<stop offset="1" stop-color="#71767e"/>'
  +'</linearGradient>'
  +'</defs>';

  if(!isBottle){
    // ================= CANETTE 33cl =================
    var body='M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z';
    return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
    +D
    +'<defs><clipPath id="gc'+id+'"><path d="'+body+'"/></clipPath></defs>'
    +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
    +'<path d="'+body+'" fill="url(#gb'+id+')" stroke="'+shade(c,-0.55)+'" stroke-width="1.4"/>'
    +'<g clip-path="url(#gc'+id+')">'
    // bulles decoratives discretes, positions jitterees par d.id
    +(function(){
      var s='', BX=[95,140,152,90,146,112], BY=[105,90,118,268,282,255], BR=[7,4.5,6,5,7,3.5];
      for(var q=0;q<6;q++){
        var jx=((id*17+q*29)%11)-5, jy=((id*23+q*13)%15)-7;
        s+='<circle cx="'+(BX[q]+jx)+'" cy="'+(BY[q]+jy)+'" r="'+BR[q]+'" fill="'+shade(c,0.3+0.03*(q%3))+'" opacity="0.'+(4+q%2)+'"/>';
      }
      return s;
    })()
    // balayage brillant diagonal
    +'<polygon points="88,58 118,58 78,321 62,321" fill="#fff" opacity="0.09"/>'
    +'</g>'
    // etiquette blanche
    +'<rect x="79" y="140" width="82" height="96" rx="11" fill="url(#gw'+id+')" stroke="'+shade(c,-0.3)+'" stroke-width="1" opacity="0.98"/>'
    +labelBlock(188)
    +'<text x="120" y="306" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="1.5" fill="'+shade(c,0.6)+'">33cl</text>'
    // reflet vertical clair a gauche
    +'<rect x="79" y="76" width="8" height="230" rx="4" fill="#fff" opacity="0.28"/>'
    +'<rect x="81" y="86" width="4" height="120" rx="2" fill="#fff" opacity="0.3"/>'
    // bord droit assombri
    +'<path d="M162,72 L162,306" stroke="#000" stroke-width="7" opacity="0.28" stroke-linecap="round"/>'
    // couvercle aluminium
    +'<path d="M77,58 Q120,50 163,58 L163,63 Q120,71 77,63 Z" fill="url(#gl'+id+')" stroke="#5c6167" stroke-width="1"/>'
    +'<path d="M80,57.2 Q120,50.4 160,57.2" fill="none" stroke="#f4f6f8" stroke-width="2.4" stroke-linecap="round"/>'
    +'<path d="M84,319 Q120,326 156,319" fill="none" stroke="'+shade(c,-0.5)+'" stroke-width="2.4" stroke-linecap="round"/>'
    +'</svg>';
  }

  // ================= BOUTEILLE =================
  var sil='M106,52 L106,86 C106,97 98,104 90,112 C81,121 77,131 77,144 L77,298 C77,313 85,322 100,322 L140,322 C155,322 163,313 163,298 L163,144 C163,131 159,121 150,112 C142,104 134,97 134,86 L134,52 Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +D
  +'<defs><clipPath id="gc'+id+'"><path d="'+sil+'"/></clipPath></defs>'
  +'<ellipse cx="120" cy="336" rx="56" ry="8" fill="#000" opacity="0.16"/>'
  // verre
  +'<path d="'+sil+'" fill="#eef2f5" stroke="'+shade(c,-0.5)+'" stroke-width="1.4"/>'
  +'<g clip-path="url(#gc'+id+')">'
  // liquide (niveau sous le goulot)
  +'<rect x="70" y="80" width="100" height="250" fill="url(#gb'+id+')"/>'
  +'<ellipse cx="120" cy="80" rx="15" ry="4" fill="'+shade(c,0.3)+'"/>'
  // fines bulles montantes dans le liquide, jitterees par d.id
  +(function(){
    var s='';
    for(var q=0;q<5;q++){
      var bx=92+((id*19+q*37)%56), by=130+((id*11+q*53)%160);
      s+='<circle cx="'+bx+'" cy="'+by+'" r="'+(2+q%3)+'" fill="'+shade(c,0.4)+'" opacity="0.5"/>';
    }
    return s;
  })()
  +'<polygon points="92,110 116,110 84,322 68,322" fill="#fff" opacity="0.10"/>'
  +'</g>'
  // etiquette blanche
  +'<rect x="81" y="168" width="78" height="90" rx="9" fill="url(#gw'+id+')" stroke="'+shade(c,-0.3)+'" stroke-width="1"/>'
  +labelBlock(213)
  +'<text x="120" y="288" text-anchor="middle" font-size="9" font-weight="600" letter-spacing="1.3" fill="'+shade(c,0.65)+'">'+cl+'cl</text>'
  // reflet vertical clair a gauche
  +'<rect x="84" y="130" width="7" height="176" rx="3.5" fill="#fff" opacity="0.4"/>'
  +'<rect x="109" y="58" width="4" height="26" rx="2" fill="#fff" opacity="0.5"/>'
  // bord droit assombri
  +'<path d="M157,140 L157,304" stroke="#000" stroke-width="6" opacity="0.2" stroke-linecap="round"/>'
  // bouchon couleur foncee du parfum
  +'<rect x="102" y="32" width="36" height="22" rx="4" fill="'+shade(c,-0.45)+'" stroke="'+shade(c,-0.6)+'" stroke-width="1"/>'
  +'<rect x="102" y="36" width="36" height="2.6" fill="'+shade(c,-0.2)+'" opacity="0.8"/>'
  +'<rect x="102" y="42" width="36" height="2.6" fill="'+shade(c,-0.2)+'" opacity="0.8"/>'
  +'<rect x="106" y="33.5" width="5" height="19" rx="2.5" fill="#fff" opacity="0.25"/>'
  +'</svg>';
};
