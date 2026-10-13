/**
 * src/modules/tasks/checkin.js
 */

import { db } from '../../db/index.js';
import { tasks } from '../../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';

export async function checkin(userId) {
  const now = new Date();
  const rows = await db.select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.user_id, userId), eq(tasks.done, false), lte(tasks.due_at, now)))
    .limit(3);

  if (rows.length > 0) {
    const titles = rows.map(r => `"${r.title}"`).join('، ');
    return `عندك مهام متأخرة: ${titles}. هتعملها امتى؟`;
  }
  return null;
}
