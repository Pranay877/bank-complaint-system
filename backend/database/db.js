// PostgreSQL connection for Supabase.
// Set DATABASE_URL in the hosting provider's environment variables.
// Never put the database URL in frontend JavaScript.
const { Pool, types } = require('pg');

// Return date/time values as strings, which the existing frontend expects.
types.setTypeParser(1082, value => value); // DATE
types.setTypeParser(1114, value => value); // TIMESTAMP
types.setTypeParser(1184, value => value); // TIMESTAMPTZ

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// A small compatibility wrapper lets most existing routes keep using
// the familiar [rows] return shape and ? placeholders from mysql2.
// PostgreSQL itself uses $1, $2, ... placeholders.
function pgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function query(sql, params = []) {
  const result = await pool.query(pgSql(sql), params);
  return [result.rows];
}

async function getConnection() {
  const client = await pool.connect();

  return {
    async query(sql, params = []) {
      const result = await client.query(pgSql(sql), params);
      return [result.rows];
    },
    async beginTransaction() {
      await client.query('BEGIN');
    },
    async commit() {
      await client.query('COMMIT');
    },
    async rollback() {
      await client.query('ROLLBACK');
    },
    release() {
      client.release();
    }
  };
}

module.exports = { query, getConnection };
