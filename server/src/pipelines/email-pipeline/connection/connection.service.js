const crypto = require('crypto');
const { getOAuthClient } = require('../ingestion/gmailClient');
const connectionRepository = require('./connection.repository');
const { createTtlMap } = require('../../../utils/ttlMap');

// Maps an opaque, single-use `state` token to the authenticated user who
// started this flow. The callback below trusts only this map — never the
// raw `state` query param — to decide whose account gets the Gmail tokens.
// Previously `state` WAS `userId.toString()`, so anyone who could complete
// their own Google consent could manually hit /gmail/callback with an
// arbitrary victim id in `state` and link their Gmail into that account.
// See utils/ttlMap.js for the eviction/cluster caveats.
const pendingConnections = createTtlMap();
const STATE_TTL_MS = 5 * 60 * 1000;

const buildAuthUrl = (userId) => {
  const oauth2Client = getOAuthClient();
  const state = crypto.randomBytes(24).toString('hex');
  pendingConnections.set(state, userId, Date.now() + STATE_TTL_MS);

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  });
  return { url, state };
};

// Single-use: called once by the callback, whether or not the state turns
// out to be valid.
const resolvePendingUserId = (state) => pendingConnections.takeIfValid(state);

const handleCallback = async (code, userId) => {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  await connectionRepository.saveGmailTokens(userId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
  await connectionRepository.ensureSyncStatusRow(userId);
};

const getStatus = async (userId) => connectionRepository.getConnectionStatus(userId);

module.exports = { buildAuthUrl, resolvePendingUserId, handleCallback, getStatus };
