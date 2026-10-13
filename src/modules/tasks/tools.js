/**
 * src/modules/tasks/tools.js
 * Agent tools for the tasks module.
 */

import { db } from '../../db/index.js';
import { tasks } from '../../db/schema.js';
import { eq, desc, and, isNull, or } from 'drizzle-orm';

export const tools = [
  {
    name: 'add_task',
    description: 'يضيف مهمة أو تذكرة للمستخدم. استخدمه لما يقول "فكرني"، "عندي مهمة"، "لازم أعمل".',
    parameters: {
      type: 'object',
      properties: {
        title:     { type: 'string', description: 'عنوان المهمة' },
        due_at:    { type: 'string', description: 'تاريخ الاستحقاق ISO 8601 (اختياري)' },
        reminder_at: { type: 'string', description: 'تاريخ التذكير ISO 8601 (اختياري)' },
      },
      required: ['title'],
    },
    async execute(args, ctx) {
      const [row] = await db.insert(tasks).values({
        user_id:    ctx.userId,
        title:      args.title,
        due_at:     args.due_at ? new Date(args.due_at) : null,
        reminder_at: args.reminder_at ? new Date(args.reminder_at) : null,
      }).returning();
      return { ok: true, id: row.id, message: `تم إضافة المهمة: "${args.title}"` };
    },
  },

  {
    name: 'list_tasks',
    description: 'يعرض المهام المفتوحة أو المكتملة للمستخدم.',
    parameters: {
      type: 'object',
      properties: {
        done: { type: 'boolean', description: 'true = المكتملة، false = المفتوحة (افتراضي: false)' },
      },
      required: [],
    },
    async execute(args, ctx) {
      const done = args.done ?? false;
      const rows = await db.select().from(tasks)
        .where(and(eq(tasks.user_id, ctx.userId), eq(tasks.done, done)))
        .orderBy(desc(tasks.created_at))
        .limit(30);
      if (rows.length === 0) return { ok: true, data: [], message: done ? 'مفيش مهام مكتملة.' : 'مفيش مهام مفتوحة.' };
      return { ok: true, data: rows, message: `${rows.length} مهمة ${done ? 'مكتملة' : 'مفتوحة'}` };
    },
  },

  {
    name: 'complete_task',
    description: 'يعلّم مهمة كمكتملة.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'ID المهمة (UUID)' },
      },
      required: ['task_id'],
    },
    async execute(args, ctx) {
      const [row] = await db.update(tasks)
        .set({ done: true })
        .where(and(eq(tasks.id, args.task_id), eq(tasks.user_id, ctx.userId)))
        .returning();
      if (!row) return { ok: false, message: 'المهمة مش موجودة.' };
      return { ok: true, message: `تم إتمام المهمة: "${row.title}"` };
    },
  },
];
