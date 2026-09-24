const { validationResult } = require('express-validator');
const { query } = require('../config/db');
const { redisClient } = require('../config/redis');
const { logActivity } = require('../utils/activity');
const { getIO } = require('../socket');

const invalidateBoardCache = async (boardId) => {
  await redisClient.del(`board:${boardId}`).catch(() => {});
};

const getLists = async (req, res, next) => {
  try {
    const { boardId } = req.params;
    const result = await query(
      'SELECT * FROM lists WHERE board_id = $1 ORDER BY position ASC',
      [boardId]
    );
    res.json({ success: true, data: { lists: result.rows } });
  } catch (err) {
    next(err);
  }
};

const createList = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { boardId } = req.params;
    const { name } = req.body;

    // Get max position
    const maxResult = await query(
      'SELECT MAX(position) as max_pos FROM lists WHERE board_id = $1',
      [boardId]
    );
    const maxPos = maxResult.rows[0].max_pos || 0;
    const position = maxPos + 1000;

    const result = await query(
      'INSERT INTO lists (board_id, name, position) VALUES ($1, $2, $3) RETURNING *',
      [boardId, name, position]
    );

    const list = result.rows[0];
    await invalidateBoardCache(boardId);
    await logActivity(boardId, null, req.user.id, 'list_created', { list_name: name });

    // Broadcast to board room
    const io = getIO();
    io.to(`board:${boardId}`).emit('list:created', { list, userId: req.user.id });

    res.status(201).json({ success: true, data: { list } });
  } catch (err) {
    next(err);
  }
};

const updateList = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { boardId, listId } = req.params;
    const { name } = req.body;

    const result = await query(
      'UPDATE lists SET name = $1 WHERE id = $2 AND board_id = $3 RETURNING *',
      [name, listId, boardId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'List not found' });
    }

    const list = result.rows[0];
    await invalidateBoardCache(boardId);
    await logActivity(boardId, null, req.user.id, 'list_renamed', { list_name: name });

    const io = getIO();
    io.to(`board:${boardId}`).emit('list:updated', { list, userId: req.user.id });

    res.json({ success: true, data: { list } });
  } catch (err) {
    next(err);
  }
};

const deleteList = async (req, res, next) => {
  try {
    const { boardId, listId } = req.params;

    await query('DELETE FROM lists WHERE id = $1 AND board_id = $2', [listId, boardId]);
    await invalidateBoardCache(boardId);
    await logActivity(boardId, null, req.user.id, 'list_deleted', { list_id: listId });

    const io = getIO();
    io.to(`board:${boardId}`).emit('list:deleted', { listId, userId: req.user.id });

    res.json({ success: true, message: 'List deleted' });
  } catch (err) {
    next(err);
  }
};

const reorderLists = async (req, res, next) => {
  try {
    const { boardId } = req.params;
    // orderedIds: array of list IDs in new order
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, message: 'orderedIds must be an array' });
    }

    // Assign evenly spaced positions
    const updates = orderedIds.map((id, index) => ({ id, position: (index + 1) * 1000 }));

    for (const { id, position } of updates) {
      await query('UPDATE lists SET position = $1 WHERE id = $2 AND board_id = $3', [position, id, boardId]);
    }

    await invalidateBoardCache(boardId);

    const io = getIO();
    io.to(`board:${boardId}`).emit('lists:reordered', { orderedIds, userId: req.user.id });

    res.json({ success: true, data: { orderedIds } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getLists, createList, updateList, deleteList, reorderLists };
