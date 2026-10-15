/**
 * src/providers/reviewer/groq.js
 * Transcript reviewer using the Groq LLM (same free key, no Google dependency).
 * Shares the Egyptian-dialect correction prompt with the Gemini reviewer.
 *
 * Select with: REVIEWER_PROVIDER=groq
 */

import { getLLMProvider } from '../llm/index.js';
import { SYSTEM_PROMPT } from './gemini.js';
import { withRetry } from '../retry.js';

/**
 * Review and correct an Arabic transcript.
 *
 * @param {string} rawTranscript – text from Whisper
 * @returns {Promise<string>}    – corrected text
 */
export async function reviewWithGroq(rawTranscript) {
  if (!rawTranscript?.trim()) return '';

  return withRetry(
    async () => {
      const llm = getLLMProvider();
      const response = await llm.chat({
        model: process.env.REVIEWER_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: rawTranscript },
        ],
        temperature: 0.1,
        max_tokens: 1024,
      });

      const corrected = (response.choices?.[0]?.message?.content ?? '').trim();
      return corrected || rawTranscript; // fall back to original if response is empty
    },
    { label: 'groq-reviewer', attempts: 2, baseMs: 500, timeoutMs: 15_000 }
  );
}
