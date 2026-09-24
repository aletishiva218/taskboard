const { verifyAccessToken } = require('../utils/jwt');
const { query } = require('../config/db');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    const result = await query(
      'SELECT id, name, email, avatar_url, google_id, email_notifications, notification_preferences FROM users WHERE id = $1',
      [payload.sub]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const requireBoardAccess = (requiredRole = 'viewer') => async (req, res, next) => {
  const roleHierarchy = { owner: 3, editor: 2, viewer: 1 };
  const boardId = req.params.boardId || req.body.boardId;

  if (!boardId) {
    return res.status(400).json({ success: false, message: 'Board ID required' });
  }

  try {
    const result = await query(
      'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
      [boardId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied to this board' });
    }

    const userRole = result.rows[0].role;
    if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
      return res.status(403).json({
        success: false,
        message: `This action requires ${requiredRole} access`,
      });
    }

    req.boardRole = userRole;
    next();
  } catch (err) {
    next(err);
  }
};

const requireAdmin = (req, res, next) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireBoardAccess, requireAdmin };
