import pg from 'pg';

const { Pool, types } = pg;

// Return NUMERIC as JS numbers. Shop-scale money stays well inside float precision.
types.setTypeParser(types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // A failed rollback should not mask the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}
