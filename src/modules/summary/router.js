/**
 * src/modules/summary/router.js
 * Phase 2.3 – weekly summary endpoints. Auto-mounted at /api/summary.
 *
 *   GET  /api/summary/weekly   – compute + return (no delivery)
 *   POST /api/summary/weekly   – compute + push + save to chat
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { computeWeeklySummary, formatWeeklySummary, deliverWeeklySummary } from './service.js';
import { getPlan } from '../../../config/plans.js';

export const router = Router();

function gate(req, res) {
  const plan = getPlan(req.session.userPlan ?? 'free');
  if (!plan.automations?.weekly_summary) {
    res.status(403).json({ error: 'الملخص الأسبوعي متاح لخطة Pro. اطلبه عبر واتساب من القائمة.' });
    return null;
  }
  return plan;
}

router.get('/weekly', requireAuth, async (req, res) => {
  if (!gate(req, res)) return;
  try {
    const stats = await computeWeeklySummary(req.session.userId);
    res.json({ ok: true, stats, text: formatWeeklySummary(stats) });
  } catch (err) {
    console.error('[summary/weekly]', err.message);
    res.status(500).json({ error: 'خطأ في حساب الملخص.' });
  }
});

router.post('/weekly', requireAuth, async (req, res) => {
  if (!gate(req, res)) return;
  try {
    const result = await deliverWeeklySummary(req.session.userId, req.session.userPlan ?? 'free');
    if (!result.ok) return res.status(403).json({ error: result.error });
    res.json({ ok: true, text: result.text, pushResult: result.pushResult });
  } catch (err) {
    console.error('[summary/weekly POST]', err.message);
    res.status(500).json({ error: 'خطأ في إرسال الملخص.' });
  }
});
