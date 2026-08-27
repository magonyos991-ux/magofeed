// Gabarit parametrique Milkis — canette 250ml coreenne.
// Identite : moitie haute blanche / moitie basse degradee d.color, separees par
// une vague douce. "MILKIS" bleu #2b6cb8 incline sur le blanc, parfum en petites
// capitales dessous, gouttes de lait stylisees sur la partie coloree.
ART["milkis"]=function(d){
  var c=d.color||'#aed6f1', id=d.id;
  // Parfum = nom sans le prefixe de marque
  var fl=String(d.name||'').replace(new RegExp(String(d.brand||'Milkis'),'ig'),'').replace(/milkis/ig,'').replace(/\s+/g,' ').trim()||'Original';
  var FL=fl.toUpperCase();
  var n=FL.length;
  var fs=n<=5?15:(n<=7?13.5:(n<=9?12:10.5));
  var ls=n<=7?2.4:1.6;
  var est=n*fs*0.72+(n-1)*ls;
  var tfit=est>126?' textLength="126" lengthAdjust="spacingAndGlyphs"':'';
  var flc=shade(c,-0.52);
  // silhouette de la canette
  var P='M62,78 C54,84 48,90 48,98 L48,292 C48,300 52,306 56,312 C59,317 62,320 70,320 L170,320 C178,320 181,317 184,312 C188,306 192,300 192,292 L192,98 C192,90 186,84 178,78 Z';
  // goutte de lait stylisee
  function dp(x,y,s){
    return '<g transform="translate('+x+','+y+') scale('+s+')">'
      +'<path d="M0,-14 C5,-6 9,-1 9,4 A9,9 0 1,1 -9,4 C-9,-1 -5,-6 0,-14 Z" fill="#ffffff" stroke="'+shade(c,-0.35)+'" stroke-width="1.2" stroke-opacity="0.45"/>'
      +'<circle cx="-3" cy="3.5" r="2.4" fill="'+shade(c,0.8)+'" opacity="0.85"/>'
      +'</g>';
  }
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // blanc de la canette (galbe horizontal)
  +'<linearGradient id="mkb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff"/>'
  +'<stop offset="0.5" stop-color="#fbfcfd"/>'
  +'<stop offset="0.82" stop-color="#eef1f4"/>'
  +'<stop offset="1" stop-color="#dbe1e6"/>'
  +'</linearGradient>'
  // bas colore du parfum (4 stops verticaux)
  +'<linearGradient id="mkc'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.32)+'"/>'
  +'<stop offset="0.4" stop-color="'+c+'"/>'
  +'<stop offset="0.75" stop-color="'+shade(c,-0.18)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.38)+'"/>'
  +'</linearGradient>'
  // couvercle aluminium
  +'<linearGradient id="mkl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eef1f3"/>'
  +'<stop offset="0.45" stop-color="#c3cad0"/>'
  +'<stop offset="1" stop-color="#8d959c"/>'
  +'</linearGradient>'
  // galbe cylindrique global
  +'<linearGradient id="mko'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>'
  +'<stop offset="0.16" stop-color="#ffffff" stop-opacity="0.06"/>'
  +'<stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>'
  +'<stop offset="0.78" stop-color="#000000" stop-opacity="0"/>'
  +'<stop offset="0.94" stop-color="#000000" stop-opacity="0.15"/>'
  +'<stop offset="1" stop-color="#000000" stop-opacity="0.3"/>'
  +'</linearGradient>'
  +'<clipPath id="mkp'+id+'"><path d="'+P+'"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="330" rx="72" ry="9" fill="#000" opacity="0.14"/>'
  // corps blanc
  +'<path d="'+P+'" fill="url(#mkb'+id+')"/>'
  +'<g clip-path="url(#mkp'+id+')">'
  // moitie basse coloree, separee par une vague douce
  +'<path d="M40,208 C70,196 95,214 122,206 C150,198 172,206 200,196 L200,345 L40,345 Z" fill="url(#mkc'+id+')"/>'
  // crete de vague laiteuse + seconde vague
  +'<path d="M40,208 C70,196 95,214 122,206 C150,198 172,206 200,196" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" opacity="0.95"/>'
  +'<path d="M40,221 C72,210 98,225 126,218 C152,212 176,219 200,209" fill="none" stroke="'+shade(c,0.55)+'" stroke-width="3" stroke-linecap="round" opacity="0.6"/>'
  // gouttes de lait stylisees
  +dp(92,252,1.05)+dp(143,238,0.72)+dp(126,290,0.9)
  // contenance
  +'<text x="120" y="313" text-anchor="middle" font-size="9.5" font-weight="600" letter-spacing="1" fill="#ffffff" opacity="0.9">250 ml</text>'
  // ombre du fond
  +'<ellipse cx="120" cy="322" rx="68" ry="8" fill="#000" opacity="0.18"/>'
  // ombre sous le couvercle
  +'<rect x="44" y="80" width="152" height="14" fill="#000" opacity="0.05"/>'
  // galbe + reflet vertical clair a gauche, bord droit assombri
  +'<rect x="44" y="60" width="152" height="266" fill="url(#mko'+id+')"/>'
  +'<rect x="57" y="104" width="10" height="200" rx="5" fill="#ffffff" opacity="0.45"/>'
  +'</g>'
  // logo incline + parfum en petites capitales
  +'<g transform="rotate(-7 120 140)">'
  +'<text x="120" y="147" text-anchor="middle" font-size="35" font-weight="800" font-style="italic" fill="#2b6cb8" letter-spacing="1" textLength="128" lengthAdjust="spacingAndGlyphs">MILKIS</text>'
  +'<path d="M64,155 Q120,163 176,151" fill="none" stroke="#2b6cb8" stroke-width="3" stroke-linecap="round" opacity="0.9"/>'
  +'<text x="120" y="179" text-anchor="middle" font-size="'+fs+'" font-weight="700" letter-spacing="'+ls+'" fill="'+flc+'"'+tfit+'>'+FL+'</text>'
  +'</g>'
  // contour du corps
  +'<path d="'+P+'" fill="none" stroke="#8d979f" stroke-width="2" opacity="0.9"/>'
  // couvercle aluminium
  +'<ellipse cx="120" cy="76" rx="58" ry="11.5" fill="url(#mkl'+id+')" stroke="#7d868e" stroke-width="1.5"/>'
  +'<ellipse cx="120" cy="76" rx="47" ry="8" fill="#c7ced4" stroke="#939ba3" stroke-width="1"/>'
  +'<rect x="112" y="71" width="17" height="7.5" rx="3.5" fill="#aab2b9" stroke="#7d868e" stroke-width="1"/>'
  +'<circle cx="117" cy="74.8" r="2.2" fill="#8b939b"/>'
  +'</svg>';
};
