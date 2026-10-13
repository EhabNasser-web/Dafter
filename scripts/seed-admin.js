/**
 * scripts/seed-admin.js
 * Creates the first admin account from ADMIN_EMAIL + ADMIN_PASSWORD env vars.
 * Safe to run multiple times – skips if the email already exists.
 *
 * Usage: node scripts/seed-admin.js
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('❌  Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file first.');
  process.exit(1);
}

const [existing] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email.toLowerCase()))
  .limit(1);

if (existing) {
  console.log(`ℹ️   Admin already exists: ${email}`);
  process.exit(0);
}

const password_hash = await bcrypt.hash(password, 12);

const [admin] = await db
  .insert(users)
  .values({
    name: 'Admin',
    email: email.toLowerCase(),
    password_hash,
    role: 'admin',
    plan: 'pro',
    status: 'active',
  })
  .returning({ id: users.id, email: users.email });

console.log(`✅  Admin created: ${admin.email} (id: ${admin.id})`);
process.exit(0);
