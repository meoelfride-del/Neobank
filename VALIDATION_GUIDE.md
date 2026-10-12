# Recette et étapes restant à valider

État local au 11 octobre 2026. Aucun déploiement réalisé. Les résultats initiaux de l’audit restent historiques.

Mise à jour : attribution/modification des IBAN et cartes, OTP des ajustements débiteurs et échéances, débit différé jusqu’à validation et budget des seules opérations réalisées sont ajoutés. Le parcours et les nouvelles vérifications sont dans [BANKING_ADMIN_GUIDE.md](BANKING_ADMIN_GUIDE.md). Les étapes ci-dessous restent applicables, mais le client doit désormais recevoir un IBAN avant ses opérations sortantes.

## Vérifications déjà réalisées

Mise à jour de la recette locale : PostgreSQL 18 est désormais configuré sur `127.0.0.1:5433`, base persistante `neobank_local`, API sur 4000. Inscription HTTP 201, session HTTP 200 et doublon HTTP 409 contrôlés sur cette base réelle. Le script `node scripts/check-local-postgres.cjs` a réussi les contrôles de rollback et de consommation concurrente du même TOTP, sans modification du schéma et avec suppression de ses seules données synthétiques. Il refuse toute autre cible. Cela complète les tests pg-mem ; l'ensemble des transactions bancaires concurrentes et la recette visuelle restent à valider.

Un administrateur local `admin@example.test` est disponible. Son mot de passe est dans `backend/.env`, champ `ADMIN_PASSWORD` : consulter ce fichier localement sans le partager. La connexion, la liste des utilisateurs, les statistiques et la liste des opérations en attente répondent HTTP 200. Ouvrir `http://localhost:5173/login`, puis accéder au backoffice. `npm run dev:all` démarre la configuration locale et redémarre PostgreSQL dédié si nécessaire.

- Tests backend : inscription et KYC, MFA, contrôle des sessions, rotation/révocation des jetons, sockets. Données synthétiques uniquement, base pg-mem.
- Tests frontend : compilation des styles, routes et utilitaires de langues.
- Build de production : 14 entrées SPA, dont `/security`.
- HTTP local : HTML et ressources compilées.
- Le script PostgreSQL historique exige une base de recette distincte ; la vérification locale ciblée décrite ci-dessus est désormais exécutée sur PostgreSQL réel.

Ces contrôles ne prouvent pas le rendu visuel ni l'ensemble des transactions bancaires concurrentes. Browser retourne toujours zéro instance disponible.

## 1. Préparer une recette locale isolée

Dans le dossier du projet, installer les dépendances si nécessaire : `npm ci`, puis `npm --prefix backend ci`.

Configurer `backend/.env` localement, sans envoyer ses secrets dans le chat : une `DATABASE_URL` de recette vide et dédiée, les clés `JWT_SECRET`, `JWT_REFRESH_SECRET` et `ENCRYPTION_KEY` fortes et stables, et les coordonnées d’un administrateur synthétique (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PHONE`). Garder `NODE_ENV=development`. Ne pas utiliser une base de production ni lancer le seed sur une base contenant des clients. Les clés existantes ne doivent pas être régénérées lorsqu’elles protègent déjà des données.

Démarrer `npm run dev:all`. Ouvrir l’adresse locale annoncée par Vite, normalement `http://localhost:5173`. Utiliser uniquement des comptes `@example.test` et le fichier `audit/kyc-synthetic.jpg` fourni, une image unie sans document personnel. Une image synthétique permet de tester le parcours informatique ; elle ne valide jamais l’identité d’une personne.

## 2. Valider l’inscription et le KYC dans le navigateur

1. Créer un compte synthétique avec tous les champs obligatoires. Mot de passe différent de sa confirmation : erreur attendue. Conditions non cochées : soumission empêchée.
2. Dans le parcours KYC, enregistrer le profil et déposer `audit/kyc-synthetic.jpg`. Soumettre : statut « En cours de vérification », modifications verrouillées.
3. Dans une fenêtre privée distincte, connecter l’administrateur. Ouvrir « Dossiers KYC », puis « Examiner KYC ». Vérifier le profil, l’agrandissement et le téléchargement de la photo.
4. Refuser avec un motif : le client doit voir le motif. Remplacer sa photo, soumettre de nouveau, puis valider le dossier synthétique pour tester les autorisations.
5. Annuler la validation avec un motif : les accès soumis au KYC doivent être refusés. Le client doit rejoindre le parcours KYC après sa prochaine requête protégée.
6. Avec un autre client, vérifier qu’aucune photo ni dossier du premier client n’est accessible. En navigation non authentifiée, la photo ne doit pas être disponible.

Noter PASS/FAIL pour chaque étape, l’URL, le navigateur, la taille de fenêtre, le comportement attendu et observé. Ne pas inclure de document personnel ni de secret dans les preuves.

## 3. Valider MFA, sessions et temps réel

1. Connecter le même client dans deux navigateurs ou profils distincts. Dans « Sécurité », vérifier que deux sessions apparaissent et que la session actuelle est identifiée.
2. Déconnecter l’autre session depuis la liste : la prochaine requête de cet autre navigateur doit échouer et le socket doit se fermer. La session courante doit rester utilisable.
3. Préparer la MFA : mauvais mot de passe refusé. Avec le bon mot de passe, ajouter la clé manuelle à une application d’authentification TOTP (6 chiffres, 30 secondes). Tester un mauvais code puis confirmer avec le code valide.
4. Se déconnecter. Sans OTP, la connexion demande le second facteur. Le code utilisé pour activer la MFA ne doit plus être accepté ; attendre le code suivant, puis se connecter.
5. Garder le compte connecté au-delà de la durée du jeton d’accès configurée : la prochaine requête normale ou `/auth/me` doit renouveler les jetons et reconnecter le socket. Les mises à jour en temps réel doivent continuer.
6. Se déconnecter normalement : les anciens jetons d’accès et de refresh doivent être refusés. Cette propriété est aussi couverte par les tests automatisés.

La migration des jetons implique une reconnexion des sessions historiques sans identifiant `sid`. Ce changement doit être annoncé lors d’une éventuelle mise en recette/déploiement.

## 4. Valider affichage, mobile et clavier

Tester inscription, KYC client, modale KYC administrateur et Sécurité à 360, 768 et 1440 pixels de largeur. Vérifier les champs, erreurs, boutons, images, téléchargements et absence de débordement qui masque une action. Les tableaux peuvent défiler horizontalement.

Parcourir les formulaires au clavier avec Tab, Maj+Tab et Entrée. Dans la modale KYC, vérifier le maintien du focus, Échap et le retour du focus au bouton d’ouverture. Vérifier les messages d’erreur sans dépendre uniquement d’une couleur.

Vérifier le footer « Copyright © 2026 Neobank ». Les nouveaux écrans KYC/MFA/sessions sont en français : les huit langues historiques ne signifient pas qu’ils sont intégralement traduits.

## 5. Valider les verrous et rollbacks sur PostgreSQL réel

Créer une base vide dédiée nommée par exemple `neobank_validation_recette`, distincte de `DATABASE_URL`. Dans PowerShell, définir localement l’URL de cette base, sans la publier :

```powershell
$env:TEST_DATABASE_URL = 'postgresql://UTILISATEUR:MOT_DE_PASSE@HOTE:5432/neobank_validation_recette'
$env:TEST_DATABASE_CONFIRM = 'ISOLATED'
node backend/test/postgres-validation.cjs
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:TEST_DATABASE_CONFIRM
```

Le script initialise le schéma applicatif dans cette base de recette, crée un utilisateur synthétique, vérifie le rollback réel et deux tentatives TOTP concurrentes. Résultat attendu : une seule tentative acceptée, l’autre refusée, puis message PASS. Il supprime uniquement son utilisateur synthétique et ses données liées ; le schéma de recette est conservé.

Ce contrôle ne remplace pas une recette complète KYC et sessions contre la même base réelle. Relancer les étapes 2 et 3 avec l’application locale configurée sur cette recette. Aucune URL PostgreSQL de test n’a été fournie ou utilisée pendant le travail actuel.

## 6. Valider l’intégration sur un environnement de recette hébergé

Aucun déploiement n’est effectué par ces travaux. Après publication autorisée sur un environnement de recette, vérifier frontend/API/DB, CORS, HTTPS, ouverture directe et rechargement de `/register`, `/onboarding`, `/admin` et `/security`, puis répéter les parcours ci-dessus. Ne pas déduire l’état du site public des résultats locaux.

## Développements encore ouverts

Ces éléments ne sont pas de simples validations manuelles : ils exigent encore du travail.

- Récupération et désactivation MFA, migration des anciens secrets MFA en clair, politique MFA obligatoire administrateur.
- Migration des jetons hors localStorage et protections associées si une authentification par cookies est retenue ; durcissement des limites distribuées et fermeture des sockets déjà ouverts lors d’une suspension administrative.
- Lots financiers de l’audit : devises, bénéficiaires externes, tâches récurrentes et budget. Ils ne sont pas marqués corrigés par les tests KYC/MFA/sessions.
- Traduction complète des nouveaux écrans et accessibilité globale.
- L’attribution/modification manuelle des IBAN et cartes est implémentée ; sa recette visuelle et sa vérification sur PostgreSQL réel restent à effectuer.
- Informations de l’éditeur et du responsable des données, contact et durées de conservation : compléter les valeurs réelles avant validation des pages publiques.

Pour clôturer une étape, conserver ses résultats et preuves dans la recette, avec date, version testée et PASS/FAIL. Ne marquer comme validé que le comportement effectivement observé.
