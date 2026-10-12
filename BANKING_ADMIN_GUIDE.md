# Attribution manuelle des IBAN, cartes et OTP des opérations sortantes

Travail local du 11 octobre 2026. Aucun déploiement ni accès à une base de production.

## IBAN et cartes dans le back-office

Dans `/admin`, ouvrir « IBAN et cartes » sur la ligne du client, puis choisir son compte.

- Le compte créé à l’inscription ou depuis l’espace client n’a plus d’IBAN généré. Le client voit « IBAN en attente d’attribution ».
- Saisir l’IBAN destiné au client et cliquer « Attribuer l’IBAN ». Pour le modifier, saisir la nouvelle valeur puis enregistrer. Contrôles du format, du pays/longueur et de la clé de contrôle ; doublons refusés. Une version périmée du compte exige le rechargement du dossier.
- Saisir le numéro de carte fourni par l’émetteur, son expiration, son type, son plafond et son statut. Aucun PIN bancaire ni CVV n’est demandé. L’attribution d’une nouvelle carte exige un compte avec IBAN, client actif et KYC validé.
- « Modifier » permet de changer ces données. Laisser le numéro vide pour conserver celui qui est enregistré. Une version périmée de la carte est refusée.
- Le numéro est chiffré. Les listes restent masquées ; le client révèle son numéro en confirmant son mot de passe. Le contrôle de doublon couvre les nouvelles empreintes et les cartes historiques sans empreinte. Aucun numéro complet n’est ajouté aux journaux ou aux messages temps réel.
- Une carte bloquée par l’administrateur ne peut pas être réactivée par le client. Le client conserve le blocage/déblocage des cartes qu’il bloque lui-même, si elles sont valides.
- Les nouveaux IBAN/cartes ne sont jamais inventés par l’application. Le prestataire et l’éditeur assurent leur attribution bancaire effective et la cohérence des données saisies.

Dans l’espace client, « Nouvelle carte » envoie maintenant une demande en attente. L’administrateur peut la sélectionner avant l’attribution. Les modifications d’IBAN et de cartes déclenchent une actualisation du client connecté ; un rechargement permet également de lire l’état courant.

## Chaque opération sortante exige un OTP administrateur

Ce parcours couvre les virements, chaque occurrence d’une échéance récurrente et les ajustements débiteurs demandés depuis le back-office.

1. Une demande est enregistrée avec le statut `pending`. Aucun débit ni crédit au destinataire n’est effectué à cette étape.
2. Dans « Opérations sortantes / OTP », l’administrateur clique « OTP », saisit un message pour le client et génère le code. Le code apparaît à l’administrateur ; il doit le transmettre au client par son canal sécurisé habituel. L’application ne l’envoie pas automatiquement par email ou SMS.
3. Dans « Comptes », le client développe l’opération : le message et l’expiration sont affichés, puis il saisit son code. Seul le propriétaire peut le confirmer.
4. L’administrateur peut ensuite approuver. Le serveur exige un code généré, confirmé et non expiré, recontrôle le solde, le compte actif, le KYC et les devises, puis applique le débit une seule fois.
5. Refus ou annulation d’une nouvelle demande : aucun débit, aucun faux remboursement. Une demande historique dont les fonds étaient déjà débités conserve son remboursement unique.

Le code est aléatoire à six chiffres, haché côté serveur, limité à cinq erreurs et lié à une seule opération. Une régénération invalide la confirmation précédente. L’expiration est contrôlée à la saisie et à l’approbation. Les écritures sensibles verrouillent la transaction et les comptes ; les verrous des comptes sont pris dans un ordre stable.

Les échéances ne débitent plus automatiquement. Chaque occurrence crée une demande avec sa propre clé d’idempotence et nécessite son propre OTP. Le calendrier mensuel conserve l’intervalle historique de 30 jours ; sa transformation en calendrier civil reste ouverte.

Les crédits entrants simples restent possibles sans OTP sortant. Le budget ne compte désormais que les opérations `completed`, excluant demandes en attente et annulations.

## Schéma et compatibilité

La version 4 autorise `accounts.iban=NULL`, ajoute `iban_version`, les demandes de carte, les empreintes/versions et le verrou administrateur des cartes, ainsi que `transactions.debit_applied` et `destination_account_id`.

Les IBAN/cartes historiques sont conservés. Les transactions historiques conservent `debit_applied=TRUE`, car le parcours antérieur débitait les fonds à la demande ; les nouvelles demandes déclarent explicitement `FALSE`. Aucun historique n’est supprimé ni réécrit par le travail local. La migration n’a été exécutée que sur les bases de tests pg-mem.

Les numéros de carte et leurs empreintes utilisent `ENCRYPTION_KEY`. Garder cette clé stable. Le stockage d’un numéro ne constitue pas à lui seul une intégration d’émission de cartes. Les paiements et traitements externes restent manuels ; les modifications de métadonnées ne sont pas des appels à un émetteur externe.

## Routes

- `PATCH /api/admin/accounts/:accountId/iban` : `{ iban, version }`.
- `GET /api/admin/accounts/:accountId/cards` : cartes masquées et demandes.
- `POST /api/admin/accounts/:accountId/cards` : `{ number, expiry, type, limits, status?, requestId? }`.
- `PATCH /api/admin/cards/:cardId` : `{ number?, expiry, type, limits, status, version }`.
- `POST /api/cards` : demande de carte, sans numéro généré.
- Les routes OTP et de revue existantes s’appliquent à toute opération sortante en attente.

## Recette à effectuer

Sur une base dédiée et avec des identifiants synthétiques uniquement :

1. Inscrire un client et vérifier l’absence d’IBAN. Valider son KYC. Attribuer un IBAN, le modifier et vérifier l’affichage client.
2. Demander une carte, l’attribuer, puis changer son numéro/plafond/statut. Vérifier le masquage, la révélation protégée et le refus de déblocage d’une carte bloquée par l’administrateur.
3. Créer un virement : le solde doit rester inchangé. Sans OTP confirmé, approbation refusée. Générer le code avec un message, le confirmer et approuver : débit exact une fois.
4. Reproduire avec un ajustement débiteur et une échéance arrivée à terme. Les deux doivent suivre le même parcours.
5. Tester mauvais code, expiration, régénération, refus, annulation et demandes multiples supérieures ensemble au solde. Vérifier que le budget n’inclut pas les demandes en attente/annulées.
6. Sur PostgreSQL réel de recette, vérifier deux approbations concurrentes d’une même opération : une seule doit réussir et produire un débit unique. Tester aussi deux administrateurs modifiant le même dossier : la seconde version ancienne doit être refusée.

Les tests automatisés utilisent pg-mem et des valeurs publiques d’exemple pour IBAN/PAN, sans opération bancaire réelle. La recette visuelle et les garanties PostgreSQL réelles restent à valider. Voir également `VALIDATION_GUIDE.md` pour préparer l’environnement local isolé.

Validation des IBAN : dépendance `iban@0.0.14`, documentation primaire [iban](https://github.com/nivalis-studio/iban). Ces vérifications de format ne prouvent pas l’existence ou la propriété d’un compte bancaire.
