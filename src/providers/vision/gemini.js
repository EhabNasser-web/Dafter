/**
 * src/providers/vision/gemini.js
 * Image understanding using Google Gemini (multimodal).
 * Reads photos of notebooks/receipts/lists and returns structured Arabic text.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from '../retry.js';

const MODEL_NAME = process.env.VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-3.7-flash';

export const SYSTEM_PROMPT = `أنت قارئ صور في تطبيق "دفتر" – مساعد شخصي للحياة اليومية بالعامية المصرية.
الصورة المرفقة واحدة من: صفحة يوميات مكتوبة بخط اليد، قائمة مهام، فاتورة أو إيصال، أو ورقة مصاريف.

مهمتك:
1. استخرج كل النصوص المقروءة من الصورة حرفياً قدر الإمكان.
2. حدد نوع المحتوى: يوميات (diary) | مهام (tasks) | مصاريف (expenses) | غير واضح (unknown).
3. لو خط اليد غير واضح في كلمة، ضع علامة [؟] بدل تخمين أرقام أو أسماء.

الرد بصيغة JSON فقط بدون أي شرح:
{"type": "diary|tasks|expenses|unknown", "text": "النص المستخرج", "notes": "ملاحظات قصيرة أو فارغ"}`;

/**
 * @param {Buffer} imageBuffer – raw image bytes
 * @param {string} mimeType     – e.g. 'image/jpeg', 'image/png', 'image/webp'
 * @returns {Promise<{ type: string, text: string, notes: string }>}
 */
export async function readImageWithGemini(imageBuffer, mimeType = 'image/jpeg') {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set in environment.');
  }
  if (!imageBuffer?.length) {
    throw new Error('Empty image buffer.');
  }

  return withRetry(
    async () => {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: SYSTEM_PROMPT });

      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
            { text: 'اقرأ هذه الصورة حسب التعليمات.' },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      });

      const raw = result.response.text().trim();
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
    { label: 'gemini-vision', attempts: 2, baseMs: 800, timeoutMs: 30_000 }
  );
}
