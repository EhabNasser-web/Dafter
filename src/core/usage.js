/**
 * src/core/usage.js
 * Phase 2.2 – usage accounting + quota enforcement.
 * Kinds: 'message' (units = count), 'voice' (units = seconds), 'tokens' (units = count).
 */

import { db } from '../db/index.js';
import { usage } from '../db/schema.js';
import { eq, and, gte, sum } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getPlan } from '../../config/plans.js';

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const monthStartISO = () => new Date().toISOString().slice(0, 7) + '-01';

/** Add units/cost to today's bucket (upsert with accumulation). Never throws. */
export async function logUsage(userId, kind, units = 0, costEstimate = 0) {
  try {
    await db.insert(usage)
      .values({
        user_id: userId,
        day: todayISO(),
        kind,
        units: String(units),
        cost_estimate: String(costEstimate),
      })
      .onConflictDoUpdate({
        target: [usage.user_id, usage.day, usage.kind],
        set: {
          units: sql`${usage.units} + ${String(units)}`,
          cost_estimate: sql`${usage.cost_estimate} + ${String(costEstimate)}`,
        },
      });
  } catch (err) {
    console.error('[usage] log failed:', err.message);
  }
}

async function sumUnits(userId, kind, sinceDay) {
  const [row] = await db.select({ total: sum(usage.units) })
    .from(usage)
    .where(and(eq(usage.user_id, userId), eq(usage.kind, kind), gte(usage.day, sinceDay)));
  return Number(row?.total ?? 0);
}

async function sumCost(userId, sinceDay) {
  const [row] = await db.select({ total: sum(usage.cost_estimate) })
    .from(usage)
    .where(and(eq(usage.user_id, userId), gte(usage.day, sinceDay)));
  return Number(row?.total ?? 0);
}

/**
 * Check quotas BEFORE an AI call.
 * @param {'message'|'voice'|'image'} what
 * @returns {Promise<{ allowed: boolean, error?: string, remaining?: number }>}
 */
export async function checkQuota(userId, planName, what) {
  const plan = getPlan(planName);
  try {
    if (what === 'message') {
      const used = await sumUnits(userId, 'message', todayISO());
      if (used >= plan.daily_message_limit) {
        return {
          allowed: false,
          error: `وصلت للحد اليومي (${plan.daily_message_limit} رسالة). جرّب بكرة، أو استخدم الإضافة اليدوية من الشاشات.`,
        };
      }
      return { allowed: true, remaining: plan.daily_message_limit - used };
    }
    if (what === 'voice') {
      const used = await sumUnits(userId, 'voice', todayISO());
      if (used >= plan.daily_voice_limit) {
        return {
          allowed: false,
          error: `خلصت التفريغات الصوتية اليوم (${plan.daily_voice_limit} يومياً). اكتب نصًا بدل الصوت لبكرة.`,
        };
      }
      return { allowed: true, remaining: plan.daily_voice_limit - used };
    }
    if (what === 'image') {
      const used = await sumUnits(userId, 'image', todayISO());
      if (used >= plan.daily_image_limit) {
        return {
          allowed: false,
          error: `خلصت قراءات الصور اليوم (${plan.daily_image_limit} يومياً). جرّب بكرة أو اكتب نصًا.`,
        };
      }
      return { allowed: true, remaining: plan.daily_image_limit - used };
    }
  } catch (err) {
    console.error('[usage] quota check failed (fail-open):', err.message);
  }
  return { allowed: true };
}

/** Usage snapshot for the admin panel. */
export async function getUsageSummary(userId) {
  const [messagesToday, voiceToday, voiceMonthSec, costMonth] = await Promise.all([
    sumUnits(userId, 'message', todayISO()),
    sumUnits(userId, 'voice', todayISO()),
    sumUnits(userId, 'voice_seconds', monthStartISO()),
    sumCost(userId, monthStartISO()),
  ]);
  return { messagesToday, voiceToday, voiceMonthSec, costMonthUSD: costMonth };
}
