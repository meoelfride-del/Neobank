const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.post('/register', validate(schemas.register), ctrl.register);
router.post('/login', validate(schemas.login), ctrl.login);
router.post('/refresh', validate(schemas.refreshSession), ctrl.refresh);
router.post('/logout', validate(schemas.refreshSession), ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.get('/sessions', authenticate, ctrl.sessions);
router.delete('/sessions/:sessionId', authenticate, ctrl.revokeSession);
router.post('/mfa/setup', authenticate, validate(schemas.mfaSetup), ctrl.setupMfa);
router.post('/mfa/enable', authenticate, validate(schemas.mfaEnable), ctrl.enableMfa);

module.exports = router;

