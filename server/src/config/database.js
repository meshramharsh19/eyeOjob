const mysql = require('mysql2/promise');
const env = require('./env');
const logger = require('./logger');

const pool = mysql.createPool({
  host: env.db.host,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  port: env.db.port,
  waitForConnections: true,
  connectionLimit: 10,
});

pool.getConnection()
  .then((conn) => {
    logger.info('MySQL connected');
    conn.release();
  })
  .catch((err) => {
    logger.error('MySQL connection error:', err.message);
  });

module.exports = pool;
