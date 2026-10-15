/**
 * src/modules/chat/router.js
 * Main chat endpoint: POST /api/chat
 * Accepts text (and optionally voice) and runs the agent.
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { runAgent } from '../../core/agent.js';
import { checkQuota, logUsage } from '../../core/usage.js';
import { llmCostEstimate } from '../../../config/costs.js';

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

  const userPlan = req.session.userPlan ?? 'free';
  const quota = await checkQuota(req.session.userId, userPlan, 'message');
  if (!quota.allowed) {
    return res.status(429).json({ error: quota.error });
  }

  try {
    const result = await runAgent({
      userId:    req.session.userId,
      userPlan,
      text:      text.trim(),
    });
    // Fire-and-forget accounting (never blocks the reply)
    logUsage(req.session.userId, 'message', 1, 0);
    if (result.usage) {
      const { model, promptTokens, completionTokens } = result.usage;
      logUsage(req.session.userId, 'tokens', promptTokens + completionTokens,
        llmCostEstimate(model, promptTokens, completionTokens));
    }
    res.json({ reply: result.reply, toolsUsed: result.toolsUsed });
  } catch (err) {
    console.error('[chat] Agent error:', err.message);
    res.status(500).json({ error: 'معلش، فيه مشكلة. جرب تاني.' });
  }
});
