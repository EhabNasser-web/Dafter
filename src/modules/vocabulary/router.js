/**
 * src/modules/vocabulary/router.js
 * Voice personal vocabulary CRUD. Auto-mounted at /api/vocabulary.
 *
 *   GET    /api/vocabulary[?category=people|places|actions&search=...]
 *   POST   /api/vocabulary          { category, term, note? }
 *   PATCH  /api/vocabulary/:id      { term?, note? }
 *   DELETE /api/vocabulary/:id
 */

import { Router } from 'express';
import { requireAuth } from '../../core/auth.js';
import {
  listVocabulary,
  addVocabulary,
  updateVocabulary,
  deleteVocabulary,
  VOCAB_CATEGORIES,
  VOCAB_CATEGORY_LABELS,
} from '../../core/vocabulary.js';

export const router = Router();

router.get('/meta', requireAuth, (_req, res) => {
  res.json({
    ok: true,
    categories: VOCAB_CATEGORIES.map((c) => ({ id: c, label: VOCAB_CATEGORY_LABELS[c] })),
  });
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await listVocabulary(req.session.userId, {
      category: req.query.category,
      search: req.query.search,
    });
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[vocab/list]', err.message);
    res.status(500).json({ error: 'خطأ في تحميل المفردات.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const result = await addVocabulary(req.session.userId, {
      category: req.body.category,
      term: req.body.term,
      note: req.body.note,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.status(201).json({ ok: true, data: result.entry });
  } catch (err) {
    console.error('[vocab/create]', err.message);
    res.status(500).json({ error: 'خطأ في حفظ المفردة.' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const result = await updateVocabulary(req.session.userId, req.params.id, {
      term: req.body.term,
      note: req.body.note,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, data: result.entry });
  } catch (err) {
    console.error('[vocab/update]', err.message);
    res.status(500).json({ error: 'خطأ في تعديل المفردة.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await deleteVocabulary(req.session.userId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[vocab/delete]', err.message);
    res.status(500).json({ error: 'خطأ في حذف المفردة.' });
  }
});
