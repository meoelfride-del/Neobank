const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate, requireRole('admin'));
router.get('/users', ctrl.listUsers);
router.get('/stats', ctrl.getStats);
router.post('/kyc/:userId', validate(schemas.adminKycDecision), ctrl.validateKyc);
router.patch('/users/:userId', validate(schemas.adminUpdateUser), ctrl.updateUser);
router.get('/users/:userId/accounts', ctrl.listUserAccounts);
router.post('/accounts/:accountId/adjust-balance', validate(schemas.adminBalanceAdjustment), ctrl.adjustBalance);
router.post('/users/:userId/suspend', validate(schemas.adminSuspendUser), ctrl.suspendUser);
router.get('/transactions/pending', ctrl.pendingTransactions);
router.post('/transactions/:txId/review', validate(schemas.adminTransactionReview), ctrl.reviewTransaction);

module.exports = router;
