-- drizzle/0007_voice_vocab.sql
-- Voice personalization: per-user vocabulary + transcript corrections.
-- Both are text-only and cascade with the user (delete-my-data safe).

CREATE TABLE IF NOT EXISTS user_vocabulary (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    VARCHAR(20) NOT NULL,   -- 'people' | 'places' | 'actions'
  term        VARCHAR(120) NOT NULL,
  note        VARCHAR(255),
  source      VARCHAR(10) NOT NULL DEFAULT 'manual',  -- 'manual' | 'learned'
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, term)
);

CREATE INDEX IF NOT EXISTS idx_vocab_user ON user_vocabulary (user_id);

CREATE TABLE IF NOT EXISTS transcript_corrections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text     TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corrections_user ON transcript_corrections (user_id);
