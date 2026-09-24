const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { query } = require('./db');
const logger = require('../utils/logger');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const name = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value;

        if (!email) {
          return done(new Error('No email returned from Google'), null);
        }

        // Check if user exists by google_id first
        let result = await query(
          'SELECT * FROM users WHERE google_id = $1',
          [googleId]
        );

        if (result.rows.length > 0) {
          return done(null, result.rows[0]);
        }

        // Check if user exists by email (link accounts)
        result = await query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
          // Link Google account to existing email account
          const updated = await query(
            `UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2)
             WHERE email = $3 RETURNING *`,
            [googleId, avatarUrl, email]
          );
          return done(null, { ...updated.rows[0], isNewUser: false });
        }

        // Create new user from Google profile
        const newUser = await query(
          `INSERT INTO users (name, email, google_id, avatar_url, email_notifications, notification_preferences)
           VALUES ($1, $2, $3, $4, true, $5) RETURNING *`,
          [
            name,
            email,
            googleId,
            avatarUrl,
            JSON.stringify({
              board_invite: true,
              card_assigned: true,
              due_date: true,
              activity: true,
              role_changed: true,
            }),
          ]
        );

        return done(null, { ...newUser.rows[0], isNewUser: true });
      } catch (err) {
        logger.error('Google OAuth error', { error: err.message });
        return done(err, null);
      }
    }
  )
);

// Minimal serialization — used only for OAuth handshake session
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
