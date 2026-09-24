const { Router } = require('express');
const { body } = require('express-validator');
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { uploadToStorage, deleteFromStorage } = require('../utils/storage');

const AVATARS_DIR = path.join(__dirname, '../../uploads/avatars');

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const router = Router();
router.use(authenticate);

router.patch(
  '/profile',
  [body('name').optional().trim().notEmpty().isLength({ max: 100 })],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
      }

      const { name } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'No fields to update' });

      const result = await query(
        'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, avatar_url',
        [name, req.user.id]
      );

      res.json({ success: true, data: { user: result.rows[0] } });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;

      const userResult = await query('SELECT password_hash, google_id FROM users WHERE id = $1', [req.user.id]);
      const user = userResult.rows[0];

      if (!user.password_hash) {
        return res.status(400).json({ success: false, message: 'OAuth users cannot set a password this way' });
      }

      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

      // Invalidate all refresh tokens
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);

      res.json({ success: true, message: 'Password updated. Please log in again.' });
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/notification-preferences', async (req, res, next) => {
  try {
    const { emailNotifications, notificationPreferences } = req.body;

    const updates = [];
    const values = [];
    let idx = 1;

    if (typeof emailNotifications === 'boolean') {
      updates.push(`email_notifications = $${idx++}`);
      values.push(emailNotifications);
    }

    if (notificationPreferences && typeof notificationPreferences === 'object') {
      const allowed = ['board_invite', 'card_assigned', 'due_date', 'activity', 'role_changed'];
      const sanitized = {};
      for (const key of allowed) {
        if (typeof notificationPreferences[key] === 'boolean') {
          sanitized[key] = notificationPreferences[key];
        }
      }
      if (Object.keys(sanitized).length > 0) {
        updates.push(`notification_preferences = notification_preferences || $${idx++}`);
        values.push(JSON.stringify(sanitized));
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING email_notifications, notification_preferences`,
      values
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /users/avatar — upload or replace profile photo
router.post('/avatar', avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Delete old avatar from Cloudinary or local disk before uploading the new one
    const existing = await query('SELECT avatar_url FROM users WHERE id = $1', [req.user.id]);
    const oldUrl = existing.rows[0]?.avatar_url;
    if (oldUrl) deleteFromStorage(oldUrl, AVATARS_DIR);

    const avatarUrl = await uploadToStorage(req.file.buffer, {
      folder: 'avatars',
      originalname: req.file.originalname,
      host: req.get('host'),
      protocol: req.protocol,
    });

    const result = await query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, name, email, avatar_url',
      [avatarUrl, req.user.id]
    );

    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (err) {
    next(err);
  }
});

// DELETE /users/avatar — remove profile photo
router.delete('/avatar', async (req, res, next) => {
  try {
    const existing = await query('SELECT avatar_url FROM users WHERE id = $1', [req.user.id]);
    const oldUrl = existing.rows[0]?.avatar_url;
    if (oldUrl) deleteFromStorage(oldUrl, AVATARS_DIR);

    await query('UPDATE users SET avatar_url = NULL WHERE id = $1', [req.user.id]);
    res.json({ success: true, data: { user: { avatar_url: null } } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
