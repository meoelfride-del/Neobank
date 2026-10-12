# Inscription et KYC manuel

Fonctionnalité locale du 9 octobre 2026, sans déploiement ni accès à des données de production.

## Parcours client

1. `/register` collecte nom, prénom, email, téléphone international, date et lieu de naissance, nationalité, adresse, ville et pays. Code postal et profession sont facultatifs. Le mot de passe est confirmé et les conditions doivent être acceptées.
2. `/onboarding` permet de compléter le profil des comptes existants, puis de déposer une photo de carte d’identité, passeport ou titre de séjour. Enregistrer le profil et la photo, puis sélectionner « Soumettre mon dossier KYC ».
3. Le dossier passe de `pending` à `in_review`. Les modifications sont verrouillées pendant la revue et après validation.
4. Un refus (`rejected`) affiche le motif au client. Le remplacement de la photo remet le dossier à compléter, puis une nouvelle soumission est possible.

Les nouveaux écrans d’inscription et KYC sont en français. Le contrôle des 57 clés historiques dans huit langues ne constitue pas une traduction des nouveaux écrans.

## Parcours administrateur

Dans `/admin`, ouvrir « Dossiers KYC », filtrer par statut, puis « Examiner KYC ». Le dossier affiche les coordonnées, le profil et la photo avec agrandissement et téléchargement authentifiés.

Après examen des informations et de la photo, cocher la confirmation de contrôle pour activer « Valider le KYC ». « Refuser le KYC » et « Annuler la revue / validation KYC » exigent un motif. L’annulation repasse le dossier à `pending` et le serveur bloque les fonctionnalités soumises au KYC, même pour une session déjà ouverte. L’interface rejoint le parcours KYC à la prochaine réponse `KYC_REQUIRED`.

Aucune validation automatique. Une décision envoyée depuis une ancienne version du profil ou de la photo échoue avec 409 et exige le rechargement du dossier. Un compte historiquement validé sans document conserve son statut ; un administrateur peut annuler sa validation et lui demander de compléter son dossier.

## Stockage et configuration

- Deux tables additives : `customer_profiles` et `kyc_documents`. `initDatabase()` les crée au démarrage du backend et enregistre la version de schéma 2. Les anciennes données sont préservées. Aucune migration n’a été appliquée à une base externe pendant ce travail.
- Photo limitée à 5 MiB et 20 millions de pixels, JPEG ou PNG non animé. Vérification du contenu réel, correction de l’orientation, réduction à 2400 pixels maximum par dimension et conversion JPEG. Les métadonnées de la photo sont retirées. Une seule photo courante par client ; un remplacement écrase la précédente.
- Le contenu est chiffré par AES-256-GCM dans PostgreSQL. `KYC_ENCRYPTION_KEY` permet une clé dédiée ; sinon `ENCRYPTION_KEY` est utilisée avec dérivation propre au KYC. Sans clé, le dépôt échoue avec 503. Utiliser une clé aléatoire forte et stable, conservée par le gestionnaire de secrets. Ne pas régénérer une clé existante sans réencrypter les documents.
- Aucun fichier sur le disque du serveur, aucune URL publique ni photo dans localStorage. Le profil est stocké dans PostgreSQL ; il n’est pas chiffré par le chiffrement applicatif des photos.
- Lecture et téléchargement réservés au propriétaire authentifié et aux administrateurs. Réponses de dossier et photo `private, no-store`. Les URL Blob côté client sont temporaires.
- Journalisation du dépôt, de la soumission, de la revue, de l’annulation, de la consultation et du téléchargement. Aucun contenu de photo n’est ajouté aux journaux.

Routes client : `GET /api/accounts/kyc/status`, `PUT /api/accounts/kyc/profile`, `POST /api/accounts/kyc/document` (multipart `document_type` + `document`), `GET /api/accounts/kyc/document?download=true`, `POST /api/accounts/kyc/submit`.

Routes admin : `GET /api/admin/kyc/:userId`, `GET /api/admin/kyc/:userId/document?download=true`, `POST /api/admin/kyc/:userId` avec `decision`, `documentId` courant et `reason` pour refus/annulation.

Mise à jour : le traitement manuel des IBAN et des cartes est désormais disponible dans le back-office, avec modification et contrôle des versions. Les nouveaux comptes attendent l’attribution d’un IBAN. Voir `BANKING_ADMIN_GUIDE.md` pour ce parcours et l’OTP obligatoire des opérations sortantes.

## Vérification

Commandes : `npm --prefix backend test`, `npm test`, `npm run i18n:check`, `npm run build`, `node audit/lot1-check.mjs kyc-build-results.json`.

Les tests HTTP utilisent une base pg-mem isolée et des images de couleur unie créées en mémoire : aucun document d’identité réel. Ils couvrent inscription, accès privé, chiffrement, formats invalides, limites, version du dossier, verrouillage, refus/remplacement, validation/annulation et anciens comptes. Ils ne prouvent pas les garanties de transactions ou verrous de PostgreSQL réel.

Le navigateur Browser explicitement sélectionné ne fournit aucune instance disponible (`agent.browsers.list()` = `[]`). Pas de vérification visuelle, clavier ou de parcours interactif dans ce navigateur.

Documentation des dépendances : [Multer](https://expressjs.com/en/resources/middleware/multer.html), [Sharp — constructor](https://sharp.pixelplumbing.com/api-constructor/), [Sharp — output](https://sharp.pixelplumbing.com/api-output/).
