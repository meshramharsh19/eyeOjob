-- AI Correction Feedback Loop (Project DOCs/ai-feedback-loop.md), §3.2.
--
-- company_aliases/role_aliases (add_alias_tables.sql) were global with no
-- user_id, unique on raw_name/raw_title. Auto-writing a user's correction
-- directly into them (the whole point of Consumer 1, §5.1) would let one
-- user's bad edit (typo, wrong company) corrupt matching for every other
-- user on the platform. Scope every alias row to a user, with a safe
-- global fallback.
--
-- user_id = 0 means global/seed (all existing rows backfill to this).
-- user_id > 0 means one user's personal correction.
--
-- Why 0 as a sentinel instead of a nullable user_id: MySQL/InnoDB treats
-- every NULL as distinct under a UNIQUE constraint, so
-- UNIQUE(user_id, raw_name) would NOT prevent duplicate (NULL, 'Google')
-- rows piling up. DEFAULT 0 (a real, comparable value) sidesteps this
-- entirely and keeps the lookup a plain indexed equality/IN query.
ALTER TABLE company_aliases
  ADD COLUMN user_id INT NOT NULL DEFAULT 0 AFTER id,
  DROP INDEX uq_company_raw_name,
  ADD UNIQUE KEY uq_company_user_raw (user_id, raw_name),
  ADD INDEX idx_company_lookup (raw_name, user_id);

ALTER TABLE role_aliases
  ADD COLUMN user_id INT NOT NULL DEFAULT 0 AFTER id,
  DROP INDEX uq_role_raw_title,
  ADD UNIQUE KEY uq_role_user_raw (user_id, raw_title),
  ADD INDEX idx_role_lookup (raw_title, user_id);
