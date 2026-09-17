-- Referenced by matching/normalization.service.js (findCompanyAlias / findRoleAlias)
-- since that file was written, but never actually created — every application that
-- reached normalizeCompany() was throwing "Table 'company_aliases' doesn't exist" and
-- silently dying before an application row was ever inserted. Empty tables are enough
-- to stop the crash; rows can be added over time as needs_review corrections come in.

CREATE TABLE IF NOT EXISTS company_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raw_name VARCHAR(255) NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_raw_name (raw_name)
);

CREATE TABLE IF NOT EXISTS role_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raw_title VARCHAR(255) NOT NULL,
  canonical_title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_raw_title (raw_title)
);
