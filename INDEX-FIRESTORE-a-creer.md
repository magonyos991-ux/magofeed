# Deux index Firestore a creer (une minute, deux clics)

## Ce que ca change

Quand tu choisis une boisson sur la carte, l'application doit savoir QUELS
magasins du coin l'ont. Aujourd'hui, sans ces deux index, elle est obligee de
demander la liste des magasins qui ont cette boisson **dans le monde entier**,
puis de garder ceux du coin.

Mesure faite sur la base, pour Mountain Dew Original :

| | sans les index | avec les index |
|---|---|---|
| magasins interroges | 8 217 (le monde) | ceux de la zone seulement |
| telecharge | 2,1 Mo | quelques kilo-octets |
| temps | environ 5 secondes | immediat |

Sans les index, **l'application fonctionne quand meme** : elle est simplement
plus lente la premiere fois qu'on choisit une boisson (ensuite c'est en
memoire pour toute la session). Rien ne casse si tu ne fais rien.

## Comment les creer

### Le plus simple : deux liens a ouvrir

Ouvre chacun de ces liens, connecte en tant que proprietaire du projet, et
clique sur **Creer l'index**. La construction prend quelques minutes, tu n'as
rien a surveiller.

1. Index `drinks` + `lat` :
   https://console.firebase.google.com/v1/r/project/magofeed-7f621/firestore/indexes?create_composite=Ck1wcm9qZWN0cy9tYWdvZmVlZC03ZjYyMS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvc3RvcmVzL2luZGV4ZXMvXxABGgoKBmRyaW5rcxgBGgcKA2xhdBABGgwKCF9fbmFtZV9fEAE

2. Index `drinksVerified` + `lat` :
   https://console.firebase.google.com/v1/r/project/magofeed-7f621/firestore/indexes?create_composite=Ck1wcm9qZWN0cy9tYWdvZmVlZC03ZjYyMS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvc3RvcmVzL2luZGV4ZXMvXxABGhIKDmRyaW5rc1ZlcmlmaWVkGAEaBwoDbGF0EAEaDAoIX19uYW1lX18QAQ

### Ou, en ligne de commande

Les deux index sont declares dans **`functions-a-deployer/firestore.indexes.json`**,
avec les huit autres index deja en service (points, parrainage, signalements,
conversations). C'est le SEUL fichier d'index du depot, et ce n'est pas un detail :

> Un `firebase deploy --only firestore:indexes` remplace la liste COMPLETE des
> index du projet par celle du fichier qu'il lit. Deployer un fichier qui ne
> contiendrait que ces deux index supprimerait les huit autres — et avec eux les
> points, le parrainage, la liste des signalements et la messagerie.
> Il ne doit donc jamais y avoir deux fichiers d'index dans ce depot.

    firebase deploy --only firestore:indexes --project magofeed-7f621

en ayant copie `functions-a-deployer/firestore.indexes.json` a cote de ton
`firebase.json`, la ou la commande va le chercher.

## Rien d'autre a faire

L'application detecte toute seule si l'index existe : elle essaie la requete
bornee, et si Firestore repond que l'index manque, elle bascule sur l'autre
chemin sans erreur visible. Le jour ou les index sont crees, elle accelere
sans qu'on touche au code.
