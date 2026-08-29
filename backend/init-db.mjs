/**
 * Apply schema.sql without psql. Safe to run on every Render deploy:
 * existing tables are left alone.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './src/db.js';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
const sql = readFileSync(schemaPath, 'utf8');

async function init() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }
  await pool.query(sql);
  console.log('Schema ready.');
}

init()
  .catch((error) => {
    console.error('Schema setup failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
