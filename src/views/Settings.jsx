import { useEffect, useRef, useState } from 'preact/hooks';
import { useSettings, updateSettings } from '../lib/store.js';
import { exportAll, importAll } from '../lib/db.js';
import { MODELS } from '../lib/claude.js';
import { zhVoices, speak } from '../lib/speech.js';
import { toast, Seg } from '../components/ui.jsx';
import { parseFirebaseConfig, newSpaceId, startSync, stopSync, inviteLink, onSyncStatus, getSyncStatus } from '../lib/sync.js';

export function Settings() {
  const s = useSettings();
  const [voices, setVoices] = useState(zhVoices());
  const [key, setKey] = useState(s.apiKey);
  const file = useRef();
  useEffect(() => {
    const f = () => setVoices(zhVoices());
    window.speechSynthesis?.addEventListener?.('voiceschanged', f);
    setTimeout(f, 500);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', f);
  }, []);
  useEffect(() => setKey(s.apiKey), [s.apiKey]);

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `hanzi-garden-${new Date().toISOString().slice(0, 10)}.json`;
    const f = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: 'Hanzi Garden backup' }); return; } catch {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };
  const doImport = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await importAll(JSON.parse(await f.text()), { merge: true });
      toast('Backup restored');
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
  };
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  return (
    <div class="page">
      <div class="page-head"><h1>Settings</h1></div>

      {!standalone && (
        <div class="card" style={{ padding: 14, marginBottom: 6 }}>
          <b>Install on your iPhone</b>
          <p class="note" style={{ margin: '4px 0 0' }}>In Safari tap <b>Share</b> → <b>Add to Home Screen</b>. The app then opens full-screen, works offline and Safari keeps your library safe from automatic cleanup.</p>
        </div>
      )}

      <h2>Claude (stories & examples)</h2>
      <div class="card" style={{ padding: 14 }}>
        <div class="form-row">
          <label>Anthropic API key</label>
          <input class="field" type="password" autocomplete="off" placeholder="sk-ant-…" value={key} onInput={(e) => setKey(e.target.value)} onBlur={() => updateSettings({ apiKey: key.trim() })} />
          <span class="note">Create one at console.anthropic.com → API keys. It is stored only on this device and sent only to Anthropic.</span>
        </div>
        <div class="form-row" style={{ marginBottom: 0 }}>
          <label>Model</label>
          <select class="field" value={s.model} onChange={(e) => updateSettings({ model: e.target.value })}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <h2>Audio</h2>
      <div class="card" style={{ padding: 14 }}>
        <div class="form-row">
          <label>Voice</label>
          <select class="field" value={s.voiceURI} onChange={(e) => updateSettings({ voiceURI: e.target.value })}>
            <option value="">Default Chinese voice</option>
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
          </select>
          <span class="note">More natural voices: iPhone Settings → Accessibility → Spoken Content → Voices → Chinese (China), download an “Enhanced” voice.</span>
        </div>
        <div class="form-row" style={{ marginBottom: 6 }}>
          <label>Speed: {s.rate.toFixed(2)}×</label>
          <input type="range" min="0.5" max="1.2" step="0.05" value={s.rate} onInput={(e) => updateSettings({ rate: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
        </div>
        <button class="btn secondary small" onClick={() => speak('你好，我们一起学习中文吧。')}>Test voice</button>
      </div>

      <SharedSpace />

      <h2>Learning & review</h2>
      <div class="card" style={{ padding: 14 }}>
        <div class="form-row">
          <label>New words per Learn session: {s.learnBatch}</label>
          <input type="range" min="2" max="10" step="1" value={s.learnBatch} onInput={(e) => updateSettings({ learnBatch: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
        </div>
        <label class="check-row" style={{ padding: '0 0 12px', border: 0 }}>
          <input type="checkbox" checked={s.learnWriting} onChange={(e) => updateSettings({ learnWriting: e.target.checked })} />
          <span>Include writing practice when learning new words</span>
        </label>
        <div class="form-row">
          <label>Writing precision</label>
          <Seg value={s.writingStrictness} onChange={(v) => updateSettings({ writingStrictness: v })} options={[['relaxed', 'Relaxed'], ['normal', 'Normal'], ['strict', 'Strict']]} />
          <span class="note">Relaxed accepts shaky strokes and strokes drawn backwards, and lets a stroke through after 4 tries.</span>
        </div>
        <div class="form-row" style={{ marginBottom: 0 }}>
          <label>Cards per review session: {s.sessionSize}</label>
          <input type="range" min="5" max="60" step="5" value={s.sessionSize} onInput={(e) => updateSettings({ sessionSize: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
        </div>
      </div>

      <h2>Backup</h2>
      <div class="card" style={{ padding: 14 }} >
        <p class="note" style={{ marginTop: 0 }}>Your library lives on this phone. Export a backup now and then (save it to Files or iCloud Drive).</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button class="btn secondary" style={{ flex: 1 }} onClick={doExport}>Export</button>
          <button class="btn secondary" style={{ flex: 1 }} onClick={() => file.current.click()}>Import</button>
          <input ref={file} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={doImport} />
        </div>
      </div>

      <h2>About</h2>
      <p class="note">
        Dictionary: CC-CEDICT (CC BY-SA 4.0, mdbg.net). Word levels: HSK 3.1 syllabus. Example sentences & audio: hsk-sentences-audio (CC BY-SA 4.0).
        Stroke order: Hanzi Writer & Make Me a Hanzi (Arphic Public License). Stories and AI examples are generated by Claude and can contain mistakes.
      </p>
    </div>
  );
}

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /spaces/{space}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`;

function SharedSpace() {
  const s = useSettings();
  const [st, setSt] = useState(getSyncStatus());
  const [cfgText, setCfgText] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [help, setHelp] = useState(false);
  useEffect(() => onSyncStatus(setSt), []);

  const create = async () => {
    setErr('');
    try {
      const config = parseFirebaseConfig(cfgText);
      const sync = { config, spaceId: newSpaceId(), name: name.trim() || 'Me', role: 'learner' };
      await updateSettings({ sync });
      await startSync({ ...sync, uploadOnStart: true });
    } catch (e) {
      setErr(e.message);
    }
  };
  const share = async () => {
    const url = inviteLink(s.sync);
    const text = 'Join my Chinese word library on Hanzi Garden:';
    if (navigator.share) {
      try { await navigator.share({ title: 'Hanzi Garden', text, url }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { prompt('Copy this link', url); }
  };
  const leave = async () => {
    if (!confirm('Stop sharing on this phone? Your words stay on this phone, but changes will no longer sync.')) return;
    stopSync();
    await updateSettings({ sync: null });
  };

  return (
    <>
      <h2>Shared space</h2>
      <div class="card" style={{ padding: 14 }}>
        {s.sync ? (
          <>
            <div class="between">
              <span><b>{s.sync.role === 'helper' ? 'Helping' : 'Sharing'}</b> as {s.sync.name}</span>
              <span class={`chip ${st.state === 'on' ? 'good' : st.state === 'error' ? '' : 'muted'}`}>{st.state === 'on' ? 'synced' : st.state}</span>
            </div>
            {st.error && <div class="error" style={{ marginTop: 8 }}>{st.error}</div>}
            <p class="note">Words, edits, review progress and recordings are shared between the phones in this space.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button class="btn" style={{ flex: 1 }} onClick={share}>Invite someone</button>
              <button class="btn plain" onClick={leave}>Leave</button>
            </div>
            <div class="form-row" style={{ margin: '12px 0 0' }}>
              <label>On this phone I am</label>
              <Seg value={s.sync.role} onChange={(role) => updateSettings({ sync: { ...s.sync, role } })} options={[['learner', 'The learner'], ['helper', 'The helper']]} />
            </div>
          </>
        ) : (
          <>
            <p class="note" style={{ marginTop: 0 }}>Share your library with another phone — for example your Chinese-speaking partner, who can add words you talked about, record their voice and see what you find hard.</p>
            <div class="form-row">
              <label>Your name</label>
              <input class="field" value={name} onInput={(e) => setName(e.target.value)} placeholder="e.g. Fran" />
            </div>
            <div class="form-row">
              <label>Firebase config (one-time setup)</label>
              <textarea class="field" rows={4} style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace' }} value={cfgText} onInput={(e) => setCfgText(e.target.value)} placeholder="Paste the firebaseConfig snippet from the Firebase console" />
            </div>
            {err && <div class="error" style={{ marginBottom: 10 }}>{err}</div>}
            <button class="btn block" disabled={!cfgText.trim()} onClick={create}>Create shared space</button>
            <button class="btn ghost block" onClick={() => setHelp(!help)}>{help ? 'Hide setup steps' : 'How do I get a Firebase config?'}</button>
            {help && (
              <ol class="note" style={{ paddingLeft: 20 }}>
                <li>Go to console.firebase.google.com → <b>Create a project</b> (free, Analytics not needed).</li>
                <li><b>Build → Authentication → Get started → Sign-in method → Anonymous → Enable.</b></li>
                <li><b>Build → Firestore Database → Create database</b> (production mode, any location).</li>
                <li>In Firestore → <b>Rules</b>, replace everything with the rules below and <b>Publish</b>.</li>
                <li>Project settings (gear) → <b>Your apps → Web (&lt;/&gt;)</b> → register an app → copy the <code>firebaseConfig</code> snippet and paste it above.</li>
                <li>Tap <b>Create shared space</b>, then <b>Invite someone</b> and send the link. The other phone just opens it.</li>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, background: 'var(--bg)', padding: 8, borderRadius: 8 }}>{RULES}</pre>
              </ol>
            )}
          </>
        )}
      </div>
    </>
  );
}
