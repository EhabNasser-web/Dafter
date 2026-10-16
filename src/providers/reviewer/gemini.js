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
import { BASE_RULES, buildReviewerSystem } from './message.js';

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash'; // fast, free tier, excellent Arabic

export const SYSTEM_PROMPT = BASE_RULES;

/**
 * Review and correct an Arabic transcript.
 *
 * @param {string} rawTranscript – text from Whisper
 * @param {{ vocabularyText?: string, audio?: { buffer: Buffer, mimeType: string } }} [opts]
 *   – personal vocabulary text; original audio (used by Gemini when available)
 * @returns {Promise<string>}    – corrected text
 */
export async function reviewWithGemini(rawTranscript, opts = {}) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set in environment.');
  }

  if (!rawTranscript?.trim()) return '';

  const systemInstruction = buildReviewerSystem({ vocabText: opts.vocabularyText });

  return withRetry(
    async () => {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction,
      });

      const parts = [{ text: rawTranscript }];
      if (opts.audio?.buffer?.length) {
        parts.push({
          inlineData: {
            data: opts.audio.buffer.toString('base64'),
            mimeType: opts.audio.mimeType || 'audio/webm',
          },
        });
        parts.unshift({ text: 'التفريغ المبدئي أعلاه مأخوذ من هذا التسجيل. استمع إليه وراجع التصحيح.' });
      }

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,  // low temp = conservative corrections
          maxOutputTokens: 1024,
        },
      });

      const corrected = result.response.text().trim();
      return corrected || rawTranscript; // fall back to original if response is empty
    },
    { label: 'gemini-reviewer', attempts: 2, baseMs: 800, timeoutMs: 12_000 }
  );
}
