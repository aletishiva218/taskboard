const Bull = require('bull');
const emailService = require('../services/emailService');
const { query } = require('../config/db');
const logger = require('../utils/logger');
const { createRedisClient } = require('../config/redis');

// Use createClient so Bull inherits our ioredis options (TLS, enableReadyCheck: false).
// Passing redis: REDIS_URL directly would bypass those settings and fail with Upstash.
const emailQueue = new Bull('email', {
  createClient: () => createRedisClient(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

const checkPreferences = async (userId, type) => {
  // Non-registered users have no preferences — always send
  if (!userId) return true;

  const result = await query(
    'SELECT email_notifications, notification_preferences FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) return false;

  const { email_notifications, notification_preferences } = result.rows[0];
  if (!email_notifications) return false;

  // Map job type to preference key
  const prefMap = {
    board_invite: 'board_invite',
    board_invite_new_user: null, // always send — recipient is not registered yet
    card_assigned: 'card_assigned',
    due_date_reminder: 'due_date',
    card_moved: 'activity',
    activity_update: 'activity',
    role_changed: 'role_changed',
    welcome: null, // always send welcome
    password_reset: null, // security email — always send
  };

  const prefKey = prefMap[type];
  if (prefKey === null) return true; // no preference check for welcome
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

emailQueue.process(async (job) => {
  const { type, data } = job.data;

  try {
    const allowed = await checkPreferences(data.userId, type);
    if (!allowed) {
      logger.info('Email skipped (preferences)', { type, userId: data.userId });
      return { skipped: true };
    }

    const handler = handlers[type];
    if (!handler) {
      throw new Error(`Unknown email type: ${type}`);
    }

    await handler(data);
    logger.info('Email job completed', { type, userId: data.userId, jobId: job.id });
    return { sent: true };
  } catch (err) {
    logger.error('Email job failed', { type, userId: data.userId, jobId: job.id, error: err.message });
    throw err;
  }
});

emailQueue.on('failed', (job, err) => {
  logger.error('Email job failed after all retries', {
    jobId: job.id,
    type: job.data.type,
    error: err.message,
    attempts: job.attemptsMade,
  });
});

emailQueue.on('stalled', (job) => {
  logger.warn('Email job stalled', { jobId: job.id });
});

const addEmailJob = async (type, data, options = {}) => {
  const job = await emailQueue.add({ type, data }, options);
  logger.debug('Email job queued', { type, userId: data.userId, jobId: job.id });
  return job;
};

module.exports = { emailQueue, addEmailJob };
