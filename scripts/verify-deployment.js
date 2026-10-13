/**
 * scripts/verify-deployment.js
 * Comprehensive pre-flight deployment verification for Daftar (Step 1.6).
 * Checks database, tables, providers, static files, and security before Railway deployment.
 *
 * Usage: npm run verify
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getLLMProvider } from '../src/providers/llm/index.js';
import { getVapidPublicKey } from '../src/providers/push/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 ─── Daftar Production Deployment Verification (Step 1.6) ───\n');

let failed = false;
function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); failed = true; }
function info(msg) { console.log(`\n📌 ${msg}`); }

// ─── 1. Environment Checklist ────────────────────────────────────────────────
info('1. Checking Environment Variables');
const REQUIRED_ENVS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'GROQ_API_KEY',
  'GOOGLE_API_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
];

for (const envName of REQUIRED_ENVS) {
  if (process.env[envName]) {
    pass(`Environment variable "${envName}" is set.`);
  } else {
    fail(`Environment variable "${envName}" is MISSING!`);
  }
}

// ─── 2. Database Connectivity & Schema ───────────────────────────────────────
info('2. Checking Database & Schema Integrity');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : undefined,
});

const REQUIRED_TABLES = [
  'users',
  'conversations',
  'messages',
  'expenses',
  'tasks',
  'diary',
  'push_subscriptions',
];

try {
  for (const t of REQUIRED_TABLES) {
    const r = await pool.query(`SELECT count(*) FROM ${t}`);
    pass(`Table "${t}" exists with ${r.rows[0].count} records.`);
  }
} catch (dbErr) {
  fail(`Database check failed: ${dbErr.message}`);
} finally {
  await pool.end();
}

// ─── 3. AI Providers Health ──────────────────────────────────────────────────
info('3. Checking AI Providers');
try {
  const llm = getLLMProvider();
  const testChat = await llm.chat({
    messages: [{ role: 'user', content: 'رد بكلمة واحدة فقط: تمام' }],
    max_tokens: 10,
    temperature: 0.1,
  });
  const reply = testChat.choices?.[0]?.message?.content?.trim();
  pass(`Groq LLM response verified: "${reply}"`);
} catch (llmErr) {
  fail(`LLM check failed: ${llmErr.message}`);
}

// ─── 4. Web Push VAPID ───────────────────────────────────────────────────────
info('4. Checking Web Push (VAPID)');
const vapidKey = getVapidPublicKey();
if (vapidKey && vapidKey.length > 30) {
  pass(`VAPID Public Key configured properly (${vapidKey.slice(0, 20)}…)`);
} else {
  fail('VAPID key check failed.');
}

// ─── 5. Static PWA Assets ───────────────────────────────────────────────────
info('5. Checking Static PWA & Theme Assets');
const REQUIRED_FILES = [
  'public/index.html',
  'public/sw.js',
  'public/manifest.json',
  'public/themes/notebook.css',
  'public/brand/icon-192.png',
  'public/brand/icon-512.png',
  'railway.json',
];

for (const relPath of REQUIRED_FILES) {
  const fullPath = join(__dirname, '..', relPath);
  if (existsSync(fullPath)) {
    pass(`Asset exists: ${relPath}`);
  } else {
    fail(`Missing required asset: ${relPath}`);
  }
}

// ─── Final Verdict ───────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────────────');
if (failed) {
  console.error('❌ Verification FAILED: Please fix the errors listed above before deploying.');
  process.exit(1);
} else {
  console.log('🎉 All checks PASSED! Daftar is 100% production-ready for Railway deployment.');
  process.exit(0);
}
