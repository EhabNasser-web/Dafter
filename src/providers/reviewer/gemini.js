/**
 * src/providers/reviewer/gemini.js
 * Transcript reviewer using Google Gemini.
 *
 * Goal: fix STT errors in Egyptian Arabic colloquial text WITHOUT changing
 * the meaning or translating to MSA. Only correct clear mistakes.
 *
 * Examples of fixes:
 *   "عيزان" → "عايزين"  (Whisper mishear)
 *   "مية" stays "مية"   (not "مئة" – it's valid Egyptian Arabic for 100)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from '../retry.js';

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash'; // fast, free tier, excellent Arabic

const SYSTEM_PROMPT = `أنت مصحح نصوص متخصص في العامية المصرية.
مهمتك: تصحيح أخطاء التفريغ الصوتي (Speech-to-Text) في النص المصري العامي.

قواعد صارمة:
1. صحّح الأخطاء الإملائية الواضحة الناتجة عن التفريغ الصوتي فقط.
2. لا تغيّر المعنى أبداً.
3. لا تترجم للعربية الفصحى – خلّي الكلام عامي مصري.
4. لو النص سليم، رجّعه كما هو بدون تعديل.
5. ردّك يكون النص المصحح فقط – بدون شرح أو تعليق.`;

/**
 * Review and correct an Arabic transcript.
 *
 * @param {string} rawTranscript – text from Whisper
 * @returns {Promise<string>}    – corrected text
 */
export async function reviewWithGemini(rawTranscript) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set in environment.');
  }

  if (!rawTranscript?.trim()) return '';

  return withRetry(
    async () => {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: SYSTEM_PROMPT,
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: rawTranscript }] }],
        generationConfig: {
          temperature: 0.1,  // low temp = conservative corrections
          maxOutputTokens: 1024,
        },
      });

      const corrected = result.response.text().trim();
      return corrected || rawTranscript; // fall back to original if response is empty
    },
    { label: 'gemini-reviewer', attempts: 3, baseMs: 800, timeoutMs: 20_000 }
  );
}
