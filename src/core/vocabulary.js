/**
 * src/core/vocabulary.js
 * Per-user voice vocabulary + transcript corrections (text only, never audio).
 * - vocabulary feeds the STT prompt and the reviewer message
 * - edited drafts are stored as corrections; a repeated correction is
 *   promoted into the vocabulary as source 'learned'
 */

import { db } from '../db/index.js';
import { userVocabulary, transcriptCorrections } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

export const VOCAB_CATEGORIES = ['people', 'places', 'actions'];
export const VOCAB_CATEGORY_LABELS = { people: 'أشخاص', places: 'أماكن', actions: 'أفعال وأنشطة' };
/** Sensible per-user cap (spec F). */
export const MAX_VOCAB_PER_USER = 200;

/** List a user's entries, optionally filtered by category or search text. */
export async function listVocabulary(userId, { category = null, search = '' } = {}) {
  const conds = [eq(userVocabulary.user_id, userId)];
  if (category && VOCAB_CATEGORIES.includes(category)) conds.push(eq(userVocabulary.category, category));
  if (search?.trim()) conds.push(sql`${userVocabulary.term} ILIKE ${'%' + search.trim() + '%'}`);
  return db.select().from(userVocabulary)
    .where(and(...conds))
    .orderBy(desc(userVocabulary.usage_count), desc(userVocabulary.updated_at))
    .limit(MAX_VOCAB_PER_USER);
}

/** Add a manual entry. Returns { ok, error?, entry? }. */
export async function addVocabulary(userId, { category, term, note = null, source = 'manual' }) {
  if (!VOCAB_CATEGORIES.includes(category)) {
    return { ok: false, error: 'التصنيف غير صالح (أشخاص، أماكن، أفعال وأنشطة).' };
  }
  const clean = String(term ?? '').trim().slice(0, 120);
  if (!clean) return { ok: false, error: 'اكتب الكلمة أو الاسم.' };
  if (!['manual', 'learned'].includes(source)) source = 'manual';

  const [{ count }] = await db.select({ count: sql`COUNT(*)` }).from(userVocabulary)
    .where(eq(userVocabulary.user_id, userId));
  if (Number(count) >= MAX_VOCAB_PER_USER) {
    return { ok: false, error: `وصلت للحد الأقصى (${MAX_VOCAB_PER_USER} مفردة). امسح القديم وضيف الجديد.` };
  }

  try {
    const [entry] = await db.insert(userVocabulary)
      .values({
        user_id: userId,
        category,
        term: clean,
        note: note ? String(note).slice(0, 255) : null,
        source,
      })
      .returning();
    return { ok: true, entry };
  } catch (err) {
    if (err.code === '23505' || err.cause?.code === '23505') return { ok: false, error: 'الكلمة دي متسجلة قبل كده في نفس التصنيف.' };
    throw err;
  }
}

/** Edit term/note of an owned entry. */
export async function updateVocabulary(userId, id, { term, note }) {
  const updates = {};
  if (term !== undefined) {
    const clean = String(term ?? '').trim().slice(0, 120);
    if (!clean) return { ok: false, error: 'الكلمة فاضية.' };
    updates.term = clean;
  }
  if (note !== undefined) updates.note = note ? String(note).slice(0, 255) : null;
  if (!Object.keys(updates).length) return { ok: false, error: 'مفيش حاجة تتعدل.' };
  updates.updated_at = new Date();
  try {
    const [entry] = await db.update(userVocabulary).set(updates)
      .where(and(eq(userVocabulary.id, id), eq(userVocabulary.user_id, userId)))
      .returning();
    if (!entry) return { ok: false, error: 'المفردة مش موجودة.' };
    return { ok: true, entry };
  } catch (err) {
    if (err.code === '23505' || err.cause?.code === '23505') return { ok: false, error: 'الكلمة دي متسجلة قبل كده في نفس التصنيف.' };
    throw err;
  }
}

/** Delete an owned entry (manual or learned). */
export async function deleteVocabulary(userId, id) {
  await db.delete(userVocabulary)
    .where(and(eq(userVocabulary.id, id), eq(userVocabulary.user_id, userId)));
  return { ok: true };
}

/** Top terms for the STT prompt, most-used first. Fire-and-forget usage bump. */
export async function topPersonalTerms(userId, limit = 12) {
  const rows = await db.select({ term: userVocabulary.term })
    .from(userVocabulary)
    .where(eq(userVocabulary.user_id, userId))
    .orderBy(desc(userVocabulary.usage_count), desc(userVocabulary.updated_at))
    .limit(limit);
  const terms = rows.map((r) => r.term);
  if (terms.length) {
    db.update(userVocabulary)
      .set({ usage_count: sql`${userVocabulary.usage_count} + 1`, updated_at: new Date() })
      .where(and(eq(userVocabulary.user_id, userId), sql`${userVocabulary.term} = ANY(${terms})`))
      .catch((err) => console.error('[vocab] usage bump failed:', err.message));
  }
  return terms;
}

/** Grouped vocabulary text for the reviewer system message. */
export async function getVocabularyText(userId) {
  const rows = await listVocabulary(userId);
  if (!rows.length) return '';
  const groups = { people: [], places: [], actions: [] };
  for (const r of rows) {
    const label = r.note ? `${r.term} (${r.note})` : r.term;
    (groups[r.category] ?? groups.actions).push(label);
  }
  const lines = [];
  for (const cat of VOCAB_CATEGORIES) {
    if (groups[cat].length) lines.push(`- ${VOCAB_CATEGORY_LABELS[cat]}: ${groups[cat].join('، ')}`);
  }
  return lines.join('\n');
}

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/** Store an edited draft as a correction; promote repeats into vocabulary. */
export async function recordCorrection(userId, rawText, correctedText) {
  const raw = norm(rawText);
  const corrected = norm(correctedText);
  if (!raw || !corrected || raw === corrected) return { ok: true, stored: false };
  if (corrected.length > 2000) return { ok: true, stored: false };

  await db.insert(transcriptCorrections).values({ user_id: userId, raw_text: raw, corrected_text: corrected });

  // Promotion: same (raw → corrected) pair seen 2+ times → learn the new word(s)
  const [{ count }] = await db.select({ count: sql`COUNT(*)` }).from(transcriptCorrections)
    .where(and(
      eq(transcriptCorrections.user_id, userId),
      eq(transcriptCorrections.raw_text, raw),
      eq(transcriptCorrections.corrected_text, corrected)
    ));
  if (Number(count) < 2) return { ok: true, stored: true, promoted: false };

  const rawWords = new Set(raw.split(' '));
  const candidate = corrected.split(' ')
    .map((w) => w.replace(/[.,!?؛،؟"«»()]/g, ''))
    .filter((w) => w && !rawWords.has(w))
    .slice(0, 3)
    .join(' ');
  if (!candidate) return { ok: true, stored: true, promoted: false };

  // Documented heuristic: new corrected words default to 'actions'
  // (most corrections in this app are verbs/activities); user can recategorize.
  const res = await addVocabulary(userId, { category: 'actions', term: candidate, note: 'اتعلم تلقائياً من تصحيحك', source: 'learned' });
  return { ok: true, stored: true, promoted: res.ok, term: res.ok ? candidate : undefined };
}
