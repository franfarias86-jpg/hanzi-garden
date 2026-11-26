import { useEffect, useMemo, useState } from 'preact/hooks';
import { Library } from './views/Library.jsx';
import { Review } from './views/Review.jsx';
import { Stories } from './views/Stories.jsx';
import { Progress } from './views/Progress.jsx';
import { Settings } from './views/Settings.jsx';
import { WordSheet, CharSheet } from './components/WordSheet.jsx';
import { Toaster } from './components/ui.jsx';
import { IconBook, IconCards, IconStory, IconChart, IconGear } from './components/icons.jsx';
import { useSheet, useWords } from './lib/store.js';
import { isDue } from './lib/srs.js';

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
  const due = useMemo(() => {
    if (!words) return 0;
    let n = 0;
    for (const w of words.values()) for (const s of Object.values(w.srs)) if (isDue(s)) n++;
    return n;
  }, [words]);
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
      <nav class="tabbar">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} class={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Icon />
            {label}
            {id === 'review' && due > 0 && <span class="badge">{due > 99 ? '99+' : due}</span>}
          </button>
        ))}
      </nav>
      {sheet?.kind === 'word' && <WordSheet key={sheet.word} word={sheet.word} context={sheet.context} />}
      {sheet?.kind === 'char' && <CharSheet key={sheet.char} char={sheet.char} />}
      <Toaster />
    </div>
  );
}
