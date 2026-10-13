/**
 * src/providers/push/index.js
 * Web Push notification provider using web-push (VAPID).
 * Handles sending payloads and auto-pruning expired/invalid subscriptions.
 */

import webpush from 'web-push';
import { db } from '../../db/index.js';
import { pushSubscriptions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@daftar.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[push] VAPID keys are missing – push notifications disabled.');
}

/**
 * Returns the public VAPID key for clients to subscribe.
 */
export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

/**
 * Sends a push notification to a single subscription.
 * Automatically cleans up expired/unregistered endpoints (410 / 404).
 *
 * @param {{ endpoint: string, p256dh?: string, auth?: string, keys?: { p256dh: string, auth: string } }} sub
 * @param {object|string} payload
 * @returns {Promise<{ ok: boolean, unsubscribed?: boolean, error?: string }>}
 */
export async function sendNotification(sub, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { ok: false, error: 'VAPID keys not configured' };
  }

  const subscriptionObj = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh || sub.keys?.p256dh,
      auth:   sub.auth || sub.keys?.auth,
    },
  };

  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

  try {
    await webpush.sendNotification(subscriptionObj, payloadStr);
    return { ok: true };
  } catch (err) {
    console.error(`[push] Error sending to ${sub.endpoint.slice(0, 35)}…:`, err.message);

    // 404 Not Found or 410 Gone means the subscription is no longer valid
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log(`[push] Pruning expired subscription: ${sub.endpoint.slice(0, 35)}…`);
      try {
        await db.delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, sub.endpoint));
      } catch (dbErr) {
        console.error('[push] Failed to prune subscription from DB:', dbErr.message);
      }
      return { ok: false, unsubscribed: true, error: 'Subscription expired or unsubscribed' };
    }

    return { ok: false, error: err.message };
  }
}

/**
 * Sends a push notification to all devices belonging to a user.
 *
 * @param {string} userId
 * @param {object|string} payload
 * @returns {Promise<{ sent: number, total: number }>}
 */
export async function sendPushToUser(userId, payload) {
  const subs = await db.select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.user_id, userId));

  if (!subs || subs.length === 0) {
    return { sent: 0, total: 0 };
  }

  const results = await Promise.allSettled(
    subs.map(sub => sendNotification(sub, payload))
  );

  const sent = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
  return { sent, total: subs.length };
}
