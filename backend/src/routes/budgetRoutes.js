const router = require('express').Router();
const ctrl = require('../controllers/budgetController');
const { authenticate, requireVerifiedKyc } = require('../middleware/auth');

router.use(authenticate, requireVerifiedKyc);
router.get('/:accountId', ctrl.getBudgetSummary);

module.exports = router;
