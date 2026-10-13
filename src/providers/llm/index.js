/**
 * src/providers/llm/index.js
 * LLM provider factory.
 * Returns the right implementation based on LLM_PROVIDER env var (default: 'groq').
 *
 * Usage:
 *   import { getLlmProvider } from '../providers/llm/index.js';
 *   const llm = getLlmProvider();
 *   const completion = await llm({ model, messages, tools });
 */

import { chatWithGroq } from './groq.js';

const PROVIDERS = {
  groq: chatWithGroq,
};

/**
 * @returns {typeof chatWithGroq}
 */
export function getLlmProvider() {
  const name = process.env.LLM_PROVIDER ?? 'groq';
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown LLM_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  // Attach .chat method for agent loop compatibility
  provider.chat = async (opts) => {
    return provider({
      model: opts.model || process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      messages: opts.messages,
      tools: opts.tools,
      maxTokens: opts.max_tokens || opts.maxTokens || 1024,
    });
  };
  return provider;
}

export const getLLMProvider = getLlmProvider;

