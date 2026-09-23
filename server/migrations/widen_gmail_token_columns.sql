-- Gmail access/refresh tokens are now stored AES-256-GCM encrypted
-- (iv:ciphertext:tag, hex-encoded) instead of plaintext — see
-- server/src/utils/crypto.util.js. The encrypted form is roughly 2-3x the
-- length of the raw token, which can exceed a VARCHAR(255) column. Widen
-- both columns to TEXT so encryption never risks silent truncation.
ALTER TABLE users
  MODIFY COLUMN gmail_token TEXT NULL,
  MODIFY COLUMN refresh_token TEXT NULL;
