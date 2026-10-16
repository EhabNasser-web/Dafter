/**
 * src/modules/expenses/router.js
 * REST endpoints for the expenses module.
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { tools } from './tools.js';
import { EXPENSE_CATEGORIES } from '../../../config/categories.js';
import { db } from '../../db/index.js';
import { expenses } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export const router = Router();

// GET /api/expenses/categories – canonical list + the user's own used ones
router.get('/categories', requireAuth, async (req, res) => {
  try {
    const known = new Set(EXPENSE_CATEGORIES.map((c) => c.name));
    const rows = await db.selectDistinct({ category: expenses.category })
      .from(expenses)
      .where(eq(expenses.user_id, req.session.userId));
    const custom = rows
      .map((r) => r.category)
      .filter((c) => c && !known.has(c))
      .map((name) => ({ name, emoji: '🏷️' }));
    res.json({ ok: true, data: [...EXPENSE_CATEGORIES, ...custom] });
  } catch (err) {
    console.error('[expenses/categories]', err.message);
    res.status(500).json({ error: 'خطأ في تحميل التصنيفات.' });
  }
});

// GET /api/expenses – list
router.get('/', requireAuth, async (req, res) => {
  try {
    const listTool = tools.find(t => t.name === 'list_expenses');
    const result = await listTool.execute(
      { from: req.query.from, to: req.query.to, type: req.query.type, limit: Number(req.query.limit) || 20 },
      { userId: req.session.userId }
    );
    res.json(result);
  } catch (err) {
    console.error('[expenses/list]', err.message);
    res.status(500).json({ error: 'خطأ في استرجاع المصروفات.' });
  }
});

// GET /api/expenses/summary
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const summaryTool = tools.find(t => t.name === 'get_expenses_summary');
    const result = await summaryTool.execute(
      { from: req.query.from, to: req.query.to },
      { userId: req.session.userId }
    );
    res.json(result);
  } catch (err) {
    console.error('[expenses/summary]', err.message);
    res.status(500).json({ error: 'خطأ في استرجاع الملخص.' });
  }
});

// POST /api/expenses – create (Phase 2.4: strict input validation)
router.post('/', requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      return res.status(400).json({ error: 'المبلغ غير صالح.' });
    }
    const type = req.body.type ?? 'expense';
    if (!['expense', 'income'].includes(type)) {
      return res.status(400).json({ error: 'النوع غير صالح.' });
    }
    const category = String(req.body.category ?? 'أخرى').slice(0, 60);
    const note = req.body.note != null ? String(req.body.note).slice(0, 1000) : null;
    const currency = String(req.body.currency ?? 'EGP').slice(0, 10);
    let happened_at = undefined;
    if (req.body.happened_at) {
      const d = new Date(req.body.happened_at);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'التاريخ غير صالح.' });
      happened_at = d;
    }
    const addTool = tools.find(t => t.name === 'add_expense');
    const result = await addTool.execute(
      { amount, type, category, note, happened_at, currency },
      { userId: req.session.userId }
    );
    res.json(result);
  } catch (err) {
    console.error('[expenses/create]', err.message);
    res.status(500).json({ error: 'خطأ في حفظ المصروف.' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { db } = await import('../../db/index.js');
    const { expenses } = await import('../../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.user_id, req.session.userId)));
    res.json({ ok: true, message: 'تم الحذف بنجاح.' });
  } catch (err) {
    console.error('[expenses/delete]', err.message);
    res.status(500).json({ error: 'خطأ في حذف المصروف.' });
  }
});
