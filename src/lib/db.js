import { openDB } from 'idb';
import { newSrs } from './srs.js';

const dbp = openDB('hanzi-garden', 1, {
  upgrade(db) {
    db.createObjectStore('words', { keyPath: 'id' });
    db.createObjectStore('stories', { keyPath: 'id' });
    db.createObjectStore('kv');
  },
});

// Ask Safari not to evict our data (works best once installed to the home screen).
navigator.storage?.persist?.().catch(() => {});

// ---------- tiny reactive store for the library ----------
let words = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(words));

export async function loadWords() {
  if (!words) {
    const db = await dbp;
    const list = await db.getAll('words');
    words = new Map(list.map((w) => [w.id, w]));
  }
  return words;
}
export function subscribeWords(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getWordsNow() {
  return words;
}

export function makeWord({ hanzi, pinyin = '', defs = [], examples = [], source = 'manual', note = '' }) {
  return {
    id: hanzi,
    hanzi,
    pinyin,
    defs,
    examples, // custom examples: {zh, py, en}
    note,
    source,
    starred: false,
    addedAt: Date.now(),
    srs: { meaning: newSrs(), listening: newSrs(), writing: newSrs() },
  };
}

export async function putWord(word) {
  await loadWords();
  const db = await dbp;
  await db.put('words', word);
  words = new Map(words).set(word.id, word);
  emit();
  return word;
}
export async function putWords(list) {
  await loadWords();
  const db = await dbp;
  const tx = db.transaction('words', 'readwrite');
  for (const w of list) tx.store.put(w);
  await tx.done;
  words = new Map(words);
  for (const w of list) words.set(w.id, w);
  emit();
}
export async function deleteWord(id) {
  await loadWords();
  const db = await dbp;
  await db.delete('words', id);
  words = new Map(words);
  words.delete(id);
  emit();
}

// ---------- stories ----------
export async function listStories() {
  const db = await dbp;
  const all = await db.getAll('stories');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getStory(id) {
  return (await dbp).get('stories', id);
}
export async function putStory(story) {
  return (await dbp).put('stories', story);
}
export async function deleteStory(id) {
  return (await dbp).delete('stories', id);
}

// ---------- key/value settings ----------
export async function kvGet(key, fallback) {
  const v = await (await dbp).get('kv', key);
  return v === undefined ? fallback : v;
}
export async function kvSet(key, value) {
  return (await dbp).put('kv', value, key);
}

// ---------- backup ----------
export async function exportAll() {
  const db = await dbp;
  return {
    app: 'hanzi-garden',
    version: 1,
    exportedAt: new Date().toISOString(),
    words: await db.getAll('words'),
    stories: await db.getAll('stories'),
    stats: await kvGet('stats', null),
  };
}
export async function importAll(data, { merge = true } = {}) {
  if (data?.app !== 'hanzi-garden') throw new Error('This file is not a Hanzi Garden backup.');
  const db = await dbp;
  const tx = db.transaction(['words', 'stories'], 'readwrite');
  if (!merge) {
    await tx.objectStore('words').clear();
    await tx.objectStore('stories').clear();
  }
  for (const w of data.words || []) tx.objectStore('words').put(w);
  for (const s of data.stories || []) tx.objectStore('stories').put(s);
  await tx.done;
  if (data.stats) await kvSet('stats', data.stats);
  words = null;
  await loadWords();
  emit();
}
