/**
 * src/modules/export/router.js
 * Phase 2.3 – data export. Auto-mounted at /api/export.
 *
 *   GET /api/export/json          – everything (expenses, tasks, diary)
 *   GET /api/export/expenses.csv  – expenses as CSV (Excel-friendly with BOM)
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { db } from '../../db/index.js';
import { expenses, tasks, diary } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getPlan } from '../../../config/plans.js';

export const router = Router();

function gate(req, res) {
  const plan = getPlan(req.session.userPlan ?? 'free');
  if (!plan.automations?.export) {
    res.status(403).json({ error: 'التصدير غير متاح لخطتك.' });
    return false;
  }
  return true;
}

const stamp = () => new Date().toISOString().slice(0, 10);

router.get('/json', requireAuth, async (req, res) => {
  if (!gate(req, res)) return;
  try {
    const userId = req.session.userId;
    const [exp, tsk, dry] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.user_id, userId)).orderBy(desc(expenses.happened_at)),
      db.select().from(tasks).where(eq(tasks.user_id, userId)).orderBy(desc(tasks.created_at)),
      db.select().from(diary).where(eq(diary.user_id, userId)).orderBy(desc(diary.day)),
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="daftar-export-${stamp()}.json"`);
    res.json({ exported_at: new Date().toISOString(), expenses: exp, tasks: tsk, diary: dry });
  } catch (err) {
    console.error('[export/json]', err.message);
    res.status(500).json({ error: 'خطأ في التصدير.' });
  }
});

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

router.get('/expenses.csv', requireAuth, async (req, res) => {
  if (!gate(req, res)) return;
  try {
    const rows = await db.select().from(expenses)
      .where(eq(expenses.user_id, req.session.userId))
      .orderBy(desc(expenses.happened_at));
    const lines = ['date,type,amount,currency,category,note'];
    for (const e of rows) {
      lines.push([
        new Date(e.happened_at).toISOString(),
        e.type, e.amount, e.currency, csvCell(e.category), csvCell(e.note),
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="daftar-expenses-${stamp()}.csv"`);
    res.send('﻿' + lines.join('\n')); // BOM for Excel Arabic
  } catch (err) {
    console.error('[export/csv]', err.message);
    res.status(500).json({ error: 'خطأ في التصدير.' });
  }
});
