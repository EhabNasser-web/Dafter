/**
 * scripts/backup-db.js
 * Creates a JSON snapshot backup of all application tables from Supabase/PostgreSQL.
 * Output is saved in the /backups directory (which is git-ignored).
 *
 * Usage: npm run backup-db
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : undefined,
});

const TABLES = [
  'users',
  'conversations',
  'messages',
  'expenses',
  'tasks',
  'diary',
  'push_subscriptions',
];

async function backup() {
  console.log('📦 Starting database backup…');
  const backupDir = join(__dirname, '../backups');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const dump = {
    exported_at: new Date().toISOString(),
    tables: {},
  };

  try {
    for (const table of TABLES) {
      const res = await pool.query(`SELECT * FROM ${table}`);
      dump.tables[table] = res.rows;
      console.log(`  ✓ Exported ${res.rows.length} rows from "${table}"`);
    }

    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const targetPath = join(backupDir, filename);

    writeFileSync(targetPath, JSON.stringify(dump, null, 2), 'utf8');
    console.log(`\n✅ Backup successfully saved to: backups/${filename}`);
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

backup();
