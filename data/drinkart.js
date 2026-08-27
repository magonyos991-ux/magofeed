/* Moteur de dessin par boisson — assemble automatiquement (voir artdefs). */
var ART={};
function shade(hex,f){hex=String(hex||'#888').replace('#','');
 var r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);
 if(f>=0){r+=(255-r)*f;g+=(255-g)*f;b+=(255-b)*f;}else{r*=1+f;g*=1+f;b*=1+f;}
 return '#'+[r,g,b].map(function(x){return Math.round(Math.max(0,Math.min(255,x))).toString(16).padStart(2,'0');}).join('');}
function artPourBoisson(d){
  if(!d||!d.brand)return null;
  var b=(d.brand||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  var fn=ART[b]||ART["generique"];
  if(!fn)return null;
  try{return fn(d);}catch(e){return null;}
}
