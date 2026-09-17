-- Migration: Add manual CRUD support, lock state, notes, and soft-delete columns to applications table

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS source ENUM('email', 'manual') NOT NULL DEFAULT 'email' AFTER platform,
  ADD COLUMN IF NOT EXISTS is_locked_by_user TINYINT(1) NOT NULL DEFAULT 0 AFTER verification_status,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER is_locked_by_user,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

-- Create composite index for efficient user-scoped queries ignoring deleted rows
SET @exist := (SELECT COUNT(*) FROM information_schema.statistics 
               WHERE table_schema = DATABASE() 
                 AND table_name = 'applications' 
                 AND index_name = 'idx_applications_user_deleted');
SET @sqlstmt := IF(@exist > 0, 'SELECT "Index already exists"', 
                   'CREATE INDEX idx_applications_user_deleted ON applications (user_id, deleted_at)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
