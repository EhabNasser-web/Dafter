/**
 * src/modules/auth/router.js
 * Phase 2.1 – public auth with manual activation.
 * Auto-mounted by moduleLoader at /api/auth.
 *
 *   GET  /api/auth/config          – public flags (whatsapp number or null)
 *   GET  /api/auth/me              – current session profile
 *   POST /api/auth/signup          – { name, email, password } → status 'pending'
 *   POST /api/auth/login           – { email, password } (active + expired-as-free only)
 *   POST /api/auth/logout
 *   POST /api/auth/forgot          – { email } → reset token (shared manually, no email yet)
 *   POST /api/auth/reset           – { token, password }
 */

import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../../core/auth.js';
import { getPlan } from '../../../config/plans.js';

export const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Public config (non-sensitive flags for the frontend) ────────────────────
router.get('/config', (_req, res) => {
  res.json({
    signupEnabled: true,
    whatsappNumber: process.env.WHATSAPP_NUMBER || null,
  });
});

// ─── Current session profile ──────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [u] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        plan: users.plan,
        status: users.status,
        theme: users.theme,
      })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);
    if (!u) return res.status(401).json({ error: 'انتهت الجلسة. سجّل الدخول مجدداً.' });
    res.json(u);
  } catch (err) {
    console.error('[auth/me]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Signup → always 'pending', admin activates manually ─────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة.' });
    }
    if (!EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    try {
      await db.insert(users).values({
        name: name.trim().slice(0, 120),
        email: email.toLowerCase().trim(),
        password_hash,
        role: 'user',
        plan: 'free',
        status: 'pending',
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'هذا البريد مسجل بالفعل. سجّل الدخول أو استرجع كلمة المرور.' });
      }
      throw err;
    }

    res.status(201).json({
      ok: true,
      message: 'تم إنشاء حسابك وهو قيد المراجعة. ستصلك الموافقة قريباً.',
    });
  } catch (err) {
    console.error('[auth/signup]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

function startSession(req, user, effectivePlan) {
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.userPlan = effectivePlan;
}

// ─── Login (pending blocked, expired falls back to free) ─────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان.' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'حسابك قيد المراجعة. سيتم تفعيله قريباً.' });
    }
    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'هذا الحساب موقوف. تواصل مع الإدارة.' });
    }

    // Expired subscriptions fall back to the free plan (Phase 2.1 assumption).
    const effectivePlan = user.status === 'expired' ? 'free' : (user.plan ?? 'free');
    startSession(req, user, effectivePlan);

    res.json({
      ok: true,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: effectivePlan,
      status: user.status,
      notice: user.status === 'expired'
        ? 'انتهى اشتراكك وعدت للخطة المجانية. جدّد للعودة لمزايا Pro.'
        : undefined,
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ─── Update own profile (Phase 2.5 – name + plan-gated theme) ───────────────
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select({ id: users.id, plan: users.plan })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);
    if (!user) return res.status(401).json({ error: 'انتهت الجلسة.' });

    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim().slice(0, 120);
      if (!name) return res.status(400).json({ error: 'الاسم غير صالح.' });
      updates.name = name;
    }
    if (req.body.theme !== undefined) {
      const allowed = getPlan(user.plan).themes ?? ['notebook'];
      if (!allowed.includes(req.body.theme)) {
        return res.status(403).json({ error: 'هذا الثيم متاح لخطة Pro.' });
      }
      updates.theme = req.body.theme;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا توجد حقول صالحة.' });
    }
    const [updated] = await db.update(users).set(updates)
      .where(eq(users.id, user.id))
      .returning({ name: users.name, theme: users.theme });
    res.json({ ok: true, ...updated });
  } catch (err) {
    console.error('[auth/profile]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Delete my data (Phase 2.4) – irreversible, cascades everything ──────────
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const { password } = req.body ?? {};
    const [user] = await db
      .select({ id: users.id, password_hash: users.password_hash })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);
    if (!user) return res.status(401).json({ error: 'انتهت الجلسة.' });
    if (!password || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة. لم يُحذف شيء.' });
    }
    await db.delete(users).where(eq(users.id, user.id)); // cascades all user data
    req.session.destroy(() => res.json({ ok: true, message: 'تم حذف حسابك وكل بياناتك نهائياً.' }));
  } catch (err) {
    console.error('[auth/delete]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});
router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email?.trim() || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'أدخل بريداً إلكترونياً صحيحاً.' });
    }

    // Always return ok to avoid leaking which emails are registered.
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await db.update(users)
        .set({
          reset_token: token,
          reset_expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        })
        .where(eq(users.id, user.id));
    }

    res.json({
      ok: true,
      message: 'لو البريد مسجل، ستجد رمز الاسترجاع عند الإدارة. صالح لمدة ساعة.',
    });
  } catch (err) {
    console.error('[auth/forgot]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});

// ─── Reset password with token ───────────────────────────────────────────────
router.post('/reset', async (req, res) => {
  try {
    const { token, password } = req.body ?? {};
    if (!token || !password || password.length < 8) {
      return res.status(400).json({ error: 'رمز غير صالح أو كلمة مرور قصيرة (8 أحرف على الأقل).' });
    }

    const [user] = await db
      .select({ id: users.id, reset_expires_at: users.reset_expires_at })
      .from(users)
      .where(eq(users.reset_token, token))
      .limit(1);

    if (!user || !user.reset_expires_at || new Date(user.reset_expires_at) < new Date()) {
      return res.status(400).json({ error: 'الرمز منتهي أو غير صالح. اطلب رمزاً جديداً.' });
    }

    await db.update(users)
      .set({
        password_hash: await bcrypt.hash(password, 12),
        reset_token: null,
        reset_expires_at: null,
      })
      .where(eq(users.id, user.id));

    res.json({ ok: true, message: 'تم تغيير كلمة المرور. سجّل الدخول بكلمتك الجديدة.' });
  } catch (err) {
    console.error('[auth/reset]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم.' });
  }
});
