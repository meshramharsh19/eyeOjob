ALTER TABLE processed_emails
  ADD COLUMN plain_text MEDIUMTEXT NULL AFTER raw_snippet,
  ADD COLUMN raw_html MEDIUMTEXT NULL AFTER plain_text;
