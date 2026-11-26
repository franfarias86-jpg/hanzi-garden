import { useEffect, useState } from 'preact/hooks';
import { loadWords, subscribeWords, getWordsNow, kvGet, kvSet } from './db.js';
import { setSpeechSettings } from './speech.js';

export function useWords() {
  const [words, setWords] = useState(getWordsNow());
  useEffect(() => {
    loadWords().then(setWords);
    return subscribeWords(setWords);
  }, []);
  return words;
}

// ---------- settings ----------
const DEFAULTS = {
  apiKey: '',
  model: 'claude-opus-5-5',
  rate: 0.85,
  voiceURI: '',
  sessionSize: 20,
  newPerDay: 15,
  showPinyin: true,
  learnBatch: 5,
  learnWriting: true,
  writingStrictness: 'relaxed',
  sync: null, // { config, spaceId, name, role: 'learner' | 'helper' }
};
let settings = { ...DEFAULTS };
const sl = new Set();
export const settingsReady = kvGet('settings', {}).then((s) => {
  settings = { ...DEFAULTS, ...s };
  setSpeechSettings(settings);
  sl.forEach((f) => f(settings));
});
export function getSettings() {
  return settings;
}
export async function updateSettings(patch) {
  settings = { ...settings, ...patch };
  setSpeechSettings(settings);
  sl.forEach((f) => f(settings));
  await kvSet('settings', settings);
}
export function useSettings() {
  const [s, set] = useState(settings);
  useEffect(() => {
    sl.add(set);
    set(settings);
    return () => sl.delete(set);
  }, []);
  return s;
}

// ---------- daily stats / streak ----------
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD
export async function recordReview(correct) {
  const st = await kvGet('stats', { days: {} });
  const d = (st.days[today()] ||= { reviews: 0, correct: 0 });
  d.reviews++;
  if (correct) d.correct++;
  await kvSet('stats', st);
}
export async function getStats() {
  const st = await kvGet('stats', { days: {} });
  let streak = 0;
  const day = new Date();
  if (!st.days[today()]) day.setDate(day.getDate() - 1);
  while (st.days[day.toLocaleDateString('sv')]) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return { streak, todayCount: st.days[today()]?.reviews || 0, days: st.days };
}

// ---------- simple global navigation for opening sheets from anywhere ----------
const nl = new Set();
let sheet = null;
export function openWord(word, context) {
  sheet = { kind: 'word', word, context };
  nl.forEach((f) => f(sheet));
}
export function openChar(char) {
  sheet = { kind: 'char', char };
  nl.forEach((f) => f(sheet));
}
export function closeSheet() {
  sheet = null;
  nl.forEach((f) => f(sheet));
}
export function useSheet() {
  const [s, set] = useState(sheet);
  useEffect(() => {
    nl.add(set);
    return () => nl.delete(set);
  }, []);
  return s;
}
