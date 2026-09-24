const { Router } = require('express');
const { body } = require('express-validator');
const passport = require('../config/passport');
const { authenticate } = require('../middleware/auth');
const {
  register,
  login,
  refresh,
  logout,
  googleCallback,
  unsubscribe,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');

const router = Router();

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  login
);

router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], resetPassword);

// Google OAuth — redirects to Google consent screen
// Preserve the post-login redirect URL in the session so it survives the OAuth round-trip.
// Must call req.session.save() before Passport's redirect fires — Passport calls res.redirect()
// synchronously, and the Redis write may not complete in time without an explicit save.
router.get('/google', (req, res, next) => {
  const redirect = req.query.redirect || '';
  const safeRedirect = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '';

  if (safeRedirect) {
    req.session.oauthRedirect = safeRedirect;
    req.session.save((err) => {
      if (err) return next(err);
      passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })(req, res, next);
    });
  } else {
    passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })(req, res, next);
  }
});

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/api/auth/google/failure', session: true }),
  googleCallback
);

router.get('/google/failure', (req, res) => {
  res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
});

// Unsubscribe from emails
router.get('/unsubscribe', unsubscribe);

// Get current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { id, name, email, avatar_url, google_id, email_notifications, notification_preferences } = req.user;
    // Check password_hash directly — google_id can be linked to an account that also has a password
    const { query } = require('../config/db');
    const pwResult = await query('SELECT password_hash FROM users WHERE id = $1', [id]);
    const hasPassword = !!(pwResult.rows[0]?.password_hash);
    res.json({
      success: true,
      data: {
        user: {
          id,
          name,
          email,
          avatarUrl: avatar_url,
          googleId: google_id,
          emailNotifications: email_notifications,
          notificationPreferences: notification_preferences,
          hasPassword,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
