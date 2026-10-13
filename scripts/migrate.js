/**
 * scripts/migrate.js
 * Applies all pending migrations to the database using Drizzle's push API.
 * Run: node scripts/migrate.js
 *
 * For production use `drizzle-kit push` or generate SQL migrations.
 * Here we use the programmatic push so there's no extra CLI dependency.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : undefined
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
  console.error('❌  Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
