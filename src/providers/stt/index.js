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

const PROVIDERS = {
  groq: transcribeWithGroq,
};

/**
 * @returns {import('./interface.js').SttProvider}
 */
export function getSttProvider() {
  const name = process.env.STT_PROVIDER ?? 'groq';
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown STT_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}
