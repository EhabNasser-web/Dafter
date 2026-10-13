/**
 * src/modules/diary/checkin.js
 */

import { db } from '../../db/index.js';
import { diary } from '../../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';

export async function checkin(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.select({ id: diary.id })
    .from(diary)
    .where(and(eq(diary.user_id, userId), gte(diary.day, today)))
    .limit(1);

  if (!row) return 'مكتبتش في يومياتك النهارده. عايز تحكيلي إيه اللي حصل؟';
  return null;
}
