const env = require('../../../config/env');
const logger = require('../../../config/logger');
const connectionService = require('./connection.service');

// Binds the `state` value to this browser (same double-submit-cookie
// pattern as /auth/google in auth.routes.js) — without it, `state` alone
// only proves the flow was started server-side for *some* user, not that
// this specific browser/request is the one that started it.
const GMAIL_STATE_COOKIE = 'gmail_oauth_state';
const GMAIL_STATE_TTL_MS = 5 * 60 * 1000;

// ── Step 1: Generate Gmail OAuth URL ──────────
const connect = (req, res) => {
  const { url, state } = connectionService.buildAuthUrl(req.user.id);
  res.cookie(GMAIL_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: GMAIL_STATE_TTL_MS,
  });
  res.json({ url });
};

// ── Step 2: Gmail OAuth Callback ──────────────
const callback = async (req, res) => {
  const { code, state } = req.query;
  const cookieState = req.cookies?.[GMAIL_STATE_COOKIE];
  res.clearCookie(GMAIL_STATE_COOKIE);

  // userId comes only from the server-side state→user mapping recorded at
  // /connect time — never parsed out of the (attacker-visible) query string.
  const userId = state && cookieState === state
    ? connectionService.resolvePendingUserId(state)
    : null;

  if (!userId) {
    logger.error('Gmail connection callback error: invalid, expired, or mismatched state');
    return res.redirect(`${env.clientUrl}/?gmail=error`);
  }

  try {
    await connectionService.handleCallback(code, userId);
    res.redirect(`${env.clientUrl}/?gmail=connected`);
  } catch (err) {
    logger.error('Gmail connection callback error:', err.message);
    res.redirect(`${env.clientUrl}/?gmail=error`);
  }
};

// ── Check Gmail Connection Status ─────────────
const status = async (req, res) => {
  const connected = await connectionService.getStatus(req.user.id);
  res.json({ connected });
};

module.exports = { connect, callback, status };
