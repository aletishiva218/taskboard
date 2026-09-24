const { query } = require('../config/db');

const getNotifications = async (req, res, next) => {
  try {
    const [notifResult, countResult] = await Promise.all([
      query(
        `SELECT id, type, title, message, data, is_read, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [req.user.id]
      ),
      query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
        [req.user.id]
      ),
    ]);

    const unreadCount = parseInt(countResult.rows[0].count, 10);

    res.json({ success: true, data: { notifications: notifResult.rows, unreadCount } });
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    await query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotifications, markRead, markAllRead };
