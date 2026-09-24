const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getNotifications, markRead, markAllRead } = require('../controllers/notificationController');

const router = Router();

router.use(authenticate);

router.get('/', getNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
