# Les index Firestore — à déployer AVANT les fonctions de points

## Pourquoi

Firestore crée tout seul un index par champ. Mais dès qu'une requête filtre sur
**deux champs à la fois** — par exemple « les signalements de cette personne
depuis ce matin » — il lui faut un **index composite**, et celui-là ne se crée
pas tout seul. Sans lui, la requête ne renvoie pas zéro : elle **échoue**.

Les fonctions de points en font sept. Si tu les déploies sans les index, le
crédit des points plantera à la première contribution, en silence, dans les
journaux — et tu croiras que la bascule n'a pas marché.

## La commande

Depuis ton dossier Firebase, une seule fois :

```
firebase deploy --only firestore:indexes
```

Elle lit `firestore.indexes.json` — copie-le d'abord à côté de
`firestore.rules`, là où `firebase.json` va le chercher.

La construction prend quelques minutes en tâche de fond. Tu peux suivre
l'avancement dans la console Firebase, onglet **Firestore → Index**.

## Si tu vois quand même une erreur d'index

Le message d'erreur de Firestore contient toujours un **lien cliquable** qui
crée l'index manquant en un clic. C'est le filet de sécurité : si j'ai oublié
une requête, le lien te la donnera.

## Les sept index et à quoi ils servent

| Collection | Champs | Sert à |
|---|---|---|
| `reports` | `by` + `createdAt` | l'anti-rejeu : « cette personne a-t-elle déjà été créditée aujourd'hui ? » |
| `reports` | `storeId` + `createdAt` | l'entraide : qui a indiqué ce magasin récemment |
| `reports` | `by` + `huntCreditedBy` | le plafond par paire : éviter que deux amis se créditent en boucle |
| `reports` | `by` + `counted` | le filleul est-il vraiment actif |
| `reports` | `storeId` + `drinkId` + `type` + `createdAt` | l'anti-farm : les annonces contredites sur place |
| `referrals` | `parrain` + `status` | les plafonds de parrainage |
| `discoveries` | `votes` + nom du document | la liste des découvertes les plus votées, au démarrage de l'app |
