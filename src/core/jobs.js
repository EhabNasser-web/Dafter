/**
 * src/core/jobs.js
 * Phase 2.3 – tiny jobs runner (wrapped so a queue can replace it later).
 * Kinds: 'reminder' { taskId }, 'weekly_summary' {}.
 */

import { db } from '../db/index.js';
import { jobs, tasks, conversations, messages, users } from '../db/schema.js';
import { eq, and, lte, inArray, desc } from 'drizzle-orm';
import { getPlan } from '../../config/plans.js';
import { sendPushToUser } from '../providers/push/index.js';
import { deliverWeeklySummary } from '../modules/summary/service.js';

async function saveAssistantMessage(userId, text) {
  const { desc: descFn } = await import('drizzle-orm');
  const [existing] = await db.select().from(conversations)
    .where(eq(conversations.user_id, userId))
    .orderBy(descFn(conversations.updated_at)).limit(1);
  const conv = existing ?? (await db.insert(conversations)
    .values({ user_id: userId, title: 'دفتر يومي' }).returning())[0];
  await db.insert(messages).values({ conversation_id: conv.id, user_id: userId, role: 'assistant', content: text });
  await db.update(conversations).set({ updated_at: new Date() }).where(eq(conversations.id, conv.id));
}

/** Create a job unless an equivalent pending/running one exists. */
export async function createJob({ userId = null, kind, payload = {}, runAfter = new Date(), maxAttempts = 3 }) {
  const existing = await db.select({ id: jobs.id }).from(jobs)
    .where(and(
      userId ? eq(jobs.user_id, userId) : eq(jobs.kind, `__never_${Date.now()}`),
      eq(jobs.kind, kind),
      inArray(jobs.status, ['pending', 'running'])
    )).limit(50);
  // Dedup reminders per task: same payload.taskId already queued
  if (kind === 'reminder' && payload.taskId) {
    const dup = await db.select({ id: jobs.id, payload: jobs.payload }).from(jobs)
      .where(and(eq(jobs.kind, 'reminder'), inArray(jobs.status, ['pending', 'running'])));
    if (dup.some((j) => j.payload?.taskId === payload.taskId)) return { ok: true, deduped: true };
  }
  if (kind !== 'reminder' && existing.length > 0 && !userId) return { ok: true, deduped: true };
  const [row] = await db.insert(jobs)
    .values({ user_id: userId, kind, payload, run_after: runAfter, max_attempts: maxAttempts })
    .returning({ id: jobs.id });
  return { ok: true, id: row.id };
}

async function handleReminder(job) {
  const { taskId } = job.payload ?? {};
  if (!taskId) return { ok: false, error: 'missing taskId' };
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task || task.done) return { ok: true, skipped: true };
  const text = `⏰ تذكير: مهمة «${task.title}» مستحقة ${task.due_at ? 'قريباً' : ''}. خلّصها قبل ما تتراكم!`;
  try {
    await saveAssistantMessage(task.user_id, text);
  } catch (err) {
    console.error('[jobs/reminder] save failed:', err.message);
  }
  await sendPushToUser(task.user_id, { title: 'دفتر · تذكير ⏰', body: text, url: '/#tasks' });
  return { ok: true };
}

async function handleWeeklySummary(job) {
  if (!job.user_id) return { ok: false, error: 'missing user' };
  const [u] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, job.user_id)).limit(1);
  const result = await deliverWeeklySummary(job.user_id, u?.plan ?? 'free');
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

const HANDLERS = { reminder: handleReminder, weekly_summary: handleWeeklySummary };

/** Claim due jobs and run them with retries. */
export async function runDueJobs(limit = 20) {
  const due = await db.select().from(jobs)
    .where(and(eq(jobs.status, 'pending'), lte(jobs.run_after, new Date())))
    .limit(limit);

  let processed = 0;
  for (const job of due) {
    await db.update(jobs).set({ status: 'running', attempts: job.attempts + 1, updated_at: new Date() })
      .where(eq(jobs.id, job.id));
    try {
      const handler = HANDLERS[job.kind];
      if (!handler) throw new Error(`unknown job kind: ${job.kind}`);
      const out = await handler(job);
      if (out.ok) {
        await db.update(jobs).set({ status: 'done', updated_at: new Date() }).where(eq(jobs.id, job.id));
      } else {
        throw new Error(out.error || 'handler failed');
      }
    } catch (err) {
      const exhausted = job.attempts + 1 >= job.max_attempts;
      await db.update(jobs).set({
        status: exhausted ? 'failed' : 'pending',
        last_error: err.message?.slice(0, 500),
        run_after: new Date(Date.now() + 5 * 60 * 1000 * (job.attempts + 1)),
        updated_at: new Date(),
      }).where(eq(jobs.id, job.id));
      console.error(`[jobs] ${job.kind} ${job.id} failed (attempt ${job.attempts + 1}):`, err.message);
    }
    processed++;
  }
  return { ok: true, processed };
}

/** Scan pro users' tasks due within 24h and queue reminders. */
export async function scanReminders() {
  const all = await db.select().from(users).where(eq(users.status, 'active'));
  let queued = 0;
  const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000);
  for (const u of all) {
    if (!getPlan(u.plan).automations?.reminders) continue;
    const open = await db.select().from(tasks)
      .where(and(eq(tasks.user_id, u.id), eq(tasks.done, false)));
    for (const t of open) {
      if (t.due_at && new Date(t.due_at) <= horizon) {
        const r = await createJob({ userId: u.id, kind: 'reminder', payload: { taskId: t.id } });
        if (r.id) queued++;
      }
    }
  }
  console.log(`[jobs] reminder scan queued ${queued} job(s).`);
  return { ok: true, queued };
}

/** Queue weekly summaries for eligible users (called by Friday cron). */
export async function scanWeeklySummaries() {
  const all = await db.select().from(users).where(eq(users.status, 'active'));
  let queued = 0;
  for (const u of all) {
    if (!getPlan(u.plan).automations?.weekly_summary) continue;
    const r = await createJob({ userId: u.id, kind: 'weekly_summary', payload: {} });
    if (r.id) queued++;
  }
  console.log(`[jobs] weekly summary scan queued ${queued} job(s).`);
  return { ok: true, queued };
}
