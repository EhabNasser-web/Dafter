/**
 * src/core/scheduler.js
 * Daily check-in scheduler and background job runner.
 * Gathers check-in prompts from enabled modules and delivers proactive
 * Web Push notifications in Egyptian Arabic.
 */

import cron from 'node-cron';
import { db } from '../db/index.js';
import { users, conversations, messages } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getRegistry } from './moduleLoader.js';
import { sendPushToUser } from '../providers/push/index.js';
import plans from '../../config/plans.js';

/**
 * Gets or creates the latest conversation for a user.
 */
async function getOrCreateConversation(userId) {
  const [existing] = await db.select()
    .from(conversations)
    .where(eq(conversations.user_id, userId))
    .orderBy(desc(conversations.updated_at))
    .limit(1);

  if (existing) return existing;

  const [created] = await db.insert(conversations)
    .values({ user_id: userId, title: 'دفتر يومي' })
    .returning();
  return created;
}

/**
 * Formulates a friendly Egyptian Arabic daily check-in message based on module prompts.
 *
 * @param {string} userId
 * @param {string} planName
 * @returns {Promise<string>}
 */
export async function buildCheckinMessage(userId, planName) {
  const plan = plans[planName] ?? plans.free;
  const enabledModules = new Set(plan.enabled_modules ?? []);
  const registry = getRegistry();

  const prompts = [];
  for (const [name, mod] of registry.entries()) {
    if (enabledModules.has(name) && typeof mod.checkin === 'function') {
      try {
        const text = await mod.checkin(userId);
        if (text) prompts.push({ module: name, text });
      } catch (err) {
        console.error(`[scheduler] Error in module checkin (${name}):`, err.message);
      }
    }
  }

  if (prompts.length === 0) {
    return 'مساء الخير يا بطل! كل حاجة متسجلة تمام النهارده وما عندكش مهام متأخرة. حابب تفضفض أو تسجل أي حاجة قبل ما تنام؟';
  }

  // If there's an overdue task prompt, prioritize it
  const taskPrompt = prompts.find(p => p.module === 'tasks');
  const expensePrompt = prompts.find(p => p.module === 'expenses');
  const diaryPrompt = prompts.find(p => p.module === 'diary');

  if (taskPrompt && expensePrompt) {
    return `مساء الخير! عندك مهام محتاجة تتقفل، وكمان مسجلتش أي مصاريف النهارده. تحب نظبط الدفتر سوا؟`;
  }

  if (expensePrompt) {
    return expensePrompt.text;
  }

  if (taskPrompt) {
    return taskPrompt.text;
  }

  if (diaryPrompt) {
    return diaryPrompt.text;
  }

  return prompts[0].text;
}

/**
 * Executes the daily check-in for a single user:
 * 1. Generates check-in text.
 * 2. Saves as an assistant message in user conversation so it appears in chat.
 * 3. Dispatches Web Push notification to user devices.
 *
 * @param {string} userId
 * @param {string} planName
 * @returns {Promise<{ ok: boolean, message: string, pushResult: { sent: number, total: number } }>}
 */
export async function runCheckinForUser(userId, planName) {
  const checkinText = await buildCheckinMessage(userId, planName);

  // Save into active conversation
  try {
    const conv = await getOrCreateConversation(userId);
    await db.insert(messages).values({
      conversation_id: conv.id,
      user_id:         userId,
      role:            'assistant',
      content:         checkinText,
    });
    await db.update(conversations)
      .set({ updated_at: new Date() })
      .where(eq(conversations.id, conv.id));
  } catch (convErr) {
    console.error('[scheduler] Failed to save check-in message to DB:', convErr.message);
  }

  // Send push notification
  const pushResult = await sendPushToUser(userId, {
    title: 'دفتر · تشيك إن المسا 📝',
    body:  checkinText,
    icon:  '/brand/icon-192.png',
    badge: '/brand/icon-192.png',
    url:   '/#chat',
  });

  return { ok: true, message: checkinText, pushResult };
}

/**
 * Runs the check-in job for all eligible active users.
 *
 * @param {{ forceUserId?: string, forcePlan?: boolean }} opts
 */
export async function runDailyCheckin({ forceUserId = null, forcePlan = false } = {}) {
  console.log(`[scheduler] 🕒 Starting daily check-in runner at ${new Date().toISOString()}…`);

  try {
    let targetUsers = [];
    if (forceUserId) {
      targetUsers = await db.select().from(users).where(eq(users.id, forceUserId)).limit(1);
    } else {
      targetUsers = await db.select().from(users).where(eq(users.status, 'active'));
    }

    let processed = 0;
    for (const u of targetUsers) {
      const plan = plans[u.plan] ?? plans.free;

      // Respect plan tier: proactive features only enabled for pro (or when forced in test)
      if (!forcePlan && !plan.proactive_features) {
        console.log(`[scheduler] Skipping user ${u.email} (plan: ${u.plan} – proactive_features disabled)`);
        continue;
      }

      console.log(`[scheduler] Running check-in for ${u.email}…`);
      const result = await runCheckinForUser(u.id, u.plan);
      console.log(`[scheduler] Check-in sent to ${u.email}: sent=${result.pushResult.sent}/${result.pushResult.total} devices`);
      processed++;
    }

    console.log(`[scheduler] ✅ Daily check-in complete. Processed ${processed} users.`);
    return { ok: true, processed };
  } catch (err) {
    console.error('[scheduler] ❌ Daily check-in runner failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Initializes cron jobs for Daftar.
 */
export function startScheduler() {
  const cronExpr = process.env.CHECKIN_CRON || '0 21 * * *'; // 9:00 PM every night
  const timezone = process.env.TIMEZONE || 'Africa/Cairo';

  console.log(`[scheduler] ⏰ Scheduling daily check-in: "${cronExpr}" [tz: ${timezone}]`);

  cron.schedule(cronExpr, () => {
    runDailyCheckin();
  }, {
    timezone,
  });
}
