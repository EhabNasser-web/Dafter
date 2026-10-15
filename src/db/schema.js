/**
 * src/db/schema.js
 * Drizzle ORM table definitions – the single source of truth for all columns.
 * Run `node scripts/migrate.js` to apply changes to the database.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  date,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),

  /** 'admin' | 'user' */
  role: varchar('role', { length: 20 }).notNull().default('user'),

  /** Theme slug – matches a file in public/themes/<theme>.css */
  theme: varchar('theme', { length: 40 }).notNull().default('notebook'),

  /** 'free' | 'pro' – must exist in config/plans.js */
  plan: varchar('plan', { length: 20 }).notNull().default('free'),

  /** 'active' | 'pending' | 'expired' | 'disabled' */
  status: varchar('status', { length: 20 }).notNull().default('active'),

  /** When a paid subscription expires; NULL means no expiry */
  expires_at: timestamp('expires_at', { withTimezone: true }),

  /** Free-text manual-payment note (amount, method, reference) – admin only */
  payment_note: text('payment_note'),

  /** Password-reset token (shared manually until email exists) + expiry */
  reset_token: text('reset_token'),
  reset_expires_at: timestamp('reset_expires_at', { withTimezone: true }),

  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── conversations ────────────────────────────────────────────────────────────
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── messages ─────────────────────────────────────────────────────────────────
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  conversation_id: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  /** 'user' | 'assistant' | 'tool' */
  role: varchar('role', { length: 20 }).notNull(),

  content: text('content').notNull(),

  /** Optional structured tool call payload */
  tool_calls: jsonb('tool_calls'),

  /** Voice transcription duration in seconds (null for text messages) */
  voice_seconds: integer('voice_seconds'),

  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── expenses ─────────────────────────────────────────────────────────────────
export const expenses = pgTable('expenses', {
  id:         uuid('id').primaryKey().defaultRandom(),
  user_id:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount:     numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency:   varchar('currency', { length: 10 }).notNull().default('EGP'),
  type:       varchar('type', { length: 10 }).notNull().default('expense'), // 'expense' | 'income'
  category:   varchar('category', { length: 60 }),
  note:       text('note'),
  happened_at: timestamp('happened_at', { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── tasks ────────────────────────────────────────────────────────────────────
export const tasks = pgTable('tasks', {
  id:         uuid('id').primaryKey().defaultRandom(),
  user_id:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title:      text('title').notNull(),
  due_at:     timestamp('due_at', { withTimezone: true }),
  reminder_at: timestamp('reminder_at', { withTimezone: true }),
  done:       boolean('done').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── diary ────────────────────────────────────────────────────────────────────
export const diary = pgTable('diary', {
  id:         uuid('id').primaryKey().defaultRandom(),
  user_id:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content:    text('content').notNull(),
  mood:       varchar('mood', { length: 30 }),  // 'happy'|'sad'|'neutral'|'anxious'|'excited'
  day:        date('day').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── usage (Phase 2.2 – quotas & cost estimates) ─────────────────────────────
export const usage = pgTable('usage', {
  id:       uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  user_id:  uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  day:      date('day').notNull(),
  /** 'message' (count) | 'voice' (seconds) | 'tokens' (count) */
  kind:     varchar('kind', { length: 20 }).notNull(),
  units:    numeric('units').notNull().default('0'),
  /** USD estimate – see config/costs.js */
  cost_estimate: numeric('cost_estimate').notNull().default('0'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ─── jobs (Phase 2.3 – background jobs) ──────────────────────────────────────
export const jobs = pgTable('jobs', {
  id:       uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  user_id:  uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  kind:     varchar('kind', { length: 40 }).notNull(),
  payload:  jsonb('payload').notNull().default({}),
  status:   varchar('status', { length: 20 }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(3),
  run_after: timestamp('run_after', { withTimezone: true }).notNull().default(sql`now()`),
  last_error: text('last_error'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ─── push_subscriptions ───────────────────────────────────────────────────────
export const pushSubscriptions = pgTable('push_subscriptions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  user_id:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint:   text('endpoint').notNull().unique(),
  p256dh:     text('p256dh').notNull(),
  auth:       text('auth').notNull(),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

