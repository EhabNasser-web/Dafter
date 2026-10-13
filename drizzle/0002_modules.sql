-- drizzle/0002_modules.sql
-- Creates tables for the three core modules: expenses, tasks, diary.

-- ─── expenses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL,
  currency    VARCHAR(10) NOT NULL DEFAULT 'EGP',
  type        VARCHAR(10) NOT NULL DEFAULT 'expense',
  category    VARCHAR(60),
  note        TEXT,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  due_at      TIMESTAMPTZ,
  reminder_at TIMESTAMPTZ,
  done        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── diary ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diary (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  mood       VARCHAR(30),
  day        DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
