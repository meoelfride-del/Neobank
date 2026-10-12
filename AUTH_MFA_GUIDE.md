# Lot 3 — première partie : double authentification

Modifications locales du 11 octobre 2026. Aucun déploiement, aucune modification de base externe.

Mise à jour : gestion des sessions ajoutée dans l’écran Sécurité. Les nouveaux jetons d’accès portent un identifiant de session vérifié côté serveur. Logout/révocation bloquent les jetons correspondants et ferment leurs sockets ; la rotation ferme l’ancien socket et le client reconnecte avec le nouveau jeton. Une révocation suit les versions renouvelées de la même session. Les anciennes sessions sans identifiant doivent se reconnecter. Voir `VALIDATION_GUIDE.md` pour la recette complète et les points encore ouverts.

L’écran `/security`, accessible depuis le lien « Sécurité » de la barre supérieure, permet de configurer une application TOTP. Le mot de passe actuel est obligatoire pour préparer la configuration et pour la confirmer avec un code à six chiffres. Une configuration expire après dix minutes et ne suffit jamais à activer la MFA.

`POST /api/auth/mfa/setup` reçoit `{ password }`, renvoie temporairement la clé manuelle et son expiration, avec `private, no-store`. `POST /api/auth/mfa/enable` reçoit `{ password, otp }` et ne renvoie aucun secret. L’inscription ne livre plus de secret MFA inutilisé.

Les nouvelles clés MFA sont chiffrées par AES-256-GCM avec une dérivation propre à la MFA depuis `ENCRYPTION_KEY`. Garder cette clé stable. Les comptes historiques dont le secret est en clair continuent à fonctionner ; leur migration complète vers le stockage chiffré reste à organiser. La clé dédiée au KYC ne contrôle pas les secrets MFA.

Les codes TOTP sont vérifiés sur la fenêtre courante de 30 secondes. Chaque pas de temps utilisé est enregistré par utilisateur dans `mfa_used_steps` et ne peut servir à une autre connexion. Le code de confirmation de l’activation est lui aussi consommé. Attendre le code suivant avant de se reconnecter. Aucune valeur de code ni secret n’est journalisée.

Le schéma 3 ajoute `mfa_setups` et `mfa_used_steps` au démarrage du backend. La connexion et la confirmation verrouillent la ligne utilisateur avant vérification/consommation. Les tests utilisent pg-mem : ils vérifient les rejets et transitions, sans démontrer les garanties de concurrence de PostgreSQL réel.

Le parcours est en français. La configuration affiche une clé manuelle, sans générateur de QR code ni envoi du secret à un service externe. La route privée est exclue de Web Analytics.

## Périmètre restant du lot 3

La preuve de possession avant activation, le rejeu TOTP, la révocation des jetons d’accès au logout et la gestion des sessions/sockets sont traités. Le lot reste ouvert pour la récupération et désactivation MFA, le stockage des jetons côté navigateur, la migration des secrets historiques, la fermeture des sockets lors d’une suspension administrative et l’obligation MFA administrateur. L’écran prévient que la récupération de l’appareil n’est pas encore disponible.

Le choix est de corriger le parcours existant Express/React sans remplacer le fournisseur d’authentification ni modifier les comptes de production.

## Vérification

`npm --prefix backend test`, `npm test`, `npm run build`, `npm run i18n:check`, `node audit/lot1-check.mjs lot3-results.json`.

Tests additionnels dans `backend/test/mfa.test.js` : mauvais mot de passe, configuration inactive/chiffrée, configuration absente/expirée, mauvais code, activation confirmée, rejeu refusé, code suivant accepté et compatibilité du secret historique. L’intégration HTTP teste le nouveau contrat et le refus de réutiliser le code d’activation lors du login.

Référence primaire de la bibliothèque existante : [otplib](https://github.com/yeojz/otplib). La version installée est conservée ; aucune migration vers une nouvelle API de bibliothèque n’a été effectuée.
