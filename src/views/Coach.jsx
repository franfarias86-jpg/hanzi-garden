// For the helper: what the learner finds hard, what's still waiting to be learned, and what you added.
import { useMemo } from 'preact/hooks';
import { useWords, useSettings, openWord } from '../lib/store.js';
import { isNewWord } from '../lib/srs.js';
import { IconSound } from '../components/icons.jsx';
import { playWordAudio } from '../lib/speech.js';

function Rows({ list, right }) {
  return (
    <div class="card list">
      {list.map((w) => (
        <div class="row" key={w.id}>
          <button class="row" style={{ padding: 0, border: 0, flex: 1 }} onClick={() => openWord(w.id)}>
            <span class="hz">{w.hanzi}</span>
            <span class="meta"><div class="py">{w.pinyin}</div><div class="def">{w.defs.slice(0, 2).join('; ')}</div></span>
            {right?.(w)}
          </button>
          <button class="icon-btn plain" onClick={() => playWordAudio(w)}><IconSound /></button>
        </div>
      ))}
    </div>
  );
}

export function Coach() {
  const words = useWords();
  const settings = useSettings();
  const me = settings.sync?.name;
  const all = useMemo(() => (words ? [...words.values()] : []), [words]);
  const hard = all
    .filter((w) => !isNewWord(w))
    .map((w) => ({ w, score: Object.values(w.srs).reduce((n, s) => n + s.lapses * 2 + (s.ease < 2.2 ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((x) => x.w);
  const waiting = all.filter(isNewWord).sort((a, b) => b.addedAt - a.addedAt);
  const mine = all.filter((w) => me && w.addedBy === me).sort((a, b) => b.addedAt - a.addedAt).slice(0, 30);
  const noAudio = mine.filter((w) => !w.hasAudio).length;

  return (
    <div class="page">
      <div class="page-head"><div><h1>Coach</h1><div class="sub">Help with what's hard</div></div></div>
      <h2>Hardest words right now</h2>
      {hard.length ? <Rows list={hard} /> : <div class="card empty" style={{ padding: 18 }}>Nothing is giving trouble yet. 👍</div>}
      <p class="note">Use them in conversation today — hearing them from you is the best review.</p>
      <h2>Waiting to be learned ({waiting.length})</h2>
      {waiting.length ? <Rows list={waiting.slice(0, 30)} right={() => <span class="chip new">new</span>} /> : <div class="card empty" style={{ padding: 18 }}>All caught up.</div>}
      {mine.length > 0 && (
        <>
          <h2>Added by you</h2>
          {noAudio > 0 && <p class="note">{noAudio} of these have no recording yet — open a word and tap “Record my voice”.</p>}
          <Rows list={mine} right={(w) => (w.hasAudio ? <span class="chip good">🎙</span> : null)} />
        </>
      )}
    </div>
  );
}
