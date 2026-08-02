# Magofeed — Stratégie d'abonnement (honnête, sans rien facturer de faux)

> Tu as une idée pour faire payer un abonnement. Voici le terrain préparé : ce
> qui est **jouable**, ce qui **rapporte vraiment**, et ce qu'il ne faut **jamais**
> faire. Rien n'est activé — c'est un plan à valider avec toi. Dis-moi ton idée
> et je te construis pile ce qu'il faut.

## La règle d'or (ne pas tuer l'app)
Magofeed vaut parce qu'il **rend service gratuitement** : trouver une boisson.
Si tu mets ça derrière un paywall au lancement, personne ne reste, et tu n'as
plus de communauté — donc plus de données — donc plus rien à vendre.
**On ne fait jamais payer pour voir où est une boisson.** On fait payer pour du
**confort en plus** (particuliers) et pour de la **visibilité / de la data** (pros).

---

## Piste A — Magofeed+ (abonnement particulier) · ~2,99 €/mois
Un abonnement « soutien + confort », honnête, qui n'enlève rien au gratuit :

| Avantage Magofeed+ | Pourquoi c'est OK (honnête) |
|---|---|
| **Alertes illimitées** (gratuit : 3 en même temps) | Le gratuit reste utile ; le power-user paie le confort |
| **Multi-zones** (surveiller plusieurs villes) | Utile aux gens qui voyagent / commandent pour d'autres |
| **Historique & courbe des prix** | Vraie valeur ajoutée, pas une info qu'on cache par méchanceté |
| **Badge « Supporter » + pseudo doré** | Cosmétique, statut, gratitude |
| **Accès anticipé** aux nouvelles fonctions | Récompense les premiers soutiens |
| **Zéro pub** (si un jour tu en mets) | Standard et honnête |

> ⚠️ **Le piège à éviter** : ne jamais transformer une fonction gratuite d'aujourd'hui
> en fonction payante demain (les gens le vivent comme un vol). Les alertes : garde
> un quota gratuit **généreux** (3), le + débloque l'illimité.

## Piste B — Le vrai argent : les PROS (B2B) 💰
C'est là que se trouve le revenu sérieux, et c'est 100 % honnête car ça repose
sur de la **vraie demande mesurée** :

1. **Magasin Partenaire vérifié** (~19–49 €/mois selon la taille)
   - Fiche mise en avant, badge « vérifié », stock tenu à jour officiellement.
   - **Insights de demande** : « on a cherché *Mogu Mogu* 40× près de chez toi ce mois-ci ».
   - Argument massue pour un night-shop : *on t'amène des gens qui cherchent exactement ce que tu vends.*
2. **Marque partenaire** (deal à négocier, pas un prix de catalogue)
   - « Boisson du moment » clairement identifiée **sponsorisée** (jamais caché).
   - Fiche produit enrichie + **data : où et quand ta boisson est la plus recherchée**.
3. **Rapports de demande** (data agrégée, anonymisée) vendus aux distributeurs.
   - « Voici les 20 boissons d'import les plus recherchées à Bruxelles ce trimestre. »
   - Ça, aucune autre source ne l'a. C'est ton or.

> Le dossier partenaire existe déjà : `growth/partenaire-marque.html`.
> Les messages de prospection aussi : `growth/premiers-messages.md`.

## Piste C — Dons / soutien libre (démarrage doux)
Un bouton « Soutenir Magofeed » (Ko-fi / Stripe) **sans rien promettre en échange**,
juste par gratitude + badge Supporter. Honnête, zéro engagement, teste l'envie de payer.
(⚠️ Jamais de fausse collecte « pour un serveur qui coûte cher » si c'est faux —
on l'a déjà dit, la crédibilité d'abord.)

---

## Comment on l'implémente proprement (le jour où tu dis go)
- **Encaissement** : Stripe (web) ou RevenueCat (si app store un jour). Jamais de
  numéro de carte qui passe par notre code.
- **Droits (entitlements) CÔTÉ SERVEUR** : l'abonnement actif est vérifié par une
  Cloud Function / un champ `users/{uid}.plan = "plus"` écrit **uniquement par le
  webhook Stripe** (jamais par le client — sinon tout le monde se met « plus »
  gratuitement en 2 clics de console). Les règles Firestore interdisent au client
  d'écrire son propre `plan`.
- **Dans l'app** : un simple `isPlus()` qui lit `users/{uid}.plan`, et on débloque
  l'illimité / le multi-zones / les courbes. Je peux préparer tout le câblage
  (quota d'alertes gratuit + déblocage + écran « Passer à Magofeed+ ») **sans
  activer le paiement**, et on branche Stripe quand tu es prêt.

## Ordre conseillé
1. **Maintenant** : rien à facturer. On finit d'attirer des utilisateurs (la valeur
   d'un abonnement = la taille de la communauté).
2. **Étape 1 (facile, honnête)** : bouton « Soutenir » + badge Supporter (Piste C).
3. **Étape 2 (le vrai revenu)** : décrocher 1–2 **magasins/marques partenaires** (Piste B).
4. **Étape 3** : Magofeed+ particulier (Piste A), une fois qu'il y a assez de monde
   pour que « alertes illimitées / multi-zones » ait du sens.

## Ce qu'on ne fait JAMAIS
- Faire payer pour voir où acheter une boisson (le cœur reste gratuit).
- Rendre payant ce qui était gratuit.
- Inventer une rareté, un faux « plus que 2 places », une fausse cagnotte.
- Promettre une récompense partenaire qui n'existe pas encore.

> Dis-moi ton idée d'abonnement : je te dis franchement si elle tient, et je
> construis l'offre + l'écran + le câblage (droits serveur) autour. Le paiement,
> on ne l'allume qu'ensemble.
