const { validationResult } = require('express-validator');
const { query } = require('../config/db');
const { redisClient } = require('../config/redis');
const { logActivity } = require('../utils/activity');
const { addEmailJob } = require('../queues/emailQueue');
const { getIO } = require('../socket');

const invalidateBoardCache = async (boardId) => {
  await redisClient.del(`board:${boardId}`).catch(() => {});
};

const getCardWithDetails = async (cardId) => {
  const result = await query(
    `SELECT c.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', cl.id, 'color', cl.color, 'text', cl.text))
              FILTER (WHERE cl.id IS NOT NULL), '[]') as labels,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url))
              FILTER (WHERE u.id IS NOT NULL), '[]') as assignees
     FROM cards c
     LEFT JOIN card_labels cl ON cl.card_id = c.id
     LEFT JOIN card_assignees ca ON ca.card_id = c.id
     LEFT JOIN users u ON u.id = ca.user_id
     WHERE c.id = $1
     GROUP BY c.id`,
    [cardId]
  );
  return result.rows[0] || null;
};

const createCard = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { boardId } = req.params;
    const { listId, name } = req.body;

    // Verify list belongs to board
    const listCheck = await query('SELECT id, name FROM lists WHERE id = $1 AND board_id = $2', [listId, boardId]);
    if (listCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'List not found in this board' });
    }

    const maxResult = await query('SELECT MAX(position) as max_pos FROM cards WHERE list_id = $1', [listId]);
    const position = (maxResult.rows[0].max_pos || 0) + 1000;

    const result = await query(
      'INSERT INTO cards (list_id, board_id, name, position) VALUES ($1, $2, $3, $4) RETURNING *',
      [listId, boardId, name, position]
    );

    const card = { ...result.rows[0], labels: [], assignees: [] };

    await invalidateBoardCache(boardId);
    await logActivity(boardId, card.id, req.user.id, 'card_created', {
      card_name: name,
      list_name: listCheck.rows[0].name,
    });

    const io = getIO();
    io.to(`board:${boardId}`).emit('card:created', { card, userId: req.user.id });

    res.status(201).json({ success: true, data: { card } });
  } catch (err) {
    next(err);
  }
};

const getCard = async (req, res, next) => {
  try {
    const { cardId } = req.params;
    const card = await getCardWithDetails(cardId);

    if (!card) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    res.json({ success: true, data: { card } });
  } catch (err) {
    next(err);
  }
};

const updateCard = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { boardId, cardId } = req.params;
    const { name, description, dueDate, due_date } = req.body;
    const resolvedDueDate = dueDate !== undefined ? dueDate : due_date;

    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (resolvedDueDate !== undefined) { updates.push(`due_date = $${idx++}`); values.push(resolvedDueDate || null); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(cardId);
    const result = await query(
      `UPDATE cards SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    const card = await getCardWithDetails(cardId);
    await invalidateBoardCache(boardId);
    await logActivity(boardId, cardId, req.user.id, 'card_updated', { card_name: card.name });

    const io = getIO();
    io.to(`board:${boardId}`).emit('card:updated', { card, userId: req.user.id });

    // Notify assignees about activity
    const assigneeIds = card.assignees.map((a) => a.id).filter((id) => id !== req.user.id);
    for (const assigneeId of assigneeIds) {
      const userResult = await query('SELECT email, name FROM users WHERE id = $1', [assigneeId]);
      if (userResult.rows.length > 0) {
        await addEmailJob('activity_update', {
          userId: assigneeId,
          email: userResult.rows[0].email,
          name: userResult.rows[0].name,
          cardName: card.name,
          actorName: req.user.name,
          action: 'updated',
          boardId,
        }).catch(() => {});
      }
    }

    res.json({ success: true, data: { card } });
  } catch (err) {
    next(err);
  }
};

const deleteCard = async (req, res, next) => {
  try {
    const { boardId, cardId } = req.params;

    const cardResult = await query('SELECT name, list_id FROM cards WHERE id = $1', [cardId]);
    if (cardResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    const { name: cardName, list_id: listId } = cardResult.rows[0];

    await query('DELETE FROM cards WHERE id = $1 AND board_id = $2', [cardId, boardId]);
    await invalidateBoardCache(boardId);
    await logActivity(boardId, null, req.user.id, 'card_deleted', { card_name: cardName });

    const io = getIO();
    io.to(`board:${boardId}`).emit('card:deleted', { cardId, listId, boardId, userId: req.user.id });

    res.json({ success: true, message: 'Card deleted' });
  } catch (err) {
    next(err);
  }
};

const moveCard = async (req, res, next) => {
  try {
    const { boardId, cardId } = req.params;
    const { listId, position } = req.body;

    if (!listId || position === undefined) {
      return res.status(400).json({ success: false, message: 'listId and position required' });
    }

    // Verify list belongs to board
    const listCheck = await query('SELECT id, name FROM lists WHERE id = $1 AND board_id = $2', [listId, boardId]);
    if (listCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'List not found in this board' });
    }

    const oldCardResult = await query('SELECT list_id, name FROM cards WHERE id = $1', [cardId]);
    if (oldCardResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    const oldListId = oldCardResult.rows[0].list_id;
    const cardName = oldCardResult.rows[0].name;

    const result = await query(
      'UPDATE cards SET list_id = $1, position = $2 WHERE id = $3 AND board_id = $4 RETURNING *',
      [listId, position, cardId, boardId]
    );

    const card = await getCardWithDetails(cardId);
    await invalidateBoardCache(boardId);

    const listMoved = oldListId !== listId;
    if (listMoved) {
      await logActivity(boardId, cardId, req.user.id, 'card_moved', {
        card_name: cardName,
        to_list: listCheck.rows[0].name,
      });
    }

    const io = getIO();
    io.to(`board:${boardId}`).emit('card:moved', {
      card,
      oldListId,
      newListId: listId,
      position,
      userId: req.user.id,
    });

    // Notify assignees if moved to different list
    if (listMoved) {
      const assigneeIds = card.assignees.map((a) => a.id).filter((id) => id !== req.user.id);
      for (const assigneeId of assigneeIds) {
        const userResult = await query('SELECT email, name FROM users WHERE id = $1', [assigneeId]);
        if (userResult.rows.length > 0) {
          await addEmailJob('card_moved', {
            userId: assigneeId,
            email: userResult.rows[0].email,
            name: userResult.rows[0].name,
            cardName,
            listName: listCheck.rows[0].name,
            boardId,
          }).catch(() => {});
        }
      }
    }

    res.json({ success: true, data: { card } });
  } catch (err) {
    next(err);
  }
};

const reorderCards = async (req, res, next) => {
  try {
    const { boardId } = req.params;
    const { listId, orderedIds } = req.body;

    if (!listId || !Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, message: 'listId and orderedIds required' });
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await query(
        'UPDATE cards SET position = $1 WHERE id = $2 AND list_id = $3 AND board_id = $4',
        [(i + 1) * 1000, orderedIds[i], listId, boardId]
      );
    }

    await invalidateBoardCache(boardId);

    const io = getIO();
    io.to(`board:${boardId}`).emit('cards:reordered', { listId, orderedIds, userId: req.user.id });

    res.json({ success: true, data: { listId, orderedIds } });
  } catch (err) {
    next(err);
  }
};

const addAssignee = async (req, res, next) => {
  try {
    const { boardId, cardId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }

    // Verify user is board member
    const memberCheck = await query(
      'SELECT id FROM board_members WHERE board_id = $1 AND user_id = $2',
      [boardId, userId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'User is not a board member' });
    }

    await query(
      'INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [cardId, userId]
    );

    const card = await getCardWithDetails(cardId);
    await invalidateBoardCache(boardId);

    const io = getIO();
    io.to(`board:${boardId}`).emit('card:updated', { card, userId: req.user.id });

    // Notify assigned user
    if (userId !== req.user.id) {
      const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
      const cardResult = await query('SELECT name FROM cards WHERE id = $1', [cardId]);
      const boardResult = await query('SELECT name FROM boards WHERE id = $1', [boardId]);

      if (userResult.rows.length > 0) {
        await addEmailJob('card_assigned', {
          userId,
          email: userResult.rows[0].email,
          name: userResult.rows[0].name,
          cardName: cardResult.rows[0]?.name,
          boardName: boardResult.rows[0]?.name,
          assignerName: req.user.name,
          boardId,
          cardId,
        }).catch(() => {});
      }
    }

    await logActivity(boardId, cardId, req.user.id, 'card_assigned', { assigned_user_id: userId });

    res.json({ success: true, data: { card } });
  } catch (err) {
    next(err);
  }
};

const removeAssignee = async (req, res, next) => {
  try {
    const { boardId, cardId, userId } = req.params;

    await query('DELETE FROM card_assignees WHERE card_id = $1 AND user_id = $2', [cardId, userId]);

    const card = await getCardWithDetails(cardId);
    await invalidateBoardCache(boardId);

    const io = getIO();
    io.to(`board:${boardId}`).emit('card:updated', { card, userId: req.user.id });

    res.json({ success: true, data: { card } });
  } catch (err) {
    next(err);
  }
};

const addLabel = async (req, res, next) => {
  try {
    const { boardId, cardId } = req.params;
    const { color, text } = req.body;

    if (!color) {
      return res.status(400).json({ success: false, message: 'color required' });
    }

    await query(
      'INSERT INTO card_labels (card_id, color, text) VALUES ($1, $2, $3)',
      [cardId, color, text || null]
    );

    const card = await getCardWithDetails(cardId);
    await invalidateBoardCache(boardId);

    const io = getIO();
    io.to(`board:${boardId}`).emit('card:updated', { card, userId: req.user.id });

    res.json({ success: true, data: { card } });
  } catch (err) {
    next(err);
  }
};

const removeLabel = async (req, res, next) => {
  try {
    const { boardId, cardId, labelId } = req.params;

    await query('DELETE FROM card_labels WHERE id = $1 AND card_id = $2', [labelId, cardId]);

    const card = await getCardWithDetails(cardId);
    await invalidateBoardCache(boardId);

    const io = getIO();
    io.to(`board:${boardId}`).emit('card:updated', { card, userId: req.user.id });

    res.json({ success: true, data: { card } });
  } catch (err) {
    next(err);
  }
};

const getCardActivity = async (req, res, next) => {
  try {
    const { cardId } = req.params;
    const result = await query(
      `SELECT al.id, al.action, al.metadata, al.created_at,
              u.id as user_id, u.name, u.avatar_url
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.card_id = $1
       ORDER BY al.created_at DESC
       LIMIT 30`,
      [cardId]
    );
    res.json({ success: true, data: { activity: result.rows } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createCard,
  getCard,
  updateCard,
  deleteCard,
  moveCard,
  reorderCards,
  addAssignee,
  removeAssignee,
  addLabel,
  removeLabel,
  getCardActivity,
};
