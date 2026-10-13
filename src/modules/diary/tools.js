/**
 * src/modules/diary/tools.js
 * Agent tools for the diary module.
 */

import { db } from '../../db/index.js';
import { diary } from '../../db/schema.js';
import { eq, desc, and, gte, lte } from 'drizzle-orm';

export const tools = [
  {
    name: 'add_diary_entry',
    description: 'يسجل يوميات أو مشاعر المستخدم. استخدمه لما يتكلم عن يومه أو مشاعره أو أحداث شخصية.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'نص اليوميات' },
        mood:    { type: 'string', enum: ['happy', 'sad', 'neutral', 'anxious', 'excited'], description: 'المزاج العام' },
        day:     { type: 'string', description: 'اليوم بصيغة YYYY-MM-DD (اختياري، افتراضي: اليوم)' },
      },
      required: ['content'],
    },
    async execute(args, ctx) {
      const today = new Date().toISOString().slice(0, 10);
      const [row] = await db.insert(diary).values({
        user_id: ctx.userId,
        content: args.content,
        mood:    args.mood ?? null,
        day:     args.day ?? today,
      }).returning();
      return { ok: true, id: row.id, message: 'تم تسجيل اليوميات.' };
    },
  },

  {
    name: 'list_diary',
    description: 'يعرض اليوميات السابقة للمستخدم.',
    parameters: {
      type: 'object',
      properties: {
        from:  { type: 'string', description: 'تاريخ بداية YYYY-MM-DD (اختياري)' },
        to:    { type: 'string', description: 'تاريخ نهاية YYYY-MM-DD (اختياري)' },
        limit: { type: 'number', description: 'عدد النتائج (افتراضي: 7)' },
      },
      required: [],
    },
    async execute(args, ctx) {
      const conditions = [eq(diary.user_id, ctx.userId)];
      if (args.from) conditions.push(gte(diary.day, args.from));
      if (args.to)   conditions.push(lte(diary.day, args.to));

      const rows = await db.select().from(diary)
        .where(and(...conditions))
        .orderBy(desc(diary.day))
        .limit(args.limit ?? 7);

      if (rows.length === 0) return { ok: true, data: [], message: 'مفيش يوميات مسجلة.' };
      return { ok: true, data: rows, message: `${rows.length} يومية` };
    },
  },
];
