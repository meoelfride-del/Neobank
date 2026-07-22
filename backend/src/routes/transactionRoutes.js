const router = require('express').Router();
const ctrl = require('../controllers/transactionController');
const { authenticate, ownsAccount } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate);
router.get('/account/:accountId', ownsAccount, ctrl.listTransactions);
router.post('/transfer', validate(schemas.transfer), ctrl.transfer);
router.post('/:txId/cancel', ctrl.cancelTransfer);
router.post('/:txId/verify-otp', validate(schemas.transferOtpVerification), ctrl.verifyTransferOtp);
router.post('/scheduled', validate(schemas.scheduledPayment), ctrl.createScheduledPayment);
router.get('/scheduled/:accountId', ownsAccount, ctrl.listScheduledPayments);

module.exports = router;
