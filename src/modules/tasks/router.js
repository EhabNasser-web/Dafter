/**
 * src/modules/tasks/router.js
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { tools } from './tools.js';

export const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const listTool = tools.find(t => t.name === 'list_tasks');
    const result = await listTool.execute({ done: req.query.done === 'true' }, { userId: req.session.userId });
    res.json(result);
  } catch (err) {
    console.error('[tasks/list]', err.message);
    res.status(500).json({ error: 'خطأ في استرجاع المهام.' });
  }
});

router.patch('/:id/complete', requireAuth, async (req, res) => {
  try {
    const completeTool = tools.find(t => t.name === 'complete_task');
    const result = await completeTool.execute({ task_id: req.params.id }, { userId: req.session.userId });
    res.json(result);
  } catch (err) {
    console.error('[tasks/complete]', err.message);
    res.status(500).json({ error: 'خطأ في تحديث المهمة.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const title = String(req.body.title ?? '').trim();
    if (!title || title.length > 500) {
      return res.status(400).json({ error: 'عنوان المهمة مطلوب (حتى 500 حرف).' });
    }
    const addTool = tools.find(t => t.name === 'add_task');
    const result = await addTool.execute(
      { title, due_at: req.body.due_at, reminder_at: req.body.reminder_at },
      { userId: req.session.userId }
    );
    res.json(result);
  } catch (err) {
    console.error('[tasks/create]', err.message);
    res.status(500).json({ error: 'خطأ في إنشاء المهمة.' });
  }
});
