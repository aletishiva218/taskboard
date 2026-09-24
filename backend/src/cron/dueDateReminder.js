const cron = require('node-cron');
const { query } = require('../config/db');
const { addEmailJob } = require('../queues/emailQueue');
const logger = require('../utils/logger');

const sendDueDateReminders = async () => {
  logger.info('Running due date reminder job');

  try {
    // Find cards due in next 24 hours with assignees who haven't been reminded
    const result = await query(
      `SELECT DISTINCT
         c.id as card_id,
         c.name as card_name,
         c.due_date,
         c.board_id,
         u.id as user_id,
         u.email,
         u.name
       FROM cards c
       JOIN card_assignees ca ON ca.card_id = c.id
       JOIN users u ON u.id = ca.user_id
       WHERE c.due_date >= NOW()
         AND c.due_date <= NOW() + INTERVAL '24 hours'
         AND u.email_notifications = true`,
      []
    );

    logger.info(`Due date reminder: found ${result.rows.length} assignees to notify`);

    for (const row of result.rows) {
      await addEmailJob('due_date_reminder', {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        cardName: row.card_name,
        boardId: row.board_id,
        cardId: row.card_id,
        dueDate: row.due_date,
      }).catch((err) => {
        logger.error('Failed to queue due date reminder', { cardId: row.card_id, error: err.message });
      });
    }
  } catch (err) {
    logger.error('Due date reminder job failed', { error: err.message });
  }
};

const startDueDateReminderJob = () => {
  // Run daily at 9 AM UTC
  cron.schedule('0 9 * * *', sendDueDateReminders, {
    scheduled: true,
    timezone: 'UTC',
  });

  logger.info('Due date reminder cron job scheduled (daily at 09:00 UTC)');
};

module.exports = { startDueDateReminderJob, sendDueDateReminders };
