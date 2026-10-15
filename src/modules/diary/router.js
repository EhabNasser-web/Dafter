/**
 * src/modules/diary/router.js
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { tools } from './tools.js';

export const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const listTool = tools.find(t => t.name === 'list_diary');
    const result = await listTool.execute(
      { from: req.query.from, to: req.query.to, limit: Number(req.query.limit) || 7 },
      { userId: req.session.userId }
    );
    res.json(result);
  } catch (err) {
    console.error('[diary/list]', err.message);
    res.status(500).json({ error: 'خطأ في استرجاع اليوميات.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const content = String(req.body.content ?? '').trim();
    if (!content || content.length > 5000) {
      return res.status(400).json({ error: 'نص اليومية مطلوب (حتى 5000 حرف).' });
    }
    const mood = req.body.mood != null ? String(req.body.mood).slice(0, 30) : null;
    const addTool = tools.find(t => t.name === 'add_diary_entry');
    const result = await addTool.execute(
      { content, mood, day: req.body.day },
      { userId: req.session.userId }
    );
    res.json(result);
  } catch (err) {
    console.error('[diary/create]', err.message);
    res.status(500).json({ error: 'خطأ في حفظ اليومية.' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const updates = {};
    if (req.body.content !== undefined) {
      const content = String(req.body.content).trim();
      if (!content || content.length > 5000) {
        return res.status(400).json({ error: 'نص اليومية مطلوب (حتى 5000 حرف).' });
      }
      updates.content = content;
    }
    if (req.body.mood !== undefined) {
      updates.mood = req.body.mood == null ? null : String(req.body.mood).slice(0, 30);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا توجد حقول صالحة.' });
    }
    const { db } = await import('../../db/index.js');
    const { diary } = await import('../../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const [row] = await db.update(diary).set(updates)
      .where(and(eq(diary.id, req.params.id), eq(diary.user_id, req.session.userId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'اليومية غير موجودة.' });
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[diary/update]', err.message);
    res.status(500).json({ error: 'خطأ في تحديث اليومية.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { db } = await import('../../db/index.js');
    const { diary } = await import('../../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    await db.delete(diary)
      .where(and(eq(diary.id, req.params.id), eq(diary.user_id, req.session.userId)));
    res.json({ ok: true, message: 'تم حذف اليومية.' });
  } catch (err) {
    console.error('[diary/delete]', err.message);
    res.status(500).json({ error: 'خطأ في حذف اليومية.' });
  }
});
