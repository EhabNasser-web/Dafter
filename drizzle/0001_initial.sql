-- drizzle/0001_initial.sql
-- Creates the three core tables: users, conversations, messages.
-- Generated from src/db/schema.js – run via: node scripts/migrate.js

-- ─── Enable pgcrypto for gen_random_uuid() ────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(120) NOT NULL,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role         VARCHAR(20)  NOT NULL DEFAULT 'user',
  theme        VARCHAR(40)  NOT NULL DEFAULT 'notebook',
  plan         VARCHAR(20)  NOT NULL DEFAULT 'free',
  status       VARCHAR(20)  NOT NULL DEFAULT 'active',
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── conversations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              VARCHAR(20)  NOT NULL,   -- 'user' | 'assistant' | 'tool'
  content           TEXT         NOT NULL,
  tool_calls        JSONB,
  voice_seconds     INTEGER,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
