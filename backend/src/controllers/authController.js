const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { query } = require('../config/db');
const {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyUnsubscribeToken,
} = require('../utils/jwt');
const { addEmailJob } = require('../queues/emailQueue');
const logger = require('../utils/logger');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

const sendTokens = async (res, user) => {
  const accessToken = generateAccessToken(user.id);
  const { token: refreshToken, hash, expiresAt } = generateRefreshToken();

  // Store refresh token hash in DB
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, hash, expiresAt]
  );

  // Clean up expired tokens for this user
  await query(
    'DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at < NOW()',
    [user.id]
  ).catch(() => {}); // non-blocking

  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

  return accessToken;
};

const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { name, email, password } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, email_notifications, notification_preferences)
       VALUES ($1, $2, $3, true, $4) RETURNING id, name, email, avatar_url, google_id, email_notifications, notification_preferences`,
      [
        name,
        email,
        hash,
        JSON.stringify({ board_invite: true, card_assigned: true, due_date: true, activity: true, role_changed: true }),
      ]
    );

    const user = result.rows[0];
    const accessToken = await sendTokens(res, user);

    logger.info('User registered', { userId: user.id, email });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url,
          googleId: user.google_id,
          emailNotifications: user.email_notifications,
          notificationPreferences: user.notification_preferences,
          hasPassword: true,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
    }

    const { email, password } = req.body;

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'This account uses Google sign-in. Please continue with Google.',
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const accessToken = await sendTokens(res, user);

    logger.info('User logged in', { userId: user.id, email });

    res.json({
      success: true,
      message: 'Logged in successfully',
      data: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url,
          googleId: user.google_id,
          emailNotifications: user.email_notifications,
          notificationPreferences: user.notification_preferences,
          hasPassword: true,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'No refresh token' });
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const result = await query(
      `SELECT rt.*, u.id as user_id FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const { user_id, id: tokenId } = result.rows[0];

    // Rotate: delete old, issue new
    await query('DELETE FROM refresh_tokens WHERE id = $1', [tokenId]);

    const userResult = await query(
      'SELECT id, name, email, avatar_url, google_id, password_hash, email_notifications, notification_preferences FROM users WHERE id = $1',
      [user_id]
    );
    const user = userResult.rows[0];

    const accessToken = await sendTokens(res, user);

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url,
          googleId: user.google_id,
          emailNotifications: user.email_notifications,
          notificationPreferences: user.notification_preferences,
          hasPassword: !!user.password_hash,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]).catch(() => {});
    }

    res.clearCookie('refreshToken', { path: '/' });
    res.clearCookie('tb-auth-check', { path: '/' });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

const googleCallback = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
    }

    // Read redirect before destroying session
    const oauthRedirect = req.session?.oauthRedirect || '';
    const safeRedirect = oauthRedirect.startsWith('/') ? oauthRedirect : '';

    const accessToken = await sendTokens(res, user);

    // Destroy OAuth session immediately — no longer needed
    req.session.destroy(() => {});

    // Send welcome email for new Google users
    if (user.isNewUser) {
      await addEmailJob('welcome', {
        userId: user.id,
        email: user.email,
        name: user.name,
      }).catch(() => {});
    }

    // Redirect to frontend with token (frontend reads & clears from URL)
    const redirectParam = safeRedirect ? `&redirect=${encodeURIComponent(safeRedirect)}` : '';
    res.redirect(`${process.env.CLIENT_URL}/callback?token=${accessToken}${redirectParam}`);
  } catch (err) {
    logger.error('Google callback error', { error: err.message });
    res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
  }
};

const unsubscribe = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token required' });
    }

    const payload = verifyUnsubscribeToken(token);
    await query(
      'UPDATE users SET email_notifications = false WHERE id = $1',
      [payload.sub]
    );

    res.json({ success: true, message: 'Unsubscribed from all email notifications' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(400).json({ success: false, message: 'Invalid or expired unsubscribe link' });
    }
    next(err);
  }
};

const GENERIC_RESET_MESSAGE = 'If this email is registered, you will receive a password reset link shortly.';

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const result = await query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email.toLowerCase().trim()]);

    // Always return generic message — do not reveal if email exists
    if (result.rows.length === 0) {
      return res.json({ success: true, message: GENERIC_RESET_MESSAGE });
    }

    const user = result.rows[0];

    // Block OAuth-only users (no password)
    if (!user.password_hash) {
      return res.json({ success: true, message: GENERIC_RESET_MESSAGE });
    }

    // Generate token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing reset tokens for this user
    await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    await query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    await addEmailJob('password_reset', {
      userId: user.id,
      email: user.email,
      name: user.name,
      resetToken: rawToken,
    }).catch(() => {});

    logger.info('Password reset requested', { userId: user.id });
    res.json({ success: true, message: GENERIC_RESET_MESSAGE });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await query(
      `SELECT prt.*, u.id as user_id FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1 AND prt.expires_at > NOW() AND prt.used = false`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const { user_id, id: tokenId } = result.rows[0];
    const passwordHash = await bcrypt.hash(password, 12);

    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, user_id]);
    await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [tokenId]);

    // Invalidate all refresh tokens for security
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [user_id]);

    logger.info('Password reset completed', { userId: user_id });
    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, logout, googleCallback, unsubscribe, forgotPassword, resetPassword };
