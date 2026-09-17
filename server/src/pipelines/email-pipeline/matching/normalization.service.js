const db = require('../../../config/database');

// ──────────────────────────────────────────────────
// NORMALIZATION
// Raw company/role strings from emails are inconsistent ("Amazon India" vs
// "Amazon Development Centre India Pvt. Ltd."). This resolves them to a
// canonical form via the alias tables, falling back to a best-effort string
// cleanup when no alias exists yet — so matching never operates on raw text.
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

const findCompanyAlias = async (rawName) => {
  try {
    const [rows] = await db.query(
      'SELECT canonical_name FROM company_aliases WHERE raw_name = ? LIMIT 1',
      [rawName]
    );
    return rows[0]?.canonical_name || null;
  } catch (err) {
    logger.error('[normalization.service] company_aliases lookup failed, falling back to raw cleanup:', err.message);
    return null;
  }
};

const findRoleAlias = async (rawTitle) => {
  try {
    const [rows] = await db.query(
      'SELECT canonical_title FROM role_aliases WHERE raw_title = ? LIMIT 1',
      [rawTitle]
    );
    return rows[0]?.canonical_title || null;
  } catch (err) {
    logger.error('[normalization.service] role_aliases lookup failed, falling back to raw cleanup:', err.message);
    return null;
  }
};

const normalizeCompany = async (rawCompany) => {
  if (!rawCompany) return null;

  const trimmed = rawCompany.trim();
  const aliased = await findCompanyAlias(trimmed);
  if (aliased) return aliased;

  return basicCleanup(trimmed);
};

const normalizeRole = async (rawRole) => {
  if (!rawRole) return null;

  const trimmed = rawRole.trim();
  const aliased = await findRoleAlias(trimmed);
  if (aliased) return aliased;

  return basicCleanup(trimmed);
};

module.exports = { normalizeCompany, normalizeRole };
