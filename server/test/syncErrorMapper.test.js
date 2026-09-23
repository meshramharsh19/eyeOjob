const { mapSyncError } = require('../src/pipelines/email-pipeline/sync-error.mapper');

describe('mapSyncError', () => {
  test('maps the real invalid_grant OAuth failure to GMAIL_AUTH_EXPIRED, 401 — never leaks the raw provider message as-is', () => {
    const err = new Error('invalid_grant');
    const result = mapSyncError(err);

    expect(result).toEqual({
      code: 'GMAIL_AUTH_EXPIRED',
      message: 'Google authentication has expired. Please reconnect your Gmail account.',
      statusCode: 401,
    });
    // The sanitized message must not just be the raw provider string.
    expect(result.message).not.toBe('invalid_grant');
  });

  test('maps "Gmail not connected" to GMAIL_AUTH_EXPIRED, 401', () => {
    const result = mapSyncError(new Error('Gmail not connected'));
    expect(result.code).toBe('GMAIL_AUTH_EXPIRED');
    expect(result.statusCode).toBe(401);
  });

  test('maps decryption failure on legacy plaintext tokens to GMAIL_AUTH_EXPIRED, 401', () => {
    const err = new Error('Malformed encrypted credential — expected iv:ciphertext:tag');
    const result = mapSyncError(err);
    expect(result).toEqual({
      code: 'GMAIL_AUTH_EXPIRED',
      message: 'Google authentication has expired. Please reconnect your Gmail account.',
      statusCode: 401,
    });
  });

  test('maps corrupted ciphertext or auth-tag mismatch to GMAIL_AUTH_EXPIRED, 401', () => {
    const err = new Error('Unsupported state or unable to authenticate data');
    const result = mapSyncError(err);
    expect(result).toEqual({
      code: 'GMAIL_AUTH_EXPIRED',
      message: 'Google authentication has expired. Please reconnect your Gmail account.',
      statusCode: 401,
    });
  });

  test('maps a 429 response status to GMAIL_RATE_LIMITED, 429', () => {
    const err = new Error('Too Many Requests');
    err.response = { status: 429 };
    const result = mapSyncError(err);
    expect(result.code).toBe('GMAIL_RATE_LIMITED');
    expect(result.statusCode).toBe(429);
  });

  test('maps common network error codes to NETWORK_ERROR, 502', () => {
    for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED']) {
      const err = new Error('network blip');
      err.code = code;
      expect(mapSyncError(err)).toMatchObject({ code: 'NETWORK_ERROR', statusCode: 502 });
    }
  });

  test('maps a generic 4xx/5xx Gmail API response to GMAIL_API_ERROR, 502', () => {
    const err = new Error('Bad Request');
    err.response = { status: 400 };
    expect(mapSyncError(err)).toMatchObject({ code: 'GMAIL_API_ERROR', statusCode: 502 });
  });

  test('falls back to UNKNOWN_ERROR, 500 for anything unrecognized', () => {
    const result = mapSyncError(new Error('something bizarre happened'));
    expect(result).toMatchObject({ code: 'UNKNOWN_ERROR', statusCode: 500 });
  });

  test('never includes the raw error message verbatim in the sanitized output (no stack/detail leakage)', () => {
    const err = new Error('secret provider internals: token=abc123');
    const result = mapSyncError(err);
    expect(result.message).not.toContain('secret provider internals');
    expect(result.message).not.toContain('abc123');
  });
});
