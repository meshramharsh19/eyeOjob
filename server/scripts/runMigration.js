const pool = require('../src/config/database');

async function migrate() {
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM applications');
    const colNames = cols.map((c) => c.Field);
    console.log('Existing columns in applications:', colNames);

    if (!colNames.includes('source')) {
      console.log('Adding column source...');
      await pool.query("ALTER TABLE applications ADD COLUMN source ENUM('email', 'manual') NOT NULL DEFAULT 'email' AFTER platform");
    }

    if (!colNames.includes('is_locked_by_user')) {
      console.log('Adding column is_locked_by_user...');
      await pool.query('ALTER TABLE applications ADD COLUMN is_locked_by_user TINYINT(1) NOT NULL DEFAULT 0 AFTER verification_status');
    }

    if (!colNames.includes('notes')) {
      console.log('Adding column notes...');
      await pool.query('ALTER TABLE applications ADD COLUMN notes TEXT NULL AFTER is_locked_by_user');
    }

    if (!colNames.includes('deleted_at')) {
      console.log('Adding column deleted_at...');
      await pool.query('ALTER TABLE applications ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at');
    }

    const [indexes] = await pool.query("SHOW INDEX FROM applications WHERE Key_name = 'idx_applications_user_deleted'");
    if (indexes.length === 0) {
      console.log('Adding index idx_applications_user_deleted...');
      await pool.query('CREATE INDEX idx_applications_user_deleted ON applications (user_id, deleted_at)');
    }

    console.log('All migrations applied successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
