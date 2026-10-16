/**
 * src/modules/expenses/tools.js
 * Agent tools for the expenses module.
 * Tools follow the OpenAI function-calling spec.
 */

import { db } from '../../db/index.js';
import { expenses } from '../../db/schema.js';
import { eq, desc, gte, lte, and, sql } from 'drizzle-orm';
import { CATEGORY_NAMES } from '../../../config/categories.js';

export const tools = [
  {
    name: 'add_expense',
    description: 'يضيف مصروف أو دخل جديد للمستخدم. استخدمه لما المستخدم يذكر مبلغ مالي أو عملية شراء أو دخل.',
    parameters: {
      type: 'object',
      properties: {
        amount:     { type: 'number',  description: 'المبلغ (بالأرقام فقط، موجب دائماً)' },
        type:       { type: 'string',  enum: ['expense', 'income'], description: 'نوع العملية: expense = مصروف، income = دخل' },
        category:   { type: 'string',  description: `التصنيف – القائمة المعتمدة: ${CATEGORY_NAMES.join('، ')}. استخدم واحداً منها دائماً. مسموح بتصنيف جديد فقط لو اقترحته على المستخدم ووافق صراحة (مثال: "بقالة" يقترح ولا يُحفظ إلا بـ"أيوه").` },
        note:       { type: 'string',  description: 'ملاحظة اختيارية عن العملية' },
        happened_at:{ type: 'string',  description: 'تاريخ ووقت العملية بصيغة ISO 8601 (اختياري، لو مش موجود استخدم الوقت الحالي)' },
        currency:   { type: 'string',  description: 'العملة (افتراضي: EGP)', default: 'EGP' },
      },
      required: ['amount', 'type', 'category'],
    },
    /** @param {object} args @param {{ userId: string }} ctx */
    async execute(args, ctx) {
      const [row] = await db.insert(expenses).values({
        user_id:    ctx.userId,
        amount:     String(Math.abs(args.amount)),
        type:       args.type,
        category:   args.category,
        note:       args.note ?? null,
        currency:   args.currency ?? 'EGP',
        happened_at: args.happened_at ? new Date(args.happened_at) : new Date(),
      }).returning();
      const verb = args.type === 'income' ? 'دخل' : 'مصروف';
      return { ok: true, id: row.id, message: `تم تسجيل ${verb}: ${args.amount} ${args.currency ?? 'EGP'} – ${args.category}` };
    },
  },

  {
    name: 'list_expenses',
    description: 'يعرض قائمة المصروفات والدخل للمستخدم. استخدمه لما يسأل عن مصاريفه أو دخله.',
    parameters: {
      type: 'object',
      properties: {
        from:     { type: 'string', description: 'تاريخ بداية الفترة ISO 8601 (اختياري)' },
        to:       { type: 'string', description: 'تاريخ نهاية الفترة ISO 8601 (اختياري)' },
        type:     { type: 'string', enum: ['expense', 'income', 'all'], description: 'نوع العملية (افتراضي: all)' },
        category: { type: 'string', description: 'تصفية حسب التصنيف (اختياري)' },
        limit:    { type: 'number', description: 'عدد النتائج (افتراضي: 20)' },
      },
      required: [],
    },
    async execute(args, ctx) {
      const conditions = [eq(expenses.user_id, ctx.userId)];
      if (args.from) conditions.push(gte(expenses.happened_at, new Date(args.from)));
      if (args.to)   conditions.push(lte(expenses.happened_at, new Date(args.to)));
      if (args.type && args.type !== 'all') conditions.push(eq(expenses.type, args.type));
      if (args.category) conditions.push(eq(expenses.category, args.category));

      const rows = await db.select().from(expenses)
        .where(and(...conditions))
        .orderBy(desc(expenses.happened_at))
        .limit(args.limit ?? 20);

      if (rows.length === 0) return { ok: true, data: [], message: 'مفيش مصروفات مسجلة في الفترة دي.' };

      const total = rows.reduce((s, r) => {
        return r.type === 'expense' ? s - Number(r.amount) : s + Number(r.amount);
      }, 0);

      return { ok: true, data: rows, total, message: `${rows.length} عملية، الرصيد الصافي: ${total.toFixed(2)} ${rows[0].currency}` };
    },
  },

  {
    name: 'get_expenses_summary',
    description: 'ملخص إجمالي المصروفات والدخل حسب التصنيف. استخدمه لما يسأل "كم صرفت؟" أو "إيه أكتر حاجة اشتريتها؟".',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'تاريخ بداية ISO 8601 (اختياري، افتراضي: بداية الشهر الحالي)' },
        to:   { type: 'string', description: 'تاريخ نهاية ISO 8601 (اختياري)' },
      },
      required: [],
    },
    async execute(args, ctx) {
      const from = args.from ? new Date(args.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const to   = args.to ? new Date(args.to) : new Date();

      const rows = await db
        .select({
          type:     expenses.type,
          category: expenses.category,
          total:    sql`SUM(${expenses.amount})`.mapWith(Number),
          count:    sql`COUNT(*)`.mapWith(Number),
        })
        .from(expenses)
        .where(and(
          eq(expenses.user_id, ctx.userId),
          gte(expenses.happened_at, from),
          lte(expenses.happened_at, to),
        ))
        .groupBy(expenses.type, expenses.category)
        .orderBy(desc(sql`SUM(${expenses.amount})`));

      const totalExpense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.total, 0);
      const totalIncome  = rows.filter(r => r.type === 'income').reduce((s, r) => s + r.total, 0);

      return { ok: true, data: rows, totalExpense, totalIncome, net: totalIncome - totalExpense };
    },
  },
];
