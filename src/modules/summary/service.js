/**
 * src/modules/summary/service.js
 * Phase 2.3 – weekly summary computation + delivery.
 * Pure queries + Arabic formatting; delivery via push + chat message.
 */

import { db } from '../../db/index.js';
import { expenses, tasks, diary, conversations, messages, users } from '../../db/schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getPlan } from '../../../config/plans.js';
import { sendPushToUser } from '../../providers/push/index.js';

const weekAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

async function getOrCreateConversation(userId) {
  const { desc } = await import('drizzle-orm');
  const [existing] = await db.select().from(conversations)
    .where(eq(conversations.user_id, userId))
    .orderBy(desc(conversations.updated_at)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(conversations)
    .values({ user_id: userId, title: 'دفتر يومي' }).returning();
  return created;
}

/** Compute the week's stats for a user. */
export async function computeWeeklySummary(userId) {
  const since = weekAgo();

  const expRows = await db.select({
    type: expenses.type,
    category: expenses.category,
    total: sql`SUM(${expenses.amount})`,
    count: sql`COUNT(*)`,
  }).from(expenses)
    .where(and(eq(expenses.user_id, userId), gte(expenses.happened_at, since)))
    .groupBy(expenses.type, expenses.category);

  let totalExpense = 0, totalIncome = 0, ops = 0;
  const byCategory = [];
  for (const r of expRows) {
    const t = Number(r.total ?? 0);
    ops += Number(r.count ?? 0);
    if (r.type === 'income') totalIncome += t;
    else { totalExpense += t; byCategory.push({ category: r.category || 'أخرى', total: t }); }
  }
  byCategory.sort((a, b) => b.total - a.total);

  const taskRows = await db.select().from(tasks).where(eq(tasks.user_id, userId));
  const weekTasks = taskRows.filter((t) => new Date(t.created_at) >= since || (t.due_at && new Date(t.due_at) >= since));
  const doneCount = weekTasks.filter((t) => t.done).length;

  const diaryRows = await db.select().from(diary)
    .where(and(eq(diary.user_id, userId), gte(diary.created_at, since)));
  const moods = {};
  for (const d of diaryRows) if (d.mood) moods[d.mood] = (moods[d.mood] || 0) + 1;

  return { totalExpense, totalIncome, ops, byCategory, tasksTotal: weekTasks.length, tasksDone: doneCount, diaryCount: diaryRows.length, moods };
}

const fmtN = (n) => Number(n).toLocaleString('ar-EG', { maximumFractionDigits: 0 });

/** Render the summary as Egyptian-Arabic text (chat + push body). */
export function formatWeeklySummary(s) {
  const lines = ['📊 ملخص أسبوعك في دفتر:', ''];
  lines.push(`💸 المصاريف: ${fmtN(s.totalExpense)} جنيه (${s.ops} عملية)`);
  if (s.totalIncome > 0) lines.push(`💰 الدخل: ${fmtN(s.totalIncome)} جنيه`);
  if (s.byCategory.length) {
    lines.push('أعلى التصنيفات:');
    for (const c of s.byCategory.slice(0, 3)) lines.push(`• ${c.category}: ${fmtN(c.total)} جنيه`);
  }
  lines.push(`✅ المهام: ${s.tasksDone} من ${s.tasksTotal} منجزة`);
  lines.push(`📖 اليوميات: ${s.diaryCount} تدوينة`);
  const topMood = Object.entries(s.moods).sort((a, b) => b[1] - a[1])[0];
  if (topMood) lines.push(`المزاج الغالب: ${topMood[0]}`);
  return lines.join('\n');
}

/**
 * Build + deliver the weekly summary (push + saved chat message).
 * Plan-gated by automations.weekly_summary.
 */
export async function deliverWeeklySummary(userId, planName) {
  const plan = getPlan(planName);
  if (!plan.automations?.weekly_summary) {
    return { ok: false, error: 'الملخص الأسبوعي متاح لخطة Pro.' };
  }
  const stats = await computeWeeklySummary(userId);
  const text = formatWeeklySummary(stats);

  try {
    const conv = await getOrCreateConversation(userId);
    await db.insert(messages).values({ conversation_id: conv.id, user_id: userId, role: 'assistant', content: text });
  } catch (err) {
    console.error('[summary] save failed:', err.message);
  }

  const pushResult = await sendPushToUser(userId, {
    title: 'دفتر · ملخص أسبوعك 📊',
    body: text.slice(0, 200),
    url: '/#chat',
  });

  return { ok: true, stats, text, pushResult };
}
