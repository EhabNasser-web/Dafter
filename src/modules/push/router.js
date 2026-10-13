/**
 * src/modules/push/router.js
 * Endpoints for Web Push subscription management and test triggers.
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import { getVapidPublicKey, sendPushToUser } from '../../providers/push/index.js';
import { runCheckinForUser } from '../../core/scheduler.js';
import { db } from '../../db/index.js';
import { pushSubscriptions } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const router = Router();

// GET /api/push/public-key – returns VAPID public key
router.get('/public-key', (_req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({ publicKey });
});

// GET /api/push/status – check if current user has active subscriptions
router.get('/status', requireAuth, async (req, res) => {
  try {
    const subs = await db.select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.user_id, req.session.userId));

    res.json({
      ok: true,
      enabled: subs.length > 0,
      count: subs.length,
    });
  } catch (err) {
    console.error('[push/status]', err.message);
    res.status(500).json({ error: 'خطأ في قراءة حالة الإشعارات.' });
  }
});

// POST /api/push/subscribe – register or update device subscription
router.post('/subscribe', requireAuth, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: 'بيانات الاشتراك غير مكتملة.' });
  }

  const endpoint = subscription.endpoint;
  const p256dh   = subscription.keys.p256dh;
  const auth     = subscription.keys.auth;
  const userAgent = req.headers['user-agent'] || null;

  try {
    const [existing] = await db.select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existing) {
      await db.update(pushSubscriptions)
        .set({
          user_id: req.session.userId,
          p256dh,
          auth,
          user_agent: userAgent,
        })
        .where(eq(pushSubscriptions.endpoint, endpoint));
    } else {
      await db.insert(pushSubscriptions).values({
        user_id:    req.session.userId,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
      });
    }

    res.json({ ok: true, message: 'تم تفعيل إشعارات دفتر بنجاح! 🔔' });
  } catch (err) {
    console.error('[push/subscribe]', err.message);
    res.status(500).json({ error: 'تعذر حفظ اشتراك الإشعارات.' });
  }
});

// POST /api/push/unsubscribe – remove a device subscription
router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'الـ endpoint مطلوب.' });
  }

  try {
    await db.delete(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.user_id, req.session.userId)
      ));

    res.json({ ok: true, message: 'تم إيقاف الإشعارات لهذا الجهاز.' });
  } catch (err) {
    console.error('[push/unsubscribe]', err.message);
    res.status(500).json({ error: 'تعذر حذف الاشتراك.' });
  }
});

// POST /api/push/test – send an immediate test push to the user
router.post('/test', requireAuth, async (req, res) => {
  try {
    const result = await sendPushToUser(req.session.userId, {
      title: 'دفتر · إشعار تجريبي 🔔',
      body: 'إشعارات دفتر شغالة تمام! المساعد هيفكرك يومياً بمصاريفك ومهامك.',
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-192.png',
      url: '/#chat',
    });

    if (result.total === 0) {
      return res.status(400).json({
        ok: false,
        error: 'مفيش جهاز مسجل لاستقبال الإشعارات. فعل الإشعارات الأول من القائمة.',
      });
    }

    res.json({
      ok: true,
      message: `تم إرسال الإشعار بنجاح إلى ${result.sent} من ${result.total} أجهزة.`,
      ...result,
    });
  } catch (err) {
    console.error('[push/test]', err.message);
    res.status(500).json({ error: 'تعذر إرسال الإشعار التجريبي.' });
  }
});

// POST /api/push/checkin-trigger – trigger daily check-in on demand for test/demo
router.post('/checkin-trigger', requireAuth, async (req, res) => {
  try {
    const result = await runCheckinForUser(req.session.userId, req.session.userPlan || 'pro');
    res.json({
      ok: true,
      message: 'تم إطلاق التشيك إن اليومي بنجاح! 📝',
      checkin: result.message,
      pushResult: result.pushResult,
    });
  } catch (err) {
    console.error('[push/checkin-trigger]', err.message);
    res.status(500).json({ error: 'تعذر تشغيل التشيك إن.' });
  }
});

