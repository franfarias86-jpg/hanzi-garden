import { loadHsk } from './data.js';
import { wordStrength } from './srs.js';

// Estimate an HSK level from the words in the library.
// A word counts fully once reviewed a bit, half while still new.
export async function estimateLevel(words) {
  const hsk = await loadHsk();
  const totals = {};
  const known = {};
  for (const w in hsk) totals[hsk[w][0]] = (totals[hsk[w][0]] || 0) + 1;
  let outside = 0;
  const weight = (w) => 0.5 + 0.5 * Math.min(1, wordStrength(w) * 2);
  for (const w of words.values()) {
    const h = hsk[w.id];
    if (h) known[h[0]] = (known[h[0]] || 0) + weight(w);
    else outside++;
  }
  const levels = [1, 2, 3, 4, 5, 6, 7].map((l) => ({
    level: l,
    total: totals[l] || 0,
    known: known[l] || 0,
    coverage: totals[l] ? (known[l] || 0) / totals[l] : 0,
  }));
  // Cumulative coverage: you're "at" level L when you know ≥60% of all words up to L.
  let level = 0;
  let cumKnown = 0;
  let cumTotal = 0;
  let progress = 0;
  for (const l of levels) {
    cumKnown += l.known;
    cumTotal += l.total;
    const cov = cumKnown / cumTotal;
    if (cov >= 0.6) level = l.level;
    else {
      progress = Math.min(0.99, cov / 0.6);
      break;
    }
  }
  const storyLevel = Math.max(1, Math.min(7, level + (progress > 0.5 ? 1 : 0) || 1));
  return { level, progress, levels, outside, storyLevel, count: words.size };
}

// Unique characters in the library
export function charactersOf(words) {
  const map = new Map();
  for (const w of words.values()) {
    for (const c of w.hanzi) {
      if (!/\p{Script=Han}/u.test(c)) continue;
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(w);
    }
  }
  return map;
}
