/**
 * config/plans.js
 * Single source of truth for plan limits and feature flags.
 * Add a new plan here; no other file needs changing.
 */

export const plans = {
  free: {
    /** Same capable model as pro – limited by message count instead */
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',

    /** Max agent messages the user can send per calendar day */
    daily_message_limit: 10,

    /** Cumulative voice transcription minutes allowed per month */
    voice_minutes_per_month: 10,

    /** Modules the user has access to (must match src/modules/<name>/) */
    enabled_modules: ['expenses', 'tasks', 'diary'],

    /**
     * Proactive features: daily check-in push notifications, weekly summary, etc.
     * Disabled on free – only manual interactions work.
     */
    proactive_features: false,

    /** Skip the Gemini reviewer step to save cost on free tier */
    use_reviewer: false,
  },

  pro: {
    /** Most capable available on Groq for user's key */
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    daily_message_limit: 300,
    voice_minutes_per_month: 120,
    enabled_modules: ['expenses', 'tasks', 'diary'],
    proactive_features: true,
    use_reviewer: true,
  },
};

/** Convenience helper – returns the plan object (defaults to 'free') */
export function getPlan(planName) {
  return plans[planName] ?? plans.free;
}

export default plans;

