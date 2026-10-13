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
    const addTool = tools.find(t => t.name === 'add_diary_entry');
    const result = await addTool.execute(
      { content: req.body.content, mood: req.body.mood, day: req.body.day },
      { userId: req.session.userId }
    );
    res.json(result);
  } catch (err) {
    console.error('[diary/create]', err.message);
    res.status(500).json({ error: 'خطأ في حفظ اليومية.' });
  }
});
