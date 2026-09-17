-- Referenced by pipeline.repository.js (insertApplication / insertTimelineEvent)
-- and matching/applicationMatcher.js since those were written, but never
-- actually added to the schema — same class of bug as add_alias_tables.sql.
-- Every application that reached insertApplication() was throwing
-- "Unknown column 'normalized_company' in 'field list'" and dying after
-- classification/extraction had already succeeded.

ALTER TABLE applications
  ADD COLUMN normalized_company VARCHAR(255) NULL AFTER role,
  ADD COLUMN normalized_role VARCHAR(255) NULL AFTER normalized_company,
  ADD COLUMN job_id VARCHAR(100) NULL AFTER normalized_role,
  ADD COLUMN location VARCHAR(255) NULL AFTER job_id;

ALTER TABLE timeline_events
  ADD COLUMN match_strategy VARCHAR(50) NULL AFTER email_msg_id,
  ADD COLUMN match_confidence DECIMAL(5,2) NULL AFTER match_strategy;
