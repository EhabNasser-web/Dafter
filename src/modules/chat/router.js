/**
 * src/modules/chat/router.js
 * Main chat endpoint: POST /api/chat
 * Accepts text (and optionally voice) and runs the agent.
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { runAgent } from '../../core/agent.js';

export const router = Router();
export const chatRouter = router;

/**
 * POST /api/chat
 * Body: { text: string }
 * Returns: { reply: string, toolsUsed: string[] }
 */
router.post('/', requireAuth, async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'الرسالة فاضية.' });
  }

  if (text.length > 2000) {
    return res.status(400).json({ error: 'الرسالة طويلة جداً (الحد 2000 حرف).' });
  }

  try {
    const result = await runAgent({
      userId:    req.session.userId,
      userPlan:  req.session.userPlan ?? 'free',
      text:      text.trim(),
    });
    res.json(result);
  } catch (err) {
    console.error('[chat] Agent error:', err.message);
    res.status(500).json({ error: 'معلش، فيه مشكلة. جرب تاني.' });
  }
});
