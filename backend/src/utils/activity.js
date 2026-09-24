const { query } = require('../config/db');
const logger = require('./logger');

const logActivity = async (boardId, cardId, userId, action, metadata = {}) => {
  try {
    await query(
      `INSERT INTO activity_logs (board_id, card_id, user_id, action, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [boardId, cardId || null, userId || null, action, JSON.stringify(metadata)]
    );
  } catch (err) {
    // Non-critical — log but don't fail the request
    logger.error('Failed to log activity', { error: err.message, boardId, action });
  }
};

module.exports = { logActivity };
