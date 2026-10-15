/**
 * scripts/seed-plans.js
 * Phase 2.5 – launch hygiene: validates every user's plan/status/theme
 * against config/plans.js and repairs invalid values back to safe defaults.
 * Idempotent – run any time: node --env-file=.env scripts/seed-plans.js
 */

import 'dotenv/config';
import { db, pool } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { plans } from '../config/plans.js';

const VALID_THEMES = ['notebook', 'stickers'];
const VALID_STATUS = ['active', 'pending', 'expired', 'disabled'];

const rows = await db.select().from(users);
console.log(`Checking ${rows.length} user(s) against config/plans.js…`);

let fixed = 0;
for (const u of rows) {
  const updates = {};
  if (!plans[u.plan]) {
    console.log(`  ⚠️ ${u.email}: unknown plan "${u.plan}" → "free"`);
    updates.plan = 'free';
  }
  if (!VALID_STATUS.includes(u.status)) {
    console.log(`  ⚠️ ${u.email}: unknown status "${u.status}" → "pending"`);
    updates.status = 'pending';
  }
  if (!VALID_THEMES.includes(u.theme)) {
    console.log(`  ⚠️ ${u.email}: unknown theme "${u.theme}" → "notebook"`);
    updates.theme = 'notebook';
  }
  // Theme must be allowed by the (possibly repaired) plan
  const planName = updates.plan ?? u.plan;
  if (!plans[planName]?.themes?.includes(u.theme) && VALID_THEMES.includes(u.theme)) {
    console.log(`  ⚠️ ${u.email}: theme "${u.theme}" not allowed on "${planName}" → "notebook"`);
    updates.theme = 'notebook';
  }
  if (Object.keys(updates).length) {
    const { eq } = await import('drizzle-orm');
    await db.update(users).set(updates).where(eq(users.id, u.id));
    fixed++;
  }
}

console.log(fixed === 0 ? '✅ All plans/statuses/themes are valid.' : `✅ Repaired ${fixed} user(s).`);
console.log('Configured plans:', Object.entries(plans).map(([k, p]) =>
  `${k}{msgs:${p.daily_message_limit},voice:${p.daily_voice_limit},themes:${(p.themes || []).join('|')}}`).join(' '));
await pool.end();
