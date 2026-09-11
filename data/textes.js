/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. */

/* ============================================================================
   LES TEXTES DITS « EN PASSANT » — messages, confirmations, étiquettes
   ----------------------------------------------------------------------------
   POURQUOI CE FICHIER EXISTE À CÔTÉ DE i18n.js.

   LANGS fonctionne par clés courtes (T.badgeScan) : c'est le bon outil quand on
   écrit l'interface, parce qu'on choisit la clé au moment où on pose le texte.
   Mais l'app porte aussi des centaines de messages nés au fil du travail —
   « Déjà rattaché », « Photo trop lourde », « Merci pour ton soutien » — écrits
   directement dans le code, à 165 endroits pour les seuls toasts.

   Les convertir en clés aurait voulu dire modifier 287 lignes dans un fichier de
   21 000, une par une, sans filet. Le risque d'en casser une est bien réel, et
   le gain identique à celui d'une solution sans risque : ICI, LE TEXTE FRANÇAIS
   EST LA CLÉ. toast("Déjà rattaché") cherche « Déjà rattaché » dans cette table
   et rend la version de la langue courante. Aucun appel n'a besoin de changer.

   CE QUE ÇA COÛTE, ET QUI EST ASSUMÉ :
     - Corriger une faute de frappe française casse le lien avec ses traductions.
       C'est pourquoi outils/verifier-textes.mjs relit la table et signale toute
       entrée qui ne correspond plus à aucun texte du code.
     - Les messages composés (« Déjà rattaché à » + nom du magasin) ne sont pas
       couverts par ce mécanisme. Ils sont listés à part, et se traitent un par
       un, plus tard, avec des clés à trous.

   CE QUI RESTE EN FRANÇAIS, ET C'EST VOULU : les écrans d'administration. Un
   seul utilisateur les ouvre, et il parle français. Les traduire coûterait le
   prix du reste de l'app pour une personne.

   Langues : en ar nl es de it pt tr zh. Le français est la source, il n'est
   donc jamais répété ici.
   ============================================================================ */

var TEXTES = {
  "\\u2713 Photo corrig\\u00E9e et partag\\u00E9e": {en:"✓ Photo fixed and shared",ar:"✓ تم تصحيح الصورة ومشاركتها",nl:"✓ Foto verbeterd en gedeeld",es:"✓ Foto corregida y compartida",de:"✓ Foto korrigiert und geteilt"},
  "Accès caméra refusé — saisis le code à la main": {en:"Camera access denied — type the code by hand",ar:"تم رفض الوصول إلى الكاميرا — أدخل الرمز يدويًا",nl:"Cameratoegang geweigerd — tik de code zelf in",es:"Cámara denegada — escribe el código a mano",de:"Kamera gesperrt — gib den Code manuell ein"},
  "Active d'abord la caméra": {en:"Turn the camera on first",ar:"فعّل الكاميرا أولًا",nl:"Zet eerst de camera aan",es:"Activa primero la cámara",de:"Aktiviere zuerst die Kamera"},
  "Active d'abord les notifications": {en:"Turn notifications on first",ar:"فعّل الإشعارات أولًا",nl:"Zet eerst meldingen aan",es:"Activa primero las notificaciones",de:"Aktiviere zuerst die Mitteilungen"},
  "Active le GPS pour te centrer": {en:"Turn GPS on to center the map",ar:"فعّل GPS لتوسيط موقعك",nl:"Zet GPS aan om te centreren",es:"Activa el GPS para centrarte",de:"Aktiviere GPS zum Zentrieren"},
  "Active ta position d'abord": {en:"Turn your location on first",ar:"فعّل موقعك أولًا",nl:"Zet eerst je locatie aan",es:"Activa tu ubicación primero",de:"Standort zuerst aktivieren"},
  "Active ta position pour l'itinéraire dans l'app": {en:"Turn your location on for in-app directions",ar:"فعّل موقعك لعرض المسار داخل التطبيق",nl:"Zet je locatie aan voor de route in de app",es:"Activa tu ubicación para la ruta en la app",de:"Standort aktivieren für die Route in der App"},
  "Actualisé !": {en:"Updated!",ar:"تم التحديث!",nl:"Bijgewerkt!",es:"¡Actualizado!",de:"Aktualisiert!"},
  "Ajout indisponible pour le moment": {en:"Can't add right now",ar:"الإضافة غير متاحة حاليًا",nl:"Toevoegen kan nu niet",es:"No se puede añadir por ahora",de:"Hinzufügen gerade nicht möglich"},
  "Ajouté aux découvertes · +20 pts": {en:"Added to discoveries · +20 pts",ar:"أُضيف إلى الاكتشافات · +20 نقطة",nl:"Bij ontdekkingen · +20 pts",es:"Añadido a descubrimientos · +20 pts",de:"Entdeckung gespeichert · +20 pts"},
  "Ajoute une note ou un petit mot": {en:"Add a note or a few words",ar:"أضف ملاحظة أو كلمة صغيرة",nl:"Voeg een notitie of woordje toe",es:"Añade una nota o un mensajito",de:"Schreib eine Notiz dazu"},
  "Ajoute une photo du produit": {en:"Add a photo of the product",ar:"أضف صورة للمنتج",nl:"Voeg een productfoto toe",es:"Añade una foto del producto",de:"Füge ein Produktfoto hinzu"},
  "Annonce publiée": {en:"Post published",ar:"تم نشر الإعلان",nl:"Bericht online",es:"Anuncio publicado",de:"Anzeige online"},
  "Annonce retirée": {en:"Post removed",ar:"تم سحب الإعلان",nl:"Bericht weg",es:"Anuncio retirado",de:"Anzeige entfernt"},
  "Aucun changement": {en:"No change",ar:"لا تغيير",nl:"Geen wijziging",es:"Sin cambios",de:"Keine Änderung"},
  "Aucun id valide": {en:"No valid id",ar:"لا يوجد معرّف صالح",nl:"Geen geldige id",es:"Ningún id válido",de:"Keine gültige ID"},
  "Aucun magasin confirme pour l'instant — sois le premier a confirmer !": {en:"No store confirmed it yet — be the first!",ar:"لا متجر يؤكد حتى الآن — كن أول من يؤكد!",nl:"Nog geen winkel bevestigt — wees de eerste!",es:"Ninguna tienda lo confirma aún — ¡sé el primero!",de:"Noch kein Laden bestätigt — sei der Erste!"},
  "Aucun magasin ouvert avec cette boisson par ici": {en:"No open store with this drink nearby",ar:"لا متجر مفتوح بهذا المشروب هنا",nl:"Geen open winkel met deze drank in de buurt",es:"Ninguna tienda abierta con esta bebida por aquí",de:"Kein offener Laden mit diesem Getränk hier"},
  "Aucune boisson alcoolisée dans une annonce": {en:"No alcoholic drinks in a post",ar:"ممنوع وضع مشروب كحولي في إعلان",nl:"Geen alcoholische drank in een bericht",es:"Nada de bebidas alcohólicas en un anuncio",de:"Kein Alkohol in Anzeigen"},
  "Aucune boisson en chasse \\u2014 tout est \\u00E0 jour !": {en:"No drink on the hunt — all up to date!",ar:"لا مشروب قيد البحث — كل شيء محدّث!",nl:"Geen drank in jacht — alles is bijgewerkt!",es:"Ninguna bebida en búsqueda — ¡todo al día!",de:"Keine Jagd offen — alles aktuell!"},
  "Bloqué par les règles Firestore — dis-le-moi, je te donne la règle à ajouter": {en:"Blocked by Firestore rules — tell me and I'll give you the rule to add",ar:"محظور بقواعد Firestore — أخبرني وسأعطيك القاعدة التي تضيفها",nl:"Geblokkeerd door Firestore-regels — zeg het me, ik geef je de regel",es:"Bloqueado por las reglas de Firestore — dímelo y te doy la regla a añadir",de:"Von Firestore-Regeln blockiert — sag Bescheid, ich nenne dir die Regel"},
  "Bloquées par le téléphone : Réglages › Notifications › Magofeed": {en:"Blocked by your phone: Settings › Notifications › Magofeed",ar:"محظورة من الهاتف: الإعدادات › الإشعارات › Magofeed",nl:"Geblokkeerd door telefoon: Instellingen › Meldingen › Magofeed",es:"Bloqueadas por el teléfono: Ajustes › Notificaciones › Magofeed",de:"Vom Handy blockiert: Einstellungen › Mitteilungen › Magofeed"},
  "Boisson alcoolis\\u00E9e \\u2014 Magofeed reste 100% sans alcool": {en:"Alcoholic drink — Magofeed stays 100% alcohol-free",ar:"مشروب كحولي — Magofeed يبقى بلا كحول 100%",nl:"Alcohol — Magofeed blijft 100% alcoholvrij",es:"Bebida alcohólica — Magofeed es 100% sin alcohol",de:"Alkohol — Magofeed bleibt 100% alkoholfrei"},
  "C’est fermé, ça ne reviendra pas · Réglages › Communauté si tu changes d’avis": {en:"It’s closed for good · Settings › Community if you change your mind",ar:"أُغلق ولن يعود · الإعدادات › المجتمع إن غيّرت رأيك",nl:"Gesloten, dit komt niet terug · Instellingen › Community als je je bedenkt",es:"Está cerrado, no volverá · Ajustes › Comunidad si cambias de idea",de:"Geschlossen, kommt nicht zurück · Einstellungen › Community bei Sinneswandel"},
  "Calcul du chemin\\u2026": {en:"Working out the route…",ar:"جارٍ حساب المسار…",nl:"Route berekenen…",es:"Calculando la ruta…",de:"Route wird berechnet…"},
  "Carte indisponible \\u2014 v\\u00e9rifie ta connexion": {en:"Map unavailable — check your connection",ar:"الخريطة غير متاحة — تحقق من اتصالك",nl:"Geen kaart — check je verbinding",es:"Mapa no disponible — comprueba tu conexión",de:"Karte nicht verfügbar — prüf deine Verbindung"},
  "Ce code de parrainage n'existe pas": {en:"That referral code doesn't exist",ar:"رمز الدعوة هذا غير موجود",nl:"Deze uitnodigingscode bestaat niet",es:"Ese código de invitación no existe",de:"Diesen Einladungscode gibt es nicht"},
  "Ce code n'est pas dans la liste": {en:"That code isn't on the list",ar:"هذا الرمز ليس في القائمة",nl:"Code staat niet in de lijst",es:"Ese código no está en la lista",de:"Dieser Code ist nicht in der Liste"},
  "Ce compte Google est d\\u00E9j\\u00E0 li\\u00E9 \\u00E0 un autre profil Magofeed": {en:"This Google account is already linked to another Magofeed profile",ar:"حساب Google هذا مرتبط بملف Magofeed آخر",nl:"Google-account hangt al aan een ander Magofeed-profiel",es:"Esta cuenta de Google ya está en otro perfil Magofeed",de:"Google-Konto gehört schon zu anderem Magofeed-Profil"},
  "Ce magasin n'est pas chargé — ouvre sa zone sur la carte d'abord": {en:"Store not loaded — open its area on the map first",ar:"هذا المتجر غير محمّل — افتح منطقته على الخريطة أولًا",nl:"Deze winkel is niet geladen — open eerst zijn zone op de kaart",es:"Esa tienda no está cargada — abre su zona en el mapa primero",de:"Laden nicht geladen — öffne zuerst sein Gebiet auf der Karte"},
  "Ce magasin n'existe plus \\u2014 veille relanc\\u00e9e": {en:"This store is gone — watch restarted",ar:"هذا المتجر لم يعد موجودًا — أُعيد تشغيل المراقبة",nl:"Winkel bestaat niet meer — bewaking hervat",es:"Tienda inexistente — vigilancia reiniciada",de:"Laden existiert nicht mehr — Wache aktiv"},
  "Certification retirée": {en:"Certification removed",ar:"تم سحب التوثيق",nl:"Erkenning ingetrokken",es:"Certificación retirada",de:"Zertifizierung entfernt"},
  "Cette boisson fait partie du catalogue de base": {en:"This drink is part of the base catalog",ar:"هذا المشروب ضمن الكتالوج الأساسي",nl:"Deze drank hoort bij de basiscatalogus",es:"Esta bebida es parte del catálogo base",de:"Dieses Getränk gehört zum Basiskatalog"},
  "Cette boisson n'est plus au catalogue": {en:"This drink is no longer in the catalog",ar:"هذا المشروب لم يعد في الكتالوج",nl:"Deze drank is uit de catalogus",es:"Esta bebida ya no está en el catálogo",de:"Dieses Getränk ist nicht mehr im Katalog"},
  "Cette fiche n'a pas de photo": {en:"This entry has no photo",ar:"لا صورة في هذه البطاقة",nl:"Deze fiche heeft geen foto",es:"Esta ficha no tiene foto",de:"Kein Foto zu diesem Eintrag"},
  "Chargement du magasin\\u2026": {en:"Loading store…",ar:"جارٍ تحميل المتجر…",nl:"Winkel laden…",es:"Cargando la tienda…",de:"Laden lädt…"},
  "Chargement du profil\\u2026": {en:"Loading profile…",ar:"جارٍ تحميل الملف الشخصي…",nl:"Profiel laden…",es:"Cargando el perfil…",de:"Profil lädt…"},
  "Choisis d'abord une boisson à chercher": {en:"Pick a drink to look for first",ar:"اختر أولًا مشروبًا للبحث عنه",nl:"Kies eerst een drank om te zoeken",es:"Elige primero una bebida que buscar",de:"Wähl zuerst ein Getränk zum Suchen"},
  "Choisis d'abord une cat\\u00E9gorie": {en:"Pick a category first",ar:"اختر فئة أولًا",nl:"Kies eerst een categorie",es:"Elige primero una categoría",de:"Wähl zuerst eine Kategorie"},
  "Code accept\\u00e9 ! Contribue un peu et vous gagnez tous les deux des points.": {en:"Code accepted! Contribute a bit and you both earn points.",ar:"تم قبول الرمز! ساهم قليلًا وتكسبان معًا نقاطًا.",nl:"Code aanvaard! Draag wat bij en jullie krijgen allebei punten.",es:"¡Código aceptado! Contribuye un poco y ganáis puntos los dos.",de:"Code akzeptiert! Trag was bei und ihr bekommt beide Punkte."},
  "Code-barre invalide (8 à 13 chiffres)": {en:"Invalid barcode (8 to 13 digits)",ar:"باركود غير صالح (8 إلى 13 رقمًا)",nl:"Ongeldige barcode (8 tot 13 cijfers)",es:"Código de barras no válido (8-13 cifras)",de:"Barcode ungültig (8 bis 13 Ziffern)"},
  "Connecte-toi d'abord — un magasin doit être rattaché à un vrai compte": {en:"Sign in first — a store must be linked to a real account",ar:"سجّل الدخول أولًا — يجب ربط المتجر بحساب حقيقي",nl:"Meld je eerst aan — een winkel wordt gekoppeld aan een echt account",es:"Inicia sesión — la tienda debe estar vinculada a una cuenta real",de:"Melde dich zuerst an — ein Laden braucht ein echtes Konto"},
  "Connexion à Google…": {en:"Signing in with Google…",ar:"جارٍ الاتصال بـ Google…",nl:"Google verbinden…",es:"Conectando con Google…",de:"Anmeldung bei Google…"},
  "Connexion indisponible — réessaie plus tard": {en:"Sign-in unavailable — try again later",ar:"تسجيل الدخول غير متاح — أعد المحاولة لاحقًا",nl:"Aanmelden kan niet — probeer later opnieuw",es:"Conexión no disponible — inténtalo más tarde",de:"Anmeldung nicht möglich — versuch es später"},
  "Connexion indisponible pour le moment": {en:"Sign-in unavailable right now",ar:"تسجيل الدخول غير متاح حاليًا",nl:"Aanmelden kan nu niet",es:"Conexión no disponible por ahora",de:"Anmeldung gerade nicht möglich"},
  "Copié — prêt à coller dans un e-mail": {en:"Copied — ready to paste in an email",ar:"تم النسخ — جاهز للّصق في بريد",nl:"Gekopieerd — plak het in een e-mail",es:"Copiado — listo para pegar en un correo",de:"Kopiert — bereit für die E-Mail"},
  "Cr\\u00E9e un compte pour participer \\u00E0 la chasse": {en:"Create an account to join the hunt",ar:"أنشئ حسابًا للمشاركة في البحث",nl:"Maak een account om mee te jagen",es:"Crea una cuenta para unirte a la búsqueda",de:"Erstell ein Konto für die Jagd"},
  "Crée d'abord un compte e-mail (Réglages → Compte)": {en:"Create an email account first (Settings → Account)",ar:"أنشئ أولًا حسابًا بالبريد (الإعدادات ← الحساب)",nl:"Eerst een e-mailaccount (Instellingen → Account)",es:"Crea primero una cuenta e-mail (Ajustes → Cuenta)",de:"Erst E-Mail-Konto anlegen (Einstellungen → Konto)"},
  "D\\u00e9j\\u00e0 pris en compte aujourd'hui pour ce magasin": {en:"Already counted today for this store",ar:"سُجّل اليوم بالفعل لهذا المتجر",nl:"Vandaag al geteld voor deze winkel",es:"Ya contabilizado hoy para esta tienda",de:"Heute schon gezählt für diesen Laden"},
  "Déjà signalé aujourd'hui": {en:"Already reported today",ar:"تم الإبلاغ اليوم بالفعل",nl:"Vandaag al gemeld",es:"Ya reportado hoy",de:"Heute schon gemeldet"},
  "Déjà signalé, merci !": {en:"Already reported, thanks!",ar:"تم الإبلاغ بالفعل، شكرًا!",nl:"Al gemeld, bedankt!",es:"¡Ya reportado, gracias!",de:"Schon gemeldet, danke!"},
  "Demande envoyée — on revient vers toi": {en:"Request sent — we'll get back to you",ar:"أُرسل الطلب — سنعود إليك",nl:"Aanvraag verstuurd — we komen terug",es:"Solicitud enviada — te contestamos",de:"Anfrage gesendet — wir melden uns"},
  "Demande refusée": {en:"Request denied",ar:"تم رفض الطلب",nl:"Vraag geweigerd",es:"Solicitud rechazada",de:"Anfrage abgelehnt"},
  "Domaine non autoris\\u00E9 dans Firebase (Console \\u2192 Authentication \\u2192 Settings \\u2192 Authorized domains)": {en:"Domain not allowed in Firebase (Console → Authentication → Settings → Authorized domains)",ar:"نطاق غير مصرّح به في Firebase (Console ← Authentication ← Settings ← Authorized domains)",nl:"Domein niet toegelaten in Firebase (Console → Authentication → Settings → Authorized domains)",es:"Dominio no autorizado en Firebase (Console → Authentication → Settings → Authorized domains)",de:"Domain in Firebase nicht erlaubt (Console → Authentication → Settings → Authorized domains)"},
  "Donne le nom de la boisson": {en:"Give the drink's name",ar:"اكتب اسم المشروب",nl:"Geef de naam van de drank",es:"Indica el nombre de la bebida",de:"Gib den Getränkenamen an"},
  "Donne un nom au magasin": {en:"Give the store a name",ar:"اكتب اسمًا للمتجر",nl:"Geef de winkel een naam",es:"Ponle nombre a la tienda",de:"Gib dem Laden einen Namen"},
  "Échec du test — réessaie": {en:"Test failed — try again",ar:"فشل الاختبار — أعد المحاولة",nl:"Test mislukt — opnieuw",es:"Prueba fallida — reintenta",de:"Test gescheitert — nochmal"},
  "Écris d'abord ton annonce": {en:"Write your post first",ar:"اكتب إعلانك أولًا",nl:"Schrijf eerst je bericht",es:"Escribe primero tu anuncio",de:"Schreib zuerst deine Anzeige"},
  "En favori · tu seras prévenu quand elle arrive près de toi": {en:"Favorited · we'll tell you when it lands near you",ar:"في المفضلة · سننبّهك عندما يصل قربك",nl:"Favoriet · je krijgt bericht als ze in de buurt is",es:"En favoritos · te avisamos cuando llegue cerca de ti",de:"Favorit · du wirst informiert, wenn es in der Nähe ist"},
  "Enregistr\\u00E9 sur cet appareil": {en:"Saved on this device",ar:"محفوظ على هذا الجهاز",nl:"Opgeslagen op dit toestel",es:"Guardado en este dispositivo",de:"Auf diesem Gerät gespeichert"},
  "Enregistr\\u00E9 sur cet appareil seulement (\\u00E9criture catalogue refus\\u00E9e)": {en:"Saved on this device only (catalog write denied)",ar:"محفوظ على هذا الجهاز فقط (رُفضت الكتابة في الكتالوج)",nl:"Enkel op dit toestel (schrijven in catalogus geweigerd)",es:"Guardado solo en este dispositivo (escritura en catálogo denegada)",de:"Nur auf diesem Gerät gespeichert (Katalog-Schreibzugriff verweigert)"},
  "Envoi du test…": {en:"Sending test…",ar:"جارٍ إرسال الاختبار…",nl:"Test sturen…",es:"Enviando prueba…",de:"Sende Test…"},
  "Envoi impossible, réessaie": {en:"Couldn't send, try again",ar:"تعذّر الإرسال، أعد المحاولة",nl:"Sturen mislukt, opnieuw",es:"No se envió, inténtalo otra vez",de:"Senden fehlgeschlagen, nochmal"},
  "Erreur lors de la suppression — ton compte est intact": {en:"Delete failed — your account is intact",ar:"خطأ أثناء الحذف — حسابك سليم",nl:"Fout bij het verwijderen — je account is intact",es:"Error al eliminar — tu cuenta está intacta",de:"Fehler beim Löschen — dein Konto ist unversehrt"},
  "Fen\\u00EAtre bloqu\\u00E9e par le navigateur \\u2014 r\\u00E9essaie": {en:"Window blocked by the browser — try again",ar:"المتصفح حظر النافذة — أعد المحاولة",nl:"Browser blokkeerde het venster — opnieuw",es:"Ventana bloqueada por el navegador — reintenta",de:"Fenster vom Browser blockiert — versuch nochmal"},
  "Flash non disponible sur cet appareil": {en:"No flash on this device",ar:"الفلاش غير متوفر على هذا الجهاز",nl:"Flits niet beschikbaar op dit toestel",es:"Flash no disponible en este dispositivo",de:"Blitz auf diesem Gerät nicht verfügbar"},
  "Fonction de sauvegarde pas encore d\\u00E9ploy\\u00E9e": {en:"Backup function not deployed yet",ar:"وظيفة النسخ الاحتياطي غير منشورة بعد",nl:"Back-upfunctie nog niet uitgerold",es:"Función de respaldo aún no desplegada",de:"Backup-Funktion noch nicht aktiv"},
  "Fonction de sauvegarde pas encore déployée": {en:"Backup function not deployed yet",ar:"وظيفة النسخ الاحتياطي غير منشورة بعد",nl:"Back-upfunctie nog niet uitgerold",es:"Función de respaldo aún no desplegada",de:"Backup-Funktion noch nicht aktiv"},
  "Fonction de test pas encore déployée côté serveur": {en:"Test function not deployed on the server yet",ar:"وظيفة الاختبار غير منشورة بعد على الخادم",nl:"Testfunctie nog niet uitgerold op de server",es:"Función de prueba aún no desplegada en el servidor",de:"Test-Funktion serverseitig noch nicht aktiv"},
  "Fonction pas encore d\\u00E9ploy\\u00E9e": {en:"Function not deployed yet",ar:"الوظيفة غير منشورة بعد",nl:"Functie nog niet uitgerold",es:"Función aún no desplegada",de:"Funktion noch nicht aktiv"},
  "Fonction serveur pas encore déployée": {en:"Server function not deployed yet",ar:"وظيفة الخادم غير منشورة بعد",nl:"Serverfunctie nog niet uitgerold",es:"Función de servidor aún no desplegada",de:"Server-Funktion noch nicht aktiv"},
  "Format non reconnu (code-barre ou URL Open Food Facts)": {en:"Format not recognized (barcode or Open Food Facts URL)",ar:"صيغة غير معروفة (باركود أو رابط Open Food Facts)",nl:"Formaat niet herkend (barcode of Open Food Facts-URL)",es:"Formato no reconocido (código o URL Open Food Facts)",de:"Format unbekannt (Barcode oder Open Food Facts URL)"},
  "Historique effacé": {en:"History cleared",ar:"تم مسح السجل",nl:"Historiek gewist",es:"Historial borrado",de:"Verlauf gelöscht"},
  "Import des horaires lancé côté serveur…": {en:"Hours import started on the server…",ar:"بدأ استيراد المواعيد على الخادم…",nl:"Import van openingsuren gestart…",es:"Importando horarios en el servidor…",de:"Öffnungszeiten-Import gestartet…"},
  "Impossible d'allumer le flash": {en:"Can't turn the flash on",ar:"تعذّر تشغيل الفلاش",nl:"Flits gaat niet aan",es:"No se puede encender el flash",de:"Blitz geht nicht an"},
  "Impossible d'enregistrer — réessaie": {en:"Can't save — try again",ar:"تعذّر الحفظ — أعد المحاولة",nl:"Opslaan mislukt — probeer opnieuw",es:"No se pudo guardar — reintenta",de:"Speichern klappt nicht — nochmal"},
  "Impossible de lire cette image": {en:"Can't read this image",ar:"تعذّرت قراءة هذه الصورة",nl:"Kan deze foto niet lezen",es:"No se puede leer esta imagen",de:"Bild nicht lesbar"},
  "Indique le nom du produit": {en:"Enter the product name",ar:"اكتب اسم المنتج",nl:"Geef de productnaam",es:"Indica el nombre del producto",de:"Gib den Produktnamen an"},
  "Indique le nom du produit d'abord": {en:"Enter the product name first",ar:"اكتب اسم المنتج أولًا",nl:"Geef eerst de productnaam",es:"Indica primero el nombre del producto",de:"Gib zuerst den Produktnamen an"},
  "Indique le nom lu sur l'\\u00E9tiquette": {en:"Enter the name on the label",ar:"اكتب الاسم كما هو على الملصق",nl:"Geef de naam op het etiket",es:"Indica el nombre de la etiqueta",de:"Gib den Namen vom Etikett an"},
  "Indisponible — vérifie ta connexion": {en:"Unavailable — check your connection",ar:"غير متاح — تحقق من اتصالك",nl:"Niet beschikbaar — check verbinding",es:"No disponible — comprueba tu conexión",de:"Nicht verfügbar — prüf deine Verbindung"},
  "Indisponible pour le moment": {en:"Unavailable right now",ar:"غير متاح حاليًا",nl:"Nu niet beschikbaar",es:"No disponible por ahora",de:"Gerade nicht verfügbar"},
  "Installation non disponible sur ce navigateur": {en:"Install not available on this browser",ar:"التثبيت غير متاح على هذا المتصفح",nl:"Installeren kan niet in deze browser",es:"Instalación no disponible en este navegador",de:"Installation in diesem Browser nicht möglich"},
  "Jeton expiré — réactive les notifications": {en:"Token expired — turn notifications back on",ar:"انتهت صلاحية الرمز — أعد تفعيل الإشعارات",nl:"Token verlopen — zet meldingen weer aan",es:"Token caducado — reactiva las notificaciones",de:"Token abgelaufen — aktiviere Mitteilungen"},
  "La carte de fond ne répond pas": {en:"The base map isn't responding",ar:"خريطة الخلفية لا تستجيب",nl:"Achtergrondkaart reageert niet",es:"El mapa base no responde",de:"Hintergrundkarte antwortet nicht"},
  "La carte n'est pas encore prête": {en:"The map isn't ready yet",ar:"الخريطة ليست جاهزة بعد",nl:"De kaart is nog niet klaar",es:"El mapa aún no está listo",de:"Die Karte ist noch nicht bereit"},
  "Laisse au moins ton nom et un moyen de te joindre": {en:"Leave at least your name and a way to reach you",ar:"اترك على الأقل اسمك ووسيلة للتواصل معك",nl:"Laat minstens je naam en contactgegevens achter",es:"Deja al menos tu nombre y un contacto",de:"Lass mindestens Namen und Kontakt da"},
  "Le don n’est pas encore branché": {en:"Donations aren’t hooked up yet",ar:"التبرع غير مفعّل بعد",nl:"Doneren is nog niet aangesloten",es:"Las donaciones aún no funcionan",de:"Spenden ist noch nicht aktiv"},
  "Lien copi\\u00e9 \\u2014 colle-le o\\u00f9 tu veux !": {en:"Link copied — paste it anywhere!",ar:"تم نسخ الرابط — ألصقه حيث تشاء!",nl:"Link gekopieerd — plak hem overal!",es:"Enlace copiado — ¡pégalo donde quieras!",de:"Link kopiert — einfach einfügen!"},
  "Magasin certifié": {en:"Store certified",ar:"متجر موثّق",nl:"Winkel erkend",es:"Tienda certificada",de:"Laden zertifiziert"},
  "Magofeed installé !": {en:"Magofeed installed!",ar:"تم تثبيت Magofeed!",nl:"Magofeed staat er!",es:"¡Magofeed instalado!",de:"Magofeed installiert!"},
  "Magofeed reste 100% sans alcool \\u2014 cette proposition ne peut pas entrer au catalogue": {en:"Magofeed stays 100% alcohol-free — this one can't join the catalog",ar:"Magofeed يبقى بلا كحول 100% — لا يمكن إدراج هذا الاقتراح في الكتالوج",nl:"Magofeed blijft 100% alcoholvrij — dit voorstel kan niet in de catalogus",es:"Magofeed es 100% sin alcohol — esta propuesta no puede entrar al catálogo",de:"Magofeed bleibt 100% alkoholfrei — das kommt nicht in den Katalog"},
  "Magofeed reste sans alcool": {en:"Magofeed stays alcohol-free",ar:"Magofeed يبقى بلا كحول",nl:"Magofeed is alcoholvrij",es:"Magofeed sigue sin alcohol",de:"Magofeed bleibt alkoholfrei"},
  "Marqué comme ton magasin": {en:"Marked as your store",ar:"حُدّد كمتجرك",nl:"Dit is nu jouw winkel",es:"Marcada como tu tienda",de:"Als dein Laden markiert"},
  "Marqué en rupture": {en:"Marked out of stock",ar:"حُدّد كنافد",nl:"Uitverkocht",es:"Marcada sin stock",de:"Ausverkauft markiert"},
  "Marqué en stock": {en:"Marked in stock",ar:"حُدّد كمتوفر",nl:"Op voorraad",es:"Marcada en stock",de:"Vorrätig markiert"},
  "Merci — signalé, on vérifie ce lieu · +2 pts": {en:"Thanks — reported, we'll check this place · +2 pts",ar:"شكرًا — تم الإبلاغ، سنتحقق من المكان · +2 نقطة",nl:"Bedankt — gemeld, we checken dit · +2 pts",es:"Gracias — reportado, revisamos el sitio · +2 pts",de:"Danke — gemeldet, wir prüfen den Ort · +2 pts"},
  "Merci ! Ton avis nous aide énormément.": {en:"Thanks! Your feedback helps a lot.",ar:"شكرًا! رأيك يساعدنا كثيرًا.",nl:"Bedankt! Je mening helpt ons enorm.",es:"¡Gracias! Tu opinión nos ayuda muchísimo.",de:"Danke! Dein Feedback hilft uns sehr."},
  "Merci \\u2014 l'\\u00E9quipe va corriger ce nom": {en:"Thanks — the team will fix this name",ar:"شكرًا — سيصحّح الفريق هذا الاسم",nl:"Bedankt — het team past de naam aan",es:"Gracias — el equipo corregirá el nombre",de:"Danke — das Team korrigiert den Namen"},
  "Merci. Sincèrement — ça compte plus que tu ne crois.": {en:"Thank you. Truly — it means more than you know.",ar:"شكرًا من القلب — هذا يعني أكثر مما تظن.",nl:"Bedankt. Echt — dit telt meer dan je denkt.",es:"Gracias. De verdad — cuenta más de lo que crees.",de:"Danke. Wirklich — das bedeutet mehr, als du denkst."},
  "Missions du jour accomplies \\u00B7 +10 pts bonus !": {en:"Daily missions done · +10 bonus pts!",ar:"أنجزت مهام اليوم · +10 نقاط إضافية!",nl:"Dagmissies voltooid · +10 pts bonus!",es:"¡Misiones del día completadas · +10 pts extra!",de:"Tagesmissionen geschafft · +10 pts Bonus!"},
  "Nettoyage des chasses…": {en:"Cleaning up hunts…",ar:"جارٍ تنظيف عمليات البحث…",nl:"Jachten opruimen…",es:"Limpiando las búsquedas…",de:"Jagden aufräumen…"},
  "Nettoyage du classement\\u2026": {en:"Cleaning up the leaderboard…",ar:"جارٍ تنظيف الترتيب…",nl:"Klassement opruimen…",es:"Limpiando la clasificación…",de:"Rangliste aufräumen…"},
  "Non supportées sur ce navigateur": {en:"Not supported on this browser",ar:"غير مدعومة على هذا المتصفح",nl:"Niet ondersteund in deze browser",es:"No compatibles con este navegador",de:"In diesem Browser nicht unterstützt"},
  "Notifications activées": {en:"Notifications on",ar:"تم تفعيل الإشعارات",nl:"Meldingen aan",es:"Notificaciones activadas",de:"Mitteilungen an"},
  "Notifications désactivées": {en:"Notifications off",ar:"تم إيقاف الإشعارات",nl:"Meldingen uit",es:"Notificaciones desactivadas",de:"Mitteilungen aus"},
  "OK \\u2014 rescanne le code (ou r\\u00e9appuie sur Scanner)": {en:"OK — rescan the code (or tap Scan again)",ar:"تمام — أعد مسح الرمز (أو اضغط «مسح» من جديد)",nl:"OK — scan de code opnieuw (of tik op Scannen)",es:"OK — reescanea el código (o pulsa Escanear)",de:"OK — scann den Code neu (oder nochmal auf Scannen)"},
  "Ouvre d'abord la fiche d'un magasin": {en:"Open a store page first",ar:"افتح بطاقة متجر أولًا",nl:"Open eerst de fiche van een winkel",es:"Abre primero la ficha de una tienda",de:"Öffne zuerst einen Ladeneintrag"},
  "Ouvre d'abord un magasin": {en:"Open a store first",ar:"افتح متجرًا أولًا",nl:"Open eerst een winkel",es:"Abre primero una tienda",de:"Öffne zuerst einen Laden"},
  "Ouvre une boisson pour lancer une chasse": {en:"Open a drink to start a hunt",ar:"افتح مشروبًا لبدء بحث",nl:"Open een drank om een jacht te starten",es:"Abre una bebida para lanzar una búsqueda",de:"Öffne ein Getränk für eine Jagd"},
  "Permission refusée par le téléphone": {en:"Permission denied by your phone",ar:"الهاتف رفض الإذن",nl:"Toestemming geweigerd door telefoon",es:"Permiso denegado por el teléfono",de:"Vom Handy verweigert"},
  "Photo non envoy\\u00E9e (v\\u00E9rifie la r\\u00E8gle discoveryPhotos)": {en:"Photo not sent (check the discoveryPhotos rule)",ar:"لم تُرسل الصورة (تحقق من قاعدة discoveryPhotos)",nl:"Foto niet verstuurd (check de regel discoveryPhotos)",es:"Foto no enviada (revisa la regla discoveryPhotos)",de:"Foto nicht gesendet (prüf die Regel discoveryPhotos)"},
  "Photo pas encore disponible pour cette boisson": {en:"No photo yet for this drink",ar:"لا صورة بعد لهذا المشروب",nl:"Nog geen foto voor deze drank",es:"Foto aún no disponible para esta bebida",de:"Noch kein Foto für dieses Getränk"},
  "Photo retir\\u00E9e (canette stylis\\u00E9e) \\u2014 sur cet appareil": {en:"Photo removed (stylized can) — on this device",ar:"أُزيلت الصورة (علبة مرسومة) — على هذا الجهاز",nl:"Foto weg (gestileerd blikje) — op dit toestel",es:"Foto retirada (lata estilizada) — en este dispositivo",de:"Foto entfernt (Stil-Dose) — auf diesem Gerät"},
  "Photo sugg\\u00E9r\\u00E9e \\u00B7 +1 pt \\u2014 l'admin va la v\\u00E9rifier": {en:"Photo suggested · +1 pt — an admin will check it",ar:"تم اقتراح الصورة · +1 نقطة — سيتحقق منها المشرف",nl:"Foto voorgesteld · +1 pt — de admin checkt ze",es:"Foto sugerida · +1 pt — el admin la revisará",de:"Foto vorgeschlagen · +1 pt — Admin prüft es"},
  "Place le magasin : GPS ou carte": {en:"Place the store: GPS or map",ar:"حدّد موقع المتجر: GPS أو الخريطة",nl:"Plaats de winkel: GPS of kaart",es:"Sitúa la tienda: GPS o mapa",de:"Laden setzen: GPS oder Karte"},
  "Position de ce magasin inconnue": {en:"Store location unknown",ar:"موقع هذا المتجر غير معروف",nl:"Locatie van die winkel onbekend",es:"Tienda sin ubicación conocida",de:"Position dieses Ladens unbekannt"},
  "Position introuvable — autorise la localisation (Réglages iPhone)": {en:"Location not found — allow location (iPhone Settings)",ar:"تعذّر تحديد الموقع — اسمح بالموقع (إعدادات iPhone)",nl:"Locatie niet gevonden — sta locatie toe (iPhone-instellingen)",es:"Ubicación no encontrada — permite la localización (Ajustes iPhone)",de:"Standort nicht gefunden — Ortung erlauben (iPhone-Einstellungen)"},
  "Pour la couper, passe par les Réglages de ton téléphone": {en:"To turn it off, go to your phone's Settings",ar:"لإيقافه، مرّ عبر إعدادات هاتفك",nl:"Uitzetten doe je via de Instellingen van je telefoon",es:"Para desactivarla, ve a los Ajustes de tu teléfono",de:"Zum Ausschalten geh in die Einstellungen deines Handys"},
  "Pr\\u00e9paration de ton lien\\u2026": {en:"Preparing your link…",ar:"جارٍ تجهيز رابطك…",nl:"Je link voorbereiden…",es:"Preparando tu enlace…",de:"Link wird erstellt…"},
  "Promotion locale seulement (erreur Firestore, v\\u00E9rifie les r\\u00E8gles)": {en:"Promoted locally only (Firestore error, check the rules)",ar:"ترقية محلية فقط (خطأ Firestore، تحقق من القواعد)",nl:"Alleen lokaal gepromoveerd (Firestore-fout, check de regels)",es:"Promoción solo local (error de Firestore, revisa las reglas)",de:"Nur lokal befördert (Firestore-Fehler, prüf die Regeln)"},
  "Proposition envoy\\u00E9e \\u00B7 +2 pts \\u2014 \\u00E0 la communaut\\u00E9 de voter !": {en:"Suggestion sent · +2 pts — now the community votes!",ar:"أُرسل الاقتراح · +2 نقطة — والتصويت للمجتمع!",nl:"Voorstel verstuurd · +2 pts — nu stemt de community!",es:"Propuesta enviada · +2 pts — ¡ahora vota la comunidad!",de:"Vorschlag gesendet · +2 pts — die Community stimmt ab!"},
  "Pseudo mis à jour !": {en:"Username updated!",ar:"تم تحديث الاسم المستعار!",nl:"Bijnaam aangepast!",es:"¡Apodo actualizado!",de:"Name aktualisiert!"},
  "Publication refusée": {en:"Post rejected",ar:"تم رفض النشر",nl:"Plaatsen geweigerd",es:"Publicación rechazada",de:"Posten abgelehnt"},
  "Rafale terminée": {en:"Burst done",ar:"انتهى المسح المتتابع",nl:"Burst klaar",es:"Ráfaga terminada",de:"Burst beendet"},
  "Recharge la page": {en:"Reload the page",ar:"أعد تحميل الصفحة",nl:"Pagina herladen",es:"Recarga la página",de:"Lad die Seite neu"},
  "Recherche de ta position…": {en:"Finding your location…",ar:"جارٍ البحث عن موقعك…",nl:"Je locatie zoeken…",es:"Buscando tu ubicación…",de:"Standort wird gesucht…"},
  "Recherche de ta position\\u2026": {en:"Finding your location…",ar:"جارٍ البحث عن موقعك…",nl:"Je locatie zoeken…",es:"Buscando tu ubicación…",de:"Standort wird gesucht…"},
  "Reconnecte-toi avec Google puis réessaie — rien n'a été supprimé": {en:"Sign in with Google again, then retry — nothing was deleted",ar:"أعد تسجيل الدخول بـ Google ثم حاول — لم يُحذف شيء",nl:"Meld je opnieuw aan met Google — er is niets verwijderd",es:"Vuelve a entrar con Google e inténtalo — no se ha borrado nada",de:"Neu bei Google anmelden und nochmal — nichts gelöscht"},
  "Réessaie dans un instant": {en:"Try again in a moment",ar:"أعد المحاولة بعد لحظة",nl:"Probeer straks opnieuw",es:"Inténtalo en un momento",de:"Versuch es gleich nochmal"},
  "Refusée par le téléphone — va dans Réglages > Magofeed > Position": {en:"Denied by your phone — go to Settings > Magofeed > Location",ar:"رفضها الهاتف — اذهب إلى الإعدادات > Magofeed > الموقع",nl:"Telefoon weigert — ga naar Instellingen > Magofeed > Locatie",es:"Denegada por el teléfono — ve a Ajustes > Magofeed > Ubicación",de:"Vom Handy verweigert — geh zu Einstellungen > Magofeed > Standort"},
  "Réglage non enregistré, réessaie": {en:"Setting not saved, try again",ar:"لم يُحفظ الإعداد، أعد المحاولة",nl:"Instelling niet bewaard, opnieuw",es:"Ajuste no guardado, reintenta",de:"Nicht gespeichert, nochmal"},
  "Remplissage lanc\\u00e9 c\\u00f4t\\u00e9 serveur\\u2026 tu peux quitter l'\\u00e9cran": {en:"Filling started on the server… you can leave this screen",ar:"بدأت التعبئة على الخادم… يمكنك مغادرة الشاشة",nl:"Aanvullen gestart… je mag het scherm sluiten",es:"Relleno iniciado en el servidor… puedes salir",de:"Läuft auf dem Server… du kannst den Bildschirm verlassen"},
  "Réparation en cours…": {en:"Repairing…",ar:"جارٍ الإصلاح…",nl:"Aan het herstellen…",es:"Reparando…",de:"Reparatur läuft…"},
  "Réparé ! Position + chasses mises à jour. Relance le diagnostic.": {en:"Fixed! Location + hunts updated. Run the diagnostic again.",ar:"تم الإصلاح! حُدّث الموقع وعمليات البحث. أعد تشغيل التشخيص.",nl:"Hersteld! Locatie + jachten bijgewerkt. Doe de diagnose opnieuw.",es:"¡Reparado! Ubicación + búsquedas al día. Repite el diagnóstico.",de:"Repariert! Standort + Jagden aktualisiert. Starte die Diagnose neu."},
  "Réservé à l'admin": {en:"Admins only",ar:"مخصص للمشرف",nl:"Enkel voor admin",es:"Solo para el admin",de:"Nur für Admins"},
  "Retir\\u00E9 en local \\u2014 v\\u00E9rifie ta connexion pour le partag\\u00E9": {en:"Removed locally — check your connection for the shared one",ar:"أُزيل محليًا — تحقق من اتصالك للنسخة المشتركة",nl:"Lokaal weg — check je verbinding voor het gedeelde",es:"Retirado en local — revisa tu conexión para lo compartido",de:"Lokal entfernt — für Geteiltes prüf die Verbindung"},
  "Retiré de tes magasins": {en:"Removed from your stores",ar:"أُزيل من متاجرك",nl:"Uit je winkels gehaald",es:"Retirada de tus tiendas",de:"Aus deinen Läden entfernt"},
  "Rupture signalée · +5 pts": {en:"Out of stock reported · +5 pts",ar:"تم الإبلاغ عن النفاد · +5 نقاط",nl:"Uitverkocht · +5 pts",es:"Sin stock reportado · +5 pts",de:"Ausverkauft gemeldet · +5 pts"},
  "Sauvegarde lancée…": {en:"Backup started…",ar:"بدأ النسخ الاحتياطي…",nl:"Back-up gestart…",es:"Respaldo iniciado…",de:"Backup gestartet…"},
  "Signalé · +3 pts": {en:"Reported · +3 pts",ar:"تم الإبلاغ · +3 نقاط",nl:"Gemeld · +3 pts",es:"Reportado · +3 pts",de:"Gemeldet · +3 pts"},
  "Signalement envoyé. Merci, on regarde.": {en:"Report sent. Thanks, we're on it.",ar:"أُرسل البلاغ. شكرًا، سنطّلع عليه.",nl:"Melding verstuurd. Bedankt, we kijken.",es:"Reporte enviado. Gracias, lo revisamos.",de:"Meldung gesendet. Danke, wir schauen nach."},
  "Suppression annulée — ton compte est intact": {en:"Deletion canceled — your account is intact",ar:"أُلغي الحذف — حسابك سليم",nl:"Verwijderen gestopt — je account is intact",es:"Eliminación cancelada — tu cuenta está intacta",de:"Löschen abgebrochen — dein Konto ist unversehrt"},
  "Suppression distante échouée": {en:"Remote delete failed",ar:"فشل الحذف عن بُعد",nl:"Wissen op afstand mislukt",es:"Eliminación remota fallida",de:"Remote-Löschen fehlgeschlagen"},
  "Suppression du compte…": {en:"Deleting account…",ar:"جارٍ حذف الحساب…",nl:"Account verwijderen…",es:"Eliminando la cuenta…",de:"Konto wird gelöscht…"},
  "Sur iPhone : ajoute d'abord l'app à l'écran d'accueil": {en:"On iPhone: add the app to your home screen first",ar:"على iPhone: أضف التطبيق إلى الشاشة الرئيسية أولًا",nl:"Op iPhone: zet de app eerst op je beginscherm",es:"En iPhone: añade primero la app a la pantalla de inicio",de:"Auf iPhone: App zuerst auf den Home-Bildschirm"},
  "Tape 1 ou 2": {en:"Type 1 or 2",ar:"اكتب 1 أو 2",nl:"Tik 1 of 2",es:"Escribe 1 o 2",de:"Tippe 1 oder 2"},
  "Tape sur la carte \\u00E0 l'emplacement exact du magasin": {en:"Tap the map at the store's exact spot",ar:"اضغط على الخريطة في موقع المتجر بالضبط",nl:"Tik op de kaart op de exacte plek van de winkel",es:"Toca en el mapa el punto exacto de la tienda",de:"Tippe auf die Karte genau auf den Laden"},
  "Test envoyé ! Ferme l'app : la notif doit arriver dans quelques secondes": {en:"Test sent! Close the app: the notification should arrive in a few seconds",ar:"أُرسل الاختبار! أغلق التطبيق: سيصل الإشعار خلال ثوانٍ",nl:"Test verstuurd! Sluit de app: de melding komt binnen enkele seconden",es:"¡Prueba enviada! Cierra la app: la notificación llegará en unos segundos",de:"Test gesendet! Schließ die App: die Mitteilung kommt in Sekunden"},
  "Trac\\u00e9 indisponible \\u2014 voici la fiche du magasin": {en:"No route available — here's the store page",ar:"المسار غير متاح — إليك بطاقة المتجر",nl:"Geen route — hier is de winkelfiche",es:"Ruta no disponible — mira la ficha de la tienda",de:"Route nicht verfügbar — hier der Ladeneintrag"},
  "Tu as déjà voté pour cette découverte": {en:"You already voted on this discovery",ar:"صوّتّ لهذا الاكتشاف من قبل",nl:"Je stemde al voor deze ontdekking",es:"Ya has votado este descubrimiento",de:"Schon für diese Entdeckung gestimmt"},
  "Tu ne recevras plus d'e-mails de chasse": {en:"You won't get hunt emails anymore",ar:"لن تصلك رسائل البحث بعد الآن",nl:"Je krijgt geen jacht-e-mails meer",es:"Ya no recibirás correos de búsqueda",de:"Du bekommst keine Jagd-E-Mails mehr"},
  "Tu viens de te prononcer sur cette boisson \\u2014 laisse passer un moment": {en:"You just voted on this drink — give it a moment",ar:"صوّتّ للتو على هذا المشروب — انتظر قليلًا",nl:"Je hebt je net over deze drank uitgesproken — wacht even",es:"Acabas de opinar sobre esta bebida — espera un poco",de:"Du hast gerade über dieses Getränk abgestimmt — warte kurz"},
  "Tutoriel relancé !": {en:"Tutorial restarted!",ar:"أُعيد تشغيل الشرح!",nl:"Tutorial herstart!",es:"¡Tutorial reiniciado!",de:"Tutorial gestartet!"},
  "URL non valide : il faut une image images.openfoodfacts.org": {en:"Invalid URL: it must be an images.openfoodfacts.org image",ar:"رابط غير صالح: يلزم صورة من images.openfoodfacts.org",nl:"Ongeldige URL: foto van images.openfoodfacts.org nodig",es:"URL no válida: hace falta una imagen images.openfoodfacts.org",de:"URL ungültig: es braucht ein Bild von images.openfoodfacts.org"},
  "Vérification indisponible — envoie ta demande à la main": {en:"Check unavailable — send your request by hand",ar:"التحقق غير متاح — أرسل طلبك يدويًا",nl:"Controle niet beschikbaar — stuur je aanvraag zelf",es:"Verificación no disponible — envía tu solicitud a mano",de:"Prüfung nicht verfügbar — schick deine Anfrage manuell"},
};

/* Rend le texte dans la langue courante. Inconnu ou langue sans traduction :
   on rend le français d'origine. Un message dans la mauvaise langue reste
   lisible ; un message vide ne l'est pas. */
function tr(fr) {
  try {
    var s = String(fr == null ? "" : fr);
    if (!s) return s;
    var lg = (typeof curLang !== "undefined" && curLang) ? curLang : "fr";
    if (lg === "fr") return s;
    var e = TEXTES[s];
    if (!e) return s;
    return e[lg] || s;
  } catch (e) { return String(fr == null ? "" : fr); }
}
