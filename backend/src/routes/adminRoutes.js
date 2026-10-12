const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const kyc = require('../controllers/kycController');
const banking = require('../controllers/bankAdminController');

router.use(authenticate, requireRole('admin'));
router.get('/sms/diagnostics', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await require('../services/smsService').diagnose());
});
router.get('/sms', async (req, res) => {
  const db = require('../config/database');
  const messages = await db.prepare(`SELECT s.id,s.user_id,s.provider,s.status,s.error_code,s.attempts,s.created_at,s.updated_at,
    u.nom,u.prenom FROM sms_outbox s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 100`).all();
  res.set('Cache-Control', 'private, no-store');
  const sms = require('../services/smsService');
  res.json({ enabled: sms.configured(), provider: sms.provider(), messages });
});
router.patch('/accounts/:accountId/iban', validate(schemas.adminIban), banking.iban);
router.get('/accounts/:accountId/cards', banking.cards);
router.post('/accounts/:accountId/cards', validate(schemas.adminCardAssign), banking.save);
router.patch('/cards/:cardId', validate(schemas.adminCardUpdate), banking.save);
router.get('/users', ctrl.listUsers);
router.get('/users/:userId/detail', ctrl.getUserDetail);
router.get('/stats', ctrl.getStats);
router.post('/kyc/:userId', validate(schemas.adminKycDecision), ctrl.validateKyc);
router.get('/kyc/:userId', kyc.adminDossier);
router.get('/kyc/:userId/document', kyc.document);
router.patch('/users/:userId', validate(schemas.adminUpdateUser), ctrl.updateUser);
router.post('/users/:userId/notifications', validate(schemas.adminNotification), ctrl.sendUserNotification);
router.get('/users/:userId/accounts', ctrl.listUserAccounts);
router.post('/accounts/:accountId/adjust-balance', validate(schemas.adminBalanceAdjustment), ctrl.adjustBalance);
router.post('/users/:userId/suspend', validate(schemas.adminSuspendUser), ctrl.suspendUser);
router.get('/transactions/pending', ctrl.pendingTransactions);
router.post('/transactions/:txId/otp', validate(schemas.adminTransferOtp), ctrl.generateTransferOtp);
router.post('/transactions/:txId/review', validate(schemas.adminTransactionReview), ctrl.reviewTransaction);

module.exports = router;
