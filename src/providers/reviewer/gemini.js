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

export const SYSTEM_PROMPT = `أنت مصحح نصوص في تطبيق "دفتر" – مساعد شخصي للحياة اليومية يتحدث العامية المصرية.
النص الذي يصلك مفرّغ من تسجيل صوتي لشخص يتكلم عامية مصرية، وقد تكون عنده مشاكل في مخارج بعض الحروف (مثل: ج/ق، س/ص، ز/ذ)، فالكلمات قد تظهر محرّفة صوتياً.

سياق التطبيق (المواضيع المتوقعة):
- مصاريف ودخل: مبالغ بالجنيه، تصنيفات (أكل، مواصلات، فواتير، تسوق، صحة، تعليم، إيجار، راتب).
- مهام وتذكيرات: أفعال مثل (فكرني، لازم، بكرة، النهارده).
- يوميات ومشاعر: وصف اليوم والمزاج (مبسوط، قلقان، متحمس).
استخدم هذا السياق لتوقّع الكلمة الأرجح عند التشوه.

قواعد صارمة:
1. الحد الأدنى من التعديل: لا تغيّر أي كلمة واضحة ومفهومة، حتى لو إملاؤها عامي.
2. الأفعال مقدسة مثل الأرقام: "جبت" (اشتريت) لا تتحول أبداً إلى "قبضت" (استلمت) – الفرق بينهما يعكس المعنى المالي. وكذلك "صرفت" لا تتحول إلى "صرفت/سرفت" بمعنى آخر.
3. الأرقام والعملات: حافظ عليها وركّبها في جملة منطقية (مثل: خمس، خمسين، جنيه، جنيهات).
4. أمثلة لأخطاء سمع شائعة: "سروفتي" → "صرفت"، "خمس بني" → "خمسين جنيه"، "النهارده/نودده" → "النهارده"، "شيبسي/شبسي" → "شيبسي".
5. لو النص مشوّه جداً، ركّب الجملة الأكثر احتمالاً من السياق أعلاه، ولا تخترع أرقاماً أو أسماء من عندك.
6. لا تترجم للفصحى أبداً – الناتج عامية مصرية فقط.
7. ردّك يكون النص المصحح فقط – بدون شرح أو تعليق أو تشكيل زائد.`;

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
    { label: 'gemini-reviewer', attempts: 2, baseMs: 800, timeoutMs: 12_000 }
  );
}
