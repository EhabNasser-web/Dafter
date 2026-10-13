/**
 * src/db/index.js
 * Creates a single shared Postgres connection pool and exports the Drizzle client.
 * Import `db` everywhere you need to query the database.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example → .env and fill it in.');
}

const isRemoteDb = process.env.DATABASE_URL.includes('supabase') || !process.env.DATABASE_URL.includes('localhost');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
  // Keep connections alive; important for Railway's long-running dyno
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Log pool errors so they surface instead of silently crashing
pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

export const db = drizzle(pool, { schema });

/** Raw pg pool – use only for migrations or transactions that need it directly */
export { pool };
