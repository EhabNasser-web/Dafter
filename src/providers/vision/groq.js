/**
 * src/providers/vision/groq.js
 * Image understanding via Groq's vision models (fast, same free key).
 * Model: GROQ_VISION_MODEL (default 'qwen/qwen3.8-27b' – vision + JSON mode).
 *
 * Select with: VISION_PROVIDER=groq
 */

import Groq from 'groq-sdk';
import { withRetry } from '../retry.js';
import { SYSTEM_PROMPT } from './gemini.js';

const MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

/**
 * @param {Buffer} imageBuffer – raw image bytes
 * @param {string} mimeType     – e.g. 'image/jpeg', 'image/png'
 * @returns {Promise<{ type: string, text: string, notes: string }>}
 */
export async function readImageWithGroqVision(imageBuffer, mimeType = 'image/jpeg') {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in environment.');
  }
  if (!imageBuffer?.length) {
    throw new Error('Empty image buffer.');
  }

  return withRetry(
    async () => {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

      const completion = await groq.chat.completions.create({
        model: MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: SYSTEM_PROMPT + '\n\nاقرأ هذه الصورة حسب التعليمات.' },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      });

      const raw = (completion.choices?.[0]?.message?.content ?? '').trim();
      try {
        const parsed = JSON.parse(raw);
        return {
          type: ['diary', 'tasks', 'expenses'].includes(parsed.type) ? parsed.type : 'unknown',
          text: String(parsed.text ?? '').trim(),
          notes: String(parsed.notes ?? '').trim(),
        };
      } catch {
        return { type: 'unknown', text: raw, notes: '' };
      }
    },
    { label: 'groq-vision', attempts: 2, baseMs: 800, timeoutMs: 45_000 }
  );
}
