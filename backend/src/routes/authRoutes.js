const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.post('/register', validate(schemas.register), ctrl.register);
router.post('/login', validate(schemas.login), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.get('/me', authenticate, ctrl.me);
router.post('/mfa/enable', authenticate, ctrl.enableMfa);

module.exports = router;
