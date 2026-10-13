/**
 * src/providers/llm/groq.js
 * LLM implementation using Groq chat completions with tool calling.
 *
 * Groq endpoint: POST https://api.groq.com/openai/v1/chat/completions
 * Compatible with the OpenAI SDK format – we use groq-sdk directly.
 */

import Groq from 'groq-sdk';
import { withRetry } from '../retry.js';

/**
 * Send a chat completion request to Groq with optional tool calling.
 *
 * @param {object} opts
 * @param {string}   opts.model       – Groq model ID (from plan config)
 * @param {Array}    opts.messages    – OpenAI-format messages array
 * @param {Array}    [opts.tools]     – OpenAI-format tools array
 * @param {number}   [opts.maxTokens] – max tokens for the response
 * @returns {Promise<import('groq-sdk').ChatCompletion>}
 */
export async function chatWithGroq({ model, messages, tools, maxTokens = 1024 }) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in environment.');
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  return withRetry(
    async () => {
      const params = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3, // deterministic-ish for data extraction
      };

      if (tools?.length) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      const completion = await groq.chat.completions.create(params);
      return completion;
    },
    { label: `groq-llm(${model})`, attempts: 3, baseMs: 600, timeoutMs: 30_000 }
  );
}

/**
 * List of available Groq models for comparison in eval-agent.js
 */
export const GROQ_MODELS = {
  fast:   'qwen/qwen3.8-27b',       // fast, excellent Arabic tool calling
  smart:  'openai/gpt-oss-120b',    // large model with deep reasoning
  vision: 'openai/gpt-oss-20b',
};
