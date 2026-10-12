# Activer TextBee pour NEO BANK

L'adaptateur TextBee est ajouté aux notifications KYC et transferts. La file persistante et les contrôles anti-doublon sont conservés. L'envoi reste désactivé : aucun accès TextBee n'est renseigné et aucun SMS réel n'a été envoyé.

Vérification : 7 tests SMS et 15 tests KYC/bancaires réussis, compilation frontend réussie. Sur PostgreSQL réel local, migration version 6 et cycle d'acceptation/livraison vérifiés avec réponses simulées, sans appel externe ; les données de cet essai ont été supprimées. La livraison via votre Android reste à tester après configuration.

1. Créer votre compte sur https://app.textbee.dev/ et vérifier votre e-mail.
2. Télécharger l'application depuis https://textbee.dev/download, l'installer sur votre Android dédié et associer le téléphone au compte. Autoriser les permissions demandées pour l'envoi des SMS.
3. Dans le tableau de bord TextBee, créer une clé API et relever le Device ID du téléphone.
4. Renseigner uniquement dans `backend/.env` :

```dotenv
SMS_PROVIDER=textbee
TEXTBEE_API_KEY=votre_cle_privee
TEXTBEE_DEVICE_ID=identifiant_du_telephone
SMS_ENABLED=true
```

5. Redémarrer l'API, puis ouvrir le backoffice, onglet « Suivi SMS ». Vérifier que TextBee est sélectionné et que l'envoi est activé. Examiner la file avant activation : les notifications encore en attente seront expédiées.
   Le bouton « Vérifier la connexion TextBee » contrôle la clé et l'accès à l'appareil sans envoyer de SMS. Il fonctionne aussi avec `SMS_ENABLED=false`. Une connexion réussie ne garantit pas que la SIM a du crédit ou que le téléphone peut remettre un SMS : valider ensuite la réception sur votre propre numéro.
6. Tester avec votre propre numéro autorisé, au format international `+`, en validant un dossier KYC de test ou un transfert synthétique. Vérifier le SMS reçu et le statut dans le backoffice. Ne pas utiliser de numéros inventés une fois l'envoi activé.

Garder le téléphone alimenté, connecté à Internet et au réseau mobile ; vérifier que l'application n'est pas mise en veille. Les SMS partent du numéro de la SIM et consomment son forfait. Les quotas gratuits TextBee et les conditions de votre opérateur s'appliquent.

La confirmation d'envoi renvoie un identifiant de lot ; la livraison est contrôlée par interrogation de ce lot. Un SMS accepté ou remis au réseau n'est jamais affiché comme livré sans confirmation. Les quotas HTTP 429 retardent la tentative suivante (une heure par défaut, ou Retry-After). Une réponse incertaine ne provoque pas de réenvoi automatique. Chaque message conserve son prestataire et son téléphone d'origine pour suivre sa livraison même après un changement de configuration.

Ne jamais mettre la clé API dans le frontend, un dépôt public ou le chat. TextBee et le téléphone participent au traitement du numéro et du message : documenter ces destinataires et leurs garanties dans la politique de confidentialité.

Références : [installation et configuration](https://textbee.dev/docs), [envoi SMS](https://textbee.dev/docs/sending-sms/sending-sms), [états de livraison](https://textbee.dev/docs/sending-sms/delivery-status).
