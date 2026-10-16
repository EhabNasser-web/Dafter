/**
 * src/providers/reviewer/message.js
 * Shared reviewer system message: strict rules + static lexicon +
 * the user's personal vocabulary. Used by both reviewer implementations
 * (Gemini text/audio, Groq text-only) so behavior is identical.
 */

import { getLexicon } from '../stt/prompt.js';

const BASE_RULES = `أنت مصحح نصوص في تطبيق "دفتر" – مساعد شخصي للحياة اليومية يتحدث العامية المصرية.
النص الذي يصلك مفرّغ من تسجيل صوتي لشخص يتكلم عامية مصرية، وقد تكون عنده مشاكل في مخارج بعض الحروف (مثل: ج/ق، س/ص، ز/ذ)، فالكلمات قد تظهر محرّفة صوتياً.

سياق التطبيق (المواضيع المتوقعة):
- مصاريف ودخل: مبالغ بالجنيه، تصنيفات (أكل، مواصلات، فواتير، تسوق، صحة، تعليم، إيجار، راتب).
- مهام وتذكيرات: أفعال مثل (فكرني، لازم، بكرة، النهارده).
- يوميات ومشاعر: وصف اليوم والمزاج (مبسوط، قلقان، متحمس).
استخدم هذا السياق لتوقّع الكلمة الأرجح عند التشوه.

قواعد صارمة:
1. صحّح فقط ما يدعمه الصوت والسياق. الحد الأدنى من التعديل: لا تغيّر أي كلمة واضحة ومفهومة، حتى لو إملاؤها عامي.
2. الأفعال مقدسة مثل الأرقام: "جبت" (اشتريت) لا تتحول أبداً إلى "قبضت" (استلمت).
3. الأرقام والمبالغ: وحّد كتابتها بشكل متسق (مثل: خمس، خمسين، جنيه، جنيهات) ولا تغيّر قيمتها أبداً.
4. الأسماء: احتفظ بأسماء مفردات المستخدم حرفياً كما هي في قائمته أدناه، ولا تستبدلها بكلمات شائعة.
5. أمثلة أخطاء سمع شائعة للإرشاد (لا للحفظ): "سروفتي" → "صرفت"، "خمس بني" → "خمسين جنيه"، "النهارده/نودده" → "النهارده"، "شيبسي/شيرسي/شبسي" → "شيبسي"، "بيون/بيوم" → "بيهم"، "أشنيني/أشريم" → "عشرين". والسياق (مصروف/مهمة/يومية) هو الحكم عند الغموض، لا التشابه الصوتي وحده.
5. لا تضف أي محتوى لم يُقَل. لا تترجم للفصحى أبداً – الناتج عامية مصرية فقط.
6. ردّك يكون النص المصحح فقط – بدون شرح أو تعليق أو تشكيل زائد.`;

function lexiconText() {
  const lex = getLexicon();
  const labels = {
    money: 'نقود وأسعار', time: 'وقت', categories: 'تصنيفات',
    tasks: 'مهام', health_habits: 'صحة وعادات', prayer: 'صلاة وعبادة',
    verbs: 'أفعال عامية', code_switch: 'كلمات إنجليزية معربة',
  };
  return Object.entries(lex)
    .filter(([, terms]) => Array.isArray(terms) && terms.length)
    .map(([cat, terms]) => `- ${labels[cat] ?? cat}: ${terms.join('، ')}`)
    .join('\n');
}

/**
 * @param {{ vocabText?: string }} [opts] – personal vocabulary grouped text
 * @returns {string} full reviewer system message
 */
export function buildReviewerSystem({ vocabText = '' } = {}) {
  const parts = [BASE_RULES, `\nالقاموس العام (كلمات متوقعة):\n${lexiconText()}`];
  if (vocabText?.trim()) {
    parts.push(`\nمفردات المستخدم الخاصة (مقدّمة على القاموس العام، احتفظ بها حرفياً):\n${vocabText.trim()}`);
  }
  return parts.join('\n');
}

export { BASE_RULES };
