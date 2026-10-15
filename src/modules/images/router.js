/**
 * src/modules/images/router.js
 * Image messages: POST /api/images (multipart, field "image").
 * Pipeline: Gemini vision → agent (confirmation-first, like voice).
 * Images are processed in memory and never stored.
 * Auto-mounted by moduleLoader at /api/images.
 */

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../core/auth.js';
import { getVisionProvider } from '../../providers/vision/index.js';
import { runAgent } from '../../core/agent.js';
import { getPlan } from '../../../config/plans.js';
import { checkQuota, logUsage } from '../../core/usage.js';
import { llmCostEstimate } from '../../../config/costs.js';

export const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB – phone photos downscaled by Gemini anyway
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('الملف المرفوع ليس صورة.'));
  },
});

/** Turns multer/busboy errors into friendly Arabic 400s instead of 500s. */
function handleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'الصورة كبيرة جداً (الحد 5MB). صغّرها أو التقط بدقة أقل.'
        : (err.message || 'تعذّر استلام الصورة.');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

const TYPE_LABEL = { diary: 'يوميات', tasks: 'مهام', expenses: 'مصاريف', unknown: 'غير محدد' };

router.post('/', requireAuth, handleUpload, async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'لم تصل أي صورة.' });
    }

    const userPlan = req.session.userPlan ?? 'free';
    const plan = getPlan(userPlan);

    // Quota gates before spending on vision
    const msgQuota = await checkQuota(req.session.userId, userPlan, 'message');
    if (!msgQuota.allowed) {
      return res.status(429).json({ error: msgQuota.error });
    }
    const imgQuota = await checkQuota(req.session.userId, userPlan, 'image');
    if (!imgQuota.allowed) {
      return res.status(429).json({ error: imgQuota.error });
    }

    // 1. Read the image
    const vision = getVisionProvider();
    const seen = await vision(req.file.buffer, req.file.mimetype || 'image/jpeg');
    console.log(`[images] type=${seen.type} text=${(seen.text || '').slice(0, 200)}`);

    if (!seen.text || seen.text.trim().length === 0) {
      return res.status(422).json({ error: 'لم أستطع قراءة شيء واضح في الصورة. صوّر مجدداً بإضاءة أفضل.' });
    }

    // 2. Run the agent on the extracted text (confirmation-first, like voice)
    const hint = {
      diary: 'دفتر اليوميات',
      tasks: 'قائمة المهام',
      expenses: 'فاتورة أو ورقة مصاريف',
      unknown: 'محتوى غير مصنف',
    }[seen.type];
    const result = await runAgent({
      userId: req.session.userId,
      userPlan,
      text: `صوّرت ${hint} وهذا النص المستخرج منها:\n${seen.text.trim()}\n(سجّلها في المكان المناسب بعد التأكد مني)`,
      transcribed: true,
    });

    // Fire-and-forget accounting
    logUsage(req.session.userId, 'image', 1, 0);
    logUsage(req.session.userId, 'message', 1, 0);
    if (result.usage) {
      const { model, promptTokens, completionTokens } = result.usage;
      logUsage(req.session.userId, 'tokens', promptTokens + completionTokens,
        llmCostEstimate(model, promptTokens, completionTokens));
    }

    res.json({
      reply: result.reply,
      toolsUsed: result.toolsUsed,
      extracted: seen.text.trim(),
      detectedType: TYPE_LABEL[seen.type],
      notes: seen.notes,
    });
  } catch (err) {
    console.error('[images] error:', err.message);
    res.status(500).json({ error: 'معلش، فيه مشكلة. جرب تاني.' });
  }
});
