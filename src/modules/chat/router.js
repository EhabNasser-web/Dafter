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
import { recordCorrection } from '../../core/vocabulary.js';

export const router = Router();
export const chatRouter = router;

/**
 * POST /api/chat
 * Body: { text: string, raw_text?: string }
 * raw_text = pre-edit voice draft; when it differs from text the pair is
 * stored as a correction and may be promoted into the user's vocabulary.
 * Returns: { reply: string, toolsUsed: string[] }
 */
router.post('/', requireAuth, async (req, res) => {
  const { text, raw_text } = req.body;

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
    // Edited voice draft → learn from the correction (fire-and-forget)
    if (typeof raw_text === 'string' && raw_text.trim() && raw_text.trim() !== text.trim()) {
      recordCorrection(req.session.userId, raw_text, text.trim())
        .then((r) => {
          if (r.promoted) console.log(`[vocab] learned "${r.term}" for user ${req.session.userId}`);
        })
        .catch((err) => console.error('[vocab] recordCorrection failed:', err.message));
    }

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
