// Builds the compact data files the app loads at runtime (public/data, public/strokes).
// Sources: CC-CEDICT (cc-cedict), HSK 3.1 syllabus (hsk3.1-syllabus),
// graded example sentences (hsk-sentences-audio, CC-BY-SA-4.0), stroke data (hanzi-writer-data).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const nm = (p) => path.join(root, 'node_modules', p);
const out = (p) => path.join(root, 'public', p);
fs.mkdirSync(out('data'), { recursive: true });
fs.mkdirSync(out('strokes'), { recursive: true });

// ---------- pinyin numbers -> tone marks ----------
const MARKS = { a: 'āáǎàa', e: 'ēéěèe', i: 'īíǐìi', o: 'ōóǒòo', u: 'ūúǔùu', ü: 'ǖǘǚǜü' };
function syllable(s) {
  const m = s.match(/^([a-zü:]+)([1-5])$/i);
  if (!m) return s.replace(/u:/g, 'ü');
  let [, body, tone] = m;
  body = body.replace(/u:/gi, 'ü').replace(/v/g, 'ü');
  const t = Number(tone) - 1;
  if (t === 4) return body;
  const lower = body.toLowerCase();
  let idx = lower.search(/[ae]/);
  if (idx < 0) idx = lower.indexOf('ou');
  if (idx < 0) {
    for (let i = lower.length - 1; i >= 0; i--) if ('iouü'.includes(lower[i])) { idx = i; break; }
  }
  if (idx < 0) return body;
  const ch = lower[idx];
  let rep = MARKS[ch][t];
  if (body[idx] !== ch) rep = rep.toUpperCase();
  return body.slice(0, idx) + rep + body.slice(idx + 1);
}
const toMarks = (p) => p.split(' ').map(syllable).join(' ');

// ---------- dictionary ----------
const { default: cedict } = await import(nm('cc-cedict/data/all.js'));
const dict = {};
for (const [, simp, py, defs] of cedict.all) {
  const list = (Array.isArray(defs) ? defs : [defs]).filter(Boolean);
  if (!list.length) continue;
  (dict[simp] ||= []).push([toMarks(py), list]);
}
// lowercase (common-noun) readings first, proper nouns later
for (const k in dict) dict[k].sort((a, b) => (/^[A-Z]/.test(a[0]) ? 1 : 0) - (/^[A-Z]/.test(b[0]) ? 1 : 0));
fs.writeFileSync(out('data/dict.json'), JSON.stringify(dict));

// ---------- HSK 3.1 ----------
const vocab = require(nm('hsk3.1-syllabus/vocabulary.json'));
const hsk = {}; // word -> [level, pinyin]
const lvl = (l) => (l === '7-9' ? 7 : Number(l));
for (const e of vocab) {
  const rows = Array.isArray(e[0]) ? e : [e];
  for (const [, level, word, py] of rows) {
    for (const w of String(word).split(/[｜|]/)) {
      const clean = w.replace(/[（(].*?[)）]/g, '').replace(/\d+$/, '').trim();
      if (!clean) continue;
      const L = lvl(level);
      if (!hsk[clean] || hsk[clean][0] > L) hsk[clean] = [L, py];
    }
  }
}
fs.writeFileSync(out('data/hsk.json'), JSON.stringify(hsk));

// ---------- sentences ----------
const sentences = require(nm('hsk-sentences-audio/data/sentences.json'));
const sent = sentences.map((s) => [
  s.id,
  s.hsk_level,
  s.chinese,
  s.pinyin,
  s.translation?.en ?? '',
  s.tokens.map((t) => t.word).join('|'),
]);
fs.writeFileSync(out('data/sentences.json'), JSON.stringify(sent));

// ---------- stroke data (HSK characters + everything in the sentences) ----------
const chars = new Set();
for (const w of Object.keys(hsk)) for (const c of w) chars.add(c);
for (const s of sentences) for (const c of s.chinese) chars.add(c);
let copied = 0;
for (const c of chars) {
  const src = nm(`hanzi-writer-data/${c}.json`);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, out(`strokes/${c}.json`));
    copied++;
  }
}

const size = (p) => (fs.statSync(out(p)).size / 1e6).toFixed(1) + ' MB';
console.log('dict entries', Object.keys(dict).length, size('data/dict.json'));
console.log('hsk words', Object.keys(hsk).length, size('data/hsk.json'));
console.log('sentences', sent.length, size('data/sentences.json'));
console.log('stroke files', copied);
