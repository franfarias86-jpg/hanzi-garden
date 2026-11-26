// Lazy-loaded reference data: CC-CEDICT, HSK 3.1 levels, graded example sentences.
const base = import.meta.env.BASE_URL;
const cache = {};
function load(name) {
  return (cache[name] ||= fetch(`${base}data/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${name}`);
    return r.json();
  }));
}

export const loadDict = () => load('dict');
export const loadHsk = () => load('hsk');

let sentIndex = null;
export async function loadSentences() {
  if (sentIndex) return sentIndex;
  const rows = await load('sentences');
  const byWord = new Map();
  const list = rows.map(([id, level, zh, py, en, toks]) => {
    const s = { id, level, zh, py, en, tokens: toks.split('|') };
    for (const t of new Set(s.tokens)) {
      if (!byWord.has(t)) byWord.set(t, []);
      byWord.get(t).push(s);
    }
    return s;
  });
  sentIndex = { list, byWord };
  return sentIndex;
}

export const HSK_LABEL = (l) => (l === 7 ? 'HSK 7–9' : `HSK ${l}`);
export const isHan = (c) => /\p{Script=Han}/u.test(c);
export const hasHan = (s) => /\p{Script=Han}/u.test(s);

export async function lookup(word) {
  const [dict, hsk] = await Promise.all([loadDict(), loadHsk()]);
  const entries = dict[word] || [];
  const h = hsk[word];
  return {
    word,
    entries: entries.map(([py, defs]) => ({ py, defs })),
    hsk: h ? h[0] : null,
    hskPinyin: h ? h[1] : null,
  };
}

// Greedy longest-match segmentation over the dictionary.
export async function segment(text) {
  const dict = await loadDict();
  const out = [];
  let i = 0;
  const chars = [...text];
  while (i < chars.length) {
    if (!isHan(chars[i])) {
      i++;
      continue;
    }
    let len = Math.min(8, chars.length - i);
    for (; len > 1; len--) if (dict[chars.slice(i, i + len).join('')]) break;
    out.push(chars.slice(i, i + len).join(''));
    i += len;
  }
  return out;
}

const stripTones = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'v').toLowerCase();
const squash = (s) => stripTones(s).replace(/[^a-z0-9v]/g, '');

// Search the dictionary by characters, pinyin (with or without tones/spaces) or English.
export async function searchDict(q, limit = 40) {
  q = q.trim();
  if (!q) return [];
  const [dict, hsk] = await Promise.all([loadDict(), loadHsk()]);
  const results = [];
  const rank = (w) => (hsk[w] ? hsk[w][0] : 20) + w.length * 0.1;
  if (hasHan(q)) {
    if (dict[q]) results.push({ w: q, score: -100 });
    for (const w in dict) {
      if (w !== q && w.includes(q)) results.push({ w, score: rank(w) + (w.startsWith(q) ? 0 : 5) });
    }
  } else {
    const sq = squash(q);
    const numbered = /\d/.test(q);
    const lq = q.toLowerCase();
    const enRe = new RegExp(`\\b${lq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    for (const w in dict) {
      let best = Infinity;
      for (const [py, defs] of dict[w]) {
        const sp = squash(py);
        if (!numbered && sp === sq) best = Math.min(best, rank(w) - 50);
        else if (!numbered && sq.length > 2 && sp.startsWith(sq)) best = Math.min(best, rank(w) - 20);
        for (const d of defs) {
          if (d.toLowerCase() === lq || d.toLowerCase() === `to ${lq}`) best = Math.min(best, rank(w) - 40);
          else if (enRe.test(d)) best = Math.min(best, rank(w) + d.length / 40);
        }
      }
      if (best < Infinity) results.push({ w, score: best });
    }
  }
  results.sort((a, b) => a.score - b.score);
  return results.slice(0, limit).map(({ w }) => ({
    word: w,
    entries: dict[w].map(([py, defs]) => ({ py, defs })),
    hsk: hsk[w] ? hsk[w][0] : null,
  }));
}

export async function examplesFor(word, max = 6) {
  const { byWord } = await loadSentences();
  const list = byWord.get(word) || [];
  return [...list].sort((a, b) => a.level - b.level || a.zh.length - b.zh.length).slice(0, max);
}

export const sentenceAudioUrl = (id, slow = false) =>
  `https://raw.githubusercontent.com/no7z/hsk-sentences-audio/main/dist/audio/${id}${slow ? '_slow' : ''}.mp3`;

// Build an entry for a new word (pinyin + definitions) from the dictionary.
export async function draftWord(word) {
  const info = await lookup(word);
  let pinyin = info.hskPinyin || info.entries[0]?.py || '';
  let defs = [];
  if (info.entries.length) {
    // Prefer the reading that matches HSK pinyin, then add other readings' senses.
    const sorted = [...info.entries].sort(
      (a, b) => (stripTones(b.py) === stripTones(pinyin || '') ? 1 : 0) - (stripTones(a.py) === stripTones(pinyin || '') ? 1 : 0),
    );
    if (!info.hskPinyin) pinyin = sorted[0].py;
    for (const e of sorted) {
      const prefix = sorted.length > 1 && e.py !== pinyin ? `[${e.py}] ` : '';
      for (const d of e.defs) defs.push(prefix + d);
    }
  }
  if (!pinyin) {
    const { pinyin: pp } = await import('pinyin-pro');
    pinyin = pp(word);
  }
  return { hanzi: word, pinyin, defs, hsk: info.hsk, found: info.entries.length > 0 };
}

export async function pinyinOf(text) {
  const { pinyin } = await import('pinyin-pro');
  return pinyin(text);
}
