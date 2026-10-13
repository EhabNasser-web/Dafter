/**
 * src/modules/expenses/checkin.js
 * Daily check-in question for the expenses module.
 */

import { db } from '../../db/index.js';
import { expenses } from '../../db/schema.js';
import { eq, gte, and } from 'drizzle-orm';

/**
 * Returns a check-in question if the user hasn't logged any expense today.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function checkin(userId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [row] = await db.select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.user_id, userId), gte(expenses.happened_at, startOfDay)))
    .limit(1);

  if (!row) {
    return 'النهارده مسجلتش أي مصروف أو دخل. حصل إيه النهارده من ناحية الفلوس؟';
  }
  return null;
}
