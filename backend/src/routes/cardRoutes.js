const router = require('express').Router();
const ctrl = require('../controllers/cardController');
const { authenticate, ownsAccount } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate);
router.get('/account/:accountId', ownsAccount, ctrl.listCards);
router.post('/', validate(schemas.cardCreate), ownsAccount, ctrl.createCard);
router.patch('/:cardId/status', validate(schemas.cardToggle), ctrl.toggleCard);
router.post('/:cardId/reveal', ctrl.revealSecrets);

module.exports = router;
