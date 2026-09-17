const { google } = require('googleapis');
const env = require('../../../config/env');

const getOAuthClient = () => new google.auth.OAuth2(
  env.google.clientId,
  env.google.clientSecret,
  env.google.redirectUri
);

const getGmailClient = (accessToken, refreshToken) => {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

// ── Decode base64 email body ──────────────────
const decodeBody = (data) => {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
};

// ── Walk a (possibly nested) MIME part tree, collecting text/plain and text/html bodies ──
const collectBodies = (part, acc) => {
  if (!part) return;

  if (part.mimeType === 'text/plain' && part.body?.data) {
    acc.plainText += decodeBody(part.body.data);
  } else if (part.mimeType === 'text/html' && part.body?.data) {
    acc.html += decodeBody(part.body.data);
  } else if (part.parts) {
    part.parts.forEach(child => collectBodies(child, acc));
  }
};

// ── Strip HTML tags down to readable text (fallback when a message has no text/plain part) ──
const htmlToText = (html) => html
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// ── Extract email parts ───────────────────────
const extractEmailParts = (payload) => {
  const headers = {};
  payload.headers?.forEach(h => {
    headers[h.name.toLowerCase()] = h.value;
  });

  const acc = { plainText: '', html: '' };

  if (payload.body?.data) {
    // Single-part message — mimeType on the top-level payload tells us which it is
    if (payload.mimeType === 'text/html') acc.html = decodeBody(payload.body.data);
    else acc.plainText = decodeBody(payload.body.data);
  } else if (payload.parts) {
    payload.parts.forEach(part => collectBodies(part, acc));
  }

  const plainText = acc.plainText || (acc.html ? htmlToText(acc.html) : '');

  return {
    body: plainText.substring(0, 5000),
    html: acc.html.substring(0, 100000),
    headers,
  };
};

module.exports = { getOAuthClient, getGmailClient, extractEmailParts };
