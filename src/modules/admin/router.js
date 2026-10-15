/**
 * src/modules/admin/router.js
 * Admin-only routes:
 *   POST /admin/login          – start a session
 *   POST /admin/logout         – end a session
 *   GET  /admin/users          – list all users
 *   POST /admin/users          – create a user (admin only)
 *   PATCH /admin/users/:id     – update plan / status / expires_at
 *   DELETE /admin/users/:id    – delete a user
 */

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { requireAdmin } from '../../core/auth.js';
import { getUsageSummary } from '../../core/usage.js';
import { getPlan } from '../../../config/plans.js';
import { eq } from 'drizzle-orm';

export const adminRouter = Router();

// ─── Login ────────────────────────────────────────────────────────────────────
adminRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان.' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
    }

    // Any active user may log in (admin creates accounts; public signup lands in Phase 2).
    // Admin-only gates stay on the user-management routes below via requireAdmin.
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'حسابك غير مفعّل حالياً. تواصل مع الإدارة.' });
    }

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.userPlan = user.plan ?? 'free';

    return res.json({ ok: true, name: user.name, role: user.role, plan: user.plan ?? 'free' });
  } catch (err) {
    console.error('[admin/login]', err);
    return res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
adminRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ─── All routes below require admin session ───────────────────────────────────
adminRouter.use(requireAdmin);

// ─── List users ───────────────────────────────────────────────────────────────
adminRouter.get('/users', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        plan: users.plan,
        status: users.status,
        expires_at: users.expires_at,
        payment_note: users.payment_note,
        reset_token: users.reset_token,
        created_at: users.created_at,
        theme: users.theme,
      })
      .from(users)
      .orderBy(users.created_at);

    return res.json(rows);
  } catch (err) {
    console.error('[admin/users GET]', err);
    return res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Usage & cost summary (Phase 2.2) ─────────────────────────────────────────
adminRouter.get('/usage/summary', async (_req, res) => {
  try {
    const all = await db
      .select({ id: users.id, name: users.name, email: users.email, plan: users.plan })
      .from(users)
      .orderBy(users.created_at);

    const rows = await Promise.all(
      all.map(async (u) => {
        const plan = getPlan(u.plan);
        return {
          ...u,
          ...(await getUsageSummary(u.id)),
          limits: {
            dailyMessages: plan.daily_message_limit,
            dailyVoice: plan.daily_voice_limit,
          },
        };
      })
    );
    const totals = rows.reduce(
      (acc, r) => ({
        messagesToday: acc.messagesToday + r.messagesToday,
        voiceMonthSec: acc.voiceMonthSec + r.voiceMonthSec,
        costMonthUSD: acc.costMonthUSD + r.costMonthUSD,
      }),
      { messagesToday: 0, voiceMonthSec: 0, costMonthUSD: 0 }
    );
    res.json({ users: rows, totals });
  } catch (err) {
    console.error('[admin/usage]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Create user ──────────────────────────────────────────────────────────────
adminRouter.post('/users', async (req, res) => {
  try {
    const { name, email, password, role = 'user', plan = 'free' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة.' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password_hash,
        role,
        plan,
        status: 'active',
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    return res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل.' });
    }
    console.error('[admin/users POST]', err);
    return res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Update user (plan / status / expires_at) ─────────────────────────────────
adminRouter.patch('/users/:id', async (req, res) => {
  try {
    const allowed = ['plan', 'status', 'expires_at', 'theme', 'name', 'payment_note'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key] === '' ? null : req.body[key];
    }

    if (updates.plan && !['free', 'pro'].includes(updates.plan)) {
      return res.status(400).json({ error: 'الخطة غير صالحة (free أو pro).' });
    }
    if (updates.status && !['active', 'pending', 'expired', 'disabled'].includes(updates.status)) {
      return res.status(400).json({ error: 'الحالة غير صالحة.' });
    }
    if (updates.theme && !['notebook', 'contrast'].includes(updates.theme)) {
      return res.status(400).json({ error: 'الثيم غير صالح.' });
    }
    if (updates.expires_at !== undefined && updates.expires_at !== null) {
      const d = new Date(updates.expires_at);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'تاريخ الانتهاء غير صالح.' });
      }
      updates.expires_at = d;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا توجد حقول صالحة للتحديث.' });
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id, plan: users.plan, status: users.status });

    if (!updated) return res.status(404).json({ error: 'المستخدم غير موجود.' });

    return res.json(updated);
  } catch (err) {
    console.error('[admin/users PATCH]', err);
    return res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Delete user ──────────────────────────────────────────────────────────────
adminRouter.delete('/users/:id', async (req, res) => {
  try {
    await db.delete(users).where(eq(users.id, req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin/users DELETE]', err);
    return res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});
