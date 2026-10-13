/**
 * scripts/test-providers.js
 * End-to-end test of the three provider layers:
 *   1. STT  – Groq Whisper (if --audio flag provided)
 *   2. Reviewer – Gemini (corrects Egyptian Arabic)
 *   3. LLM  – Groq chat (basic Arabic conversation)
 *
 * Usage:
 *   node --env-file=.env scripts/test-providers.js
 *   node --env-file=.env scripts/test-providers.js --audio ./sample.ogg
 *
 * If no --audio flag, Stage 1 is skipped and Stage 2 uses a hardcoded
 * sample transcript with intentional STT-style typos.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { getSttProvider } from '../src/providers/stt/index.js';
import { getReviewerProvider } from '../src/providers/reviewer/index.js';
import { getLlmProvider } from '../src/providers/llm/index.js';
import { GROQ_MODELS } from '../src/providers/llm/groq.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const audioFlagIdx = args.indexOf('--audio');
const audioPath = audioFlagIdx !== -1 ? args[audioFlagIdx + 1] : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function ok(label, value) {
  console.log(`✅  ${label}:`);
  console.log(`    ${String(value).replace(/\n/g, '\n    ')}`);
}

function fail(label, err) {
  console.error(`❌  ${label}: ${err.message}`);
}

// ─── STAGE 1: STT (Groq Whisper) ─────────────────────────────────────────────
section('Stage 1 – STT (Groq Whisper)');

let rawTranscript = null;

if (audioPath) {
  if (!existsSync(audioPath)) {
    console.error(`Audio file not found: ${audioPath}`);
    process.exit(1);
  }
  try {
    const audioBuffer = await readFile(audioPath);
    const ext = audioPath.split('.').pop().toLowerCase();
    const mimeMap = { ogg: 'audio/ogg', mp3: 'audio/mp3', webm: 'audio/webm', wav: 'audio/wav', m4a: 'audio/mp4' };
    const mimeType = mimeMap[ext] ?? 'audio/webm';

    console.log(`⏳  Transcribing ${audioPath} (${(audioBuffer.length / 1024).toFixed(1)} KB)…`);
    const stt = getSttProvider();
    const result = await stt(audioBuffer, mimeType, `audio.${ext}`);
    rawTranscript = result.text;

    ok('Transcript', result.text);
    ok('Language', result.language);
    ok('Duration', `${result.durationSeconds}s`);
  } catch (err) {
    fail('STT', err);
    process.exit(1);
  }
} else {
  // Use a hardcoded sample with intentional STT errors for testing the reviewer
  rawTranscript = 'دفعت تمنين جنيه على الادام النهاردة والبقية على القهوة';
  console.log('ℹ️   No --audio flag. Using hardcoded sample transcript:');
  console.log(`    "${rawTranscript}"`);
}

// ─── STAGE 2: Reviewer (Gemini) ───────────────────────────────────────────────
section('Stage 2 – Reviewer (Google Gemini)');

let reviewedTranscript = rawTranscript;

try {
  console.log('⏳  Reviewing transcript…');
  const reviewer = getReviewerProvider();
  reviewedTranscript = await reviewer(rawTranscript);

  ok('Raw', rawTranscript);
  ok('Reviewed', reviewedTranscript);

  if (rawTranscript === reviewedTranscript) {
    console.log('    ℹ️   No changes (text was already correct)');
  }
} catch (err) {
  fail('Reviewer', err);
  console.log('    ⚠️   Continuing with raw transcript…');
  reviewedTranscript = rawTranscript;
}

// ─── STAGE 3: LLM (Groq) – test on two models ────────────────────────────────
section('Stage 3 – LLM (Groq) – two models comparison');

const testModels = [
  { label: 'Fast  (8B)', model: GROQ_MODELS.fast  },
  { label: 'Smart (70B)', model: GROQ_MODELS.smart },
];

const systemPrompt = `أنت مساعد «دفتر» الشخصي. ردودك دايماً بالعامية المصرية القصيرة.`;
const userMessage = reviewedTranscript;

const llm = getLlmProvider();

for (const { label, model } of testModels) {
  try {
    console.log(`\n⏳  Testing model: ${label} (${model})…`);

    const completion = await llm({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage   },
      ],
      maxTokens: 200,
    });

    const reply = completion.choices[0]?.message?.content ?? '(no content)';
    const usage = completion.usage;

    ok(`[${label}] Reply`, reply);
    console.log(`    Tokens: prompt=${usage?.prompt_tokens} completion=${usage?.completion_tokens}`);
  } catch (err) {
    fail(`[${label}] LLM`, err);
  }
}

// ─── Done ─────────────────────────────────────────────────────────────────────
section('Done');
console.log('✅  Provider chain test complete.\n');
