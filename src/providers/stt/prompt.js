/**
 * src/providers/stt/prompt.js
 * Builds the SHORT Whisper hint prompt from the static lexicon plus the
 * user's personal vocabulary. Whisper-style prompts are limited to about
 * 224 tokens, so we enforce a tight character budget (Arabic ≈ 3 chars/token).
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _lexicon = null;
/** Static Egyptian-Arabic lexicon, loaded once. */
export function getLexicon() {
  if (!_lexicon) {
    _lexicon = JSON.parse(readFileSync(join(__dirname, 'lexicon.json'), 'utf8'));
  }
  return _lexicon;
}

/** Flat list of the highest-value lexicon terms (short, everyday words first). */
export function topLexiconTerms(limit = 25) {
  const lex = getLexicon();
  const priority = ['money', 'verbs', 'time', 'categories', 'tasks', 'health_habits', 'prayer', 'code_switch'];
  const out = [];
  for (const cat of priority) {
    for (const term of lex[cat] ?? []) {
      if (out.length >= limit) return out;
      if (!out.includes(term)) out.push(term);
    }
  }
  return out;
}

export const STYLE_LINE = 'صرفت خمسين جنيه على الأكل النهارده، فكرني أكلم الدكتور بكرة، صليت ومشيت واتغديت';

/** Approx token budget guard for the Whisper prompt. */
export const PROMPT_CHAR_BUDGET = 600;

/**
 * @param {{ personalTerms?: string[] }} [opts]
 * @returns {string} short prompt: style line + personal terms first, then lexicon terms
 */
export function buildSttPrompt({ personalTerms = [] } = {}) {
  const parts = [STYLE_LINE];
  let used = STYLE_LINE.length;

  const pushTerms = (terms) => {
    const fresh = [];
    for (const t of terms) {
      const term = String(t ?? '').trim();
      if (!term || parts.join(' ').includes(term)) continue;
      if (used + term.length + 2 > PROMPT_CHAR_BUDGET) break;
      fresh.push(term);
      used += term.length + 2;
    }
    if (fresh.length) parts.push(fresh.join('، '));
  };

  pushTerms(personalTerms.slice(0, 12));
  pushTerms(topLexiconTerms(25));
  return parts.join('. ');
}
