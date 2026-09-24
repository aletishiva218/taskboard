const { validationResult } = require('express-validator');
const { query } = require('../config/db');
const { getIO } = require('../socket');
const { logActivity } = require('../utils/activity');

const getComments = async (req, res, next) => {
  try {
    const { cardId } = req.params;
    const result = await query(
      `SELECT cc.id, cc.card_id, cc.user_id, cc.text, cc.created_at,
              u.name as user_name, u.avatar_url
       FROM card_comments cc
       JOIN users u ON u.id = cc.user_id
       WHERE cc.card_id = $1
       ORDER BY cc.created_at ASC`,
      [cardId]
    );
    res.json({ success: true, data: { comments: result.rows } });
  } catch (err) {
    next(err);
  }
};

const addComment = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    const { boardId, cardId } = req.params;
    const { text } = req.body;

    const result = await query(
      `INSERT INTO card_comments (card_id, board_id, user_id, text)
       VALUES ($1, $2, $3, $4)
       RETURNING id, card_id, user_id, text, created_at`,
      [cardId, boardId, req.user.id, text]
    );

    const comment = {
      ...result.rows[0],
      user_name: req.user.name,
      avatar_url: req.user.avatar_url || null,
    };

    await logActivity(boardId, cardId, req.user.id, 'comment_added', {
      preview: text.substring(0, 80),
    });

    const io = getIO();
    io.to(`board:${boardId}`).emit('comment:created', { comment, cardId });

    res.status(201).json({ success: true, data: { comment } });
  } catch (err) {
    next(err);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const { boardId, cardId, commentId } = req.params;

    const existing = await query(
      'SELECT user_id FROM card_comments WHERE id = $1 AND card_id = $2',
      [commentId, cardId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    if (existing.rows[0].user_id !== req.user.id) {
      const boardResult = await query('SELECT owner_id FROM boards WHERE id = $1', [boardId]);
      if (!boardResult.rows[0] || boardResult.rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
    }

    await query('DELETE FROM card_comments WHERE id = $1', [commentId]);

    const io = getIO();
    io.to(`board:${boardId}`).emit('comment:deleted', { commentId, cardId });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getComments, addComment, deleteComment };
