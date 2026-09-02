// Gabarit parametrique Chupa Chups Sparkling — canette SLIM 25cl.
// Identite : corps degrade couleur du parfum, bande blanche centrale facon
// papier de sucette (rayures obliques aux extremites), badge fleur jaune
// 8 petales a coeur rouge "Chupa Chups", "sparkling" en italique puis le
// PARFUM en capitales sous la bande, couvercle aluminium.
ART["chupa chups"]=function(d){
  var c=d.color||'#e74c3c', id=d.id;
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  // Parfum = nom sans le prefixe de marque ni la gamme "Sparkling"
  var fl=String(d.name||'')
    .replace(new RegExp(String(d.brand||'Chupa Chups'),'ig'),'')
    .replace(/chupa\s*chups/ig,'').replace(/sparkling/ig,'')
    .replace(/\s+/g,' ').trim()||'Original';
  // Cesure en 1 ou 2 lignes equilibrees
  var words=fl.toUpperCase().split(' '), lines;
  if(fl.length<=11||words.length===1){lines=[words.join(' ')];}
  else{
    var best=null;
    for(var i=1;i<words.length;i++){
      var a=words.slice(0,i).join(' '), b=words.slice(i).join(' ');
      var m=Math.max(a.length,b.length);
      if(!best||m<best.m)best={m:m,a:a,b:b};
    }
    lines=[best.a,best.b];
  }
  var L=0; for(var j=0;j<lines.length;j++) L=Math.max(L,lines[j].length);
  var fs=lines.length===1?(L<=6?15:L<=8?13.5:L<=10?12:11):(L<=8?12.5:L<=11?11.5:L<=14?10.5:9.5);
  var ls=L<=8?1.4:0.5;
  // Couleur du texte selon la clarte du parfum
  var hx=String(c).replace('#','');
  var lum=(0.299*parseInt(hx.substr(0,2),16)+0.587*parseInt(hx.substr(2,2),16)+0.114*parseInt(hx.substr(4,2),16))/255;
  var tc=lum>0.62?shade(c,-0.62):'#ffffff';
  var cl=(d.formats&&d.formats[0]&&d.formats[0].cl?d.formats[0].cl:25)+' cl';
  // Silhouette de la canette slim
  var P='M84,74 C76,80 71,86 71,94 L71,290 C71,299 74,305 78,311 C81,316 84,319 92,319 L148,319 C156,319 159,316 162,311 C166,305 169,299 169,290 L169,94 C169,86 164,80 156,74 Z';
  // Rayures obliques (papier de sucette torsade), miroir gauche/droite
  var sl='',sr='';
  for(var t=30;t<118;t+=10){
    sl+='<path d="M'+t+',224 L'+(t+42)+',144" stroke="'+c+'" stroke-width="5" opacity="0.95"/>';
  }
  for(var u=124;u<212;u+=10){
    sr+='<path d="M'+u+',224 L'+(u-42)+',144" stroke="'+c+'" stroke-width="5" opacity="0.95"/>';
  }
  // Fleur jaune 8 petales
  var petals='';
  for(var k=0;k<8;k++){
    petals+='<ellipse cx="0" cy="-23" rx="9.5" ry="14" fill="#f9d61b" stroke="#e2b40c" stroke-width="1" transform="rotate('+(k*45)+')"/>';
  }
  // Lignes du parfum
  var ftxt='';
  var y0=lines.length===1?263:255;
  for(var t=0;t<lines.length;t++){
    var len=lines[t].length;
    var est=len*fs*0.7+(len-1)*ls;
    var tfit=est>88?' textLength="88" lengthAdjust="spacingAndGlyphs"':'';
    ftxt+='<text x="120" y="'+(y0+t*fs*1.18)+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="'+ls+'" fill="'+tc+'"'+tfit+'>'+esc(lines[t])+'</text>';
  }
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // corps : degrade vertical du parfum (4 stops)
  +'<linearGradient id="ccb'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.3)+'"/>'
  +'<stop offset="0.42" stop-color="'+c+'"/>'
  +'<stop offset="0.78" stop-color="'+shade(c,-0.16)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.36)+'"/>'
  +'</linearGradient>'
  // galbe cylindrique : reflet a gauche, bord droit assombri
  +'<linearGradient id="cco'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>'
  +'<stop offset="0.17" stop-color="#ffffff" stop-opacity="0.07"/>'
  +'<stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>'
  +'<stop offset="0.78" stop-color="#000000" stop-opacity="0"/>'
  +'<stop offset="0.93" stop-color="#000000" stop-opacity="0.16"/>'
  +'<stop offset="1" stop-color="#000000" stop-opacity="0.32"/>'
  +'</linearGradient>'
  // couvercle aluminium
  +'<linearGradient id="ccl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eef1f3"/>'
  +'<stop offset="0.45" stop-color="#c3cad0"/>'
  +'<stop offset="1" stop-color="#8d959c"/>'
  +'</linearGradient>'
  +'<clipPath id="ccp'+id+'"><path d="'+P+'"/></clipPath>'
  +'<clipPath id="ccsl'+id+'"><rect x="71" y="152" width="24" height="64"/></clipPath>'
  +'<clipPath id="ccsr'+id+'"><rect x="145" y="152" width="24" height="64"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="331" rx="56" ry="8" fill="#000" opacity="0.15"/>'
  // corps colore
  +'<path d="'+P+'" fill="url(#ccb'+id+')"/>'
  +'<g clip-path="url(#ccp'+id+')">'
  // bulles (soda petillant)
  +'<g fill="#ffffff" opacity="0.35">'
  +'<circle cx="100" cy="112" r="3"/><circle cx="128" cy="100" r="2.2"/>'
  +'<circle cx="112" cy="133" r="2"/><circle cx="141" cy="124" r="2.8"/>'
  +'<circle cx="90" cy="139" r="1.8"/><circle cx="98" cy="287" r="2"/>'
  +'<circle cx="143" cy="293" r="2.4"/>'
  +'</g>'
  // bande blanche centrale, papier de sucette
  +'<rect x="71" y="152" width="98" height="64" fill="#ffffff"/>'
  +'<g clip-path="url(#ccsl'+id+')">'+sl+'</g>'
  +'<g clip-path="url(#ccsr'+id+')">'+sr+'</g>'
  +'<line x1="71" y1="152" x2="169" y2="152" stroke="'+shade(c,-0.25)+'" stroke-width="1" opacity="0.45"/>'
  +'<line x1="71" y1="216" x2="169" y2="216" stroke="'+shade(c,-0.25)+'" stroke-width="1" opacity="0.45"/>'
  // ombres internes haut/bas
  +'<rect x="71" y="76" width="98" height="12" fill="#000" opacity="0.06"/>'
  +'<ellipse cx="120" cy="321" rx="46" ry="7" fill="#000" opacity="0.18"/>'
  // galbe + reflet vertical clair a gauche
  +'<rect x="66" y="60" width="108" height="266" fill="url(#cco'+id+')"/>'
  +'<rect x="79" y="102" width="8" height="192" rx="4" fill="#ffffff" opacity="0.4"/>'
  +'</g>'
  // badge fleur pose sur la bande, sur un disque blanc
  +'<g transform="translate(120,184)">'
  +'<circle r="38.5" fill="#ffffff" stroke="'+shade(c,-0.3)+'" stroke-width="1" stroke-opacity="0.25"/>'
  +petals
  +'<circle r="17.5" fill="#e0242a" stroke="#b8161c" stroke-width="1"/>'
  +'<text x="0" y="-2.5" text-anchor="middle" font-size="8" font-style="italic" font-weight="700" fill="#ffffff">Chupa</text>'
  +'<text x="0" y="7.5" text-anchor="middle" font-size="8" font-style="italic" font-weight="700" fill="#ffffff">Chups</text>'
  +'</g>'
  // gamme + parfum sous la bande
  +'<text x="120" y="238" text-anchor="middle" font-size="11" font-style="italic" font-weight="600" letter-spacing="0.5" fill="'+tc+'" opacity="0.92">sparkling</text>'
  +ftxt
  // contenance
  +'<text x="120" y="306" text-anchor="middle" font-size="8.5" font-weight="600" letter-spacing="1" fill="'+tc+'" opacity="0.8">'+cl+'</text>'
  // contour du corps
  +'<path d="'+P+'" fill="none" stroke="'+shade(c,-0.55)+'" stroke-width="1.5" opacity="0.6"/>'
  // couvercle aluminium
  +'<ellipse cx="120" cy="74" rx="38" ry="8.5" fill="url(#ccl'+id+')" stroke="#7d868e" stroke-width="1.5"/>'
  +'<ellipse cx="120" cy="74" rx="30" ry="5.5" fill="#c7ced4" stroke="#939ba3" stroke-width="1"/>'
  +'<rect x="113" y="70" width="14" height="6.5" rx="3" fill="#aab2b9" stroke="#7d868e" stroke-width="1"/>'
  +'<circle cx="117" cy="73.2" r="1.9" fill="#8b939b"/>'
  +'</svg>';
};
