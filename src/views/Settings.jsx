import { useEffect, useRef, useState } from 'preact/hooks';
import { useSettings, updateSettings } from '../lib/store.js';
import { exportAll, importAll } from '../lib/db.js';
import { MODELS } from '../lib/claude.js';
import { zhVoices, speak } from '../lib/speech.js';
import { toast } from '../components/ui.jsx';

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

      <h2>Review</h2>
      <div class="card" style={{ padding: 14 }}>
        <div class="form-row" style={{ marginBottom: 0 }}>
          <label>Cards per session: {s.sessionSize}</label>
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
