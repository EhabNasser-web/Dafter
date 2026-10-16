/**
 * src/providers/stt/index.js
 * STT provider factory.
 * Returns the right implementation based on STT_PROVIDER env var (default: 'groq').
 *
 * Usage:
 *   import { getSttProvider } from '../providers/stt/index.js';
 *   const stt = getSttProvider();
 *   const { text, durationSeconds } = await stt(audioBuffer, 'audio/webm');
 */

import { transcribeWithGroq } from './groq.js';
import { transcribeWithGemini } from './gemini.js';

const PROVIDERS = {
  gemini: transcribeWithGemini,
  groq: transcribeWithGroq,
};

/**
 * @returns {import('./interface.js').SttProvider}
 * Signature: (audioBuffer, mimeType, filename?, opts?: { prompt?: string })
 */
export function getSttProvider() {
  const name = process.env.STT_PROVIDER ?? 'gemini';
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown STT_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}
