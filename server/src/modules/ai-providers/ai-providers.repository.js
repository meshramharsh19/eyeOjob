const db = require('../../config/database');

// ── user_ai_providers (personal BYOK fallback chain) ────────────────────

const listForUser = async (userId) => {
  const [rows] = await db.query(
    `SELECT id, provider, model, priority, status, last_validated_at, last_used_at,
            last_error_code, last_error_message, created_at, updated_at
     FROM user_ai_providers
     WHERE user_id = ?
     ORDER BY priority ASC`,
    [userId]
  );
  return rows;
};

// Only CONNECTED rows participate in the live fallback chain — INVALID/
// QUOTA_EXCEEDED/etc rows stay visible in listForUser() for the settings UI
// but are skipped here. Includes encrypted_credential — this function is
// only ever called from ai-providers.gateway.js, immediately before
// decrypting in-memory for a provider call; it must never be used to build
// an HTTP response (use listForUser for that).
const getConnectedProviders = async (userId) => {
  const [rows] = await db.query(
    `SELECT id, provider, model, priority, encrypted_credential
     FROM user_ai_providers
     WHERE user_id = ? AND status = 'CONNECTED'
     ORDER BY priority ASC`,
    [userId]
  );
  return rows;
};

const getById = async (id, userId) => {
  const [rows] = await db.query(
    `SELECT id, user_id, provider, encrypted_credential, model, priority, status
     FROM user_ai_providers WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  return rows[0] || null;
};

const getNextPriority = async (userId) => {
  const [rows] = await db.query(
    'SELECT COALESCE(MAX(priority), -1) + 1 AS nextPriority FROM user_ai_providers WHERE user_id = ?',
    [userId]
  );
  return rows[0].nextPriority;
};

// Upsert on (user_id, provider) — reconnecting the same provider (e.g. after
// rotating a key) replaces the credential/model but keeps its existing
// priority slot rather than moving it to the back of the chain.
const upsertConnected = async ({ userId, provider, encryptedCredential, model, priority }) => {
  await db.query(
    `INSERT INTO user_ai_providers
       (user_id, provider, encrypted_credential, model, priority, status, last_validated_at, last_error_code, last_error_message)
     VALUES (?, ?, ?, ?, ?, 'CONNECTED', NOW(), NULL, NULL)
     ON DUPLICATE KEY UPDATE
       encrypted_credential = VALUES(encrypted_credential),
       model = VALUES(model),
       status = 'CONNECTED',
       last_validated_at = NOW(),
       last_error_code = NULL,
       last_error_message = NULL`,
    [userId, provider, encryptedCredential, model, priority]
  );
  const [rows] = await db.query(
    `SELECT id, provider, model, priority, status FROM user_ai_providers WHERE user_id = ? AND provider = ?`,
    [userId, provider]
  );
  return rows[0];
};

const updateModel = async (id, userId, model) => {
  const [result] = await db.query(
    'UPDATE user_ai_providers SET model = ? WHERE id = ? AND user_id = ?',
    [model, id, userId]
  );
  return result.affectedRows > 0;
};

const markValidated = async (id) => {
  await db.query(
    `UPDATE user_ai_providers
     SET status = 'CONNECTED', last_validated_at = NOW(), last_error_code = NULL, last_error_message = NULL
     WHERE id = ?`,
    [id]
  );
};

const markUsed = async (id) => {
  await db.query('UPDATE user_ai_providers SET last_used_at = NOW() WHERE id = ?', [id]);
};

const markFailed = async (id, status, errorCode, errorMessage) => {
  await db.query(
    'UPDATE user_ai_providers SET status = ?, last_error_code = ?, last_error_message = ? WHERE id = ?',
    [status, errorCode, errorMessage?.slice(0, 255) || null, id]
  );
};

const remove = async (id, userId) => {
  const [result] = await db.query(
    'DELETE FROM user_ai_providers WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.affectedRows > 0;
};

// Bulk reorder in a single statement — avoids the duplicate-rank races a
// one-by-one PATCH loop would create. providerIds is ordered
// highest-priority-first (index 0 -> priority 0).
const reorder = async (userId, providerIds) => {
  if (providerIds.length === 0) return;
  const cases = providerIds.map((id, index) => `WHEN ${db.escape(id)} THEN ${index}`).join(' ');
  const placeholders = providerIds.map(() => '?').join(',');
  await db.query(
    `UPDATE user_ai_providers
     SET priority = CASE id ${cases} END
     WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...providerIds]
  );
};

// ── subscriptions (managed-AI seam, no billing flow yet) ────────────────

const getSubscription = async (userId) => {
  const [rows] = await db.query(
    'SELECT user_id, plan, has_managed_ai, monthly_call_cap FROM subscriptions WHERE user_id = ?',
    [userId]
  );
  if (rows[0]) return rows[0];
  // No row yet (user created before the BYOK migration's backfill, or the
  // backfill was skipped) — default them onto the free plan on read rather
  // than failing resolveChain().
  await db.query(
    'INSERT IGNORE INTO subscriptions (user_id, plan, has_managed_ai) VALUES (?, \'free\', 0)',
    [userId]
  );
  return { user_id: userId, plan: 'free', has_managed_ai: 0, monthly_call_cap: null };
};

// ── user_ai_monthly_usage (free-tier quota) ──────────────────────────────

const getOrCreateMonthlyUsage = async (userId, yearMonth) => {
  await db.query(
    `INSERT INTO user_ai_monthly_usage (user_id, period_month, calls_used)
     VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId, yearMonth]
  );
  const [rows] = await db.query(
    'SELECT calls_used, quota_notified FROM user_ai_monthly_usage WHERE user_id = ? AND period_month = ?',
    [userId, yearMonth]
  );
  return rows[0];
};

// Atomic per-call increment — see Section 5.4, Project DOCs/BYOK.md. Checked
// and incremented per AI call, not once per sync, so a user with N calls
// remaining can't overrun the cap by an entire sync's worth of emails.
const incrementMonthlyUsage = async (userId, yearMonth) => {
  await db.query(
    `INSERT INTO user_ai_monthly_usage (user_id, period_month, calls_used)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE calls_used = calls_used + 1`,
    [userId, yearMonth]
  );
};

const markQuotaNotified = async (userId, yearMonth) => {
  await db.query(
    'UPDATE user_ai_monthly_usage SET quota_notified = 1 WHERE user_id = ? AND period_month = ?',
    [userId, yearMonth]
  );
};

// ── ai_usage_logs (per-call telemetry) ───────────────────────────────────

const logUsage = async ({
  userId, provider, model, source, operation = 'email_extraction',
  latencyMs, success, errorCategory = null,
  promptTokens = null, completionTokens = null, totalTokens = null,
}) => {
  await db.query(
    `INSERT INTO ai_usage_logs
       (user_id, provider, model, source, operation, latency_ms, success,
        error_category, prompt_tokens, completion_tokens, total_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, provider, model, source, operation, latencyMs, success ? 1 : 0,
      errorCategory, promptTokens, completionTokens, totalTokens]
  );
};

const getUsageSummary = async (userId, days) => {
  const [rows] = await db.query(
    `SELECT provider, source,
            COUNT(*) AS total,
            SUM(success) AS successCount
     FROM ai_usage_logs
     WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY provider, source`,
    [userId, days]
  );
  return rows;
};

module.exports = {
  listForUser,
  getConnectedProviders,
  getById,
  getNextPriority,
  upsertConnected,
  updateModel,
  markValidated,
  markUsed,
  markFailed,
  remove,
  reorder,
  getSubscription,
  getOrCreateMonthlyUsage,
  incrementMonthlyUsage,
  markQuotaNotified,
  logUsage,
  getUsageSummary,
};
