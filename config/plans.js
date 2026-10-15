/**
 * config/plans.js
 * Single source of truth for plan limits and feature flags.
 * Add a new plan here; no other file needs changing.
 */

export const plans = {
  free: {
    /** Same capable model as pro – limited by counts instead */
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',

    /** Max agent messages per day (×30 ≈ 300/month) */
    daily_message_limit: 10,

    /** Max voice transcriptions per day (×30 ≈ 60/month) */
    daily_voice_limit: 2,

    /** Modules the user has access to (must match src/modules/<name>/) */
    enabled_modules: ['expenses', 'tasks', 'diary'],

    /**
     * Proactive features: daily check-in push notifications, weekly summary, etc.
     * Disabled on free – only manual interactions work.
     */
    proactive_features: false,

    /** Skip the Gemini reviewer step to save cost on free tier */
    use_reviewer: false,

    /** Phase 2.3 automations available on this plan */
    automations: {
      weekly_summary: false,
      reminders: false,
      export: true,
    },

    /** Phase 2.5 – selectable UI themes */
    themes: ['notebook'],
  },

  pro: {
    /** Most capable available on Groq for user's key */
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    daily_message_limit: 100,
    daily_voice_limit: 80,
    enabled_modules: ['expenses', 'tasks', 'diary'],
    proactive_features: true,
    use_reviewer: true,
    automations: {
      weekly_summary: true,
      reminders: true,
      export: true,
    },
    themes: ['notebook', 'contrast'],
  },
};

/** Convenience helper – returns the plan object (defaults to 'free') */
export function getPlan(planName) {
  return plans[planName] ?? plans.free;
}

export default plans;

