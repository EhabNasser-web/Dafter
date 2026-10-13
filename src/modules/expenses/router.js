/**
 * src/modules/expenses/router.js
 * REST endpoints for the expenses module.
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { tools } from './tools.js';

export const router = Router();

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

// POST /api/expenses – create
router.post('/', requireAuth, async (req, res) => {
  try {
    const addTool = tools.find(t => t.name === 'add_expense');
    const result = await addTool.execute(
      {
        amount: Number(req.body.amount),
        type: req.body.type || 'expense',
        category: req.body.category || 'أخرى',
        note: req.body.note,
        happened_at: req.body.happened_at,
        currency: req.body.currency || 'EGP',
      },
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
