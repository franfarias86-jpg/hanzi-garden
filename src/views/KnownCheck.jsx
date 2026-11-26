// Quick check: flip through HSK words and mark the ones you already know, to bring the library
// (and the level estimate) up to date in minutes. Known words are scheduled far apart so they
// don't flood the reviews; "Learn it" sends a word to Learn mode instead.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useWords } from '../lib/store.js';
import { loadHsk, loadDict, HSK_LABEL, draftWord } from '../lib/data.js';
import { putWords, deleteWord, makeWord } from '../lib/db.js';
import { seedKnown } from '../lib/srs.js';
import { speak } from '../lib/speech.js';
import { estimateLevel } from '../lib/level.js';
import { IconBack, IconEye, IconSound } from '../components/icons.jsx';

export function KnownCheck({ onBack }) {
  const words = useWords();
  const [hsk, setHsk] = useState(null);
  const [dict, setDict] = useState(null);
  const [level, setLevel] = useState(null);
  const [skipped, setSkipped] = useState(new Set());
  const [history, setHistory] = useState([]); // [{id, action}]
  const [peek, setPeek] = useState(false);
  const [counts, setCounts] = useState({ well: 0, familiar: 0, learn: 0, skip: 0 });

  useEffect(() => {
    Promise.all([loadHsk(), loadDict(), estimateLevel(words)]).then(([h, d, est]) => {
      setHsk(h);
      setDict(d);
      setLevel(Math.max(1, Math.min(7, est.level || 1)));
    });
  }, []);

  // words of the chosen level you don't have yet, in syllabus order (roughly by usefulness)
  const deck = useMemo(() => {
    if (!hsk || !level) return [];
    return Object.keys(hsk).filter((w) => hsk[w][0] === level && !words.has(w) && !skipped.has(w));
  }, [hsk, level, words, skipped]);
  const totalAtLevel = useMemo(() => (hsk && level ? Object.keys(hsk).filter((w) => hsk[w][0] === level).length : 0), [hsk, level]);
  const knownAtLevel = totalAtLevel - deck.length - [...skipped].filter((w) => hsk?.[w]?.[0] === level).length;

  const cur = deck[0];
  useEffect(() => setPeek(false), [cur]);

  const act = async (action) => {
    if (!cur) return;
    setHistory((h) => [...h.slice(-50), { id: cur, action }]);
    setCounts((c) => ({ ...c, [action]: c[action] + 1 }));
    if (action === 'skip') return setSkipped(new Set(skipped).add(cur));
    const d = await draftWord(cur);
    let w = makeWord({ ...d, source: 'quick-check' });
    if (action !== 'learn') w = seedKnown(w, action);
    await putWords([w]);
  };
  const undo = async () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(history.slice(0, -1));
    setCounts((c) => ({ ...c, [last.action]: c[last.action] - 1 }));
    if (last.action === 'skip') {
      const s = new Set(skipped);
      s.delete(last.id);
      setSkipped(s);
    } else await deleteWord(last.id);
  };

  if (!hsk || !level) return <div class="page"><div class="empty">Loading…</div></div>;
  const entry = cur && dict[cur]?.[0];

  return (
    <div class="page review">
      <div class="between">
        <button class="icon-btn plain" onClick={onBack} aria-label="Back"><IconBack /></button>
        <select class="field" style={{ width: 'auto', padding: '6px 10px', fontSize: 15 }} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7].map((l) => <option key={l} value={l}>{HSK_LABEL(l)}</option>)}
        </select>
        <span class="sub">{Math.max(0, knownAtLevel)}/{totalAtLevel}</span>
      </div>
      <div class="progress"><div style={{ width: `${(Math.max(0, knownAtLevel) / totalAtLevel) * 100}%` }} /></div>
      {cur ? (
        <>
          <div class="prompt" onClick={() => setPeek(true)}>
            <div class="sub">Do you already know this word?</div>
            <div class="hz">{cur}</div>
            {peek ? (
              <>
                <div class="py">{hsk[cur][1]}</div>
                <div style={{ maxWidth: 460 }}>{entry?.[1]?.slice(0, 3).join('; ')}</div>
              </>
            ) : (
              <button class="btn ghost small"><IconEye width="16" /> Peek</button>
            )}
            <button class="icon-btn" onClick={(e) => { e.stopPropagation(); speak(cur); }}><IconSound /></button>
          </div>
          <div class="stack">
            <div class="grades" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button class="g2" onClick={() => act('familiar')}>Familiar<small>I recognise it</small></button>
              <button class="g3" onClick={() => act('well')}>Know it well<small>no need to drill</small></button>
            </div>
            <div class="grades" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button class="g1" onClick={() => act('learn')}>Learn it<small>add to new words</small></button>
              <button class="g0" onClick={() => act('skip')}>Skip<small>not now</small></button>
            </div>
            <div class="between">
              <button class="btn ghost small" disabled={!history.length} onClick={undo}>↶ Undo</button>
              <span class="note">+{counts.well + counts.familiar} known · {counts.learn} to learn</span>
            </div>
          </div>
        </>
      ) : (
        <div class="empty" style={{ paddingTop: 40 }}>
          <div class="big" style={{ color: 'var(--good)' }}>✓</div>
          <p>You've been through all of {HSK_LABEL(level)}.</p>
          {level < 7 && <button class="btn" onClick={() => setLevel(level + 1)}>Continue with {HSK_LABEL(level + 1)}</button>}
          <p><button class="btn ghost" onClick={onBack}>Done</button></p>
        </div>
      )}
      <p class="note" style={{ textAlign: 'center' }}>Known words go straight to your library with long review intervals, so they only come up now and then.</p>
    </div>
  );
}
