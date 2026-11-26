import { useEffect, useState } from 'preact/hooks';
import { useWords, getStats, openWord } from '../lib/store.js';
import { estimateLevel, charactersOf } from '../lib/level.js';
import { loadHsk, loadDict, HSK_LABEL } from '../lib/data.js';
import { putWords, makeWord } from '../lib/db.js';
import { draftWord } from '../lib/data.js';
import { toast } from '../components/ui.jsx';
import { IconPlus } from '../components/icons.jsx';

export function Progress() {
  const words = useWords();
  const [est, setEst] = useState(null);
  const [stats, setStats] = useState(null);
  const [next, setNext] = useState([]);
  useEffect(() => {
    if (!words) return;
    estimateLevel(words).then(setEst);
    getStats().then(setStats);
    Promise.all([loadHsk(), loadDict()]).then(([hsk, dict]) => {
      // most useful words you don't have yet: lowest HSK level first
      const list = Object.keys(hsk)
        .filter((w) => !words.has(w))
        .sort((a, b) => hsk[a][0] - hsk[b][0])
        .slice(0, 15)
        .map((w) => ({ w, level: hsk[w][0], py: hsk[w][1], def: dict[w]?.[0]?.[1]?.slice(0, 2).join('; ') || '' }));
      setNext(list);
    });
  }, [words]);
  if (!words || !est) return null;
  const chars = charactersOf(words).size;
  const add = async (w) => {
    await putWords([makeWord(await draftWord(w))]);
    toast(`Added ${w}`);
  };

  return (
    <div class="page">
      <div class="page-head"><h1>Level</h1></div>
      <div class="card" style={{ padding: 18, textAlign: 'center' }}>
        <div class="sub">Estimated level</div>
        <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--accent)', lineHeight: 1.2 }}>{est.level ? HSK_LABEL(est.level) : 'Pre-HSK 1'}</div>
        {est.level < 7 && (
          <>
            <div class="levelbar" style={{ margin: '12px 0 6px' }}><div style={{ width: `${est.progress * 100}%` }} /></div>
            <div class="sub">{Math.round(est.progress * 100)}% of the way to {HSK_LABEL(est.level + 1)}</div>
          </>
        )}
        <p class="note" style={{ marginBottom: 0 }}>You reach a level when you know at least 60% of all HSK 3.1 words up to it. Words you've reviewed count more than words you just added.</p>
      </div>

      <div class="stats" style={{ marginTop: 12 }}>
        <div class="card stat"><b>{words.size}</b><span>words</span></div>
        <div class="card stat"><b>{chars}</b><span>characters</span></div>
        <div class="card stat"><b>{stats?.streak || 0}🔥</b><span>day streak</span></div>
      </div>

      <h2>HSK 3.1 coverage</h2>
      <div class="card">
        {est.levels.map((l) => (
          <div class="lvl-row" key={l.level}>
            <b>{HSK_LABEL(l.level)}</b>
            <div class="levelbar"><div style={{ width: `${Math.min(100, l.coverage * 100)}%`, opacity: l.coverage ? 1 : 0 }} /></div>
            <span class="num">{Math.round(l.known)} / {l.total}</span>
          </div>
        ))}
      </div>
      {est.outside > 0 && <p class="note">{est.outside} of your words are outside the HSK lists (names, slang, specialised words).</p>}

      {next.length > 0 && (
        <>
          <h2>Useful next words</h2>
          <div class="card list">
            {next.map((n) => (
              <div class="row" key={n.w}>
                <button class="row" style={{ padding: 0, border: 0, flex: 1 }} onClick={() => openWord(n.w)}>
                  <span class="hz">{n.w}</span>
                  <span class="meta"><div class="py">{n.py}</div><div class="def">{n.def}</div></span>
                  <span class="chip muted">{n.level === 7 ? '7–9' : n.level}</span>
                </button>
                <button class="icon-btn" onClick={() => add(n.w)} aria-label="Add"><IconPlus /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
