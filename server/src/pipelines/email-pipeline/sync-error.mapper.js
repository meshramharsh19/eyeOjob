// Maps a raw error thrown out of syncUserEmails into a safe, user-facing
// { code, message, statusCode } triple. The raw error (stack, provider
// response, etc.) is always logged in full server-side by the caller
// (pipeline.orchestrator.js) before this sanitized version is what actually
// reaches the client or gets persisted to sync_status.last_error_message —
// never OAuth tokens, credentials, or raw provider payloads.
const mapSyncError = (err) => {
  const message = err?.message || '';
  const httpStatus = Number(err?.response?.status ?? err?.code ?? err?.status) || null;

  // google-auth-library throws a plain Error with this exact message when the
  // stored refresh token has been revoked/expired (see the real incident this
  // was written against — a stale refresh token surfacing as a raw 500).
  if (/invalid_grant/i.test(message)) {
    return {
      code: 'GMAIL_AUTH_EXPIRED',
      message: 'Google authentication has expired. Please reconnect your Gmail account.',
      statusCode: 401,
    };
  }

  if (message === 'Gmail not connected') {
    return {
      code: 'GMAIL_AUTH_EXPIRED',
      message: 'Gmail is not connected. Please connect your Gmail account.',
      statusCode: 401,
    };
  }

  // Thrown by crypto.util.js#decrypt when a stored token can't be decrypted
  // (pre-encryption plaintext left over from before this was added, a
  // corrupted value, or a GCM auth-tag mismatch). Treating this as an
  // UNKNOWN_ERROR would leave sync_status stuck at 'failed' instead of
  // 'needs_reconnect' — the scheduler would keep re-picking up this user
  // every run, hit the same decrypt failure, and spam logs forever.
  if (/Malformed encrypted credential|Unsupported state or unable to authenticate data/i.test(message)) {
    return {
      code: 'GMAIL_AUTH_EXPIRED',
      message: 'Google authentication has expired. Please reconnect your Gmail account.',
      statusCode: 401,
    };
  }

  if (httpStatus === 429) {
    return {
      code: 'GMAIL_RATE_LIMITED',
      message: "Gmail temporarily limited synchronization. We'll retry shortly.",
      statusCode: 429,
    };
  }

  if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(err?.code)) {
    return {
      code: 'NETWORK_ERROR',
      message: "We couldn't reach Gmail. Please try again.",
      statusCode: 502,
    };
  }

  if (httpStatus && httpStatus >= 400) {
    return {
      code: 'GMAIL_API_ERROR',
      message: 'Gmail returned an error while syncing. Please try again.',
      statusCode: 502,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: "We couldn't sync your emails. Please try again.",
    statusCode: 500,
  };
};

module.exports = { mapSyncError };
