const router = require('express').Router();
const ctrl = require('../controllers/accountController');
const { authenticate, requireVerifiedKyc, ownsAccount } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate);
router.post('/kyc/submit', ctrl.submitKyc);
router.get('/kyc/status', ctrl.kycStatus);
router.use(requireVerifiedKyc);
router.get('/', ctrl.listAccounts);
router.post('/', validate(schemas.accountCreate), ctrl.createAccount);
router.get('/:accountId', ownsAccount, ctrl.getAccount);

module.exports = router;
