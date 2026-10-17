// transcript-rules.js
// Rule-based post-processing for Egyptian-Arabic speech transcripts (no AI calls, zero cost).
// Pipeline: junk/hallucination filter -> loop collapse -> personal vocabulary -> spelling fixes
//           -> time expressions -> spoken numbers -> digits.
// Conservative by design: ambiguous single words (واحد، ست، ميه، ألف...) are converted
// only when a context word (جنيه، كيلو، ساعة...) sits next to them.

// ---------- normalization ----------
const MARKS = /[\u064B-\u065F\u0670\u0640]/g;
export function norm(s) {
  return String(s)
    .replace(MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

const TOKEN_RE = /^([^\p{L}\p{M}\p{N}]*)([\p{L}\p{M}\p{N}]+)([^\p{L}\p{M}\p{N}]*)$/u;

function tokenize(text) {
  return String(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const m = TOKEN_RE.exec(raw);
      return m ? { pre: m[1], core: m[2], post: m[3], raw } : { pre: '', core: null, post: '', raw };
    });
}

function join(tokens) {
  return tokens
    .map((t) => (t.core === null ? t.raw : t.pre + t.core + t.post))
    .join(' ')
    .trim();
}

// ---------- lexicon ----------
const L = new Map();
const add = (words, entry) =>
  words.split(' ').forEach((w) => L.set(norm(w), entry));

add('واحد واحده', { t: 'unit', v: 1 });
add('اتنين اثنين اثنان اتنان', { t: 'unit', v: 2 });
add('تلاته ثلاثه تلات ثلاث', { t: 'unit', v: 3 });
add('اربعه اربع', { t: 'unit', v: 4 });
add('خمسه خمس', { t: 'unit', v: 5 });
add('سته ست', { t: 'unit', v: 6 });
add('سبعه سبع', { t: 'unit', v: 7 });
add('تمانيه ثمانيه تماني ثماني ثمان', { t: 'unit', v: 8 });
add('تسعه تسع', { t: 'unit', v: 9 });
add('عشره عشر', { t: 'unit', v: 10 });

add('احداشر حداشر احدعشر', { t: 'teen', v: 11 });
add('اتناشر اثناعشر اثنعشر', { t: 'teen', v: 12 });
add('تلتاشر تلاتاشر ثلاثهعشر', { t: 'teen', v: 13 });
add('اربعتاشر', { t: 'teen', v: 14 });
add('خمستاشر', { t: 'teen', v: 15 });
add('ستاشر', { t: 'teen', v: 16 });
add('سبعتاشر', { t: 'teen', v: 17 });
add('تمنتاشر تمانتاشر', { t: 'teen', v: 18 });
add('تسعتاشر', { t: 'teen', v: 19 });

add('عشرين عشرون', { t: 'ten', v: 20 });
add('تلاتين ثلاثين', { t: 'ten', v: 30 });
add('اربعين', { t: 'ten', v: 40 });
add('خمسين', { t: 'ten', v: 50 });
add('ستين', { t: 'ten', v: 60 });
add('سبعين', { t: 'ten', v: 70 });
add('تمانين ثمانين', { t: 'ten', v: 80 });
add('تسعين', { t: 'ten', v: 90 });

add('ميه ميت مايه مئه', { t: 'hundw', v: 100 });
add('ميتين مئتين ماتين', { t: 'hund', v: 200 });
add('تلتميه تلاتميه ثلاثمايه ثلاثميه', { t: 'hund', v: 300 });
add('ربعميه اربعميه اربعمايه', { t: 'hund', v: 400 });
add('خمسميه خمسمايه', { t: 'hund', v: 500 });
add('ستميه ستمايه', { t: 'hund', v: 600 });
add('سبعميه سبعمايه', { t: 'hund', v: 700 });
add('تمنميه تمانميه ثمانمايه ثمانميه', { t: 'hund', v: 800 });
add('تسعميه تسعمايه', { t: 'hund', v: 900 });

add('الف', { t: 'multk', plural: false });
add('الاف تلاف', { t: 'multk', plural: true });
add('الفين', { t: 'fixk', v: 2000 });
add('مليون', { t: 'multm', plural: false });
add('ملايين', { t: 'multm', plural: true });
add('مليونين', { t: 'fixm', v: 2000000 });

// fractions: value is a fraction of the last magnitude (ونص after ألفين = 500)
const FR = new Map([
  ['نص', 0.5],
  ['نصف', 0.5],
  ['ربع', 0.25],
]);
const isNum = (k) => L.has(k) || FR.has(k);

// words that make a bare single number word safe to convert
const CONTEXT = new Set(
  (
    'جنيه جنيها جنيهات ج دولار ريال درهم دينار يورو قرش ' +
    'كيلو كيلوجرام جرام لتر متر كيلومتر كم ' +
    'ساعه ساعات الساعه دقيقه دقايق دقائق يوم ايام اسبوع اسابيع شهر شهور سنه سنين ' +
    'مره مرات قطعه قطع حبه حبات علبه كيس اكياس كوب اكواب طبق اطباق وجبه وجبات رقم'
  )
    .split(' ')
    .map(norm)
);

// ---------- token annotation ----------
function annotate(tokens) {
  for (const t of tokens) {
    t.absorbed = false;
    t.waw = false;
    if (t.core === null) continue;
    t.n = norm(t.core);
    t.key = t.n;
    if (t.n.length > 1 && t.n[0] === 'و' && !isNum(t.n)) {
      const rest = t.n.slice(1);
      if (isNum(rest)) {
        t.waw = true;
        t.key = rest;
      }
    }
  }
  // a lone "و" before a number word acts as the connector of that word
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const nx = tokens[i + 1];
    if (t.core !== null && t.n === 'و' && !t.pre && !t.post && nx.core !== null && !nx.pre && !nx.waw && isNum(nx.key)) {
      t.absorbed = true;
      nx.waw = true;
    }
  }
  return tokens;
}

// ---------- spoken number parser ----------
// Returns { value, end, count, first } or null. `end` is exclusive.
function parseNumberAt(tokens, i, opts = {}) {
  let j = i;
  let done = 0; // completed thousands / millions
  let g = 0; // current group below 1000
  let lastMag = 1;
  let lastType = null;
  let lastUnitVal = 0;
  let count = 0;
  let consumedEnd = i;
  let firstKey = null;
  const afterBig = ['hund', 'hundw', 'fixk', 'multk', 'fixm', 'multm'];
  const afterBigNoHund = ['fixk', 'multk', 'fixm', 'multm'];

  while (j < tokens.length) {
    const t = tokens[j];
    if (t.absorbed) {
      j++;
      continue;
    }
    if (t.core === null) break;
    if (count > 0 && t.pre) break;
    const e = L.get(t.key);
    const fr = FR.get(t.key);
    if (!e && fr === undefined) break;
    if (t.waw && count === 0 && !opts.allowLeadingWaw) break;

    if (fr !== undefined) {
      if (opts.noFractions || count === 0 || !t.waw || lastType === 'frac') break;
      const val = fr * lastMag;
      if (val >= 1000) done += val;
      else g += val;
      lastType = 'frac';
      count++;
      consumedEnd = j + 1;
      j++;
      break;
    }

    let ok = true;
    switch (e.t) {
      case 'unit':
        if (count === 0) {
          g += e.v;
          lastUnitVal = e.v;
        } else if (t.waw && afterBig.includes(lastType)) {
          g += e.v;
          lastUnitVal = e.v;
        } else ok = false;
        lastMag = 1;
        break;
      case 'teen':
        if (count === 0 || (t.waw && afterBig.includes(lastType))) g += e.v;
        else ok = false;
        lastMag = 1;
        break;
      case 'ten':
        if (count === 0) g += e.v;
        else if (t.waw && lastType === 'unit' && lastUnitVal <= 9 && g % 100 === lastUnitVal) g += e.v;
        else if (t.waw && afterBig.includes(lastType)) g += e.v;
        else ok = false;
        lastMag = 1;
        break;
      case 'hund':
        if (count === 0 || (t.waw && afterBigNoHund.includes(lastType))) g += e.v;
        else ok = false;
        lastMag = 100;
        break;
      case 'hundw':
        if (count === 0) g += 100;
        else if (lastType === 'unit' && !t.waw && lastUnitVal >= 3 && lastUnitVal <= 9 && g === lastUnitVal) {
          g = lastUnitVal * 100;
        } else if (t.waw && afterBigNoHund.includes(lastType)) g += 100;
        else ok = false;
        lastMag = 100;
        break;
      case 'fixk':
        if ((count === 0 || (t.waw && (lastType === 'fixm' || lastType === 'multm'))) && g === 0) done += e.v;
        else ok = false;
        lastMag = 1000;
        break;
      case 'multk':
        if (g > 0) {
          done += g * 1000;
          g = 0;
        } else if (!e.plural && (count === 0 || t.waw)) {
          done += 1000;
        } else ok = false;
        lastMag = 1000;
        break;
      case 'fixm':
        if (count === 0 && g === 0) done += e.v;
        else ok = false;
        lastMag = 1000000;
        break;
      case 'multm':
        if (g > 0) {
          done += g * 1000000;
          g = 0;
        } else if (!e.plural && (count === 0 || t.waw)) {
          done += 1000000;
        } else ok = false;
        lastMag = 1000000;
        break;
      default:
        ok = false;
    }
    if (!ok) break;
    lastType = e.t;
    if (count === 0) firstKey = t.key;
    count++;
    consumedEnd = j + 1;
    j++;
    if (t.post) break;
  }
  if (count === 0) return null;
  return { value: done + g, end: consumedEnd, count, firstKey };
}

function fmtNumber(v) {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
}

function spanReplace(tokens, start, end, text) {
  const first = tokens[start];
  const last = tokens[end - 1];
  const tok = { pre: first.pre, core: text, post: last.post, raw: text };
  return { start, end, tok };
}

function applyReplacements(tokens, reps) {
  if (!reps.length) return tokens;
  reps.sort((a, b) => a.start - b.start);
  const out = [];
  let i = 0;
  for (const r of reps) {
    while (i < r.start) out.push(tokens[i++]);
    out.push(r.tok);
    i = r.end;
  }
  while (i < tokens.length) out.push(tokens[i++]);
  return out;
}

// ---------- stage: digits ----------
function toWesternDigits(text) {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, '');
}

// ---------- stage: junk / hallucinations ----------
// Known Whisper hallucinations on silence or noise in Arabic. Extend this list from your own logs.
const JUNK_PHRASES = [
  'ترجمة نانسي قنقر',
  'ترجمه نانسي قنقر',
  'اشتركوا في القناة',
  'اشتركوا في القناه',
  'اشترك في القناة',
  'اشترك في القناه',
  'لا تنسوا الاشتراك في القناة',
  'لا تنسى الاشتراك في القناة',
  'شكرا للمشاهدة',
  'شكرا على المشاهدة',
  'شكرا لمشاهدتكم',
  'تابعونا على',
].map((p) => p.split(' ').map(norm));

function removeJunk(tokens, changes) {
  let cur = tokens;
  let again = true;
  while (again) {
    again = false;
    annotate(cur);
    const words = cur.filter((t) => t.core !== null);
    for (const ph of JUNK_PHRASES) {
      const L2 = ph.length;
      if (words.length < L2) continue;
      const tail = words.slice(words.length - L2).map((t) => t.n);
      const head = words.slice(0, L2).map((t) => t.n);
      if (tail.every((w, k) => w === ph[k])) {
        const removed = cur.splice(cur.length - L2, L2);
        changes.push({ rule: 'junk', from: join(removed), to: '' });
        again = true;
        break;
      }
      if (head.every((w, k) => w === ph[k])) {
        const removed = cur.splice(0, L2);
        changes.push({ rule: 'junk', from: join(removed), to: '' });
        again = true;
        break;
      }
    }
  }
  return cur;
}

// ---------- stage: repetition loops ----------
function collapseLoops(tokens, changes) {
  annotate(tokens);
  let cur = tokens;
  for (let n = 1; n <= 8; n++) {
    let i = 0;
    const out = [];
    while (i < cur.length) {
      let reps = 1;
      while (i + (reps + 1) * n <= cur.length) {
        let same = true;
        for (let k = 0; k < n; k++) {
          const a = cur[i + k];
          const b = cur[i + reps * n + k];
          if (a.core === null || b.core === null || norm(a.core) !== norm(b.core)) {
            same = false;
            break;
          }
        }
        if (!same) break;
        reps++;
      }
      if (reps >= 3) {
        changes.push({ rule: 'loop', from: join(cur.slice(i, i + reps * n)), to: join(cur.slice(i, i + n)) });
        for (let k = 0; k < n; k++) out.push(cur[i + k]);
        i += reps * n;
      } else {
        out.push(cur[i++]);
      }
    }
    cur = out;
  }
  return cur;
}

// ---------- stage: personal vocabulary ----------
function lev1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  if (a.length > b.length) return a.slice(i + 1) === b.slice(i);
  return b.slice(i + 1) === a.slice(i);
}

// vocabulary: [{ term: 'مريم', misheard: ['مريام', 'ميريم'] }]
function applyVocabulary(tokens, vocabulary, fuzzy, changes) {
  if (!vocabulary || !vocabulary.length) return tokens;
  annotate(tokens);
  const phrases = [];
  for (const v of vocabulary) {
    for (const m of v.misheard || []) {
      const words = String(m).split(/\s+/).filter(Boolean).map(norm);
      if (words.length) phrases.push({ words, term: v.term });
    }
  }
  phrases.sort((a, b) => b.words.length - a.words.length);
  const singles = vocabulary
    .map((v) => ({ term: v.term, n: norm(v.term) }))
    .filter((v) => !/\s/.test(v.term) && v.n.length >= 5);

  const reps = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    let hit = false;
    for (const p of phrases) {
      const L2 = p.words.length;
      if (i + L2 > tokens.length) continue;
      let ok = true;
      for (let k = 0; k < L2; k++) {
        const x = tokens[i + k];
        if (x.core === null || x.n !== p.words[k] || (k < L2 - 1 && x.post)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const r = spanReplace(tokens, i, i + L2, p.term);
        changes.push({ rule: 'vocabulary', from: join(tokens.slice(i, i + L2)), to: p.term });
        reps.push(r);
        i += L2;
        hit = true;
        break;
      }
    }
    if (hit) continue;
    if (fuzzy && t.core !== null && t.n.length >= 5) {
      const m = singles.find((s) => s.n !== t.n && lev1(s.n, t.n));
      const exact = singles.some((s) => s.n === t.n);
      if (m && !exact) {
        changes.push({ rule: 'vocabulary-fuzzy', from: t.core, to: m.term });
        reps.push(spanReplace(tokens, i, i + 1, m.term));
      }
    }
    i++;
  }
  return applyReplacements(tokens, reps);
}

// ---------- stage: spelling fixes ----------
const SPELLING = new Map(
  Object.entries({
    جنية: 'جنيه',
    جنيها: 'جنيه',
    ميتينج: 'ميتنج',
    ميتينغ: 'ميتنج',
    ميتنغ: 'ميتنج',
  }).map(([k, v]) => [norm(k), v])
);

function fixSpellings(tokens, changes) {
  annotate(tokens);
  for (const t of tokens) {
    if (t.core === null) continue;
    const fix = SPELLING.get(t.n);
    if (fix && fix !== t.core) {
      changes.push({ rule: 'spelling', from: t.core, to: fix });
      t.core = fix;
    }
  }
  return tokens;
}

// ---------- stage: time expressions ----------
const TIME_FR = new Map([
  ['ربع', 15],
  ['نص', 30],
  ['نصف', 30],
  ['تلت', 20],
  ['ثلث', 20],
]);

function skipAbsorbed(tokens, j) {
  while (j < tokens.length && tokens[j].absorbed) j++;
  return j;
}

function parseMinutes(tokens, j, requireWaw) {
  j = skipAbsorbed(tokens, j);
  const t = tokens[j];
  if (!t || t.core === null) return null;
  if (requireWaw && !t.waw) return null;
  if (j > 0 && t.pre) return null;
  if (TIME_FR.has(t.key)) return { value: TIME_FR.get(t.key), end: j + 1 };
  const r = parseNumberAt(tokens, j, { noFractions: true, allowLeadingWaw: true });
  if (r && Number.isInteger(r.value) && r.value >= 1 && r.value <= 59) return { value: r.value, end: r.end };
  return null;
}

function convertTimes(tokens, changes) {
  annotate(tokens);
  const reps = [];
  const used = new Set();
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.core === null || t.n !== 'الساعه' || t.post) continue;
    const hs = skipAbsorbed(tokens, k + 1);
    const hr = parseNumberAt(tokens, hs, { noFractions: true });
    if (!hr || !Number.isInteger(hr.value) || hr.value < 1 || hr.value > 12) continue;
    let h = hr.value;
    let m = 0;
    let j = hr.end;
    let usedMod = false;
    const last = tokens[hr.end - 1];
    if (!last.post) {
      const plus = parseMinutes(tokens, j, true);
      if (plus) {
        m = plus.value;
        j = plus.end;
        usedMod = true;
      }
      const jj = skipAbsorbed(tokens, j);
      const mt = tokens[jj];
      if (mt && mt.core !== null && mt.key === 'الا' && !mt.pre && !tokens[jj - 1].post) {
        const minus = parseMinutes(tokens, jj + 1, false);
        if (minus) {
          if (usedMod) m -= minus.value;
          else {
            m = 60 - minus.value;
            h = h === 1 ? 12 : h - 1;
          }
          j = minus.end;
          usedMod = true;
        }
      }
    }
    if (!usedMod || m < 0 || m > 59) continue;
    const text = `${h}:${String(m).padStart(2, '0')}`;
    const r = spanReplace(tokens, hs, j, text);
    changes.push({ rule: 'time', from: join(tokens.slice(hs, j)), to: text });
    reps.push(r);
    for (let x = hs; x < j; x++) used.add(x);
    k = j - 1;
  }
  return applyReplacements(tokens, reps);
}

// ---------- stage: spoken numbers ----------
const NEEDS_CONTEXT = (e) =>
  e.t === 'unit' || e.t === 'hundw' || (e.t === 'multk' && !e.plural) || (e.t === 'multm' && !e.plural);

function convertNumbers(tokens, changes) {
  annotate(tokens);
  const reps = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.absorbed || t.core === null || t.waw || !isNum(t.key) || FR.has(t.key)) {
      i++;
      continue;
    }
    const run = parseNumberAt(tokens, i);
    if (!run) {
      i++;
      continue;
    }
    let convert = true;
    if (run.count === 1) {
      const e = L.get(run.firstKey);
      if (e && NEEDS_CONTEXT(e)) {
        const prev = tokens[i - 1];
        const next = tokens[run.end];
        const prevCtx = prev && prev.core !== null && !prev.post && CONTEXT.has(prev.key);
        const nextCtx = next && next.core !== null && !tokens[run.end - 1].post && CONTEXT.has(next.key);
        convert = Boolean(prevCtx || nextCtx);
      }
    }
    if (convert) {
      const text = fmtNumber(run.value);
      changes.push({ rule: 'number', from: join(tokens.slice(i, run.end)), to: text });
      reps.push(spanReplace(tokens, i, run.end, text));
    }
    i = run.end;
  }
  return applyReplacements(tokens, reps);
}

// ---------- public API ----------
export function applyTranscriptRules(text, { vocabulary = [], fuzzy = false } = {}) {
  const changes = [];
  let s = toWesternDigits(String(text || ''));
  s = s.replace(/[\[\(]\s*(موسيقى|موسيقي|تصفيق|ضحك)\s*[\]\)]/g, ' ').replace(/[♪♫]/g, ' ');
  let tokens = tokenize(s);
  tokens = removeJunk(tokens, changes);
  tokens = collapseLoops(tokens, changes);
  tokens = applyVocabulary(tokens, vocabulary, fuzzy, changes);
  tokens = fixSpellings(tokens, changes);
  tokens = convertTimes(tokens, changes);
  tokens = convertNumbers(tokens, changes);
  return { text: join(tokens), changes };
}

export { parseNumberAt as _parseNumberAt, tokenize as _tokenize, annotate as _annotate };
