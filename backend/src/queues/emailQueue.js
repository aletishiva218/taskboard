// Direct async email processor — no Redis queue dependency.
// Bull + Upstash is incompatible: Upstash closes idle connections that interrupt
// Bull's blocking BRPOP, causing jobs to stall silently. Since this runs on a
// single Render instance, a simple in-process queue with exponential retry is
// sufficient and far more reliable.
const emailService = require('../services/emailService');
const { query } = require('../config/db');
const logger = require('../utils/logger');

const checkPreferences = async (userId, type) => {
  if (!userId) return true;

  const result = await query(
    'SELECT email_notifications, notification_preferences FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) return false;

  const { email_notifications, notification_preferences } = result.rows[0];
  if (!email_notifications) return false;

  const prefMap = {
    board_invite: 'board_invite',
    board_invite_new_user: null,
    card_assigned: 'card_assigned',
    due_date_reminder: 'due_date',
    card_moved: 'activity',
    activity_update: 'activity',
    role_changed: 'role_changed',
    welcome: null,
    password_reset: null,
  };

  const prefKey = prefMap[type];
  if (prefKey === null) return true;
  if (!prefKey) return false;

  return notification_preferences?.[prefKey] !== false;
};

const handlers = {
  board_invite: (data) => emailService.sendBoardInvite(data),
  board_invite_new_user: (data) => emailService.sendBoardInviteNewUser(data),
  card_assigned: (data) => emailService.sendCardAssigned(data),
  due_date_reminder: (data) => emailService.sendDueDateReminder(data),
  card_moved: (data) => emailService.sendCardMoved(data),
  activity_update: (data) => emailService.sendActivityUpdate(data),
  role_changed: (data) => emailService.sendRoleChanged(data),
  welcome: (data) => emailService.sendWelcome(data),
  password_reset: (data) => emailService.sendPasswordReset(data),
};

const processEmail = async (type, data, attempt = 1) => {
  try {
    const allowed = await checkPreferences(data.userId, type);
    if (!allowed) {
      logger.info('Email skipped (preferences)', { type, userId: data.userId });
      return;
    }

    const handler = handlers[type];
    if (!handler) {
      logger.error('Unknown email type', { type });
      return;
    }

    await handler(data);
    logger.info('Email job completed', { type, userId: data.userId, attempt });
  } catch (err) {
    logger.error('Email job failed', { type, userId: data.userId, error: err.message, attempt });
    if (attempt < 3) {
      const delay = attempt * 2000; // 2 s, 4 s
      setTimeout(() => processEmail(type, data, attempt + 1), delay);
    } else {
      logger.error('Email job failed after all retries', { type, userId: data.userId });
    }
  }
};

const addEmailJob = (type, data) => {
  logger.info('Email job queued', { type, userId: data.userId });
  setImmediate(() => processEmail(type, data));
};

module.exports = { addEmailJob };
