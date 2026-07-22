const router = require('express').Router();
const ctrl = require('../controllers/chatbotController');
const { authenticate, requireVerifiedKyc } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate, requireVerifiedKyc);
router.get('/history', ctrl.history);
router.post('/message', validate(schemas.chatMessage), ctrl.sendMessage);

module.exports = router;
