import assert from 'node:assert/strict';
import { applyTranscriptRules } from '../src/providers/stt/transcript-rules.js';

const cases = [
  // [input, expected, options?]
  // --- amounts ---
  ['صرفت تلتمية وخمسين جنيه', 'صرفت 350 جنيه'],
  ['دفعت ألفين ونص', 'دفعت 2500'],
  ['مية ونص جنيه', '150 جنيه'],
  ['خمسة وعشرين جنيه', '25 جنيه'],
  ['عشرين جنيه', '20 جنيه'],
  ['تلات تلاف وخمسمية', '3500'],
  ['ألف وخمسمية جنيه', '1500 جنيه'],
  ['مية وخمسين الف', '150000'],
  ['مليون ونص', '1500000'],
  ['اتنين ونص كيلو طماطم', '2.5 كيلو طماطم'],
  ['اتنين كيلو طماطم', '2 كيلو طماطم'],
  ['ست جنيه', '6 جنيه'],
  ['ميه جنيه', '100 جنيه'],
  ['ميتين جنيه', '200 جنيه'],
  ['الف جنيه', '1000 جنيه'],
  ['حداشر جنيه', '11 جنيه'],
  ['مية وخمسة وعشرين جنيه', '125 جنيه'],
  ['صرفت خمسين جنيه، ودفعت تلاتين', 'صرفت 50 جنيه، ودفعت 30'],
  // --- must stay unchanged (ambiguous words without context) ---
  ['واحد صاحبي كلمني', 'واحد صاحبي كلمني'],
  ['الاتنين الجاي عندي ميتنج', 'الاتنين الجاي عندي ميتنج'],
  ['شربت ميه كتير', 'شربت ميه كتير'],
  ['ألف شكر ليك', 'ألف شكر ليك'],
  ['الست اللي جنبنا', 'الست اللي جنبنا'],
  // --- time ---
  ['الساعة خمسة إلا ربع', 'الساعة 4:45'],
  ['الساعة ستة ونص', 'الساعة 6:30'],
  ['الساعة تمانية وربع', 'الساعة 8:15'],
  ['الساعة واحدة إلا تلت', 'الساعة 12:40'],
  ['الساعة ستة ونص إلا خمسة', 'الساعة 6:25'],
  ['الساعة ستة وخمسة وعشرين', 'الساعة 6:25'],
  ['ميتنج الساعة خمسة', 'ميتنج الساعة 5'],
  // --- digits ---
  ['دفعت ٣٥٠ جنيه', 'دفعت 350 جنيه'],
  // --- hallucinations and loops ---
  ['ترجمة نانسي قنقر', ''],
  ['صرفت عشرين جنيه اشتركوا في القناة', 'صرفت 20 جنيه'],
  ['جنيه جنيه جنيه جنيه', 'جنيه'],
  // --- spelling ---
  ['دفعت عشرين جنية', 'دفعت 20 جنيه'],
];

let pass = 0;
const fails = [];
for (const [input, expected, opts] of cases) {
  const { text } = applyTranscriptRules(input, opts);
  if (text === expected) pass++;
  else fails.push({ input, expected, got: text });
}

// vocabulary
{
  const vocab = [{ term: 'مريم', misheard: ['مريام', 'ميريم'] }, { term: 'سيدي بشر', misheard: ['سيدي بشير'] }];
  const r1 = applyTranscriptRules('كلمت مريام امبارح', { vocabulary: vocab });
  const r2 = applyTranscriptRules('رحت سيدي بشير', { vocabulary: vocab });
  const r3 = applyTranscriptRules('كلمت مريمم', { vocabulary: [{ term: 'مريمم', misheard: [] }, { term: 'محمودد', misheard: [] }], fuzzy: true });
  const vcases = [
    [r1.text, 'كلمت مريم امبارح'],
    [r2.text, 'رحت سيدي بشر'],
  ];
  for (const [got, expected] of vcases) {
    if (got === expected) pass++;
    else fails.push({ input: 'vocabulary', expected, got });
  }
  void r3;
}

const total = cases.length + 2;
console.log(`passed ${pass}/${total}`);
if (fails.length) {
  for (const f of fails) console.log('FAIL', JSON.stringify(f));
  process.exit(1);
}
