const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.listNotifications);
router.patch('/read-all', ctrl.markAllAsRead);
router.patch('/:notificationId/read', ctrl.markAsRead);

module.exports = router;
