// Shared space: two devices (the learner and a helper, e.g. a Chinese-speaking partner) share one library.
// Backend: Firebase Firestore (free tier). Each word is a document; last write wins by `updatedAt`.
// Deleted words leave a tombstone so the deletion reaches the other device.
import { setSyncHook, putWords, deleteWord, getWordsNow, loadWords } from './db.js';

let backend = null;
let status = { state: 'off', error: '' };
const sl = new Set();
const setStatus = (s) => {
  status = { ...status, ...s };
  sl.forEach((f) => f(status));
};
export const getSyncStatus = () => status;
export function onSyncStatus(fn) {
  sl.add(fn);
  return () => sl.delete(fn);
}

// ---------- invite links ----------
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export function inviteLink(sync) {
  const payload = b64e(JSON.stringify({ c: sync.config, s: sync.spaceId }));
  return `${location.origin}${location.pathname}#join=${payload}`;
}
export function parseInvite(hash) {
  const m = hash.match(/join=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const { c, s } = JSON.parse(b64d(m[1]));
    return c && s ? { config: c, spaceId: s } : null;
  } catch {
    return null;
  }
}

// Accepts the snippet copied from the Firebase console (`const firebaseConfig = {...}`) or plain JSON.
export function parseFirebaseConfig(text) {
  const pick = (k) => text.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`))?.[1];
  const cfg = { apiKey: pick('apiKey'), authDomain: pick('authDomain'), projectId: pick('projectId'), appId: pick('appId') };
  const emu = pick('emulator');
  if (emu) cfg.emulator = emu;
  if (!cfg.apiKey || !cfg.projectId) throw new Error('Could not find apiKey and projectId in that text.');
  return cfg;
}
export const newSpaceId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);

// ---------- backends ----------
async function firebaseBackend(config, spaceId) {
  const [{ initializeApp, getApps }, fs, { getAuth, signInAnonymously }] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
    import('firebase/auth'),
  ]);
  const fresh = !getApps().find((a) => a.name === spaceId);
  const app = fresh ? initializeApp(config, spaceId) : getApps().find((a) => a.name === spaceId);
  const auth = getAuth(app);
  const db = fs.getFirestore(app);
  if (config.emulator && fresh) {
    // local Firebase emulators (development/testing only)
    const { connectAuthEmulator } = await import('firebase/auth');
    connectAuthEmulator(auth, `http://${config.emulator}:9099`, { disableWarnings: true });
    fs.connectFirestoreEmulator(db, config.emulator, 8080);
  }
  await signInAnonymously(auth);
  const col = fs.collection(db, 'spaces', spaceId, 'words');
  const audioCol = fs.collection(db, 'spaces', spaceId, 'audio');
  const clean = (o) => JSON.parse(JSON.stringify(o)); // drop undefined values
  return {
    subscribe(onDocs, onError) {
      return fs.onSnapshot(col, (snap) => onDocs(snap.docChanges().map((c) => c.doc.data())), onError);
    },
    async put(list) {
      for (let i = 0; i < list.length; i += 400) {
        const b = fs.writeBatch(db);
        for (const w of list.slice(i, i + 400)) b.set(fs.doc(col, w.id), clean(w));
        await b.commit();
      }
    },
    async putAudio(id, data) {
      await fs.setDoc(fs.doc(audioCol, id), data);
    },
    async getAudio(id) {
      const d = await fs.getDoc(fs.doc(audioCol, id));
      return d.exists() ? d.data() : null;
    },
    close() {},
  };
}

// ---------- merge ----------
async function applyRemote(docs) {
  const local = getWordsNow() || (await loadWords());
  const puts = [];
  for (const r of docs) {
    if (!r?.id) continue;
    const l = local.get(r.id);
    if (r.deleted) {
      if (l && (l.updatedAt || 0) <= r.updatedAt) await deleteWord(r.id, { fromRemote: true });
      continue;
    }
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) puts.push(r);
  }
  if (puts.length) await putWords(puts, { fromRemote: true });
}

let unsub = null;
let me = '';
export async function startSync(sync) {
  stopSync();
  if (!sync?.spaceId) return;
  me = sync.name || '';
  setStatus({ state: 'connecting', error: '' });
  try {
    backend = await firebaseBackend(sync.config, sync.spaceId);
    setSyncHook(async ({ put, remove }) => {
      try {
        if (put) await backend.put(put.map((w) => ({ ...w, updatedBy: me })));
        if (remove) await backend.put(remove.map((id) => ({ id, deleted: true, updatedAt: Date.now(), updatedBy: me })));
        setStatus({ state: 'on', error: '', last: Date.now() });
      } catch (e) {
        setStatus({ state: 'error', error: e.message });
      }
    });
    let first = true;
    unsub = backend.subscribe(
      async (docs) => {
        await applyRemote(docs);
        if (first && sync.uploadOnStart) {
          // creator of the space: upload the existing library once
          first = false;
          const words = [...(getWordsNow() || (await loadWords())).values()];
          await backend.put(words.map((w) => ({ ...w, updatedBy: w.updatedBy || me })));
        }
        first = false;
        setStatus({ state: 'on', error: '', last: Date.now() });
      },
      (e) => setStatus({ state: 'error', error: e.message }),
    );
  } catch (e) {
    setStatus({ state: 'error', error: e.message });
  }
}
export function stopSync() {
  unsub?.();
  unsub = null;
  backend?.close();
  backend = null;
  setSyncHook(null);
  setStatus({ state: 'off', error: '' });
}

// ---------- recorded pronunciations ----------
const audioCache = new Map();
export async function getAudio(id) {
  if (audioCache.has(id)) return audioCache.get(id);
  if (!backend) return null;
  const a = await backend.getAudio(id).catch(() => null);
  if (a) audioCache.set(id, a);
  return a;
}
export async function saveAudio(word, blob) {
  if (!backend) throw new Error('Join a shared space first to save recordings.');
  if (blob.size > 700000) throw new Error('Recording is too long — keep it under ~20 seconds.');
  const data = await new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(blob);
  });
  const a = { data, by: me, at: Date.now() };
  await backend.putAudio(word.id, a);
  audioCache.set(word.id, a);
  await putWords([{ ...word, hasAudio: true, audioBy: me }]);
}
export const syncActive = () => !!backend;
