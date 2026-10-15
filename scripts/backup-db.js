/**
 * scripts/backup-db.js
 * Creates an ENCRYPTED (AES-256-GCM) JSON snapshot of all application tables.
 * Output is saved in the /backups directory (which is git-ignored).
 * Password hashes are excluded from backups by default.
 *
 *   BACKUP_PASSPHRASE=a-strong-secret  – required (never commit it)
 *
 * Usage:
 *   npm run backup-db              – encrypted backup (.json.enc)
 *   node scripts/backup-db.js --decrypt backups/<file>.json.enc
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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
  'usage',
  'jobs',
];

/** Columns never written to backups (auth secrets). */
const EXCLUDED = { users: new Set(['password_hash', 'reset_token']) };

function getKey() {
  const pass = process.env.BACKUP_PASSPHRASE;
  if (!pass) {
    console.error('❌ BACKUP_PASSPHRASE is not set. Refusing to write an unencrypted backup.');
    process.exit(1);
  }
  return crypto.scryptSync(pass, 'daftar-backup-v1', 32);
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') });
}

function decrypt(payload) {
  const key = getKey();
  const { iv, tag, data } = JSON.parse(payload);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

async function backup() {
  console.log('📦 Starting encrypted database backup…');
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
      const hidden = EXCLUDED[table];
      dump.tables[table] = hidden
        ? res.rows.map((r) => { const c = { ...r }; for (const k of hidden) delete c[k]; return c; })
        : res.rows;
      console.log(`  ✓ Exported ${res.rows.length} rows from "${table}"`);
    }

    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json.enc`;
    writeFileSync(join(backupDir, filename), encrypt(JSON.stringify(dump)), 'utf8');
    console.log(`\n✅ Encrypted backup saved to: backups/${filename}`);
    console.log('   (auth secrets excluded; file is AES-256-GCM encrypted)');
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function decryptFile(target) {
  const payload = readFileSync(target, 'utf8');
  const out = join(__dirname, '../backups', basename(target).replace(/\.enc$/, ''));
  writeFileSync(out, decrypt(payload), 'utf8');
  console.log(`✅ Decrypted to: backups/${basename(out)}`);
  await pool.end();
}

if (process.argv.includes('--decrypt')) {
  const target = process.argv[process.argv.indexOf('--decrypt') + 1];
  if (!target) {
    console.error('Usage: node scripts/backup-db.js --decrypt backups/<file>.json.enc');
    process.exit(1);
  }
  decryptFile(target);
} else {
  backup();
}
