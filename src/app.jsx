import { useEffect, useMemo, useState } from 'preact/hooks';
import { Library } from './views/Library.jsx';
import { Review } from './views/Review.jsx';
import { Stories } from './views/Stories.jsx';
import { Progress } from './views/Progress.jsx';
import { Settings } from './views/Settings.jsx';
import { WordSheet, CharSheet } from './components/WordSheet.jsx';
import { Toaster } from './components/ui.jsx';
import { IconBook, IconCards, IconStory, IconChart, IconGear } from './components/icons.jsx';
import { useSheet, useWords, useSettings, updateSettings, getSettings } from './lib/store.js';
import { isDue, isNewWord } from './lib/srs.js';
import { startSync, parseInvite } from './lib/sync.js';
import { Coach } from './views/Coach.jsx';
import { Sheet } from './components/ui.jsx';
import { IconHighlight } from './components/icons.jsx';

// start syncing on launch if this device belongs to a shared space
if (getSettings().sync) startSync(getSettings().sync);

const HELPER_TABS = [
  ['library', 'Library', IconBook],
  ['coach', 'Coach', IconHighlight],
  ['stories', 'Stories', IconStory],
  ['settings', 'Settings', IconGear],
];
const TABS = [
  ['library', 'Library', IconBook],
  ['review', 'Review', IconCards],
  ['stories', 'Stories', IconStory],
  ['level', 'Level', IconChart],
  ['settings', 'Settings', IconGear],
];

export function App() {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('tab') || 'library'; } catch { return 'library'; }
  });
  const sheet = useSheet();
  const words = useWords();
  const settings = useSettings();
  const helper = settings.sync?.role === 'helper';
  const [invite, setInvite] = useState(() => parseInvite(location.hash));
  const due = useMemo(() => {
    if (!words) return 0;
    let n = 0;
    for (const w of words.values()) {
      if (isNewWord(w)) n++;
      else for (const s of Object.values(w.srs)) if (isDue(s)) n++;
    }
    return n;
  }, [words]);
  const tabs = helper ? HELPER_TABS : TABS;
  useEffect(() => {
    try { localStorage.setItem('tab', tab); } catch {}
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <div class="app">
      {tab === 'library' && <Library />}
      {tab === 'review' && <Review />}
      {tab === 'stories' && <Stories />}
      {tab === 'level' && <Progress />}
      {tab === 'settings' && <Settings />}
      {tab === 'coach' && <Coach />}
      {!tabs.some(([id]) => id === tab) && <Library />}
      <nav class="tabbar">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} class={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Icon />
            {label}
            {id === 'review' && due > 0 && <span class="badge">{due > 99 ? '99+' : due}</span>}
          </button>
        ))}
      </nav>
      {sheet?.kind === 'word' && <WordSheet key={sheet.word} word={sheet.word} context={sheet.context} />}
      {sheet?.kind === 'char' && <CharSheet key={sheet.char} char={sheet.char} />}
      {invite && <JoinSheet invite={invite} onDone={(t) => { setInvite(null); history.replaceState(null, '', location.pathname); if (t) setTab(t); }} />}
      <Toaster />
    </div>
  );
}

function JoinSheet({ invite, onDone }) {
  const current = getSettings().sync;
  const [name, setName] = useState('');
  const [role, setRole] = useState('helper');
  const join = async () => {
    const sync = { config: invite.config, spaceId: invite.spaceId, name: name.trim() || (role === 'helper' ? 'Partner' : 'Me'), role };
    await updateSettings({ sync });
    startSync(sync);
    onDone(role === 'helper' ? 'library' : 'review');
  };
  return (
    <Sheet onClose={() => onDone()}>
      <h1 style={{ fontSize: 26, margin: '4px 0 8px' }}>Join a shared space</h1>
      <p class="sub">You've been invited to share a Hanzi Garden library. Words added on either phone appear on both.</p>
      {current && current.spaceId !== invite.spaceId && <div class="error" style={{ marginBottom: 12 }}>This phone is already in another shared space; joining switches to the new one.</div>}
      <div class="form-row"><label>Your name (shown on the words you add)</label><input class="field" value={name} onInput={(e) => setName(e.target.value)} placeholder="e.g. 小美" /></div>
      <div class="form-row">
        <label>On this phone I am…</label>
        <div class="card list">
          <label class="check-row"><input type="radio" name="role" checked={role === 'helper'} onChange={() => setRole('helper')} /><span><b>The helper</b><br /><span class="sub">I add words and phrases, record my pronunciation and see what's hard</span></span></label>
          <label class="check-row"><input type="radio" name="role" checked={role === 'learner'} onChange={() => setRole('learner')} /><span><b>The learner</b><br /><span class="sub">This is my own second device</span></span></label>
        </div>
      </div>
      <button class="btn block" onClick={join}>Join</button>
    </Sheet>
  );
}
