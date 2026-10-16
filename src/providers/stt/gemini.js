/**
 * src/providers/stt/gemini.js
 * STT implementation using Google Gemini multimodal audio input.
 * Lightweight model for fast, free-tier Egyptian-Arabic transcription.
 *
 * Select with: STT_PROVIDER=gemini (default)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from '../retry.js';

const MODEL_NAME = process.env.STT_MODEL || 'gemini-3.5-flash-lite';

const TRANSCRIBE_INSTRUCTION = `فرّغ هذا التسجيل الصوتي إلى نص بالعامية المصرية حرفياً كما قيل، بدون ترجمة للفصحى وبدون شرح أو تعليق. لو فيه كلام غير واضح ضع علامة [؟] بدل التخمين.`;

/**
 * Transcribe audio using Gemini.
 *
 * @param {Buffer} audioBuffer  – raw audio bytes
 * @param {string} mimeType     – e.g. 'audio/webm', 'audio/ogg', 'audio/mp3'
 * @param {string} [filename]   – ignored (kept for interface compatibility)
 * @param {{ prompt?: string }} [opts] – vocabulary hint appended to the instruction
 * @returns {Promise<{text: string, language: string, durationSeconds: number}>}
 */
export async function transcribeWithGemini(audioBuffer, mimeType = 'audio/webm', filename = 'audio.webm', opts = {}) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set in environment.');
  }
  if (!audioBuffer?.length) {
    throw new Error('Empty audio buffer.');
  }

  // durationSeconds is estimated (Gemini returns no duration):
  // Opus/webm speech ≈ 2KB/s. Used for stats only, not billing.
  const estimatedSeconds = Math.max(1, Math.round(audioBuffer.length / 2000));

  return withRetry(
    async () => {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      let instruction = TRANSCRIBE_INSTRUCTION;
      if (opts.prompt?.trim()) {
        instruction += `\nكلمات متوقعة في الكلام (استعن بها عند الغموض): ${opts.prompt.trim()}`;
      }

      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: audioBuffer.toString('base64'), mimeType } },
            { text: instruction },
          ],
        }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 1024 },
      });

      return {
        text: (result.response.text() ?? '').trim(),
        language: 'ar',
        durationSeconds: estimatedSeconds,
      };
    },
    { label: 'gemini-stt', attempts: 2, baseMs: 800, timeoutMs: 45_000 }
  );
}
