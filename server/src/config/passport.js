const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./database');
const env = require('./env');

passport.use(
  new GoogleStrategy(
    {
      clientID: env.google.clientId,
      clientSecret: env.google.clientSecret,
      callbackURL: env.google.redirectUri,
      accessType: 'offline', // Requests refresh_token
      prompt: 'consent',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const avatar = profile.photos[0]?.value || null;

        // 1. Check if user already exists
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        let user;

        if (rows.length > 0) {
          // --- USER EXISTS: Update tokens & avatar ---
          user = rows[0];
          await db.query(
            `UPDATE users
             SET gmail_token = ?, refresh_token = COALESCE(?, refresh_token), avatar = ?, is_verified = 1, gmail_connected = 1
             WHERE id = ?`,
            [accessToken, refreshToken || null, avatar, user.id]
          );
          user.avatar = avatar;
          user.gmail_token = accessToken;
        } else {
          // --- NEW USER: Register user into DB ---
          const [result] = await db.query(
            `INSERT INTO users (email, name, password, is_verified, avatar, gmail_token, refresh_token, gmail_connected)
             VALUES (?, ?, NULL, 1, ?, ?, ?, 1)`,
            [email, name, avatar, accessToken, refreshToken || null]
          );

          user = {
            id: result.insertId,
            email,
            name,
            avatar,
            is_verified: 1,
          };
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
