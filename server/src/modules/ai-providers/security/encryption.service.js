const crypto = require('crypto');
const env = require('../../../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, GCM standard
const KEY_LENGTH = 32; // 256-bit key

// Validated lazily (not at process startup like config/env.js's REQUIRED_VARS)
// because BYOK is optional — a server with zero users on BYOK never needs
// this key configured. Only the first encrypt/decrypt call pays for the check.
let cachedKey = null;
const getMasterKey = () => {
  if (cachedKey) return cachedKey;
  const raw = env.byok.credentialEncryptionKey;
  if (!raw) {
    throw new Error('AI_CREDENTIAL_ENCRYPTION_KEY is not set — required to store or read BYOK provider credentials.');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`AI_CREDENTIAL_ENCRYPTION_KEY must be exactly ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars), got ${key.length} bytes.`);
  }
  cachedKey = key;
  return cachedKey;
};

// Storage format: hex(iv):hex(ciphertext):hex(tag) — a single colon-delimited
// string so the TEXT column in user_ai_providers.encrypted_credential needs
// no structural change if the format is ever revisited.
const encrypt = (plaintext) => {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`;
};

const decrypt = (stored) => {
  const key = getMasterKey();
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted credential — expected iv:ciphertext:tag');
  }
  const [ivHex, ciphertextHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag); // throws if the ciphertext/tag was tampered with
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
};

module.exports = { encrypt, decrypt };
