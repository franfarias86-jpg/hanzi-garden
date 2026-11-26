// SM-2 style spaced repetition, one schedule per skill (meaning / listening / writing).
const DAY = 86400000;

export const SKILLS = ['meaning', 'listening', 'writing'];
export const SKILL_LABEL = { meaning: 'Meaning', listening: 'Listening', writing: 'Writing' };

export function newSrs() {
  return { due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, last: 0 };
}

// grade: 0 again, 1 hard, 2 good, 3 easy
export function schedule(s, grade, now = Date.now()) {
  s = { ...newSrs(), ...s };
  if (grade === 0) {
    s.reps = 0;
    s.lapses += 1;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.interval = 0;
    s.due = now + 10 * 60 * 1000; // see it again in 10 minutes
  } else {
    let interval;
    if (s.reps === 0) interval = grade === 1 ? 0.5 : grade === 2 ? 1 : 3;
    else if (s.reps === 1) interval = grade === 1 ? 2 : grade === 2 ? 3 : 6;
    else interval = s.interval * (grade === 1 ? 1.2 : grade === 2 ? s.ease : s.ease * 1.3);
    s.ease = Math.max(1.3, s.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
    s.reps += 1;
    s.interval = Math.min(interval, 3650);
    s.due = now + s.interval * DAY;
  }
  s.last = now;
  return s;
}

export function isDue(s, now = Date.now()) {
  return !s || s.due <= now;
}

// 0..1 rough mastery of one skill
export function strength(s) {
  if (!s || !s.reps) return 0;
  return Math.min(1, Math.log2(1 + s.interval) / Math.log2(1 + 60));
}

export function wordStrength(w) {
  const m = strength(w.srs?.meaning);
  const l = strength(w.srs?.listening);
  const wr = strength(w.srs?.writing);
  return m * 0.5 + l * 0.3 + wr * 0.2;
}

export function nextDueLabel(s, now = Date.now()) {
  if (!s || !s.reps) return 'new';
  const d = s.due - now;
  if (d <= 0) return 'due';
  if (d < 3600000) return `${Math.round(d / 60000)} min`;
  if (d < DAY) return `${Math.round(d / 3600000)} h`;
  return `${Math.round(d / DAY)} d`;
}

// ---------- learning lifecycle ----------
// A word starts "new": it has to go through Learn mode before it enters reviews.
// Older words (from before Learn mode existed) that were already reviewed count as learned.
export function isNewWord(w) {
  if (w.learned !== undefined) return !w.learned;
  return !(w.srs?.meaning?.reps > 0);
}

const jitter = (a, b) => a + Math.random() * (b - a);

// Called when a word finishes Learn mode. Struggling words come back sooner.
export function graduate(w, { fails = 0 } = {}, now = Date.now()) {
  const first = fails >= 3 ? 0.4 : fails >= 1 ? 0.8 : 1;
  const mk = (days) => ({ ...newSrs(), reps: 1, interval: days, due: now + days * DAY, last: now });
  return { ...w, learned: true, learnedAt: now, srs: { meaning: mk(first), listening: mk(first + 0.5), writing: mk(first * 2) } };
}

// For words the learner already knows (quick check). Spread due dates so they don't arrive all at once.
export function seedKnown(w, how, now = Date.now()) {
  const range = how === 'well' ? [30, 120] : [5, 20];
  const mk = () => {
    const interval = jitter(...range);
    return { ...newSrs(), reps: how === 'well' ? 4 : 2, ease: how === 'well' ? 2.7 : 2.5, interval, due: now + interval * DAY, last: now };
  };
  return { ...w, learned: true, learnedAt: now, known: how, srs: { meaning: mk(), listening: mk(), writing: mk() } };
}
