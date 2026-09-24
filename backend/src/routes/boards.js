const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, requireBoardAccess } = require('../middleware/auth');
const { query } = require('../config/db');
const {
  getBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  inviteMember,
  acceptInvitation,
  updateMemberRole,
  removeMember,
  getActivity,
  toggleFavourite,
  exportBoard,
} = require('../controllers/boardController');
const { createNotification } = require('../utils/notifications');

// Emit in-app notifications to board members not currently in the board socket room
const notifyOfflineBoardMembers = async (io, boardId, senderId, senderName, title, message) => {
  try {
    const roomSockets = await io.in(`board:${boardId}`).fetchSockets();
    const onlineUserIds = new Set(roomSockets.map(s => s.user?.id));
    const membersResult = await query(
      'SELECT u.id FROM board_members bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id = $1 AND bm.user_id != $2',
      [boardId, senderId]
    );
    for (const member of membersResult.rows) {
      if (!onlineUserIds.has(member.id)) {
        const notification = await createNotification(member.id, 'chat_message', title, message, { boardId, senderId, senderName });
        if (notification) {
          io.to(`user:${member.id}`).emit('notification:new', notification);
        }
      }
    }
  } catch {}
};

const router = Router();

router.use(authenticate);

router.get('/', getBoards);
router.post(
  '/',
  [body('name').trim().notEmpty().isLength({ max: 255 })],
  createBoard
);

// Accept a board invitation (token from email link)
router.post('/join', [body('token').notEmpty()], acceptInvitation);

router.get('/:boardId', requireBoardAccess('viewer'), getBoard);

router.patch(
  '/:boardId',
  requireBoardAccess('editor'),
  [body('name').trim().notEmpty().isLength({ max: 255 })],
  updateBoard
);

router.delete('/:boardId', requireBoardAccess('owner'), deleteBoard);

router.post(
  '/:boardId/members',
  requireBoardAccess('owner'),
  [
    body('email').isEmail().normalizeEmail(),
    body('role').optional().isIn(['editor', 'viewer']),
  ],
  inviteMember
);

router.patch(
  '/:boardId/members/:userId/role',
  requireBoardAccess('owner'),
  [body('role').isIn(['editor', 'viewer'])],
  updateMemberRole
);

router.delete('/:boardId/members/:userId', requireBoardAccess('owner'), removeMember);

router.get('/:boardId/activity', requireBoardAccess('viewer'), getActivity);

router.post('/:boardId/favourite', requireBoardAccess('viewer'), toggleFavourite);

router.get('/:boardId/export', requireBoardAccess('viewer'), exportBoard);

// ── Board Chat ────────────────────────────────────────────────────────────────

const multer = require('multer');
const { uploadToStorage } = require('../utils/storage');

const chatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function buildMessage(row, user) {
  return {
    id: row.id,
    boardId: row.board_id,
    content: row.content,
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    attachment: row.attachment_url
      ? { url: row.attachment_url, name: row.attachment_name, type: row.attachment_type, size: row.attachment_size }
      : null,
    user: { id: user.id, name: user.name, avatarUrl: user.avatar_url },
  };
}

// GET /:boardId/messages — fetch last 50 messages (chronological)
router.get('/:boardId/messages', requireBoardAccess('viewer'), async (req, res, next) => {
  try {
    const { boardId } = req.params;
    const { before } = req.query;

    const params = [boardId];
    let beforeClause = '';
    if (before) {
      params.push(before);
      beforeClause = `AND m.created_at < (
        SELECT created_at FROM board_messages WHERE id = $${params.length}
      )`;
    }

    const result = await query(
      `SELECT m.id, m.board_id, m.content,
              m.attachment_url, m.attachment_name, m.attachment_type, m.attachment_size,
              m.created_at, m.edited_at,
              u.id AS user_id, u.name AS user_name, u.avatar_url AS user_avatar_url
       FROM board_messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.board_id = $1 ${beforeClause}
       ORDER BY m.created_at DESC
       LIMIT 50`,
      params
    );

    const messages = result.rows.reverse().map((r) => ({
      id: r.id,
      boardId: r.board_id,
      content: r.content,
      createdAt: r.created_at,
      editedAt: r.edited_at || null,
      attachment: r.attachment_url
        ? { url: r.attachment_url, name: r.attachment_name, type: r.attachment_type, size: r.attachment_size }
        : null,
      user: { id: r.user_id, name: r.user_name, avatarUrl: r.user_avatar_url },
    }));

    res.json({ success: true, data: { messages } });
  } catch (err) {
    next(err);
  }
});

// POST /:boardId/messages — send a text message, broadcast via socket
router.post(
  '/:boardId/messages',
  requireBoardAccess('viewer'),
  [body('content').trim().notEmpty().isLength({ max: 2000 })],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Message content is required (max 2000 chars)' });
      }

      const { boardId } = req.params;
      const { content } = req.body;

      const msgResult = await query(
        `INSERT INTO board_messages (board_id, user_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, board_id, content, attachment_url, attachment_name, attachment_type, attachment_size, created_at`,
        [boardId, req.user.id, content]
      );

      const message = buildMessage(msgResult.rows[0], req.user);

      const { getIO } = require('../socket');
      const io = getIO();
      io.to(`board:${boardId}`).emit('chat:message', { message });

      res.json({ success: true, data: { message } });

      // Non-blocking: notify board members who are not in the board room
      query('SELECT name FROM boards WHERE id = $1', [boardId])
        .then(boardRow => {
          const boardName = boardRow.rows[0]?.name || 'Board';
          const preview = content.length > 60 ? content.slice(0, 57) + '...' : content;
          return notifyOfflineBoardMembers(io, boardId, req.user.id, req.user.name, `New message in ${boardName}`, `${req.user.name}: ${preview}`);
        })
        .catch(() => {});
    } catch (err) {
      next(err);
    }
  }
);

// POST /:boardId/messages/upload — send a file (+ optional caption)
router.post(
  '/:boardId/messages/upload',
  requireBoardAccess('viewer'),
  chatUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file provided' });
      }

      const { boardId } = req.params;
      const caption = req.body.caption?.trim() || null;

      if (caption && caption.length > 2000) {
        return res.status(400).json({ success: false, message: 'Caption too long (max 2000 chars)' });
      }

      const fileUrl = await uploadToStorage(req.file.buffer, {
        folder: 'chat',
        originalname: req.file.originalname,
        host: req.get('host'),
        protocol: req.protocol,
      });

      const msgResult = await query(
        `INSERT INTO board_messages (board_id, user_id, content, attachment_url, attachment_name, attachment_type, attachment_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, board_id, content, attachment_url, attachment_name, attachment_type, attachment_size, created_at`,
        [boardId, req.user.id, caption, fileUrl, req.file.originalname, req.file.mimetype, req.file.size]
      );

      const message = buildMessage(msgResult.rows[0], req.user);

      const { getIO } = require('../socket');
      const io = getIO();
      io.to(`board:${boardId}`).emit('chat:message', { message });

      res.json({ success: true, data: { message } });

      // Non-blocking: notify board members who are not in the board room
      query('SELECT name FROM boards WHERE id = $1', [boardId])
        .then(boardRow => {
          const boardName = boardRow.rows[0]?.name || 'Board';
          const notifMessage = caption
            ? `${req.user.name}: ${caption.length > 50 ? caption.slice(0, 47) + '...' : caption}`
            : `${req.user.name}: Sent an attachment`;
          return notifyOfflineBoardMembers(io, boardId, req.user.id, req.user.name, `New message in ${boardName}`, notifMessage);
        })
        .catch(() => {});
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /:boardId/messages/:messageId — edit own text message within 1 minute
router.patch(
  '/:boardId/messages/:messageId',
  requireBoardAccess('viewer'),
  [body('content').trim().notEmpty().isLength({ max: 2000 })],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Content is required (max 2000 chars)' });
      }

      const { boardId, messageId } = req.params;
      const { content } = req.body;

      const existing = await query(
        'SELECT id, user_id, content, attachment_url, created_at FROM board_messages WHERE id = $1 AND board_id = $2',
        [messageId, boardId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }

      const msg = existing.rows[0];

      if (msg.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Cannot edit another user\'s message' });
      }

      if (!msg.content) {
        return res.status(400).json({ success: false, message: 'File-only messages cannot be edited' });
      }

      // Server-side 1-minute guard
      if (Date.now() - new Date(msg.created_at).getTime() > 60 * 1000) {
        return res.status(403).json({ success: false, message: 'Edit window has expired (1 minute)' });
      }

      const updateResult = await query(
        `UPDATE board_messages SET content = $1, edited_at = NOW()
         WHERE id = $2
         RETURNING id, board_id, content,
                   attachment_url, attachment_name, attachment_type, attachment_size,
                   created_at, edited_at`,
        [content, messageId]
      );

      const message = buildMessage(updateResult.rows[0], req.user);

      const { getIO } = require('../socket');
      getIO().to(`board:${boardId}`).emit('chat:message_updated', { message });

      res.json({ success: true, data: { message } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
