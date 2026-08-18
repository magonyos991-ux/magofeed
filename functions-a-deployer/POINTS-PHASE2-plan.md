# Points infalsifiables — ce que ça demande vraiment

> Écrit après avoir compté, dans `index.html`, **tous** les endroits où l'app
> crédite des points. Le but de cette note est qu'on arrête de traiter la
> Phase 2 comme un interrupteur : c'en est un pour la sécurité, mais le travail
> derrière n'est pas d'une ligne.

## Le constat

Le README dit, à juste titre : « quand tu auras basculé **tous** les crédits de
points côté serveur, active la version stricte de `firestore.rules` ». Ce
« tous » vaut la peine d'être chiffré.

| | |
|---|---|
| Endroits où le client fait `userStats.pts += …` | **28** |
| Couverts par `points-serveur-PHASE2.js` | **1** (la promotion d'une découverte, +50) |
| Restants | **27** |

Activer la version stricte des règles aujourd'hui **gèlerait les points** : le
client ne pourrait plus écrire `points`, et seule la promotion créditerait
encore. Les 27 autres actions deviendraient silencieusement gratuites. Ce
serait pire que le problème actuel — un utilisateur honnête verrait son
compteur cesser de monter sans explication.

## Les 28 crédits, et par quel bout les prendre

**21** s'accompagnent d'une écriture dans Firestore (confirmation de stock, prix,
photo, ajout d'une boisson à un magasin, signalement, découverte…). Ceux-là sont
les plus simples : une Cloud Function déclenchée sur le document écrit peut
créditer les points, exactement comme `antiFarmRupture` retire les siens. Le
client n'a plus qu'à afficher l'animation, sans toucher au solde.

**7** ne écrivent rien côté serveur — série de contributions (`bumpStreak`),
missions du jour, note d'une boisson, partage. Il n'y a pas d'événement Firestore
auquel s'accrocher : il faut soit une fonction *callable* avec sa propre
protection anti-rejeu, soit recalculer la récompense côté serveur à partir de
données déjà présentes (la série, par exemple, se déduit de l'historique des
contributions — c'est même plus sûr que de faire confiance au localStorage).

> Le détail ligne par ligne se régénère en une commande, plutôt que de vivre ici
> et de se périmer :
>
> ```bash
> grep -nE 'userStats\.pts *\+=' index.html
> ```

## L'ordre à respecter

Chaque crédit doit être déplacé **dans cet ordre**, un par un :

1. déployer la fonction serveur qui crédite ;
2. **puis** retirer le `userStats.pts += …` correspondant dans `index.html` ;
3. et seulement quand les 28 sont passés, activer la version stricte des règles.

Inverser 1 et 2 fait perdre les points aux gens le temps du déploiement. Faire 3
trop tôt gèle tout. C'est la seule vraie difficulté du chantier : il n'est pas
compliqué, il est **long et séquentiel**.

## Ce que ça vaut, et ce que ça coûte

Le classement est la boucle de rétention de Magofeed. Tant que les points sont
écrits par le téléphone, il est falsifiable en trente secondes depuis la console
du navigateur — et le jour où quelqu'un s'en vante, c'est la crédibilité du
classement entier qui tombe, pas seulement son score à lui.

Cela dit, le risque est proportionnel au nombre de joueurs qui ont un intérêt à
tricher. Aujourd'hui, avec une communauté qui démarre, ce n'est pas l'urgence
que c'est en apparence. La bonne stratégie n'est probablement pas de tout
basculer d'un coup, mais **par ordre de valeur du point** :

1. la promotion d'une découverte (**+50**) — déjà écrite, il ne reste qu'à
   déployer et retirer le crédit client (README, « Bascule Phase 2 ») ;
2. l'ajout d'une boisson repérée en magasin (**+30**) et la photo de découverte
   (**+20**) — les deux plus gros gains restants ;
3. le scan de frigo (**+10**) et les missions (**+10**) ;
4. le reste (**+1 à +5**), qui ne vaut pas la peine d'être triché à la main.

Après l'étape 2, l'essentiel de la valeur farmable est protégé. La version
stricte des règles, elle, attend la fin — elle est le verrou, pas le chantier.

## Pourquoi ce n'est pas fait ici

Ce fichier a été écrit sans accès au projet Firebase : je n'ai pu ni déployer,
ni tester une seule de ces fonctions. Écrire 27 déclencheurs sans jamais les
exécuter, sur le mécanisme qui distribue les récompenses de vraies personnes,
produirait du code d'apparence correcte que personne n'aurait vu tourner. Les
points en double et les points disparus se voient en production, sur les
comptes des gens, et se réparent à la main.

Ce qui manque n'est donc pas le code : c'est un émulateur Firestore et une passe
de test par crédit. À faire ensemble, dans l'ordre ci-dessus.
