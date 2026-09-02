// Gabarit parametrique Mogu Mogu — bouteille PET courte et trapue, epaules
// carrees, petit goulot, bouchon vert. Jus = d.color avec cubes de nata de
// coco blancs, etiquette blanche bordee de la couleur du parfum.
// Gamme "Ice Tea" : bouteille plus haute + bandeau ICE TEA sur l'etiquette.
ART["mogu mogu"]=function(d){
  var c=d.color||'#f39c12', id=d.id;
  var raw=String(d.name||'');
  var ice=/ice\s*tea/i.test(raw);
  // Parfum = nom sans le prefixe de marque (et sans "Ice Tea")
  var fl=raw.replace(/mogu\s*mogu/ig,'').replace(/ice\s*tea/ig,'').replace(/\s+/g,' ').trim()||'Original';
  fl=fl.toUpperCase();
  var n=fl.length;
  var pfs=n<=6?14:(n<=9?13:(n<=12?11:9.5));
  var fit=(pfs*0.62*n)>94?' textLength="94" lengthAdjust="spacingAndGlyphs"':'';
  var dk=shade(c,-0.42);            // couleur foncee du parfum (logo)
  var vg='#3fae5a';                 // vert bouchon
  var t=ice?-30:0;                  // decalage vertical : Ice Tea plus haute
  // micro-variation deterministe par parfum : distingue les parfums
  // auxquels le catalogue donne la meme couleur
  var hs=0; for(var i=0;i<fl.length;i++) hs+=fl.charCodeAt(i);
  var v=((hs%7)-3)*0.03;            // -0.09 .. +0.09
  // etiquette
  var ly=ice?176:184, lh=ice?96:84;
  var my1=ice?216:214, my2=ice?239:240;      // lignes MOGU / MOGU
  var mfs=ice?22:25;
  var py=ice?246:248, pty=ice?259:261.5;     // pastille parfum
  var s='<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // jus : degrade vertical 4 stops de la couleur du parfum
  +'<linearGradient id="mgJ'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.3+v)+'"/>'
  +'<stop offset="0.35" stop-color="'+shade(c,0.08+v)+'"/>'
  +'<stop offset="0.72" stop-color="'+shade(c,v)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.2+v)+'"/>'
  +'</linearGradient>'
  // bouchon vert
  +'<linearGradient id="mgC'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(vg,0.35)+'"/>'
  +'<stop offset="0.5" stop-color="'+vg+'"/>'
  +'<stop offset="1" stop-color="'+shade(vg,-0.35)+'"/>'
  +'</linearGradient>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="336" rx="66" ry="9" fill="#000" opacity="0.13"/>'
  // corps PET trapu, epaules carrees, petit goulot
  +'<path d="M104,'+(76+t)+' L104,'+(85+t)+' C104,'+(91+t)+' 98,'+(93+t)+' 88,'+(97+t)
  +' Q58,'+(106+t)+' 58,'+(126+t)+' L58,304 Q58,326 80,326 L160,326 Q182,326 182,304'
  +' L182,'+(126+t)+' Q182,'+(106+t)+' 152,'+(97+t)+' C142,'+(93+t)+' 136,'+(91+t)+' 136,'+(85+t)
  +' L136,'+(76+t)+' Z" fill="#f2f6f7" stroke="'+shade(c,-0.5)+'" stroke-width="2.5" stroke-linejoin="round"/>'
  // le jus (rempli jusqu au goulot)
  +'<path d="M108,'+(80+t)+' L108,'+(85+t)+' C108,'+(93+t)+' 101,'+(96+t)+' 91,'+(100+t)
  +' Q63,'+(109+t)+' 63,'+(127+t)+' L63,303 Q63,321 81,321 L159,321 Q177,321 177,303'
  +' L177,'+(127+t)+' Q177,'+(109+t)+' 149,'+(100+t)+' C139,'+(96+t)+' 132,'+(93+t)+' 132,'+(85+t)
  +' L132,'+(80+t)+' Z" fill="url(#mgJ'+id+')"/>'
  // ligne d epaule
  +'<path d="M66,'+(122+t)+' Q120,'+(112+t)+' 174,'+(122+t)+'" stroke="'+shade(c,-0.3)+'" stroke-width="2" fill="none" opacity="0.3"/>'
  // cubes de nata de coco (8, blancs, legerement inclines)
  +'<g fill="#fff" opacity="0.95" stroke="'+shade(c,-0.22)+'" stroke-width="1.2">'
  +'<rect x="76" y="'+(136+t)+'" width="14" height="14" rx="2.8" transform="rotate(-12 83 '+(143+t)+')"/>'
  +'<rect x="108" y="'+(126+t)+'" width="13" height="13" rx="2.6" transform="rotate(8 114 '+(132+t)+')"/>'
  +'<rect x="146" y="'+(140+t)+'" width="14" height="14" rx="2.8" transform="rotate(16 153 '+(147+t)+')"/>'
  +'<rect x="90" y="'+(160+t)+'" width="12" height="12" rx="2.4" transform="rotate(-18 96 '+(166+t)+')"/>'
  +'<rect x="128" y="'+(162+t)+'" width="13" height="13" rx="2.6" transform="rotate(5 134 '+(168+t)+')"/>'
  // — en dessous de l etiquette
  +'<rect x="80" y="288" width="14" height="14" rx="2.8" transform="rotate(10 87 295)"/>'
  +'<rect x="118" y="296" width="13" height="13" rx="2.6" transform="rotate(-13 124 302)"/>'
  +'<rect x="150" y="284" width="12" height="12" rx="2.4" transform="rotate(18 156 290)"/>'
  +'</g>'
  // mention nata de coco sur le jus
  +'<text x="120" y="281" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" opacity="0.85" letter-spacing="1">NATA DE COCO</text>'
  // rainures PET du bas
  +'<path d="M63,302 L177,302 M63,310 L177,310" stroke="'+shade(c,-0.3)+'" stroke-width="1.6" opacity="0.3"/>'
  // etiquette blanche joyeuse bordee de la couleur du parfum
  +'<rect x="54" y="'+ly+'" width="132" height="'+lh+'" rx="11" fill="#fff" stroke="'+c+'" stroke-width="5"/>'
  +'<rect x="61" y="'+(ly+7)+'" width="118" height="'+(lh-14)+'" rx="7" fill="none" stroke="'+shade(c,0.55)+'" stroke-width="1.5"/>'
  // points joyeux couleur parfum
  +'<circle cx="71" cy="'+(ly+17)+'" r="3.2" fill="'+shade(c,0.15)+'"/>'
  +'<circle cx="169" cy="'+(ly+17)+'" r="3.2" fill="'+shade(c,0.15)+'"/>'
  +'<circle cx="66" cy="'+(ly+27)+'" r="2" fill="'+shade(c,0.4)+'"/>'
  +'<circle cx="174" cy="'+(ly+27)+'" r="2" fill="'+shade(c,0.4)+'"/>'
  +(ice
    ? '<rect x="82" y="'+(ly+6)+'" width="76" height="15" rx="7.5" fill="'+dk+'"/>'
      +'<text x="120" y="'+(ly+17.2)+'" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" letter-spacing="2">ICE TEA</text>'
    : '')
  // MOGU MOGU en lettres rondes de la couleur foncee du parfum
  +'<text x="120" y="'+my1+'" text-anchor="middle" font-size="'+mfs+'" font-weight="800" fill="'+dk+'" stroke="'+dk+'" stroke-width="2" paint-order="stroke" stroke-linejoin="round" letter-spacing="1.5">MOGU</text>'
  +'<text x="120" y="'+my2+'" text-anchor="middle" font-size="'+mfs+'" font-weight="800" fill="'+dk+'" stroke="'+dk+'" stroke-width="2" paint-order="stroke" stroke-linejoin="round" letter-spacing="1.5">MOGU</text>'
  // le parfum, sur pastille foncee
  +'<rect x="68" y="'+py+'" width="104" height="19" rx="9.5" fill="'+dk+'"/>'
  +'<text x="120" y="'+pty+'" text-anchor="middle" font-size="'+pfs+'" font-weight="700" fill="#fff"'+fit+'>'+fl+'</text>'
  // reflet vertical clair a gauche (au-dessus et en dessous de l etiquette)
  +'<rect x="68" y="'+(132+t)+'" width="10" height="'+(ly-138-t)+'" rx="5" fill="#fff" opacity="0.5"/>'
  +'<rect x="68" y="'+(ly+lh+6)+'" width="10" height="'+(316-ly-lh-6)+'" rx="5" fill="#fff" opacity="0.4"/>'
  +'<path d="M98,'+(94+t)+' Q78,'+(102+t)+' 70,'+(118+t)+'" stroke="#fff" stroke-width="4.5" fill="none" opacity="0.55" stroke-linecap="round"/>'
  // bord droit assombri
  +'<rect x="165" y="'+(132+t)+'" width="9" height="'+(ly-138-t)+'" rx="4.5" fill="'+shade(c,-0.5)+'" opacity="0.2"/>'
  +'<rect x="165" y="'+(ly+lh+6)+'" width="9" height="'+(316-ly-lh-6)+'" rx="4.5" fill="'+shade(c,-0.5)+'" opacity="0.18"/>'
  // goulot + bouchon vert strie
  +'<rect x="100" y="'+(72+t)+'" width="40" height="6" rx="3" fill="'+shade(vg,-0.25)+'"/>'
  +'<rect x="98" y="'+(52+t)+'" width="44" height="22" rx="5" fill="url(#mgC'+id+')"/>'
  +'<path d="M106,'+(55+t)+' L106,'+(71+t)+' M113,'+(54+t)+' L113,'+(72+t)+' M120,'+(54+t)+' L120,'+(72+t)
  +' M127,'+(54+t)+' L127,'+(72+t)+' M134,'+(55+t)+' L134,'+(71+t)+'" stroke="'+shade(vg,-0.4)+'" stroke-width="1.6" opacity="0.6"/>'
  +'<rect x="102" y="'+(55+t)+'" width="4" height="14" rx="2" fill="#fff" opacity="0.4"/>'
  +'</svg>';
  return s;
};
