const path = require('path');
const { query } = require('../config/db');
const { getIO } = require('../socket');
const { logActivity } = require('../utils/activity');
const { uploadToStorage, deleteFromStorage } = require('../utils/storage');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const getAttachments = async (req, res, next) => {
  try {
    const { cardId } = req.params;
    const result = await query(
      `SELECT ca.id, ca.card_id, ca.user_id, ca.filename, ca.original_name,
              ca.mimetype, ca.size, ca.created_at, u.name as user_name
       FROM card_attachments ca
       JOIN users u ON u.id = ca.user_id
       WHERE ca.card_id = $1
       ORDER BY ca.created_at DESC`,
      [cardId]
    );
    // filename stores either a Cloudinary URL (new) or a UUID filename (legacy local).
    // Expose a url field so the frontend always has the right link.
    const attachments = result.rows.map(a => ({
      ...a,
      url: a.filename.startsWith('http') ? a.filename : null,
    }));
    res.json({ success: true, data: { attachments } });
  } catch (err) {
    next(err);
  }
};

const addAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { boardId, cardId } = req.params;

    // Upload to Cloudinary (prod) or local disk (dev); returns a public URL
    const fileUrl = await uploadToStorage(req.file.buffer, {
      folder: 'attachments',
      originalname: req.file.originalname,
      host: req.get('host'),
      protocol: req.protocol,
    });

    const result = await query(
      `INSERT INTO card_attachments (card_id, board_id, user_id, filename, original_name, mimetype, size)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, card_id, user_id, filename, original_name, mimetype, size, created_at`,
      [cardId, boardId, req.user.id, fileUrl, req.file.originalname, req.file.mimetype, req.file.size]
    );

    // filename now stores the full URL; expose it as url for the frontend
    const attachment = { ...result.rows[0], user_name: req.user.name, url: fileUrl };

    await logActivity(boardId, cardId, req.user.id, 'attachment_added', {
      name: req.file.originalname,
    });

    const io = getIO();
    io.to(`board:${boardId}`).emit('attachment:created', { attachment, cardId });

    res.status(201).json({ success: true, data: { attachment } });
  } catch (err) {
    next(err);
  }
};

const deleteAttachment = async (req, res, next) => {
  try {
    const { boardId, cardId, attachmentId } = req.params;

    const result = await query(
      'SELECT * FROM card_attachments WHERE id = $1 AND card_id = $2',
      [attachmentId, cardId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const attachment = result.rows[0];
    if (attachment.user_id !== req.user.id) {
      const boardResult = await query('SELECT owner_id FROM boards WHERE id = $1', [boardId]);
      if (!boardResult.rows[0] || boardResult.rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
    }

    // filename stores either a Cloudinary URL or a local URL; deleteFromStorage handles both
    deleteFromStorage(attachment.filename, UPLOADS_DIR);

    await query('DELETE FROM card_attachments WHERE id = $1', [attachmentId]);

    const io = getIO();
    io.to(`board:${boardId}`).emit('attachment:deleted', { attachmentId, cardId });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAttachments, addAttachment, deleteAttachment };
