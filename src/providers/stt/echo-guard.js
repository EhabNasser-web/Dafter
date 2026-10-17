/**
 * src/providers/stt/echo-guard.js
 * Silence-hallucination guard for voice transcription.
 *
 * On unclear or near-silent audio, Whisper-style STT models sometimes echo
 * the hint prompt back instead of transcribing real speech (the model returns
 * STYLE_LINE word-for-word as if the user had said it). This module detects
 * such echoes so /api/voice/transcribe can reject the take before the reviewer
 * spends tokens or a nonsense draft reaches the user.
 *
 * Robustness notes learned from production:
 * - Token matching must ignore punctuation: the model often returns the echo
 *   with Arabic commas/periods attached ("النهارده،") which used to break the
 *   exact-token comparison and let the echo through as a draft.
 * - The guard also runs on the FINAL text (after the reviewer), where the
 *   transcript rules have already converted number words (خمسين → 50), so
 *   NUMBER_TOKENS below must map both spellings to the same token.
 */

import { norm } from './transcript-rules.js';
import { STYLE_LINE } from './prompt.js';

// Spoken numbers → digits: transcript-rules converts words like خمسين to "50"
// before the draft is shown, so both forms must compare equal.
const NUMBER_TOKENS = Object.freeze({ خمسين: '50' });

/** Comparable tokens: normalized letters/digits only, no punctuation. */
function tokens(text) {
  return norm(String(text ?? ''))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => NUMBER_TOKENS[t] ?? t);
}

const HINT_TOKENS = tokens(STYLE_LINE);
// Tolerances for the near-verbatim check: one tweaked/skipped word and a few
// extra words are still treated as an echo.
const MIN_MATCHED = HINT_TOKENS.length - 1;
const MIN_WORDS = HINT_TOKENS.length - 2;
const MAX_WORDS = HINT_TOKENS.length + 3;
// Secondary net: a long transcript made almost entirely of prompt vocabulary
// is the model vomiting its own prompt (e.g. a shuffled term soup).
const VOMIT_MIN_WORDS = 12;
const VOMIT_RATIO = 0.9;

/**
 * @param {string} text – transcript (raw, or final after reviewer/rules)
 * @param {string} [promptText] – the exact STT hint prompt sent to the model
 * @returns {boolean} true when the text looks like the hint prompt itself
 */
export function isHintEcho(text, promptText = '') {
  const words = tokens(text);
  if (!words.length) return false;

  // Primary: near-complete, in-order reproduction of the hint's STYLE_LINE.
  if (words.length >= MIN_WORDS && words.length <= MAX_WORDS) {
    let matched = 0;
    for (let i = 0, j = 0; i < words.length && j < HINT_TOKENS.length; i++) {
      if (words[i] === HINT_TOKENS[j]) { matched++; j++; }
    }
    if (matched >= MIN_MATCHED) return true;
  }

  // Secondary: prompt-vomit soup.
  if (promptText && words.length >= VOMIT_MIN_WORDS) {
    const promptSet = new Set(tokens(promptText));
    const onPrompt = words.reduce((n, w) => n + (promptSet.has(w) ? 1 : 0), 0);
    if (onPrompt / words.length >= VOMIT_RATIO) return true;
  }

  return false;
}
