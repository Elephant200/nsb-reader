import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.POSTGRES_URL;

export const pool = connectionString
  ? new Pool({
    connectionString,
    ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false }
  })
  : null;

export async function query (text, values = []) {
  if (!pool) {
    throw new Error('Missing DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL for Supabase Postgres');
  }

  return await pool.query(text, values);
}

export async function close () {
  if (pool) {
    await pool.end();
  }
}
