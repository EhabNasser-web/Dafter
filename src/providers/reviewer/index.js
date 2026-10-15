/**
 * src/providers/reviewer/index.js
 * Reviewer provider factory.
 * Returns the right implementation based on REVIEWER_PROVIDER env var (default: 'gemini').
 *
 * On free plan (use_reviewer: false), call getReviewerProvider({ bypass: true })
 * which returns a no-op that just echoes the input.
 *
 * Usage:
 *   import { getReviewerProvider } from '../providers/reviewer/index.js';
 *   const reviewer = getReviewerProvider();
 *   const corrected = await reviewer(rawTranscript);
 */

import { reviewWithGemini } from './gemini.js';
import { reviewWithGroq } from './groq.js';

const PROVIDERS = {
  gemini: reviewWithGemini,
  groq: reviewWithGroq,
};

/** No-op reviewer for free plan – skips the Gemini call to save cost */
function noopReviewer(text) {
  return Promise.resolve(text);
}

/**
 * @param {{ bypass?: boolean }} [opts]
 * @returns {(text: string) => Promise<string>}
 */
export function getReviewerProvider({ bypass = false } = {}) {
  if (bypass) return noopReviewer;

  const name = process.env.REVIEWER_PROVIDER ?? 'gemini';
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown REVIEWER_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}
