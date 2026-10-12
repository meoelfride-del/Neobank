const router = require('express').Router();
const ctrl = require('../controllers/accountController');
const { authenticate, requireVerifiedKyc, ownsAccount } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const kyc = require('../controllers/kycController');
const { uploadKyc, kycUploadLimiter } = require('../middleware/kycUpload');

router.use(authenticate);
router.post('/kyc/submit', ctrl.submitKyc);
router.get('/kyc/status', kyc.status);
router.put('/kyc/profile', validate(schemas.kycProfile), kyc.profile);
router.post('/kyc/document', kycUploadLimiter, uploadKyc, validate(schemas.kycUpload), kyc.upload);
router.get('/kyc/document', kyc.document);
router.use(requireVerifiedKyc);
router.get('/', ctrl.listAccounts);
router.post('/', validate(schemas.accountCreate), ctrl.createAccount);
router.get('/:accountId', ownsAccount, ctrl.getAccount);

module.exports = router;
