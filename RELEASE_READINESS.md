# NEO BANK — vérification et préparation de mise en ligne

État du 11 octobre 2026. Livraison préparée ; aucun déploiement réalisé.

## Résultats de la version finale

| Contrôle | Résultat |
| --- | --- |
| Tests backend | 53 réussis |
| Tests frontend | 11 réussis |
| Compilation et routes SPA | Réussie, 14 routes |
| Langues historiques | 8 fichiers, 57 clés de référence ; nouveaux parcours français |
| Audit npm, frontend et backend | 0 vulnérabilité signalée, développement inclus |
| Inscription et JWT atomiques, PostgreSQL réel | Réussis ; pas de compte incomplet après échec JWT |
| Rollback et concurrence TOTP, PostgreSQL réel | Réussis |
| Recette HTTP + PostgreSQL + WebSocket | Inscription, KYC privé/téléchargement, événements admin/client, profil complet, IBAN, carte modifiée, OTP, débit/crédit uniques et file SMS réussis |
| Livraison SMS réelle | Confirmée par l’utilisateur ; pas de nouvel envoi de test par l’agent |
| Interface visuelle/mobile | À confirmer dans le navigateur ; Browser ne fournit aucune instance |
| Frontend public actuel | HTTP 200, version antérieure |
| API publique actuelle | HTTP 502 |
| Connexion Vercel | Réauthentification nécessaire |
| Identité légale | À corriger : les identifiants transmis correspondent à la Banca d’Italia |

La recette PostgreSQL complète s’exécute via `node scripts/check-local-flows.cjs`. Elle crée un schéma `neobank_validation_flow_…` dans la base locale dédiée, désactive l’envoi SMS uniquement dans son processus, puis supprime ce schéma et ses données synthétiques. Les données courantes, leurs clés et leur configuration ne sont pas modifiées. Aucun SMS n’est envoyé par cette recette.

## Corrections issues de cette vérification

- Le bootstrap administrateur conserve le mot de passe, la suspension et le KYC d’un administrateur existant. Une collision avec un e-mail client est refusée.
- La création du compte, du profil, du compte bancaire et de la session constitue une seule transaction. Les jetons sont signés avant le commit.
- Les soumissions/décisions KYC et les nouvelles inscriptions actualisent le backoffice via WebSocket. Le statut KYC client reçoit la décision ; le polling reste un secours.
- Une suspension ferme immédiatement les sockets de l’utilisateur concerné.
- Le suivi SMS s’actualise toutes les 30 secondes quand son onglet est visible. Une panne de chargement du backoffice produit un message explicite.
- Les dépendances vulnérables ont été corrigées ; React Router est passé à 7.18.4. Le mode développement backend utilise `node --watch` au lieu de nodemon. Node 24.16.0 est la version de recette déclarée.
- La production refuse les clés JWT/chiffrement absentes, faibles ou d’exemple, une base autre que PostgreSQL et une activation TextBee incomplète.

## Conditions encore nécessaires pour publier

1. Rétablir l’accès Vercel et identifier le projet/équipe existants associés à `www.neo-finance.app`. Identifier aussi le dépôt dédié et le service Render ; ce dossier est actuellement dans un dépôt Git parent utilisateur, sans liaison de projet vérifiée. Ne pas publier ce dépôt parent.
2. Dans Render, lire le premier échec du service `neobank-api-meoelfride` et corriger la cause du 502. Vérifier PostgreSQL, `DATABASE_URL`, les clés existantes et le démarrage. Ne pas régénérer `ENCRYPTION_KEY` ni la clé KYC : elles protègent les données historiques.
3. Fournir l’identité réelle de l’exploitant, son adresse complète, son contact, sa juridiction et ses autorisations applicables. Les numéros `00950501007` et `00997670583` ne sont pas insérés dans NEO BANK : ils sont publiés par la [Banca d’Italia](https://collezionedarte.bancaditalia.it/web/guest/copyright). Ils ne permettent pas d’identifier une société distincte sous le nom NEOBANK.
4. Effectuer la recette visuelle à 360, 768 et 1440 pixels : inscription, KYC, modales admin, clavier, attribution IBAN/cartes, OTP et suivi SMS. L’actualisation en temps réel est vérifiée par des sockets réels ; son rendu visuel reste à confirmer.

## Ordre de déploiement proposé

1. Sauvegarder PostgreSQL de production et conserver les clés de chiffrement actuelles. Préparer une préproduction avec sa base isolée et les mêmes formats de clés ; ne pas y importer des documents personnels pour la recette.
2. Publier le backend depuis un dépôt dédié vérifié. `render.yaml` prépare un service avec PostgreSQL, une seule écoute API/WebSocket, TextBee sélectionné et l’envoi désactivé au départ. Reporter les accès TextBee directement dans Render. Le schéma ajoute uniquement les migrations 1 à 6 ; ne jamais exécuter le seed en production.
3. Vérifier `/api/health`, `/api/ready`, CORS, login, profils KYC, WebSockets et contrôle OTP sur la préproduction. Les sessions historiques sans `sid` imposeront une reconnexion.
4. Préparer le frontend avec `VITE_API_URL` et `VITE_SOCKET_URL` de la cible, et les champs `VITE_LEGAL_*` corrects. Publier une version Vercel de production sans attribuer immédiatement le domaine ; tester cette version puis la promouvoir. L’API doit être disponible avant le frontend.
5. Examiner la file SMS et activer TextBee explicitement en production. Vérifier une livraison sur un numéro autorisé.
6. Après promotion, vérifier santé, inscription, accès admin, réception WebSocket et absence d’erreurs. Conserver les références des versions précédentes pour un retour arrière.

Le retour arrière du frontend ne remplace pas une restauration des données. Les migrations additives restent en place ; ne pas supprimer les colonnes/tables ou rétablir un backend qui contourne les contrôles OTP. Prévoir un correctif compatible ou un retour applicatif compatible avec le schéma et les écritures déjà effectuées.

## Confidentialité de la livraison

Les fichiers `.env`, clés, données PostgreSQL, photos de clients et dépendances installées sont exclus de l’archive de livraison. `.vercelignore` exclut également le backend et les fichiers privés de l’envoi du frontend. Les modèles `.env.example` contiennent uniquement des champs à renseigner et des valeurs d’exemple.
