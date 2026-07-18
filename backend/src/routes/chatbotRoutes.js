const router = require('express').Router();
const ctrl = require('../controllers/chatbotController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate);
router.get('/history', ctrl.history);
router.post('/message', validate(schemas.chatMessage), ctrl.sendMessage);

module.exports = router;
