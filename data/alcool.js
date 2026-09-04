/* ============================================================================
   MAGOFEED — LEXIQUE ANTI-ALCOOL
   ----------------------------------------------------------------------------
   Magofeed est 100 % sans alcool. Choix du fondateur, non negociable : les
   bieres et vins « 0,0 % » sont refuses aussi, et le mot « beer » n'a pas sa
   place dans l'app, meme pour un ginger beer.

   Ce fichier est la seule liste. Elle est lue par nameLooksAlcoholic() et
   offIsAlcoholic() (index.html). Trois familles :
     ALCOOL_MOTS     mots entiers (apres normTxt : minuscules, sans accents),
                     dans toutes les langues qu'on a pu reunir
     ALCOOL_RACINES  racines cherchees SANS frontiere de mot a gauche
                     (« Rotwein », « Tafelbier », « Weisswein »)
     ALCOOL_SCRIPTS  formes en ecriture non latine (arabe, hebreu, cyrillique,
                     grec, japonais, chinois, coreen, thai, hindi...), cherchees
                     telles quelles dans le texte brut
     ALCOOL_MARQUES  marques dont le nom seul suffit (Jupiler, Smirnoff...)
     ALCOOL_FAUX     ce qu'on retire du texte AVANT de chercher, pour ne pas
                     bloquer un ginger ale, un vinaigre ou une vitamine

   Un faux positif se corrige d'un tap dans l'app (« La fiche se trompe ? ») ;
   un vrai alcool qui passe, non. En cas de doute, le mot est dans la liste.
   ============================================================================ */
var ALCOOL_FAUX = [
  /ginger[- ]?ale/g, /gingembre/g, /ginger/g, /vinaigres?/g, /vinegars?/g, /virgin/g,
  /vitamine?s?/g, /sans[- ]?alcool/g, /alcohol[- ]?free/g, /alkoholfrei/g, /alcoholvrij/g,
  /sin[- ]?alcohol/g, /senza[- ]?alcol/g, /sem[- ]?alcool/g, /bez[- ]?alkoholu/g, /alkolsuz/g,
  /0[.,]0\s*%?/g, /malta[- ]?guinness/g, /\bmocktails?\b/g, /\bboisson[- ]?malt/g, /\bmalta\b/g,
  /\bbrut[- ]?de[- ]?pomme/g, /cocktails?[- ]?(de[- ]?)?(fruits?|exotique|tropical)/g, /\bspritz\b/g, /\bpanache\b/g
];

var ALCOOL_MOTS = [
  /* francais */
  "alcool", "alcools", "alcoolise", "alcoolisee", "alcoolises", "alcoolisees", "biere", "bieres", "vin", "vins", "vinasse",
  "cidre", "cidres", "champagne", "champagnes", "cremant", "mousseux", "petillant de raisin",
  "liqueur", "liqueurs", "eau-de-vie", "poire williams", "eau de vie", "eaux-de-vie", "digestif", "aperitif", "aperitifs", "spiritueux",
  "rhum", "rhums", "cognac", "armagnac", "calvados", "prunelle", "genievre", "pastis", "anisette",
  "chartreuse", "benedictine", "cointreau", "curacao", "vsop", "xo", "hydromel", "pommeau", "pineau",
  "ratafia", "floc", "macvin", "rince cochon", "kir", "planteur", "ti punch", "sangria", "grog", "vin chaud",
  "gueuze", "geuze", "kriek", "lambic", "trappiste", "trappistes", "abbaye", "tripel", "dubbel", "quadrupel", "pils", "pilsner", "pilsener", "bock", "faro", "framboise lambic",
  "vin rouge", "vin blanc", "vin rose", "vin doux", "vin de table", "vin de pays", "grand cru",
  "premier cru", "cru bourgeois", "cru classe", "chateau", "domaine", "cuvee", "millesime", "millesime",
  "vendanges", "vendange tardive", "appellation", "bouteille de vin", "bag in box",
  /* anglais */
  "alcohol", "alcoholic", "beer", "beers", "ale", "ales", "lager", "lagers", "stout", "ipa", "apa", "neipa",
  "pale ale", "wine", "wines", "cider", "ciders", "perry", "mead", "spirits", "liquor", "liquors",
  "booze", "whisky", "whiskey", "whiskies", "whiskeys", "scotch", "vodka", "vodkas", "gin", "gins",
  "rum", "rums", "brandy", "tequila", "mezcal", "absinthe", "vermouth", "sherry", "porto", "madeira", "marsala",
  "hard seltzer", "hard lemonade", "hard cider", "alcopop", "alcopops", "shandy", "radler",
  "sparkling wine", "red wine", "white wine", "rose wine", "dessert wine", "ice wine", "icewine",
  "moonshine", "hooch", "abv", /* neerlandais */
  "bier", "bieren", "pintje", "pintjes", "wijn", "wijnen", "rode wijn", "witte wijn", "rose wijn", "likeur", "likeuren",
  "jenever", "genever", "oude jenever", "jonge jenever", "brandewijn", "advocaat", "kruidenbitter",
  "trappist", "abdijbier", "witbier", "tarwebier", "bokbier", "tafelbier", "streekbier", "alcoholisch", "alcoholische",
  "sterke drank", "sterkedrank", "borrel", "cidre", "appelcider",
  /* allemand */
  "wein", "weine", "rotwein", "weisswein", "weißwein", "rosewein", "sekt", "schaumwein", "perlwein", "gluhwein", "glühwein",
  "federweisser", "eiswein", "spatlese", "spätlese", "auslese", "kabinett", "riesling", "weizen", "weissbier", "weißbier",
  "hefeweizen", "kolsch", "kölsch", "helles", "dunkel", "dunkles", "bockbier", "doppelbock", "maibock", "marzen", "märzen",
  "pilsener", "landbier", "zwickel", "kellerbier", "rauchbier", "starkbier", "schnaps", "schnapps", "obstler", "korn",
  "kornbrand", "weinbrand", "likor", "likör", "kräuterlikör", "krauterlikor", "jagertee", "jägertee", "apfelwein", "alkohol", "alkoholisch", "alkoholische", "alkoholhaltig", "spirituose", "spirituosen", "branntwein",
  /* espagnol */
  "cerveza", "cervezas", "vino", "vinos", "vino tinto", "tinto", "vino blanco", "vino rosado",
  "cava", "sidra", "sidras", "licor", "licores", "aguardiente", "orujo", "pacharan", "pacharán", "vermut",
  "sangria", "sangría", "tinto de verano", "calimocho", "kalimotxo", "rebujito", "chupito", "cubata", "brandy",
  "jerez", "oloroso", "amontillado", "moscatel", "mistela", "crianza", "reserva", "gran reserva",
  "rioja", "ribera", "ribera del duero", "priorat", "penedes", "penedès", "albarino", "albariño", "verdejo", "garnacha",
  "tempranillo", "mencia", "mencía", "txakoli", "alcoholico", "alcohólico", "bebida alcoholica", "pisco", /* italien */
  "birra", "birre", "vino", "vini", "vino rosso", "vino bianco", "rosato", "spumante", "prosecco", "franciacorta", "asti",
  "lambrusco", "moscato", "chianti", "barolo", "barbaresco", "brunello", "montepulciano", "valpolicella", "amarone",
  "soave", "primitivo", "nero davola", "negroamaro", "sangiovese", "nebbiolo", "barbera", "trebbiano", "vermentino",
  "grappa", "amaro", "amari", "limoncello", "sambuca", "liquore", "liquori", "aperitivo", "spritz veneziano", "digestivo",
  "alcolico", "alcolica", "alcolici", "superalcolico", "superalcolici", "vinsanto", "vin santo", "passito", "marsala",
  /* portugais */
  "cerveja", "cervejas", "vinho", "vinhos", "vinho tinto", "vinho branco", "vinho verde", "aguardente", "cachaca", "cachaça",
  "licor", "bagaco", "bagaço", "ginjinha", "ginja", "douro", "alentejo", "alcoolico", "alcoólico",
  /* turc */
  "bira", "biralar", "sarap", "şarap", "raki", "rakı", "votka", "viski", "likor", "likör", "alkol", "alkollu", "alkollü",
  "kanyak", "boza",
  /* polonais / tcheque / slovaque / hongrois / roumain / balkans */
  "piwo", "piwa", "wino", "wina", "wodka", "wódka", "nalewka", "nalewki", "spirytus", "alkohol", "alkoholowy", "alkoholowe",
  "bimber", "miod pitny", "miód pitny", "cydr", "pivo", "piva", "vino", "vina", "slivovice", "slivovitz", "becherovka",
  "palinka", "pálinka", "sor", "sör", "bor", "borok", "unicum", "tokaji", "tokaj", "bere", "tuica", "țuică",
  "palinca", "pălincă", "rachiu", "rakija", "rakia", "sljivovica", "šljivovica", "mastika", "vinjak", "ouzo", "tsipouro",
  /* scandinave / finnois / baltes */
  "öl", "olut", "oluet", "viini", "vin", "vinet", "sprit", "brannvin", "brännvin", "akvavit", "aquavit", "snaps",
  "glogg", "glögg", "mjod", "mjød", "alus", "vynas", "degtine", "degtinė", "alkoholi", "alkoholijuoma", "siideri",
  /* grec (latin) / arabe (latin) / hebreu (latin) / persan (latin) */
  "krasi", "krasí", "bira", "bíra", "ouzo", "tsipouro", "retsina", "metaxa", "mastiha", "khamr", "nabidh", "araq", "arak",
  "birra", "yayin", "yain", "shekhar", "shekar", "yayn", "sharab", "araghi", "aragh",
  /* asie (latin) */
  "sake", "saké", "nihonshu", "shochu", "chuhai", "chu-hi", "umeshu", "highball", "soju", "makgeolli", "makkoli", "cheongju",
  "baijiu", "huangjiu", "mijiu", "shaoxing", "maotai", "moutai", "kaoliang", "bia", "ruou", "rượu", "tuak", "toddy",
  "feni", "fenny", "desi daru", "daru", "tharra", "lao khao", "tapai", "tuba", "lambanog", "brem", "arrack",
  /* afrique */
  "pombe", "tembo", "mnazi", "burukutu", "pito", "ogogoro", "kachasu", "chibuku", "umqombothi", "tej", "tella", /* russe / ukrainien (latin) */
  "pivo", "vodka", "kvas", "kvass", "samogon", "kon'yak", "konyak", "shampanskoe", "nastoyka", "nalivka", "medovukha",
  /* cepages et appellations (nommer la bouteille sans jamais ecrire « vin ») */
  "merlot", "cabernet", "cabernet sauvignon", "chardonnay", "sauvignon", "sauvignon blanc", "pinot", "pinot noir",
  "pinot gris", "pinot grigio", "pinot blanc", "syrah", "shiraz", "malbec", "grenache", "carignan", "mourvedre", "mourvèdre",
  "cinsault", "gamay", "viognier", "chenin", "muscadet", "gewurztraminer", "gewürztraminer", "sylvaner",
  "zinfandel", "carmenere", "carménère", "torrontes", "torrontés", "bonarda", "pinotage", "gruner veltliner",
  "grüner veltliner", "zweigelt", "blaufrankisch", "blaufränkisch", "kekfrankos", "kékfrankos", "furmint", "dornfelder",
  "spatburgunder", "spätburgunder", "muller thurgau", "müller-thurgau", "bordeaux", "medoc", "médoc", "pomerol",
  "saint-emilion", "saint emilion", "margaux", "pauillac", "pessac", "sauternes", "bourgogne", "chablis",
  "meursault", "pouilly", "sancerre", "beaujolais", "cotes du rhone", "côtes du rhône", "chateauneuf", "châteauneuf",
  "gigondas", "tavel", "bandol", "cahors", "minervois", "corbieres", "corbières", "fitou", "gaillac", "jurancon", "jurançon",
  "monbazillac", "vouvray", "chinon", "bourgueil", "saumur", "alsace grand cru", "cotes de provence", "côtes de provence",
  "banyuls", "rivesaltes", "maury", "muscat de rivesaltes", "cremant dalsace", "clairette",
  "blanquette", "gaillac", "bergerac", "buzet", "madiran", "irouleguy", "irouléguy", "cotes du jura", "arbois", "savagnin",
  "vin jaune", "vin de paille", "cotes de gascogne", "picpoul", "chateauneuf-du-pape", "tokay", "porto", "tawny", "lbv", "colheita", "moscatel de setubal", "mateus", "vinho do porto",
  /* bieres : styles supplementaires */
  "witbier", "weizenbier", "dunkelweizen", "kristallweizen", "schwarzbier", "altbier", "gose", "berliner weisse",
  "wild ale", "barleywine", "imperial stout", "milk stout", "oatmeal stout", "session ipa", "double ipa", "dipa",
  "triple ipa", "pale lager", "amber ale", "brown ale", "golden ale", "strong ale", "old ale", "scotch ale",
  "belgian ale", "biere de garde", "bière de garde", "grisette", "kellerpils", "zwickl", "cerveza artesanal", "craft beer",
  "birra artigianale", "cerveja artesanal", "bierbrouwerij", "brouwerij", "brauerei", "brewery", "microbrasserie", "microbrewery",
  /* alcopops et marques-types */
  "breezer", "smirnoff ice", "wkd", "hooch", "bacardi breezer", "mike's hard", "white claw", "vodka cruiser",
  "eristoff ice", "desperados", "somersby", "strongbow", "magners", "bulmers", "kopparberg", "rekorderlig",
  "savanna", "hunter's", "hunters dry", "angry orchard", "woodchuck", "thatchers", "aspall", "stella cidre",
  /* mentions legales / degre */
  "abus dalcool", "l'abus d'alcool", "abus d'alcool", "consommer avec moderation", "consommer avec modération",
  "drink responsibly", "alcohol by volume", "vol. alc", "alc. vol", "alc/vol", "18+", "interdit aux mineurs",
  "verboden onder 18", "verboden onder de 18", "geen 18 geen alcohol", "nix18"
];

/* Racines cherchees SANS frontiere de mot a gauche : elles collent a
   d'autres mots dans les langues germaniques et neerlandaise. */
var ALCOOL_RACINES = [
  "wein", "bier", "wijn", "likor", "likeur", "schnaps", "brannt", "sekt", "cider", "cidre", "vodka", "wodka", "whisk",
  "tequila", "sangria", "prosecco", "champagne", "cerveza", "cerveja", "birra", "vinho", "alkohol", "alcool", "alcohol",
  "alcol", "alkol", "alcoh", "spirituos", "kvass", "pivo"
];

/* Formes non latines : cherchees telles quelles dans le texte d'origine. */
var ALCOOL_SCRIPTS = [
  /* arabe */ "كحول", "كحولي", "كحولية", "خمر", "خمور", "نبيذ", "بيرة", "بيره", "جعة", "عرق", "ويسكي", "فودكا", "شمبانيا", "مشروبات روحية", "مسكر", "مسكرات",
  /* hebreu */ "אלכוהול", "אלכוהולי", "בירה", "יין", "יינות", "ערק", "עראק", "ארק", "וודקה", "ויסקי", "ליקר", "שכר", "קוניאק", "שמפניה", "ברנדי", "רום", "טקילה", "יין אדום", "יין לבן",
  /* persan / ourdou */ "آبجو", "شراب", "مشروب الکلی", "ودکا", "ویسکی",
  /* cyrillique */ "алкоголь", "алкогол", "спирт", "пиво", "вино", "вина", "водка", "горілка", "горилка", "коньяк", "шампанское", "шампанське", "ликёр", "ликер", "лікер", "сидр", "виски", "ром", "текила", "джин", "самогон", "наливка", "настойка", "бренди", "вермут", "глинтвейн", "медовуха", "бира", "ракия", "ракија", "вињак", "пиво", "квас",
  /* grec */ "αλκοόλ", "αλκοολούχ", "μπύρα", "μπίρα", "κρασί", "οίνος", "ούζο", "τσίπουρο", "ρακί", "ρετσίνα", "βότκα", "ουίσκι", "λικέρ", "σαμπάνια", "κονιάκ",
  /* japonais */ "ビール", "発泡酒", "日本酒", "清酒", "焼酎", "泡盛", "ウイスキー", "ウィスキー", "ワイン", "梅酒", "チューハイ", "酎ハイ", "ハイボール", "リキュール", "カクテル", "ブランデー", "ウォッカ", "ジン", "ラム酒", "テキーラ", "シャンパン", "スパークリングワイン", "アルコール", "お酒", "酒",
  /* chinois */ "啤酒", "白酒", "黄酒", "葡萄酒", "红酒", "紅酒", "米酒", "烧酒", "燒酒", "威士忌", "伏特加", "白兰地", "白蘭地", "朗姆酒", "龙舌兰", "香槟", "香檳", "鸡尾酒", "雞尾酒", "利口酒", "酒精", "含酒精", "清酒", "茅台", "二锅头", "老白干",
  /* coreen */ "맥주", "소주", "막걸리", "청주", "와인", "위스키", "보드카", "샴페인", "칵테일", "리큐르", "알코올", "주류", "술",
  /* thai / lao / khmer / birman */ "เบียร์", "เหล้า", "ไวน์", "สุรา", "วิสกี้", "ว็อดก้า", "แอลกอฮอล์", "ເບຍ", "ເຫຼົ້າ", "ស្រា", "ស្រាបៀរ", "ဘီယာ", "အရက်",
  /* hindi / bengali / tamil / etc. */ "बीयर", "बियर", "शराब", "मदिरा", "वाइन", "व्हिस्की", "वोदका", "रम", "दारू", "মদ", "বিয়ার", "ওয়াইন", "மது", "பீர்", "ஒயின்", "ಮದ್ಯ", "మద్యం", "ബിയർ", "മദ്യം",
  /* georgien / armenien */ "ღვინო", "ლუდი", "ჭაჭა", "արաղ", "գինի", "գարեջուր",
  /* amharique */ "ቢራ", "ጠጅ", "ጠላ", "አረቄ"
];

/* Marques dont le nom seul suffit (bieres, spiritueux, vins, alcopops). */
var ALCOOL_MARQUES = [
  /* bieres belges / neerlandaises */ "jupiler", "stella artois", "stella", "maes", "carapils", "cara pils", "duvel", "chimay", "leffe", "hoegaarden",
  "primus", "karmeliet", "tripel karmeliet", "kwak", "orval", "westmalle", "rochefort", "westvleteren", "achel", "chouffe", "la chouffe",
  "kasteel", "vedett", "cornet", "grimbergen", "affligem", "ciney", "tongerlo", "omer", "rodenbach", "liefmans", "lindemans",
  "timmermans", "mort subite", "scaldis", "delirium", "st feuillien", "saint feuillien", "la trappe", "bavik", "cristal alken",
  "bockor", "brugse zot", "straffe hendrik", "gouden carolus", "maredsous", "val-dieu", "val dieu", "steenbrugge", "lupulus", "bertinchamps",
  "brasserie de la senne", "zinnebir", "taras boulba", "jambe de bois", "bruxellensis", "cantillon", "3 fonteinen", "drie fonteinen", "girardin",
  "de koninck", "bolleke", "hapkin", "piedboeuf", "heineken", "amstel", "grolsch", "hertog jan", "gulpener",
  "dommelsch", "jupiler blue", "jupiler 0.0", "leffe 0.0", "maes 0.0",
  /* bieres monde */ "desperados", "corona", "corona extra", "corona cero", "budweiser", "bud light", "carlsberg", "beck's", "becks", "guinness",
  "kronenbourg", "1664", "kanterbrau", "pelforth", "fischer", "adelscott", "pietra", "licorne", "peroni", "moretti", "birra moretti",
  "nastro azzurro", "san miguel", "estrella", "estrella damm", "estrella galicia", "mahou", "cruzcampo", "alhambra", "sagres", "super bock",
  "efes", "tuborg", "pilsner urquell", "staropramen", "kozel", "budvar", "zywiec", "tyskie", "lech", "okocim", "warka", "baltika",
  "kirin", "sapporo", "tsingtao", "bintang", "chang", "singha", "cass", "hite", "coors", "miller",
  "michelob", "modelo", "pacifico", "dos equis", "brahma", "skol", "quilmes", "castle", "windhoek", "tusker",
  "kingfisher", "foster's", "fosters", "victoria bitter", "carling", "tennent's", "tennents", "newcastle brown", "boddingtons",
  "kilkenny", "murphy's", "murphys", "erdinger", "paulaner", "franziskaner", "warsteiner", "bitburger", "krombacher", "veltins", "jever",
  "radeberger", "augustiner", "weihenstephaner", "schofferhofer", "schöfferhofer", "hofbrau", "hofbräu", "lowenbrau", "löwenbräu",
  "spaten", "hacker-pschorr", "clausthaler", "brooklyn", "sierra nevada", "lagunitas", "blue moon", "samuel adams", "sam adams", "goose island",
  "brewdog", "punk ipa", "camden", "beavertown", "mikkeller", "omnipollo", "vedett ipa", "ichnusa", "menabrea",
  /* vodkas, gins, rhums, whiskies, tequilas */ "smirnoff", "absolut", "grey goose", "belvedere", "ciroc", "ketel one", "stolichnaya", "stoli",
  "russian standard", "zubrowka", "żubrówka", "eristoff", "poliakov", "sobieski", "finlandia", "skyy", "titos", "tito's",
  "bombay sapphire", "bombay", "hendrick's", "hendricks", "gordon's", "gordons", "beefeater", "tanqueray", "monkey 47", "roku gin", "bulldog gin",
  "jose cuervo", "cuervo", "patron", "patrón", "don julio", "olmeca", "sierra tequila", "havana club", "bacardi", "captain morgan", "kraken",
  "diplomatico", "bumbu", "plantation", "mount gay", "appleton", "brugal", "barcelo", "barceló", "matusalem", "zacapa", "don papa", "malibu",
  "jack daniel's", "jack daniels", "jim beam", "maker's mark", "makers mark", "wild turkey", "four roses", "woodford", "bulleit", "buffalo trace",
  "johnnie walker", "ballantine's", "ballantines", "jameson", "chivas", "chivas regal", "grant's", "grants", "famous grouse", "j&b", "dewar's",
  "glenfiddich", "glenlivet", "glenmorangie", "macallan", "lagavulin", "laphroaig", "talisker", "ardbeg", "bowmore", "oban", "dalmore",
  "bushmills", "tullamore", "tullamore dew", "monkey shoulder", "nikka", "yamazaki", "hibiki", "hakushu", "label 5", "william peel", "clan campbell",
  "sir edward's", "black & white", "cutty sark",
  /* cognacs, liqueurs, aperitifs */ "hennessy", "remy martin", "rémy martin", "martell", "courvoisier", "camus", "meukow", "grand marnier", "cointreau",
  "jagermeister", "jägermeister", "fernet", "fernet branca", "ramazzotti", "disaronno", "amaretto", "sambuca", "limoncello", "villa massa",
  "ouzo 12", "metaxa", "pernod", "ricard", "pastis 51", "suze", "lillet", "aperol", "campari", "martini", "cinzano", "noilly prat", "pimm's", "pimms",
  "baileys", "kahlua", "kahlúa", "tia maria", "passoa", "passoã", "hpnotiq", "sourz", "pisang ambon", "batida", "amarula", "sheridan's",
  "cointreau", "get 27", "get 31", "marie brizard", "bols", "de kuyper", "wenneker", "licor 43", "frangelico", "chambord", "drambuie", "glayva", "southern comfort", "jack fire", "jack honey", "berentzen", "kleiner feigling", "underberg",
  "averna", "cynar", "montenegro", "amaro lucano", "picon", "byrrh", "dubonnet", "cap corse", "ambassadeur", "rinquinquin", "elixir d'anvers",
  "elixir danvers", "mandarine napoleon", "peket", "filliers", "smeets", "hertekamp", "bols jonge", "ketel 1",
  /* champagnes, vins, cavas, ciders */ "moet", "moët", "moet & chandon", "veuve clicquot", "dom perignon", "dom pérignon", "ruinart", "taittinger",
  "bollinger", "krug", "laurent-perrier", "laurent perrier", "pommery", "mumm", "piper-heidsieck", "piper heidsieck", "nicolas feuillatte", "canard-duchene",
  "canard duchene", "deutz", "perrier-jouet", "perrier jouet", "billecart", "freixenet", "codorniu", "codorníu", "segura viudas", "jaume serra",
  "yellow tail", "yellowtail", "barefoot", "jacob's creek", "jacobs creek", "casillero del diablo", "concha y toro", "carlo rossi",
  "mateus", "blossom hill", "echo falls", "hardys", "kendall-jackson", "cloudy bay", "penfolds", "beringer", "mouton cadet", "jp chenet", "j.p. chenet",
  "baron de lestac", "roche mazet", "vieux papes", "cellier des dauphins", "listel", "villa maria", "oyster bay", "kumala", "nederburg", "kwv",
  "marques de caceres", "marqués de cáceres", "campo viejo", "faustino", "protos", "pata negra", "ramon bilbao", "ramón bilbao",
  "somersby", "strongbow", "magners", "bulmers", "kopparberg", "rekorderlig", "savanna", "thatchers", "aspall", /* alcopops */ "smirnoff ice", "bacardi breezer", "wkd", "hooch", "mike's hard lemonade", "white claw", "vodka cruiser", "eristoff ice",
  "flirt vodka", "jillz", "cava spritz", "hugo spritz", "aperol spritz", "moscow mule", "bloody mary", "negroni", "whisky sour", "gin tonic", "gin-tonic", "gin & tonic", "cuba libre", "black russian", "white russian", "b52", "jagerbomb", "jägerbomb",
  "irish coffee", "kir royal", "sangria"
];
