// Re-exports the shared AES-256-GCM crypto util — kept as a separate file so
// existing imports (`./security/encryption.service`) don't need to change.
// Also used outside ai-providers (e.g. Gmail OAuth token storage) via
// '../../../utils/crypto.util' directly.
module.exports = require('../../../utils/crypto.util');
