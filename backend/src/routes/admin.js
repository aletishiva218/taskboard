const { Router } = require('express');
const { createBullBoard } = require('bull-board');
const { BullAdapter } = require('bull-board/bullAdapter');
const { emailQueue } = require('../queues/emailQueue');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

const { router: bullBoardRouter } = createBullBoard([new BullAdapter(emailQueue)]);

router.use('/queues', requireAdmin, bullBoardRouter);

module.exports = router;
