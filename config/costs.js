/**
 * config/costs.js
 * Nominal per-unit rates used ONLY for cost *estimates* in the admin panel.
 * Groq/Gemini free tiers may make real cost $0 – these numbers exist so the
 * admin can compare relative consumption per user/plan and react if paid
 * tiers are ever enabled. Update from the providers' pricing pages.
 *
 * All rates in USD.
 */
export const costs = {
  /** LLM cost per 1M tokens: { input, output } – keyed by model, fallback `default` */
  llmPerMillionTokens: {
    'openai/gpt-oss-120b': { input: 0.15, output: 0.75 },
    'openai/gpt-oss-20b': { input: 0.1, output: 0.5 },
    default: { input: 0.15, output: 0.75 },
  },

  /** STT cost per audio minute (Whisper-class) */
  sttPerMinute: 0.01,

  /** Reviewer tokens ride the free tier – recorded with zero cost */
  reviewerPerMillionTokens: { input: 0, output: 0 },
};

export function llmCostEstimate(model, promptTokens = 0, completionTokens = 0) {
  const r = costs.llmPerMillionTokens[model] ?? costs.llmPerMillionTokens.default;
  return (promptTokens * r.input + completionTokens * r.output) / 1_000_000;
}

export function sttCostEstimate(seconds = 0) {
  return (seconds / 60) * costs.sttPerMinute;
}

export default costs;
