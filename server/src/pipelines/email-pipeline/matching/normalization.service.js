const db = require('../../../config/database');

// ──────────────────────────────────────────────────
// NORMALIZATION
// Raw company/role strings from emails are inconsistent ("Amazon India" vs
// "Amazon Development Centre India Pvt. Ltd."). This resolves them to a
// canonical form via the alias tables, falling back to a best-effort string
// cleanup when no alias exists yet — so matching never operates on raw text.
//
// Multi-tenant lookup (AI Correction Feedback Loop, Project DOCs/
// ai-feedback-loop.md §3.2): every alias row belongs to a user_id, with 0
// reserved for the global/seed set. A user-specific correction always wins
// over the global fallback for that same user, and is completely invisible
// to every other user — one user's bad edit can never corrupt another
// user's matching. userId is required on every call now (0 is not a
// meaningful "current user", only ever a stored row's fallback value), so
// every caller must know whose alias lookup this is.
// ──────────────────────────────────────────────────

const LEGAL_SUFFIXES = [
  'private limited', 'pvt ltd', 'pvt. ltd.', 'pvt. ltd', 'pvt ltd.',
  'llp', 'inc.', 'inc', 'ltd.', 'ltd', 'limited', 'corporation', 'corp.', 'corp',
  'technologies', 'technology', 'solutions', 'software', 'services',
];

const basicCleanup = (raw) => {
  let value = raw.toLowerCase().trim();
  value = value.replace(/[.,]/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();

  for (const suffix of LEGAL_SUFFIXES) {
    const pattern = new RegExp(`\\b${suffix.replace(/\./g, '\\.')}\\b`, 'g');
    value = value.replace(pattern, ' ');
  }

  return value.replace(/\s+/g, ' ').trim();
};

// Missing-table errors here were previously fatal to the whole application-
// creation step: normalizeCompany() threw, the exception propagated all the
// way up through processEmail, and the email got recorded as "processed"
// (classification already written earlier in the flow) with no application
// ever created — permanently unrecoverable, since the sync's idempotency
// check skips anything already in processed_emails. A schema/table problem
// should degrade to the no-alias-found path, not silently eat real
// applications. (The tables themselves are created by
// migrations/add_alias_tables.sql — this catch is a safety net for whatever
// the next version of this class of bug looks like, not a substitute for
// running migrations.)
const logger = require('../../../config/logger');

// user_id IN (?, 0) ORDER BY user_id DESC: the caller's own row (user_id > 0)
// sorts before the global seed row (user_id = 0) when both exist, so a
// personal correction always wins without needing a second query/CASE.
const findCompanyAlias = async (userId, rawName) => {
  try {
    const [rows] = await db.query(
      'SELECT canonical_name FROM company_aliases WHERE user_id IN (?, 0) AND raw_name = ? ORDER BY user_id DESC LIMIT 1',
      [userId, rawName]
    );
    return rows[0]?.canonical_name || null;
  } catch (err) {
    logger.error('[normalization.service] company_aliases lookup failed, falling back to raw cleanup:', err.message);
    return null;
  }
};

const findRoleAlias = async (userId, rawTitle) => {
  try {
    const [rows] = await db.query(
      'SELECT canonical_title FROM role_aliases WHERE user_id IN (?, 0) AND raw_title = ? ORDER BY user_id DESC LIMIT 1',
      [userId, rawTitle]
    );
    return rows[0]?.canonical_title || null;
  } catch (err) {
    logger.error('[normalization.service] role_aliases lookup failed, falling back to raw cleanup:', err.message);
    return null;
  }
};

const normalizeCompany = async (userId, rawCompany) => {
  if (!rawCompany) return null;

  const trimmed = rawCompany.trim();
  const aliased = await findCompanyAlias(userId, trimmed);
  if (aliased) return aliased;

  return basicCleanup(trimmed);
};

const normalizeRole = async (userId, rawRole) => {
  if (!rawRole) return null;

  const trimmed = rawRole.trim();
  const aliased = await findRoleAlias(userId, trimmed);
  if (aliased) return aliased;

  return basicCleanup(trimmed);
};

// Consumer 1 (ai-feedback-loop.md §5.1) — personal alias auto-write. Called
// from applications.service.js the moment a user corrects a company/role
// value that came from the AI. Always writes at the correcting user's own
// user_id (never 0/global — promoting to global is a deliberate later/
// manual step, §3.2), so future emails for THIS user normalize correctly
// immediately, with zero risk to any other user's matching.
const upsertCompanyAlias = async (userId, rawName, canonicalName) => {
  if (!rawName || !canonicalName) return;
  await db.query(
    `INSERT INTO company_aliases (user_id, raw_name, canonical_name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE canonical_name = VALUES(canonical_name)`,
    [userId, rawName, canonicalName]
  );
};

const upsertRoleAlias = async (userId, rawTitle, canonicalTitle) => {
  if (!rawTitle || !canonicalTitle) return;
  await db.query(
    `INSERT INTO role_aliases (user_id, raw_title, canonical_title)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE canonical_title = VALUES(canonical_title)`,
    [userId, rawTitle, canonicalTitle]
  );
};

module.exports = { normalizeCompany, normalizeRole, upsertCompanyAlias, upsertRoleAlias };
