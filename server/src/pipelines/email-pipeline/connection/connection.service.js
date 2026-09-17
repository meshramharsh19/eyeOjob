const { getOAuthClient } = require('../ingestion/gmailClient');
const connectionRepository = require('./connection.repository');

const buildAuthUrl = (userId) => {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: userId.toString(),
  });
};

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

module.exports = { buildAuthUrl, handleCallback, getStatus };
