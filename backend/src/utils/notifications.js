const { query } = require('../config/db');
const logger = require('./logger');

const createNotification = async (userId, type, title, message, data = {}) => {
  try {
    const result = await query(
      'INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, type, title, message, JSON.stringify(data)]
    );
    return result.rows[0];
  } catch (err) {
    logger.error('Failed to create notification', { userId, type, error: err.message });
    return null;
  }
};

module.exports = { createNotification };
