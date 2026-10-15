/**
 * src/providers/vision/index.js
 * Vision provider factory (default: 'gemini').
 * Select with: VISION_PROVIDER=gemini
 */

import { readImageWithGemini } from './gemini.js';
import { readImageWithGroqVision } from './groq.js';

const PROVIDERS = {
  gemini: readImageWithGemini,
  groq: readImageWithGroqVision,
};

/**
 * @returns {(imageBuffer: Buffer, mimeType: string) => Promise<{ type: string, text: string, notes: string }>}
 */
export function getVisionProvider() {
  const name = process.env.VISION_PROVIDER ?? 'gemini';
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown VISION_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}
