const env = require('../../../config/env');
const logger = require('../../../config/logger');
const connectionService = require('./connection.service');

// ── Step 1: Generate Gmail OAuth URL ──────────
const connect = (req, res) => {
  const url = connectionService.buildAuthUrl(req.user.id);
  res.json({ url });
};

// ── Step 2: Gmail OAuth Callback ──────────────
const callback = async (req, res) => {
  const { code, state } = req.query;
  const userId = parseInt(state);

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
