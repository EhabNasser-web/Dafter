/**
 * scripts/check-foundation.js
 * Smoke-test for Step 1.1 – imports all modules and prints a pass/fail table.
 * Does NOT need a real database connection.
 *
 * Usage: node --env-file=.env scripts/check-foundation.js
 */

import { plans, getPlan } from '../config/plans.js';
import { requireAuth, requireAdmin } from '../src/core/auth.js';
import * as schema from '../src/db/schema.js';

const results = [];

function check(label, fn) {
  try {
    fn();
    results.push({ label, ok: true });
  } catch (err) {
    results.push({ label, ok: false, err: err.message });
  }
}

// ─── config/plans.js ─────────────────────────────────────────────────────────
check('plans.free exists', () => { if (!plans.free) throw new Error('missing'); });
check('plans.pro exists',  () => { if (!plans.pro)  throw new Error('missing'); });
check('free has model',    () => { if (!plans.free.model) throw new Error('missing model'); });
check('getPlan("pro")',    () => { const p = getPlan('pro'); if (p.model !== plans.pro.model) throw new Error('mismatch'); });
check('getPlan("bogus") defaults to free', () => {
  const p = getPlan('bogus');
  if (p !== plans.free) throw new Error('should default to free');
});

// ─── src/core/auth.js ────────────────────────────────────────────────────────
check('requireAuth is a function',  () => { if (typeof requireAuth  !== 'function') throw new Error(); });
check('requireAdmin is a function', () => { if (typeof requireAdmin !== 'function') throw new Error(); });

check('requireAuth blocks no-session', () => {
  let status;
  const req = { session: {} };
  const res = { status: (s) => { status = s; return { json: () => {} }; } };
  requireAuth(req, res, () => { throw new Error('should not reach next'); });
  if (status !== 401) throw new Error(`expected 401, got ${status}`);
});

check('requireAdmin blocks non-admin', () => {
  let status;
  const req = { session: { userId: 'x', role: 'user' } };
  const res = { status: (s) => { status = s; return { json: () => {} }; } };
  requireAdmin(req, res, () => { throw new Error('should not reach next'); });
  if (status !== 403) throw new Error(`expected 403, got ${status}`);
});

check('requireAdmin passes admin', () => {
  let called = false;
  const req = { session: { userId: 'x', role: 'admin' } };
  const res = {};
  requireAdmin(req, res, () => { called = true; });
  if (!called) throw new Error('next() was not called');
});

// ─── src/db/schema.js ────────────────────────────────────────────────────────
check('schema.users exists',        () => { if (!schema.users)         throw new Error(); });
check('schema.conversations exists',() => { if (!schema.conversations) throw new Error(); });
check('schema.messages exists',     () => { if (!schema.messages)      throw new Error(); });

// ─── Print results ────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;

console.log('\n┌─────────────────────────────────────────────────────┐');
console.log('│          Daftar – Step 1.1 Foundation Check         │');
console.log('├─────────────────────────────────────────────────────┤');
for (const r of results) {
  const icon = r.ok ? '✅' : '❌';
  const label = r.label.padEnd(45);
  console.log(`│ ${icon} ${label} │`);
  if (!r.ok) console.log(`│    ↳ ${r.err ?? 'failed'}`);
}
console.log('├─────────────────────────────────────────────────────┤');
console.log(`│  Passed: ${passed}/${results.length}   Failed: ${failed}${' '.repeat(32)}│`);
console.log('└─────────────────────────────────────────────────────┘\n');

process.exit(failed > 0 ? 1 : 0);
