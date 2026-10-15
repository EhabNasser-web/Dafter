-- drizzle/0004_phase2_auth.sql
-- Phase 2.1: public signup with manual activation.
-- Adds manual-payment note + password-reset token columns to users.

ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_note     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ;

-- One active reset token per user is enough; index for token lookups.
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token);
