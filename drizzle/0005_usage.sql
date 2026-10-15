-- drizzle/0005_usage.sql
-- Phase 2.2: quotas and cost control.
-- One row per (user, day, kind); units/cost accumulate via upsert.

CREATE TABLE IF NOT EXISTS usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           DATE NOT NULL,
  kind          VARCHAR(20) NOT NULL,   -- 'message' | 'voice' | 'tokens'
  units         NUMERIC NOT NULL DEFAULT 0,   -- messages: count; voice: seconds; tokens: count
  cost_estimate NUMERIC NOT NULL DEFAULT 0,   -- USD estimate
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, day, kind)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_day ON usage (user_id, day);
