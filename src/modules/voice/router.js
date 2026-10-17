/**
 * src/modules/voice/router.js
 * Voice input WITHOUT automatic agent execution.
 *   POST /api/voice/transcribe (multipart, field "audio")
 *     → quotas → STT (personalized prompt) → rule-based post-processing
 *     → reviewer (Pro only) → rules again → { rawText, text, durationSeconds, changes }
 * The chat draft UI sends the final (possibly edited) text to /api/chat,
 * which stores corrections and may learn vocabulary – nothing is recorded
 * until the user presses Send.
 * Auto-mounted by moduleLoader at /api/voice.
 */

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../core/auth.js';
import { getSttProvider, getSttFallbackProvider } from '../../providers/stt/index.js';
import { getReviewerProvider } from '../../providers/reviewer/index.js';
import { buildSttPrompt } from '../../providers/stt/prompt.js';
import { applyTranscriptRules } from '../../providers/stt/transcript-rules.js';
import { getPlan } from '../../../config/plans.js';
import { checkQuota, logUsage } from '../../core/usage.js';
import { sttCostEstimate } from '../../../config/costs.js';
import { topPersonalTerms, getVocabularyText, getRuleVocabulary } from '../../core/vocabulary.js';

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

const isMostlyArabic = (text) => {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const letters = (text.match(/\p{L}/gu) || []).length;
  return letters === 0 || arabicChars / letters >= 0.3;
};

/** DEBUG_STT=true → يطبع التفريغات وقائمة الإصلاحات في اللوج (نصوص فقط، لا صوت). */
const DEBUG_STT = process.env.DEBUG_STT === 'true';

router.post('/transcribe', requireAuth, handleUpload, async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'لم يصل أي ملف صوتي.' });
    }

    const userId = req.session.userId;
    const userPlan = req.session.userPlan ?? 'free';
    const plan = getPlan(userPlan);

    // Quota gate before spending on STT (message quota is spent at Send time)
    const voiceQuota = await checkQuota(userId, userPlan, 'voice');
    if (!voiceQuota.allowed) {
      return res.status(429).json({ error: voiceQuota.error });
    }

    // 1. Transcribe: primary first, automatic fallback on overload/timeout
    const mime = req.file.mimetype || 'audio/webm';
    const filename = `voice.${EXT_BY_MIME[mime] ?? 'webm'}`;
    const personalTerms = await topPersonalTerms(userId).catch(() => []);
    const prompt = buildSttPrompt({ personalTerms });
    let rawText, durationSeconds;
    try {
      ({ text: rawText, durationSeconds } = await getSttProvider()(
        req.file.buffer, mime, filename, { prompt }
      ));
    } catch (primaryErr) {
      const fallback = getSttFallbackProvider();
      if (!fallback) throw primaryErr;
      console.warn(`[voice] primary STT failed (${primaryErr.message}) – trying fallback`);
      ({ text: rawText, durationSeconds } = await fallback(
        req.file.buffer, mime, filename, { prompt }
      ));
    }

    if (!rawText || rawText.trim().length === 0) {
      return res.status(422).json({ error: 'لم أسمع شيئاً واضحاً. سجّل مجدداً بصوت أعلى.' });
    }

    // Guard: Whisper sometimes returns Latin transliteration for unclear audio.
    if (!isMostlyArabic(rawText)) {
      console.log('[voice] rejecting non-Arabic transcript');
      return res.status(422).json({ error: 'الصوت كان غير واضح والتفريغ طلع ملخبط. سجّل تاني في مكان هادي وبصوت واضح.' });
    }

    // 2. Rule-based post-processing on the RAW transcript (no AI, zero cost):
    //    junk → loops → personal vocabulary → spellings → times → numbers.
    const ruleVocabulary = await getRuleVocabulary(userId).catch(() => []);
    const prePass = applyTranscriptRules(rawText, { vocabulary: ruleVocabulary });

    // 3. Review/correct (Pro only – free relies on the rules + the editable draft)
    let reviewed = prePass.text;
    if (plan.use_reviewer) {
      try {
        const reviewer = getReviewerProvider();
        const vocabularyText = await getVocabularyText(userId).catch(() => '');
        reviewed = await reviewer(prePass.text, {
          vocabularyText,
          audio: { buffer: req.file.buffer, mimeType: mime },
        });
      } catch (revErr) {
        console.error('[voice] Reviewer failed, continuing with rules output:', revErr.message);
      }
    }

    // 4. Rules again on the final text before the draft is shown
    const finalPass = applyTranscriptRules(reviewed, { vocabulary: ruleVocabulary });
    if (!finalPass.text.trim()) {
      return res.status(422).json({ error: 'لم أسمع شيئاً واضحاً. سجّل مجدداً بصوت أعلى.' });
    }

    // Combined, de-duplicated change list (rendered under the draft)
    const seen = new Set();
    const changes = [...prePass.changes, ...finalPass.changes].filter((c) => {
      const key = `${c.rule}|${c.from}|${c.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (DEBUG_STT) {
      console.log('[voice] raw transcript:', rawText.trim());
      console.log('[voice] rules(pre-reviewer):', prePass.text.trim());
      if (plan.use_reviewer) console.log('[voice] reviewed transcript:', reviewed.trim());
      console.log('[voice] final transcript:', finalPass.text.trim());
      console.log('[voice] stt-rules changes:', JSON.stringify(changes));
    }

    // Fire-and-forget accounting (message counted at Send)
    logUsage(userId, 'voice', 1, 0);
    logUsage(userId, 'voice_seconds', durationSeconds ?? 0, sttCostEstimate(durationSeconds ?? 0));

    res.json({
      rawText: rawText.trim(),
      text: finalPass.text.trim(),
      durationSeconds: durationSeconds ?? 0,
      changes,
    });
  } catch (err) {
    console.error('[voice] Transcribe error:', err.message);
    res.status(500).json({ error: 'معلش، فيه مشكلة. جرب تاني.' });
  }
});
