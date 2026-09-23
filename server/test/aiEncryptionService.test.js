// AES-256-GCM encryption round trip + tamper detection — the encrypted
// credential is the only thing standing between a DB dump and a leaked
// user API key, so this is worth testing directly rather than only
// indirectly through the higher-level BYOK flow.

const ORIGINAL_KEY = process.env.AI_CREDENTIAL_ENCRYPTION_KEY;

beforeAll(() => {
  // Deterministic 32-byte test key — never the real dev/prod key.
  process.env.AI_CREDENTIAL_ENCRYPTION_KEY = '0'.repeat(64);
});

afterAll(() => {
  process.env.AI_CREDENTIAL_ENCRYPTION_KEY = ORIGINAL_KEY;
});

// env.js reads process.env once at require time via dotenv, but
// byok.credentialEncryptionKey is a plain property read (not cached at
// require time beyond that), and encryption.service.js's getMasterKey()
// caches on first use — so this must be required fresh, after the env var
// above is set, within an isolated module registry.
let encryptionService;
beforeEach(() => {
  jest.resetModules();
  encryptionService = require('../src/modules/ai-providers/security/encryption.service');
});

describe('encryption.service', () => {
  test('round-trips a plaintext value', () => {
    const plaintext = 'gsk_super_secret_api_key_value';
    const encrypted = encryptionService.encrypt(plaintext);
    expect(encryptionService.decrypt(encrypted)).toBe(plaintext);
  });

  test('stored format is iv:ciphertext:tag (three hex segments)', () => {
    const encrypted = encryptionService.encrypt('some-key');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    parts.forEach((p) => expect(p).toMatch(/^[0-9a-f]+$/));
  });

  test('two encryptions of the same plaintext produce different ciphertext (random IV)', () => {
    const a = encryptionService.encrypt('same-value');
    const b = encryptionService.encrypt('same-value');
    expect(a).not.toBe(b);
    expect(encryptionService.decrypt(a)).toBe('same-value');
    expect(encryptionService.decrypt(b)).toBe('same-value');
  });

  test('tampered ciphertext fails authentication and throws', () => {
    const encrypted = encryptionService.encrypt('secret-value');
    const [iv, ciphertext, tag] = encrypted.split(':');
    const flippedLastByte = ciphertext.slice(0, -2) + (ciphertext.slice(-2) === '00' ? '01' : '00');
    const tampered = `${iv}:${flippedLastByte}:${tag}`;
    expect(() => encryptionService.decrypt(tampered)).toThrow();
  });

  test('tampered auth tag fails authentication and throws', () => {
    const encrypted = encryptionService.encrypt('secret-value');
    const [iv, ciphertext, tag] = encrypted.split(':');
    const flippedTag = tag.slice(0, -2) + (tag.slice(-2) === '00' ? '01' : '00');
    expect(() => encryptionService.decrypt(`${iv}:${ciphertext}:${flippedTag}`)).toThrow();
  });

  test('malformed stored value (wrong number of segments) throws a clear error', () => {
    expect(() => encryptionService.decrypt('not-a-valid-format')).toThrow('Malformed encrypted credential');
  });

  // AI_CREDENTIAL_ENCRYPTION_KEY is a REQUIRED_VAR in config/env.js (it's
  // load-bearing for Gmail token storage now, not just BYOK) — an unset or
  // malformed key now fails loudly at require/boot time via env.js, rather
  // than lazily the first time something tries to encrypt/decrypt.
  test('throws a clear error when AI_CREDENTIAL_ENCRYPTION_KEY is unset', () => {
    jest.resetModules();
    delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
    // Without this, config/env.js's dotenv.config() would reload the real
    // dev server/.env (which does have this key set for actual BYOK use)
    // and silently defeat the "unset" scenario this test is checking.
    jest.doMock('dotenv', () => ({ config: () => ({}) }));
    try {
      expect(() => require('../src/modules/ai-providers/security/encryption.service'))
        .toThrow('Missing required environment variables: AI_CREDENTIAL_ENCRYPTION_KEY');
    } finally {
      // env.js now validates eagerly at require time (see config/env.js),
      // so leaving the key deleted here would break every later test's
      // beforeEach (it requires encryption.service fresh on every run).
      jest.dontMock('dotenv');
      process.env.AI_CREDENTIAL_ENCRYPTION_KEY = '0'.repeat(64);
    }
  });

  test('throws a clear error when AI_CREDENTIAL_ENCRYPTION_KEY is the wrong length', () => {
    jest.resetModules();
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = 'deadbeef'; // 4 bytes, not 32
    expect(() => require('../src/modules/ai-providers/security/encryption.service'))
      .toThrow('AI_CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hex characters');
  });
});
