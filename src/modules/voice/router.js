/**
 * src/modules/voice/router.js
 * Voice messages: POST /api/voice (multipart, field "audio").
 * Pipeline: Groq Whisper STT → Gemini reviewer (per plan) → agent.
 * Auto-mounted by moduleLoader at /api/voice.
 */

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../core/auth.js';
import { getSttProvider } from '../../providers/stt/index.js';
import { getReviewerProvider } from '../../providers/reviewer/index.js';
import { runAgent } from '../../core/agent.js';
import { getPlan } from '../../../config/plans.js';

export const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB ≈ several minutes of compressed audio
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('audio/')) return cb(null, true);
    cb(new Error('الملف المرفوع ليس ملفاً صوتياً.'));
  },
});

/** Turns multer/busboy errors into friendly Arabic 400s instead of 500s. */
function handleUpload(req, res, next) {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'التسجيل طويل جداً (الحد 10MB). سجّل مقطعاً أقصر.'
        : (err.message || 'تعذّر استلام الملف الصوتي.');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

const EXT_BY_MIME = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

router.post('/', requireAuth, handleUpload, async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'لم يصل أي ملف صوتي.' });
    }

    const userPlan = req.session.userPlan ?? 'free';
    const plan = getPlan(userPlan);

    // 1. Transcribe with Whisper
    const stt = getSttProvider();
    const mime = req.file.mimetype || 'audio/webm';
    const filename = `voice.${EXT_BY_MIME[mime] ?? 'webm'}`;
    const { text: rawText, durationSeconds } = await stt(req.file.buffer, mime, filename);

    if (!rawText || rawText.trim().length === 0) {
      return res.status(422).json({ error: 'لم أسمع شيئاً واضحاً. سجّل مجدداً بصوت أعلى.' });
    }

    // 2. Review/correct the transcript (skipped on free plan to save cost)
    let text = rawText;
    try {
      const reviewer = getReviewerProvider({ bypass: !plan.use_reviewer });
      text = await reviewer(rawText);
    } catch (revErr) {
      console.error('[voice] Reviewer failed, continuing with raw transcript:', revErr.message);
    }

    // 3. Run the agent on the transcript
    const result = await runAgent({
      userId: req.session.userId,
      userPlan,
      text: text.trim(),
      voiceSeconds: durationSeconds ?? 0,
    });

    res.json({ ...result, transcript: text.trim() });
  } catch (err) {
    console.error('[voice] Agent error:', err.message);
    res.status(500).json({ error: 'معلش، فيه مشكلة. جرب تاني.' });
  }
});
