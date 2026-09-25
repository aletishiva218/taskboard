const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

// Bull Board removed — email queue is now an in-process async processor,
// not a Redis-backed Bull queue (Upstash incompatibility with blocking BRPOP).
router.get('/queues', requireAdmin, (req, res) => {
  res.json({ message: 'Queue monitor not available — using in-process email processor.' });
});

module.exports = router;
