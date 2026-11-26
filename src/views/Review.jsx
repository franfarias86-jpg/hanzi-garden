import { useEffect, useMemo, useState } from 'preact/hooks';
import { useWords, useSettings, recordReview, openWord } from '../lib/store.js';
import { putWord } from '../lib/db.js';
import { schedule, isDue, SKILL_LABEL } from '../lib/srs.js';
import { examplesFor, isHan } from '../lib/data.js';
import { speak, playSentence } from '../lib/speech.js';
import { StrokeQuiz } from '../components/Stroke.jsx';
import { Highlight } from '../components/WordSheet.jsx';
import { IconSound, IconX, IconEye } from '../components/icons.jsx';

const MODES = [
  { id: 'mixed', label: 'Mixed review', desc: 'Everything that is due', skills: ['meaning', 'listening', 'writing'] },
  { id: 'meaning', label: 'Hanzi → meaning', desc: 'See it, recall pinyin & meaning', skills: ['meaning'] },
  { id: 'choice', label: 'Definitions', desc: 'Pick the right definition', skills: ['meaning'] },
  { id: 'listening', label: 'Listening', desc: 'Hear it in a sentence', skills: ['listening'] },
  { id: 'writing', label: 'Writing', desc: 'Write it stroke by stroke', skills: ['writing'] },
];

const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function dueList(words, skills, now = Date.now()) {
  const out = [];
  for (const w of words.values()) for (const s of skills) if (isDue(w.srs[s], now)) out.push({ id: w.id, skill: s });
  return out;
}

function buildQueue(words, mode, size, extra) {
  const m = MODES.find((x) => x.id === mode);
  let items = dueList(words, m.skills);
  // reviewed cards first (most overdue), then new ones
  items.sort((a, b) => {
    const sa = words.get(a.id).srs[a.skill], sb = words.get(b.id).srs[b.skill];
    return (sa.reps === 0) - (sb.reps === 0) || sa.due - sb.due;
  });
  if (extra === 'all') items = shuffle([...words.values()].map((w) => ({ id: w.id, skill: m.skills[Math.floor(Math.random() * m.skills.length)] })));
  if (extra === 'starred') items = shuffle([...words.values()].filter((w) => w.starred).map((w) => ({ id: w.id, skill: m.skills[Math.floor(Math.random() * m.skills.length)] })));
  // avoid the same word twice in a row in mixed mode
  const seen = new Set();
  const first = [], later = [];
  for (const it of items) (seen.has(it.id) ? later : first).push(it), seen.add(it.id);
  items = [...first, ...later].slice(0, size);
  return items.map((it) => ({ ...it, kind: mode === 'choice' ? 'choice' : it.skill === 'meaning' && mode === 'mixed' && Math.random() < 0.4 && words.size >= 4 ? 'choice' : it.skill }));
}

export function Review() {
  const words = useWords();
  const settings = useSettings();
  const [session, setSession] = useState(null);
  const now = Date.now();
  const counts = useMemo(() => {
    if (!words) return {};
    const c = {};
    for (const m of MODES) c[m.id] = dueList(words, m.skills, now).length;
    return c;
  }, [words, session]);

  if (!words) return null;
  if (session) return <Session queue={session.queue} label={session.label} onExit={() => setSession(null)} />;

  const start = (mode, extra) => {
    const queue = buildQueue(words, mode, settings.sessionSize, extra);
    if (queue.length) setSession({ queue, label: MODES.find((m) => m.id === mode).label });
  };
  const starred = [...words.values()].filter((w) => w.starred).length;

  return (
    <div class="page">
      <div class="page-head"><div><h1>Review</h1><div class="sub">{counts.mixed || 0} reviews due</div></div></div>
      {words.size === 0 ? (
        <div class="empty"><div class="big">复习</div>Add some words to your library first.</div>
      ) : (
        <>
          <button class="card mode" style={{ width: '100%', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} disabled={!counts.mixed} onClick={() => start('mixed')}>
            <span><b>Mixed review</b><span class="sub">Meaning, listening and writing — all that's due</span></span>
            <span class="n">{counts.mixed}</span>
          </button>
          <div class="modes">
            {MODES.slice(1).map((m) => (
              <button key={m.id} class="card mode" disabled={!counts[m.id]} onClick={() => start(m.id)} style={!counts[m.id] ? { opacity: 0.55 } : {}}>
                <span class="n">{counts[m.id]}</span>
                <b>{m.label}</b>
                <span class="sub">{m.desc}</span>
              </button>
            ))}
          </div>
          <h2>Extra practice</h2>
          <div class="card list">
            {MODES.slice(1).map((m) => (
              <button class="row" key={m.id} onClick={() => start(m.id, 'all')}>
                <span class="meta"><b>{m.label}</b><div class="def">Random words from your whole library</div></span>
              </button>
            ))}
            {starred > 0 && (
              <button class="row" onClick={() => start('mixed', 'starred')}>
                <span class="meta"><b>★ Starred words</b><div class="def">{starred} words</div></span>
              </button>
            )}
          </div>
          <p class="note">Extra practice still updates the schedule of each word.</p>
        </>
      )}
    </div>
  );
}

function Session({ queue: initial, label, onExit }) {
  const words = useWords();
  const [queue, setQueue] = useState(initial);
  const [i, setI] = useState(0);
  const [results, setResults] = useState({ right: 0, total: 0 });
  const [requeued, setRequeued] = useState(new Set());
  const item = queue[i];
  const word = item && words.get(item.id);

  const grade = async (g) => {
    const w = words.get(item.id);
    await putWord({ ...w, srs: { ...w.srs, [item.skill]: schedule(w.srs[item.skill], g) } });
    await recordReview(g > 0);
    setResults((r) => ({ right: r.right + (g > 0 ? 1 : 0), total: r.total + 1 }));
    if (g === 0 && !requeued.has(i)) {
      setRequeued(new Set(requeued).add(queue.length));
      setQueue([...queue, { ...item }]);
    }
    setI(i + 1);
  };

  if (!item || !word) {
    return (
      <div class="page">
        <div class="empty" style={{ paddingTop: 80 }}>
          <div class="big" style={{ color: 'var(--good)' }}>好!</div>
          <h1 style={{ color: 'var(--ink)' }}>Session complete</h1>
          <p>{results.right} of {results.total} correct</p>
          <button class="btn" onClick={onExit}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div class="page review">
      <div class="between">
        <button class="icon-btn plain" onClick={onExit} aria-label="End session"><IconX /></button>
        <span class="sub">{label === 'Mixed review' ? `Mixed · ${SKILL_LABEL[item.skill]}` : label}</span>
        <span class="sub">{i + 1}/{queue.length}</span>
      </div>
      <div class="progress"><div style={{ width: `${(i / queue.length) * 100}%` }} /></div>
      {item.kind === 'meaning' && <FlashCard key={i} word={word} onGrade={grade} />}
      {item.kind === 'choice' && <ChoiceCard key={i} word={word} words={words} onGrade={grade} />}
      {item.kind === 'listening' && <ListenCard key={i} word={word} words={words} onGrade={grade} />}
      {item.kind === 'writing' && <WriteCard key={i} word={word} onGrade={grade} />}
    </div>
  );
}

function Grades({ onGrade }) {
  return (
    <div class="grades">
      <button class="g0" onClick={() => onGrade(0)}>Again<small>forgot</small></button>
      <button class="g1" onClick={() => onGrade(1)}>Hard<small>struggled</small></button>
      <button class="g2" onClick={() => onGrade(2)}>Good<small>got it</small></button>
      <button class="g3" onClick={() => onGrade(3)}>Easy<small>instant</small></button>
    </div>
  );
}

function Continue({ correct, onGrade, word }) {
  return (
    <div class="stack">
      <div class={correct ? 'chip good' : 'chip'} style={{ textAlign: 'center', padding: 8, fontSize: 15 }}>{correct ? 'Correct!' : 'Not quite — it will come back soon.'}</div>
      <div class="between">
        <button class="btn plain" onClick={() => openWord(word.id)}>Details</button>
        <button class="btn" style={{ flex: 1 }} onClick={() => onGrade(correct ? 2 : 0)}>Continue</button>
      </div>
    </div>
  );
}

function useExample(word) {
  const [ex, setEx] = useState(undefined);
  useEffect(() => {
    examplesFor(word.id, 12).then((list) => {
      const all = [...(word.examples || []).map((e) => ({ ...e, custom: true })), ...list];
      setEx(all.length ? all[Math.floor(Math.random() * Math.min(all.length, 5))] : null);
    });
  }, [word.id]);
  return ex;
}

function Answer({ word, ex }) {
  return (
    <>
      <div class="py">{word.pinyin}</div>
      <div style={{ maxWidth: 480 }}>{word.defs.slice(0, 4).join('; ')}</div>
      {ex && (
        <div class="card" style={{ padding: 12, marginTop: 8, textAlign: 'left', display: 'flex', gap: 10 }}>
          <button class="icon-btn" onClick={() => playSentence(ex)}><IconSound /></button>
          <div>
            <div class="zh" style={{ fontSize: 19 }}><Highlight text={ex.zh} word={word.id} /></div>
            <div class="sub">{ex.en}</div>
          </div>
        </div>
      )}
    </>
  );
}

function FlashCard({ word, onGrade }) {
  const [shown, setShown] = useState(false);
  const ex = useExample(word);
  const reveal = () => { setShown(true); speak(word.id); };
  return (
    <>
      <div class="prompt">
        <div class="hz">{word.hanzi}</div>
        {shown ? <Answer word={word} ex={ex} /> : <div class="sub">Say the pinyin and meaning, then reveal.</div>}
      </div>
      {shown ? <Grades onGrade={onGrade} /> : <button class="btn block" onClick={reveal}><IconEye width="20" /> Show answer</button>}
    </>
  );
}

function pickDistractors(word, words, n, key) {
  const pool = shuffle([...words.values()].filter((w) => w.id !== word.id && key(w) && key(w) !== key(word)));
  // prefer same length (for hanzi) to make it harder
  pool.sort((a, b) => (Math.abs(a.hanzi.length - word.hanzi.length) - Math.abs(b.hanzi.length - word.hanzi.length)));
  return pool.slice(0, n);
}

function ChoiceCard({ word, words, onGrade }) {
  const ex = useExample(word);
  const short = (w) => w.defs.slice(0, 2).join('; ');
  const options = useMemo(() => shuffle([word, ...pickDistractors(word, words, 3, short)]), [word.id]);
  const [picked, setPicked] = useState(null);
  const choose = (w) => { if (!picked) { setPicked(w); speak(word.id); } };
  return (
    <>
      <div class="prompt">
        <div class="hz">{word.hanzi}</div>
        {picked && <div class="py">{word.pinyin}</div>}
        <div class="choices" style={{ marginTop: 10 }}>
          {options.map((o) => (
            <button key={o.id} class={`choice ${picked ? (o.id === word.id ? 'right' : o === picked ? 'wrong' : '') : ''}`} onClick={() => choose(o)}>
              {short(o) || o.pinyin}
              {picked && o.id !== word.id && <span class="sub"> — {o.hanzi}</span>}
            </button>
          ))}
        </div>
        {picked && ex && <Answer word={{ ...word, defs: [] , pinyin: '' }} ex={ex} />}
      </div>
      {picked && <Continue correct={picked.id === word.id} onGrade={onGrade} word={word} />}
    </>
  );
}

function ListenCard({ word, words, onGrade }) {
  const ex = useExample(word);
  const options = useMemo(() => shuffle([word, ...pickDistractors(word, words, 3, (w) => w.hanzi)]), [word.id]);
  const [picked, setPicked] = useState(null);
  const [slow, setSlow] = useState(false);
  const play = (s = slow) => (ex ? playSentence(ex, { slow: s }) : speak(word.id, s ? { rate: 0.55 } : {}));
  useEffect(() => { if (ex !== undefined) setTimeout(() => play(false), 300); }, [ex]);
  if (ex === undefined) return <div class="prompt" />;
  return (
    <>
      <div class="prompt">
        <div class="sub">{ex ? 'Listen to the sentence. Which word did you hear?' : 'Listen. Which word is it?'}</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button class="icon-btn" style={{ width: 72, height: 72, borderRadius: 36 }} onClick={() => play(false)} aria-label="Play"><IconSound width="34" height="34" /></button>
          <button class="btn secondary small" style={{ alignSelf: 'center' }} onClick={() => { setSlow(true); play(true); }}>🐢 Slow</button>
        </div>
        {picked && ex && (
          <div class="card" style={{ padding: 12, textAlign: 'left' }}>
            <div class="zh" style={{ fontSize: 21 }}><Highlight text={ex.zh} word={word.id} /></div>
            {ex.py && <div class="py" style={{ fontSize: 14 }}>{ex.py}</div>}
            <div class="sub">{ex.en}</div>
          </div>
        )}
        <div class="choices" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
          {options.map((o) => (
            <button key={o.id} class={`choice zh ${picked ? (o.id === word.id ? 'right' : o === picked ? 'wrong' : '') : ''}`} onClick={() => !picked && setPicked(o)}>
              {o.hanzi}
              {picked && <div class="sub" style={{ fontSize: 12, fontFamily: 'system-ui' }}>{o.pinyin}</div>}
            </button>
          ))}
        </div>
      </div>
      {picked && <Continue correct={picked.id === word.id} onGrade={onGrade} word={word} />}
    </>
  );
}

function WriteCard({ word, onGrade }) {
  const chars = [...word.hanzi].filter(isHan);
  const [ci, setCi] = useState(0);
  const [total, setTotal] = useState({ mistakes: 0, hint: false });
  const [done, setDone] = useState(false);
  const size = Math.min(280, window.innerWidth - 64);
  const onCharDone = ({ mistakes, usedHint }) => {
    const t = { mistakes: total.mistakes + mistakes, hint: total.hint || usedHint };
    setTotal(t);
    if (ci + 1 < chars.length) setTimeout(() => setCi(ci + 1), 500);
    else { setDone(true); speak(word.id); }
  };
  const suggested = total.hint || total.mistakes > 4 ? 0 : total.mistakes > 1 ? 1 : total.mistakes === 1 ? 2 : 3;
  return (
    <>
      <div class="prompt" style={{ justifyContent: 'flex-start' }}>
        <div class="py">{word.pinyin}</div>
        <div style={{ maxWidth: 480 }}>{word.defs.slice(0, 3).join('; ')}</div>
        <div class="zh" style={{ fontSize: 30, letterSpacing: 4 }}>
          {chars.map((c, i) => <span key={i} style={{ color: i < ci || done ? 'var(--ink)' : i === ci ? 'var(--accent)' : 'var(--line)' }}>{i < ci || done ? c : '□'}</span>)}
        </div>
        {!done && <StrokeQuiz key={ci} char={chars[ci]} size={size} onDone={onCharDone} />}
        {done && <div class="hz">{word.hanzi}</div>}
      </div>
      {done && (
        <div class="stack">
          <div class="note" style={{ textAlign: 'center' }}>{total.mistakes} mistake{total.mistakes === 1 ? '' : 's'}{total.hint ? ', used a hint' : ''}. How did it go?</div>
          <div class="grades">
            {['Again', 'Hard', 'Good', 'Easy'].map((l, g) => (
              <button key={g} class={`g${g}`} style={g === suggested ? { outline: '2px solid currentColor' } : {}} onClick={() => onGrade(g)}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
