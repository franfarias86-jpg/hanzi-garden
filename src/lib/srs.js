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
