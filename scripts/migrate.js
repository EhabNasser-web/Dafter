/**
 * scripts/migrate.js
 * Applies all pending migrations to the database.
 * Can be run standalone (node scripts/migrate.js) or imported by server.js.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readFileSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL is not set – skipping migrations.');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  console.log('⏳  Running migrations…');
  try {
    const migrationsDir = join(__dirname, '../drizzle');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`📄  Applying ${file}…`);
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }

    console.log('✅  Migrations applied successfully.');
  } catch (err) {
    console.error('❌  Migration error:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

// Run standalone if executed directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
