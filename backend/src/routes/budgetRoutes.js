const router = require('express').Router();
const ctrl = require('../controllers/budgetController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/:accountId', ctrl.getBudgetSummary);

module.exports = router;
