/**
 * scripts/test-push.js
 * Verification script for Step 1.5:
 * - Tests VAPID config
 * - Tests push_subscriptions table in DB
 * - Tests buildCheckinMessage logic from modules
 * - Tests scheduler job execution
 */

import 'dotenv/config';
import { db } from '../src/db/index.js';
import { users, pushSubscriptions } from '../src/db/schema.js';
import { getVapidPublicKey, sendNotification } from '../src/providers/push/index.js';
import { buildCheckinMessage, runCheckinForUser } from '../src/core/scheduler.js';
import { loadModules } from '../src/core/moduleLoader.js';
import express from 'express';

console.log('🧪 ─── Starting Step 1.5 Push & Check-In Verification ───\n');

// 1. Verify VAPID Key
const pubKey = getVapidPublicKey();
if (!pubKey || pubKey.length < 20) {
  console.error('❌ VAPID Public Key missing or invalid!');
  process.exit(1);
}
console.log(`✅ 1. VAPID Public Key loaded (${pubKey.slice(0, 15)}…)`);

// 2. Verify Database table
const subsCount = await db.select().from(pushSubscriptions).limit(1);
console.log('✅ 2. push_subscriptions DB table verified.');

// 3. Load modules to register checkin hooks
const app = express();
await loadModules(app);

// 4. Find or use admin user
const [admin] = await db.select().from(users).limit(1);
if (!admin) {
  console.error('❌ No user found in database.');
  process.exit(1);
}
console.log(`✅ 3. Testing with user: ${admin.email} (id: ${admin.id}, plan: ${admin.plan})`);

// 5. Test Check-In message builder
const checkinMsg = await buildCheckinMessage(admin.id, admin.plan);
console.log('\n📝 4. Generated Check-In Message:');
console.log(`   "${checkinMsg}"\n`);

if (!checkinMsg || typeof checkinMsg !== 'string') {
  console.error('❌ Checkin message failed to generate.');
  process.exit(1);
}
console.log('✅ 5. Check-In generation logic passed.');

// 6. Test runCheckinForUser
const checkinRunResult = await runCheckinForUser(admin.id, admin.plan);
console.log('✅ 6. runCheckinForUser executed successfully:', {
  savedToChat: checkinRunResult.ok,
  pushSent: checkinRunResult.pushResult.sent,
  totalDevices: checkinRunResult.pushResult.total,
});

console.log('\n🎉 ─── Step 1.5 Verification Passed Successfully! ───');
process.exit(0);
