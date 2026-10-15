-- drizzle/0006_jobs.sql
-- Phase 2.3: background jobs with status and retries.

CREATE TABLE IF NOT EXISTS jobs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system-wide job
  kind       VARCHAR(40) NOT NULL,   -- 'reminder' | 'weekly_summary' | ...
  payload    JSONB NOT NULL DEFAULT '{}',
  status     VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|running|done|failed
  attempts   INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_run ON jobs (status, run_after);
CREATE INDEX IF NOT EXISTS idx_jobs_user_kind ON jobs (user_id, kind);
