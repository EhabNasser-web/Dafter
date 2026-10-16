/**
 * scripts/stt-benchmark.js
 * Measures the effect of the lexicon prompt, personal vocabulary and the
 * reviewer on transcription quality – with and without each layer.
 *
 * Usage:
 *   node --env-file=.env scripts/stt-benchmark.js --audio ./sample.ogg \
 *     --reference "صرفت خمسين جنيه على الأكل النهارده" \
 *     [--vocab "أحمد,المعادي,صليت"] [--reviewer groq|gemini|off] [--prompt both|default|lexicon]
 *
 * --reference enables scoring: token-F1 + numbers-preserved check.
 * Without it, outputs are printed for manual eyeballing.
 * Client-side audio-chain A/B (raw vs processed mic) is done from the app:
 * open chat, run voiceDebug(true) in the console, record once, then feed
 * BOTH downloaded blobs here with --audio to compare end-to-end.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { getSttProvider } from '../src/providers/stt/index.js';
import { buildSttPrompt } from '../src/providers/stt/prompt.js';
import { getReviewerProvider } from '../src/providers/reviewer/index.js';

const args = process.argv.slice(2);
const val = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const audioPath = val('--audio');
const reference = val('--reference') || null;
const sampleVocab = (val('--vocab') || '').split(',').map((s) => s.trim()).filter(Boolean);
const reviewerOnly = val('--reviewer'); // groq|gemini|off
const promptOnly = val('--prompt') || 'both'; // both|default|lexicon

if (!audioPath || !existsSync(audioPath)) {
  console.error('Usage: node --env-file=.env scripts/stt-benchmark.js --audio <file> [--reference "..."] [--vocab "a,b"] [--reviewer groq|gemini|off] [--prompt both|default|lexicon]');
  process.exit(1);
}

const normDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const tokens = (s) => normDigits(s).split(/\s+/).map((w) => w.replace(/[.,!?؛،؟"«»()]/g, '')).filter(Boolean);

/** Token-F1 between hypothesis and reference (0..1). */
function scoreF1(hyp, ref) {
  const h = tokens(hyp);
  const r = tokens(ref);
  if (!r.length) return null;
  const counts = new Map();
  for (const w of r) counts.set(w, (counts.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of h) {
    if ((counts.get(w) ?? 0) > 0) { hit++; counts.set(w, counts.get(w) - 1); }
  }
  if (!hit) return 0;
  const p = hit / h.length;
  const rec = hit / r.length;
  return (2 * p * rec) / (p + rec);
}

/** Are all digit sequences of the reference preserved in the hypothesis? */
function numbersPreserved(hyp, ref) {
  const nums = (s) => (normDigits(s).match(/\d+(\.\d+)?/g) || []);
  const r = nums(ref);
  if (!r.length) return null;
  const h = new Set(nums(hyp));
  const missing = r.filter((n) => !h.has(n));
  return { ok: missing.length === 0, missing };
}

const audioBuffer = await readFile(audioPath);
const ext = audioPath.split('.').pop().toLowerCase();
const mimeMap = { ogg: 'audio/ogg', mp3: 'audio/mp3', webm: 'audio/webm', wav: 'audio/wav', m4a: 'audio/mp4' };
const mimeType = mimeMap[ext] ?? 'audio/webm';
console.log(`Audio: ${audioPath} (${(audioBuffer.length / 1024).toFixed(1)} KB, ${mimeType})`);
if (reference) console.log(`Reference: "${reference}"`);
if (sampleVocab.length) console.log(`Sample vocab: ${sampleVocab.join('، ')}`);

const promptModes = [];
if (promptOnly === 'both' || promptOnly === 'default') promptModes.push({ name: 'prompt=default', prompt: undefined });
if (promptOnly === 'both' || promptOnly === 'lexicon') {
  promptModes.push({ name: 'prompt=lexicon+vocab', prompt: buildSttPrompt({ personalTerms: sampleVocab }) });
}

const reviewerModes = reviewerOnly
  ? [reviewerOnly]
  : ['off', process.env.REVIEWER_PROVIDER ?? 'groq'];

const stt = getSttProvider();
const results = [];

for (const pm of promptModes) {
  console.log(`\n── STT [${pm.name}] ${pm.prompt ? `(${(pm.prompt.length)} chars)` : '(provider default)'}`);
  let raw;
  try {
    const out = await stt(audioBuffer, mimeType, `bench.${ext}`, pm.prompt ? { prompt: pm.prompt } : {});
    raw = out.text;
    console.log(`   raw (${out.durationSeconds}s): "${raw}"`);
  } catch (err) {
    console.error(`   ❌ STT failed: ${err.message}`);
    continue;
  }

  for (const rm of reviewerModes) {
    let final = raw;
    let label = `reviewer=${rm}`;
    if (rm !== 'off') {
      try {
        process.env.REVIEWER_PROVIDER = rm;
        const reviewer = getReviewerProvider();
        final = await reviewer(raw, { vocabularyText: sampleVocab.join('، ') });
        console.log(`   [${label}]: "${final}"`);
      } catch (err) {
        console.error(`   ❌ reviewer(${rm}) failed: ${err.message} – keeping raw`);
      }
    } else {
      console.log(`   [${label}]: (raw kept)`);
    }
    const row = { prompt: pm.name, reviewer: rm, text: final };
    if (reference) {
      row.f1 = scoreF1(final, reference);
      row.numbers = numbersPreserved(final, reference);
    }
    results.push(row);
  }
}

if (reference && results.length) {
  console.log('\n═══════════════ SCORES (higher F1 = better) ═══════════════');
  for (const r of results) {
    const f1 = r.f1 === null ? 'n/a' : r.f1.toFixed(3);
    const nums = r.numbers === null ? 'n/a' : (r.numbers.ok ? 'ok' : `MISSING ${r.numbers.missing.join(',')}`);
    console.log(`  ${r.prompt} + ${r.reviewer} → F1=${f1} numbers=${nums}`);
  }
}
console.log('\n✅  Benchmark complete.');
