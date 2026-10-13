/**
 * src/db/index.js
 * Creates a single shared Postgres connection pool and exports the Drizzle client.
 * Import `db` everywhere you need to query the database.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  console.error(
    '[db] DATABASE_URL is not set – server will start in degraded mode (health check stays up, DB routes will fail until the variable is set).'
  );
}

const databaseUrl = process.env.DATABASE_URL || '';
const isRemoteDb = databaseUrl.includes('supabase') || (databaseUrl && !databaseUrl.includes('localhost'));

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
      // Keep connections alive; important for Railway's long-running dyno
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  : null;

// Log pool errors so they surface instead of silently crashing
if (pool) {
  pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err.message);
  });
}

/**
 * When DATABASE_URL is missing the server still boots (so /health answers
 * and Railway does not report CRASHED). Any actual DB access throws a clear
 * request-time error instead of crashing the process at import time.
 */
function createMissingDbProxy() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        throw new Error(
          'DATABASE_URL is not set. Set it in .env (local) or Railway Variables (production).'
        );
      },
    }
  );
}

export const db = pool ? drizzle(pool, { schema }) : createMissingDbProxy();

/** Raw pg pool – use only for migrations or transactions that need it directly */
export { pool };
