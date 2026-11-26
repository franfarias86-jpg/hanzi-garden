// Compare typed pinyin with the expected pinyin.
// Accepts tone marks, tone numbers (xue2xi2) or no tones at all.
const MARK_TONE = {};
'āēīōūǖ'.split('').forEach((c) => (MARK_TONE[c] = 1));
'áéíóúǘ'.split('').forEach((c) => (MARK_TONE[c] = 2));
'ǎěǐǒǔǚ'.split('').forEach((c) => (MARK_TONE[c] = 3));
'àèìòùǜ'.split('').forEach((c) => (MARK_TONE[c] = 4));

const base = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü|u:|v/g, 'u').replace(/[^a-z]/g, '');

// sequence of tones 1-4 found in a string (marks or digits); neutral tones are ignored
function tones(s) {
  const out = [];
  for (const ch of s.toLowerCase()) {
    if (MARK_TONE[ch]) out.push(MARK_TONE[ch]);
    else if (/[1-4]/.test(ch)) out.push(Number(ch));
  }
  return out;
}

// -> { ok, toneless, base: bool, tonesOk: bool }
export function checkPinyin(input, expected) {
  const b = base(input) === base(expected);
  const ti = tones(input);
  if (!b) return { ok: false, base: false, tonesOk: false };
  if (!ti.length) return { ok: true, toneless: true, base: true, tonesOk: null };
  const te = tones(expected);
  const tonesOk = ti.length === te.length && ti.every((t, i) => t === te[i]);
  return { ok: tonesOk, base: true, tonesOk };
}

// A hint that makes the learner work: level 1 = first letter of each syllable, level 2 = half of each syllable
export function pinyinHint(syllables, level) {
  return syllables
    .map((s) => {
      const n = level <= 1 ? 1 : Math.ceil(s.length / 2);
      return s.slice(0, n) + '·'.repeat(Math.max(0, s.length - n));
    })
    .join(' ');
}
