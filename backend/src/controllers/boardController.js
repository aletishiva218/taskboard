const { validationResult } = require('express-validator');
const { query } = require('../config/db');
const { redisClient } = require('../config/redis');
const { addEmailJob } = require('../queues/emailQueue');
const { logActivity } = require('../utils/activity');
const { generateInvitationToken, verifyInvitationToken } = require('../utils/jwt');
const { createNotification } = require('../utils/notifications');
const { getIO } = require('../socket');
const logger = require('../utils/logger');

const BOARD_CACHE_TTL = 60; // seconds

const invalidateBoardCache = async (boardId) => {
  await redisClient.del(`board:${boardId}`).catch(() => {});
};

const getBoards = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT b.id, b.name, b.owner_id, b.created_at, b.updated_at,
              bm.role,
              COUNT(DISTINCT bm2.user_id) as member_count,
              CASE WHEN fb.board_id IS NOT NULL THEN true ELSE false END as is_favourite
       FROM boards b
       JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
       LEFT JOIN board_members bm2 ON bm2.board_id = b.id
       LEFT JOIN favourite_boards fb ON fb.board_id = b.id AND fb.user_id = $1
       GROUP BY b.id, b.name, b.owner_id, b.created_at, b.updated_at, bm.role, fb.board_id
       ORDER BY b.updated_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: { boards: result.rows } });
  } catch (err) {
    next(err);
  }
};

const getBoard = async (req, res, next) => {
  try {
    const { boardId } = req.params;

    // Try cache first
    const cached = await redisClient.get(`board:${boardId}`).catch(() => null);
    if (cached) {
      const cachedBoard = JSON.parse(cached);
      const member = cachedBoard.members?.find((m) => m.user_id === req.user.id);
      cachedBoard.role = member?.role ?? null;
      // is_favourite is user-specific — not stored in the shared cache; query it separately
      const favResult = await query(
        'SELECT 1 FROM favourite_boards WHERE user_id = $1 AND board_id = $2',
        [req.user.id, boardId]
      ).catch(() => ({ rows: [] }));
      cachedBoard.is_favourite = favResult.rows.length > 0;
      return res.json({ success: true, data: cachedBoard, cached: true });
    }

    // Board details
    const boardResult = await query(
      `SELECT b.id, b.name, b.owner_id, b.created_at, b.updated_at
       FROM boards b WHERE b.id = $1`,
      [boardId]
    );

    if (boardResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }

    // Members with user info
    const membersResult = await query(
      `SELECT bm.user_id, bm.role, u.name, u.email, u.avatar_url
       FROM board_members bm JOIN users u ON u.id = bm.user_id
       WHERE bm.board_id = $1`,
      [boardId]
    );

    // Lists with cards
    const listsResult = await query(
      `SELECT l.id, l.name, l.position FROM lists l WHERE l.board_id = $1 ORDER BY l.position ASC`,
      [boardId]
    );

    const cardsResult = await query(
      `SELECT c.id, c.list_id, c.name, c.description, c.due_date, c.position, c.created_at,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('id', cl.id, 'color', cl.color, 'text', cl.text))
                FILTER (WHERE cl.id IS NOT NULL), '[]'
              ) as labels,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url))
                FILTER (WHERE u.id IS NOT NULL), '[]'
              ) as assignees
       FROM cards c
       LEFT JOIN card_labels cl ON cl.card_id = c.id
       LEFT JOIN card_assignees ca ON ca.card_id = c.id
       LEFT JOIN users u ON u.id = ca.user_id
       WHERE c.board_id = $1
       GROUP BY c.id
       ORDER BY c.position ASC`,
      [boardId]
    );

    const board = {
      ...boardResult.rows[0],
      members: membersResult.rows,
      lists: listsResult.rows,
      cards: cardsResult.rows,
    };

    // Cache for 60s (without user-specific role so it's shareable across users)
    await redisClient.setex(`board:${boardId}`, BOARD_CACHE_TTL, JSON.stringify(board)).catch(() => {});

    const currentMember = membersResult.rows.find((m) => m.user_id === req.user.id);
    board.role = currentMember?.role ?? null;

    res.json({ success: true, data: board });
  } catch (err) {
    next(err);
  }
};

const createBoard = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { name } = req.body;

    const boardResult = await query(
      'INSERT INTO boards (name, owner_id) VALUES ($1, $2) RETURNING *',
      [name, req.user.id]
    );
    const board = boardResult.rows[0];

    // Add creator as owner
    await query(
      'INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)',
      [board.id, req.user.id, 'owner']
    );

    await logActivity(board.id, null, req.user.id, 'board_created', { board_name: name });

    logger.info('Board created', { boardId: board.id, userId: req.user.id });

    res.status(201).json({
      success: true,
      message: 'Board created',
      data: {
        board: {
          ...board,
          role: 'owner',
          member_count: 1,
          is_favourite: false,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

const updateBoard = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { boardId } = req.params;
    const { name } = req.body;

    const result = await query(
      'UPDATE boards SET name = $1 WHERE id = $2 RETURNING *',
      [name, boardId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }

    await invalidateBoardCache(boardId);
    await logActivity(boardId, null, req.user.id, 'board_renamed', { new_name: name });

    res.json({ success: true, data: { board: result.rows[0] } });
  } catch (err) {
    next(err);
  }
};

const deleteBoard = async (req, res, next) => {
  try {
    const { boardId } = req.params;

    await query('DELETE FROM boards WHERE id = $1', [boardId]);
    await invalidateBoardCache(boardId);

    logger.info('Board deleted', { boardId, userId: req.user.id });
    res.json({ success: true, message: 'Board deleted' });
  } catch (err) {
    next(err);
  }
};

const inviteMember = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { boardId } = req.params;
    const { email, role = 'editor' } = req.body;

    // Get board name
    const boardResult = await query('SELECT name FROM boards WHERE id = $1', [boardId]);
    const boardName = boardResult.rows[0]?.name;

    // Find user by email
    const userResult = await query('SELECT id, name, email FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      // User not registered — send invitation email with a join link
      const token = generateInvitationToken({ boardId, email, role, inviterName: req.user.name, boardName });
      await addEmailJob('board_invite_new_user', {
        userId: null,
        email,
        inviterName: req.user.name,
        boardName,
        role,
        inviteToken: token,
      }).catch(() => {});

      return res.json({ success: true, message: `Invitation sent to ${email}. They will receive an email to join.` });
    }

    const invitee = userResult.rows[0];

    // Check not already a member
    const existing = await query(
      'SELECT id FROM board_members WHERE board_id = $1 AND user_id = $2',
      [boardId, invitee.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'User is already a member of this board' });
    }

    // Registered user — send token-based invitation (same as unregistered), requiring acceptance
    const token = generateInvitationToken({ boardId, email, role, inviterName: req.user.name, boardName });

    await addEmailJob('board_invite', {
      userId: invitee.id,
      email: invitee.email,
      name: invitee.name,
      boardName,
      inviterName: req.user.name,
      role,
      inviteToken: token,
    }).catch(() => {});

    // Create in-app notification and emit via socket if user is online
    const notification = await createNotification(
      invitee.id,
      'board_invite',
      'Board Invitation',
      `${req.user.name} invited you to join "${boardName}" as ${role}`,
      { boardId, boardName, inviterName: req.user.name, role, inviteToken: token }
    );

    if (notification) {
      try {
        getIO().to(`user:${invitee.id}`).emit('notification:new', notification);
      } catch {}
    }

    await logActivity(boardId, null, req.user.id, 'member_invited', { invited_email: email, role });

    res.json({ success: true, message: `Invitation sent to ${email}. They will receive an email to accept.` });
  } catch (err) {
    next(err);
  }
};

const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Invitation token required' });
    }

    let decoded;
    try {
      decoded = verifyInvitationToken(token);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid or expired invitation link' });
    }

    const { boardId, email, role } = decoded;

    // Email must match the logged-in user
    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: `This invitation was sent to ${email}. Please sign in with that account.`,
      });
    }

    // Check if board exists
    const boardResult = await query('SELECT id, name FROM boards WHERE id = $1', [boardId]);
    if (boardResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Board not found or has been deleted' });
    }

    // Check if already a member
    const existing = await query(
      'SELECT id FROM board_members WHERE board_id = $1 AND user_id = $2',
      [boardId, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, message: 'You are already a member of this board', data: { boardId } });
    }

    await query(
      'INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)',
      [boardId, req.user.id, role]
    );

    await invalidateBoardCache(boardId);
    await logActivity(boardId, null, req.user.id, 'member_joined', { role });

    res.json({ success: true, message: 'Invitation accepted! Welcome to the board.', data: { boardId } });
  } catch (err) {
    next(err);
  }
};

const updateMemberRole = async (req, res, next) => {
  try {
    const { boardId, userId } = req.params;
    const { role } = req.body;

    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be editor or viewer' });
    }

    // Can't change owner's role
    const ownerCheck = await query(
      'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
      [boardId, userId]
    );
    if (ownerCheck.rows[0]?.role === 'owner') {
      return res.status(400).json({ success: false, message: 'Cannot change owner role' });
    }

    const result = await query(
      'UPDATE board_members SET role = $1 WHERE board_id = $2 AND user_id = $3 RETURNING *',
      [role, boardId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    await invalidateBoardCache(boardId);
    await logActivity(boardId, null, req.user.id, 'member_role_changed', { user_id: userId, new_role: role });

    // Notify affected user in real-time so their UI updates without a page refresh
    try {
      getIO().to(`user:${userId}`).emit('member:role_updated', { boardId, role });
    } catch {}

    // Notify user of role change
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    const boardResult = await query('SELECT name FROM boards WHERE id = $1', [boardId]);

    if (userResult.rows.length > 0) {
      await addEmailJob('role_changed', {
        userId,
        email: userResult.rows[0].email,
        name: userResult.rows[0].name,
        boardName: boardResult.rows[0]?.name,
        newRole: role,
      }).catch(() => {});
    }

    res.json({ success: true, data: { member: result.rows[0] } });
  } catch (err) {
    next(err);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const { boardId, userId } = req.params;

    // Can't remove owner
    const check = await query(
      'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
      [boardId, userId]
    );
    if (check.rows[0]?.role === 'owner') {
      return res.status(400).json({ success: false, message: 'Cannot remove board owner' });
    }

    await query(
      'DELETE FROM board_members WHERE board_id = $1 AND user_id = $2',
      [boardId, userId]
    );

    await invalidateBoardCache(boardId);
    res.json({ success: true, message: 'Member removed' });
  } catch (err) {
    next(err);
  }
};

const getActivity = async (req, res, next) => {
  try {
    const { boardId } = req.params;
    const result = await query(
      `SELECT al.id, al.action, al.metadata, al.created_at,
              u.id as user_id, u.name, u.avatar_url
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.board_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [boardId]
    );

    res.json({ success: true, data: { activities: result.rows } });
  } catch (err) {
    next(err);
  }
};

const toggleFavourite = async (req, res, next) => {
  try {
    const { boardId } = req.params;
    const userId = req.user.id;

    const existing = await query(
      'SELECT 1 FROM favourite_boards WHERE user_id = $1 AND board_id = $2',
      [userId, boardId]
    );

    if (existing.rows.length > 0) {
      await query('DELETE FROM favourite_boards WHERE user_id = $1 AND board_id = $2', [userId, boardId]);
      res.json({ success: true, data: { is_favourite: false } });
    } else {
      await query('INSERT INTO favourite_boards (user_id, board_id) VALUES ($1, $2)', [userId, boardId]);
      res.json({ success: true, data: { is_favourite: true } });
    }
  } catch (err) {
    next(err);
  }
};

const exportBoard = async (req, res, next) => {
  try {
    const { boardId } = req.params;
    const { format = 'json' } = req.query;
    const userId = req.user.id;

    const boardResult = await query('SELECT id, name, created_at FROM boards WHERE id = $1', [boardId]);
    if (!boardResult.rows[0]) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }
    const board = boardResult.rows[0];

    const [
      listsResult,
      cardsResult,
      commentsResult,
      attachmentsResult,
      membersResult,
      favouriteResult,
      activityResult,
      chatResult,
    ] = await Promise.all([
      query(
        'SELECT id, name, position, created_at FROM lists WHERE board_id = $1 ORDER BY position',
        [boardId]
      ),
      query(
        `SELECT c.id, c.list_id, c.name, c.description, c.due_date, c.position, c.created_at,
                COALESCE(
                  json_agg(DISTINCT jsonb_build_object('color', cl.color, 'text', cl.text))
                  FILTER (WHERE cl.id IS NOT NULL), '[]'
                ) AS labels,
                COALESCE(
                  json_agg(DISTINCT jsonb_build_object('name', u.name, 'email', u.email))
                  FILTER (WHERE u.id IS NOT NULL), '[]'
                ) AS assignees
         FROM cards c
         LEFT JOIN card_labels cl ON cl.card_id = c.id
         LEFT JOIN card_assignees ca ON ca.card_id = c.id
         LEFT JOIN users u ON u.id = ca.user_id
         WHERE c.board_id = $1
         GROUP BY c.id
         ORDER BY c.position`,
        [boardId]
      ),
      query(
        `SELECT cc.id, cc.card_id, cc.text, cc.created_at, u.name AS author, u.email AS author_email
         FROM card_comments cc
         JOIN users u ON u.id = cc.user_id
         WHERE cc.board_id = $1
         ORDER BY cc.created_at ASC`,
        [boardId]
      ),
      query(
        `SELECT ca.id, ca.card_id, ca.original_name, ca.filename, ca.created_at,
                u.name AS uploaded_by
         FROM card_attachments ca
         JOIN users u ON u.id = ca.user_id
         WHERE ca.board_id = $1
         ORDER BY ca.created_at ASC`,
        [boardId]
      ),
      query(
        `SELECT u.id, u.name, u.email, bm.role, bm.created_at AS joined_at
         FROM board_members bm
         JOIN users u ON u.id = bm.user_id
         WHERE bm.board_id = $1
         ORDER BY bm.created_at ASC`,
        [boardId]
      ),
      query(
        'SELECT 1 FROM favourite_boards WHERE user_id = $1 AND board_id = $2',
        [userId, boardId]
      ),
      query(
        `SELECT al.card_id, al.action, al.metadata, al.created_at, u.name AS user_name
         FROM activity_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.board_id = $1 AND al.card_id IS NOT NULL
         ORDER BY al.created_at ASC`,
        [boardId]
      ),
      query(
        `SELECT m.content, u.name AS sent_by, m.created_at AS time
         FROM board_messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.board_id = $1 AND m.content IS NOT NULL
         ORDER BY m.created_at ASC`,
        [boardId]
      ),
    ]);

    const isFavourite = favouriteResult.rows.length > 0;
    const generatedAt = new Date().toISOString();
    const safeName = board.name.replace(/[^a-z0-9]/gi, '_');

    // Group by card_id
    const commentsByCard = {};
    for (const c of commentsResult.rows) {
      (commentsByCard[c.card_id] ||= []).push({
        id: c.id, text: c.text, author: c.author, author_email: c.author_email, created_at: c.created_at,
      });
    }

    const activityByCard = {};
    for (const a of activityResult.rows) {
      (activityByCard[a.card_id] ||= []).push({
        action: a.action, metadata: a.metadata, user_name: a.user_name, created_at: a.created_at,
      });
    }

    const cardListMap = {};
    for (const card of cardsResult.rows) {
      cardListMap[card.id] = card.list_id;
    }

    if (format === 'csv') {
      const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = [];

      // BOARD
      rows.push(['BOARD']);
      rows.push(['Name', 'Board ID', 'Favourite', 'Generated Date']);
      rows.push([board.name, board.id, isFavourite ? 'Yes' : 'No', generatedAt]);
      rows.push([]);

      // USERS
      rows.push(['USERS']);
      rows.push(['Name', 'Role', 'Joined Date']);
      for (const m of membersResult.rows) {
        rows.push([m.name, m.role, m.joined_at]);
      }
      rows.push([]);

      // LISTS
      rows.push(['LISTS']);
      rows.push(['Total Lists', 'List Name', 'List ID', 'Total Cards']);
      for (let i = 0; i < listsResult.rows.length; i++) {
        const list = listsResult.rows[i];
        const cardCount = cardsResult.rows.filter((c) => c.list_id === list.id).length;
        rows.push([i === 0 ? listsResult.rows.length : '', list.name, list.id, cardCount]);
      }
      rows.push([]);

      // CARDS
      rows.push(['CARDS']);
      rows.push(['Total Cards', 'Card Name', 'Card ID', 'List ID', 'Description', 'Labels', 'Members', 'Comments', 'Activity Count', 'Due Date']);
      for (let i = 0; i < cardsResult.rows.length; i++) {
        const card = cardsResult.rows[i];
        const comments = (commentsByCard[card.id] || []).map((c) => `[${c.author}] ${c.text}`).join(' | ');
        const activityCount = (activityByCard[card.id] || []).length;
        rows.push([
          i === 0 ? cardsResult.rows.length : '',
          card.name,
          card.id,
          card.list_id,
          card.description || '',
          (card.labels || []).map((l) => l.text || l.color).join('; '),
          (card.assignees || []).map((a) => a.name).join('; '),
          comments,
          activityCount,
          card.due_date ? new Date(card.due_date).toISOString().split('T')[0] : '',
        ]);
      }
      rows.push([]);

      // ATTACHMENTS
      rows.push(['ATTACHMENTS']);
      rows.push(['Attachment ID', 'Name', 'Uploaded By', 'Card ID', 'List ID', 'Card Due Date']);
      for (const a of attachmentsResult.rows) {
        const card = cardsResult.rows.find((c) => c.id === a.card_id);
        rows.push([
          a.id,
          a.original_name,
          a.uploaded_by,
          a.card_id,
          cardListMap[a.card_id] || '',
          card?.due_date ? new Date(card.due_date).toISOString().split('T')[0] : '',
        ]);
      }
      rows.push([]);

      // CHAT
      rows.push(['CHAT']);
      rows.push(['Sent By', 'Message', 'Time']);
      for (const m of chatResult.rows) {
        rows.push([m.sent_by, m.content, m.time]);
      }

      const csv = rows.map((row) => row.map((cell) => esc(cell)).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_export.csv"`);
      return res.send(csv);
    }

    // JSON
    const data = {
      board: {
        id: board.id,
        name: board.name,
        is_favourite: isFavourite,
        generated_at: generatedAt,
      },
      users: membersResult.rows.map((m) => ({
        name: m.name,
        email: m.email,
        role: m.role,
        joined_date: m.joined_at,
      })),
      lists: {
        total: listsResult.rows.length,
        items: listsResult.rows.map((list) => ({
          id: list.id,
          name: list.name,
          total_cards: cardsResult.rows.filter((c) => c.list_id === list.id).length,
        })),
      },
      cards: {
        total: cardsResult.rows.length,
        items: cardsResult.rows.map((card) => ({
          id: card.id,
          name: card.name,
          list_id: card.list_id,
          description: card.description,
          due_date: card.due_date,
          labels: card.labels,
          members: card.assignees,
          comments: commentsByCard[card.id] || [],
          activity: activityByCard[card.id] || [],
        })),
      },
      attachments: attachmentsResult.rows.map((a) => ({
        attachment_id: a.id,
        name: a.original_name,
        uploaded_by: a.uploaded_by,
        card_id: a.card_id,
        list_id: cardListMap[a.card_id] || null,
        due_date: cardsResult.rows.find((c) => c.id === a.card_id)?.due_date || null,
      })),
      chat: chatResult.rows.map((m) => ({
        content: m.content,
        sent_by: m.sent_by,
        time: m.time,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_export.json"`);
    return res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
