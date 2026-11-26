// Learn mode: active learning for words that were just added.
// Each word is studied once, then climbs a ladder of exercises that ask for more and more recall.
// Mistakes never just reveal the answer: the learner gets a hint and has to produce the answer,
// and the word comes back a few turns later at the same step.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { pinyin as pinyinPro } from 'pinyin-pro';
import { useWords, useSettings, recordReview } from '../lib/store.js';
import { putWord } from '../lib/db.js';
import { graduate } from '../lib/srs.js';
import { examplesFor, isHan, HSK_LABEL, lookup } from '../lib/data.js';
import { speak, playSentence, playWordAudio } from '../lib/speech.js';
import { checkPinyin, pinyinHint } from '../lib/pinyin.js';
import { StrokeAnim, StrokeQuiz } from '../components/Stroke.jsx';
import { Highlight } from '../components/WordSheet.jsx';
import { IconSound, IconX, IconEye } from '../components/icons.jsx';

const STEPS = ['meaning', 'sound', 'pinyin', 'write', 'recall'];
const STEP_LABEL = { meaning: 'Recognise the meaning', sound: 'Recognise the sound', pinyin: 'Recall the pinyin', write: 'Write it', recall: 'Recall from meaning' };

const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const short = (w) => w.defs.slice(0, 2).join('; ') || w.pinyin;

// pick the next thing to do: introduce a word while fewer than 3 are in practice,
// otherwise the eligible word with the lowest step (never the same word twice in a row if avoidable)
function nextItem(state, last) {
  const active = state.filter((s) => s.stage >= 0 && s.stage < s.steps.length);
  const unseen = state.filter((s) => s.stage === -1);
  if (unseen.length && (active.length < 3 || active.every((s) => s.wait > 0))) return { s: unseen[0], kind: 'study' };
  if (!active.length) return null;
  let cand = active.filter((s) => s.wait <= 0 && s.id !== last);
  if (!cand.length) cand = active.filter((s) => s.id !== last);
  if (!cand.length) cand = active;
  cand.sort((a, b) => a.wait - b.wait || a.stage - b.stage);
  const s = cand[0];
  return { s, kind: s.steps[s.stage] };
}

export function pickNewWords(words, n) {
  return [...words.values()].filter((w) => w.learned === false || (w.learned === undefined && !(w.srs?.meaning?.reps > 0))).sort((a, b) => a.addedAt - b.addedAt).slice(0, n);
}

export function Learn({ ids, onExit }) {
  const words = useWords();
  const settings = useSettings();
  const steps = settings.learnWriting === false ? STEPS.filter((s) => s !== 'write') : STEPS;
  const [state, setState] = useState(() => ids.map((id) => ({ id, stage: -1, wait: 0, fails: 0, steps })));
  const [turn, setTurn] = useState(0);
  const [lastId, setLastId] = useState(null);
  const [graduated, setGraduated] = useState([]);
  const item = useMemo(() => nextItem(state, lastId), [turn]);

  const advance = async (id, ok) => {
    const next = state.map((s) => {
      if (s.id === id) {
        if (s.stage === -1) return { ...s, stage: 0, wait: 1 };
        if (ok) return { ...s, stage: s.stage + 1, wait: 2 };
        return { ...s, fails: s.fails + 1, wait: 2 };
      }
      return { ...s, wait: s.wait - 1 };
    });
    const me = next.find((s) => s.id === id);
    if (item.kind !== 'study') await recordReview(ok);
    if (me.stage === me.steps.length) {
      await putWord(graduate(words.get(id), { fails: me.fails }));
      setGraduated((g) => [...g, id]);
    }
    setState(next);
    setLastId(id);
    setTurn((t) => t + 1);
  };

  const total = state.length * (steps.length + 1);
  const done = state.reduce((n, s) => n + (s.stage + 1), 0);

  if (!item) {
    return (
      <div class="page">
        <div class="empty" style={{ paddingTop: 60 }}>
          <div class="big" style={{ color: 'var(--good)' }}>学会了</div>
          <h1 style={{ color: 'var(--ink)' }}>{graduated.length} new word{graduated.length === 1 ? '' : 's'} learned</h1>
          <p class="zh" style={{ fontSize: 24 }}>{graduated.join('  ')}</p>
          <p>They now move into your reviews. The first review is tomorrow — sooner for the ones that gave you trouble.</p>
          <button class="btn" onClick={onExit}>Done</button>
        </div>
      </div>
    );
  }
  const word = words?.get(item.s.id);
  if (!word) return null;
  const others = [...words.values()].filter((w) => w.id !== word.id);
  const props = { word, others, onResult: (ok) => advance(word.id, ok) };

  return (
    <div class="page review">
      <div class="between">
        <button class="icon-btn plain" onClick={onExit} aria-label="Stop"><IconX /></button>
        <span class="sub">{item.kind === 'study' ? 'New word' : STEP_LABEL[item.kind]}</span>
        <span class="sub">{graduated.length}/{state.length} learned</span>
      </div>
      <div class="progress"><div style={{ width: `${(done / total) * 100}%`, background: 'var(--good)' }} /></div>
      {item.kind === 'study' && <Study key={turn} {...props} />}
      {item.kind === 'meaning' && <PickMeaning key={turn} {...props} />}
      {item.kind === 'sound' && <PickBySound key={turn} {...props} />}
      {item.kind === 'pinyin' && <TypePinyin key={turn} {...props} />}
      {item.kind === 'write' && <WriteIt key={turn} {...props} />}
      {item.kind === 'recall' && <Recall key={turn} {...props} />}
    </div>
  );
}

function useExample(word) {
  const [ex, setEx] = useState(null);
  useEffect(() => {
    examplesFor(word.id, 6).then((list) => {
      const all = [...(word.examples || []).map((e) => ({ ...e, custom: true })), ...list];
      setEx(all[0] || null);
    });
  }, [word.id]);
  return ex;
}

function Study({ word, onResult }) {
  const ex = useExample(word);
  const [hsk, setHsk] = useState(null);
  const chars = [...word.hanzi].filter(isHan);
  useEffect(() => {
    playWordAudio(word);
    lookup(word.id).then((l) => setHsk(l.hsk));
  }, []);
  return (
    <>
      <div class="prompt" style={{ justifyContent: 'flex-start', gap: 6 }}>
        <div class="chips">
          <span class="chip new">New</span>
          {hsk && <span class="chip muted">{HSK_LABEL(hsk)}</span>}
          {word.addedBy && <span class="chip muted">from {word.addedBy}</span>}
        </div>
        <div class="hz">{word.hanzi}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span class="py">{word.pinyin}</span>
          <button class="icon-btn" onClick={() => playWordAudio(word)}><IconSound /></button>
        </div>
        <div style={{ maxWidth: 480 }}>{word.defs.slice(0, 4).join('; ')}</div>
        {word.note && <div class="note"><i>{word.note}</i></div>}
        <div class="charbox" style={{ justifyContent: 'center', margin: '6px 0' }}>
          {chars.slice(0, 4).map((c, i) => <StrokeAnim key={c + i} char={c} size={chars.length > 2 ? 86 : 110} />)}
        </div>
        {ex && (
          <div class="card" style={{ padding: 12, textAlign: 'left', display: 'flex', gap: 10, width: '100%' }}>
            <button class="icon-btn" onClick={() => playSentence(ex)}><IconSound /></button>
            <div>
              <div class="zh" style={{ fontSize: 19 }}><Highlight text={ex.zh} word={word.id} /></div>
              {ex.py && <div class="py" style={{ fontSize: 13 }}>{ex.py}</div>}
              <div class="sub">{ex.en}</div>
            </div>
          </div>
        )}
        <p class="note">Say it out loud a couple of times. Notice the parts of each character. Then try to remember it.</p>
      </div>
      <button class="btn block" onClick={() => onResult(true)}>I've had a good look</button>
    </>
  );
}

// Multiple choice where a wrong pick is crossed out and you keep trying: you always find the answer yourself.
function Choices({ options, correctId, render, zh, onDone }) {
  const [wrong, setWrong] = useState(new Set());
  const [right, setRight] = useState(false);
  const pick = (o) => {
    if (right || wrong.has(o.id)) return;
    if (o.id === correctId) {
      setRight(true);
      setTimeout(() => onDone(wrong.size === 0), wrong.size ? 1100 : 600);
    } else setWrong(new Set(wrong).add(o.id));
  };
  return (
    <>
      <div class="choices" style={zh ? { gridTemplateColumns: '1fr 1fr' } : {}}>
        {options.map((o) => (
          <button key={o.id} class={`choice ${zh ? 'zh' : ''} ${wrong.has(o.id) ? 'wrong' : ''} ${right && o.id === correctId ? 'right' : ''}`} style={wrong.has(o.id) ? { opacity: 0.5, textDecoration: 'line-through' } : {}} onClick={() => pick(o)}>
            {render(o)}
          </button>
        ))}
      </div>
      {wrong.size > 0 && !right && <p class="note" style={{ textAlign: 'center' }}>Not that one — think again.</p>}
    </>
  );
}

function distractors(word, others, key, n = 3) {
  const pool = shuffle(others.filter((o) => key(o) && key(o) !== key(word)));
  pool.sort((a, b) => Math.abs([...a.hanzi].length - [...word.hanzi].length) - Math.abs([...b.hanzi].length - [...word.hanzi].length));
  return pool.slice(0, n);
}

function useFallbackPool(others) {
  // with very few words in the library, borrow simple distractors so multiple choice still works
  const [pool, setPool] = useState(others);
  useEffect(() => {
    if (others.length >= 3) return;
    Promise.all(['水', '书', '吃', '大', '朋友', '学校', '今天', '喜欢'].map((h) => lookup(h))).then((ls) =>
      setPool([...others, ...ls.filter((l) => l.entries.length).map((l) => ({ id: l.word, hanzi: l.word, pinyin: l.hskPinyin || l.entries[0].py, defs: l.entries[0].defs }))]),
    );
  }, []);
  return pool;
}

function PickMeaning({ word, others, onResult }) {
  const pool = useFallbackPool(others);
  const opts = useMemo(() => shuffle([word, ...distractors(word, pool.filter((p) => p.id !== word.id), short)]), [pool]);
  return (
    <>
      <div class="prompt">
        <div class="hz">{word.hanzi}</div>
        <div class="sub">What does it mean?</div>
        <Choices key={word.id} options={opts} correctId={word.id} render={short} onDone={(ok) => { playWordAudio(word); onResult(ok); }} />
      </div>
    </>
  );
}

function PickBySound({ word, others, onResult }) {
  const pool = useFallbackPool(others);
  const opts = useMemo(() => shuffle([word, ...distractors(word, pool.filter((p) => p.id !== word.id), (w) => w.hanzi)]), [pool]);
  useEffect(() => { setTimeout(() => playWordAudio(word), 250); }, []);
  return (
    <div class="prompt">
      <div class="sub">Which word do you hear?</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button class="icon-btn" style={{ width: 72, height: 72, borderRadius: 36 }} onClick={() => playWordAudio(word)}><IconSound width="34" height="34" /></button>
        <button class="btn secondary small" style={{ alignSelf: 'center' }} onClick={() => speak(word.hanzi, { rate: 0.5 })}>🐢 Slow</button>
      </div>
      <Choices key={word.id} options={opts} correctId={word.id} zh render={(o) => o.hanzi} onDone={onResult} />
    </div>
  );
}

function TypePinyin({ word, onResult }) {
  const [val, setVal] = useState('');
  const [tries, setTries] = useState(0); // wrong attempts so far
  const [msg, setMsg] = useState('');
  const [solved, setSolved] = useState(null);
  const input = useRef();
  const syllables = useMemo(() => pinyinPro(word.hanzi, { type: 'array' }), [word.id]);
  useEffect(() => input.current?.focus(), []);
  const submit = (e) => {
    e.preventDefault();
    if (solved !== null) return onResult(solved);
    const r = checkPinyin(val, word.pinyin);
    if (r.ok) {
      setSolved(tries === 0);
      setMsg(r.toneless ? `Right! With tones: ${word.pinyin}` : 'Right!');
      playWordAudio(word);
      return;
    }
    const t = tries + 1;
    setTries(t);
    if (r.base && r.tonesOk === false) setMsg('The sounds are right — check the tones. Listen again.');
    else if (t === 1) setMsg(`Not quite. Hint: ${pinyinHint(syllables, 1)}`);
    else if (t === 2) setMsg(`Closer hint: ${pinyinHint(syllables, 2)}`);
    else setMsg(`It's “${word.pinyin}”. Type it to fix it in memory.`);
    if (r.base) playWordAudio(word);
    setVal('');
  };
  return (
    <form class="prompt" onSubmit={submit}>
      <div class="hz">{word.hanzi}</div>
      <div class="sub">Type the pinyin (tones optional: xue2xi2 or xuexi)</div>
      <input ref={input} class="field" style={{ textAlign: 'center', maxWidth: 320 }} autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck={false} value={val} onInput={(e) => setVal(e.target.value)} placeholder="pinyin" readOnly={solved !== null} />
      {msg && <div class={solved !== null ? 'chip good' : 'note'} style={{ padding: '6px 10px', fontSize: 15 }}>{msg}</div>}
      {tries >= 1 && solved === null && <button type="button" class="btn ghost small" onClick={() => playWordAudio(word)}><IconSound width="16" /> Listen</button>}
      <button class="btn block" style={{ marginTop: 10 }} disabled={!val.trim() && solved === null}>{solved !== null ? 'Continue' : 'Check'}</button>
    </form>
  );
}

function WriteIt({ word, onResult }) {
  const chars = [...word.hanzi].filter(isHan);
  const [ci, setCi] = useState(0);
  const [stats, setStats] = useState({ mistakes: 0, hint: false });
  const size = Math.min(260, window.innerWidth - 64);
  const done = (r) => {
    const s = { mistakes: stats.mistakes + r.mistakes, hint: stats.hint || r.usedHint };
    setStats(s);
    if (ci + 1 < chars.length) setTimeout(() => setCi(ci + 1), 400);
    else {
      playWordAudio(word);
      setTimeout(() => onResult(!s.hint && s.mistakes <= 2 * chars.length), 700);
    }
  };
  return (
    <div class="prompt" style={{ justifyContent: 'flex-start' }}>
      <div class="py">{word.pinyin}</div>
      <div>{short(word)}</div>
      <div class="zh" style={{ fontSize: 28, letterSpacing: 4 }}>
        {chars.map((c, i) => <span key={i} style={{ color: i < ci ? 'var(--ink)' : i === ci ? 'var(--accent)' : 'var(--line)' }}>{i < ci ? c : '□'}</span>)}
      </div>
      <StrokeQuiz key={ci} char={chars[ci]} size={size} guide={true} onDone={done} />
      <p class="note">First time: trace with the guide, or switch it off to test yourself.</p>
    </div>
  );
}

function Recall({ word, onResult }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <div class="prompt">
        <div class="sub">Which word means…</div>
        <div style={{ fontSize: 22, fontWeight: 600, maxWidth: 480 }}>{short(word)}</div>
        <div class="note">Say it out loud and picture the characters before you check.</div>
        {shown && (
          <>
            <div class="hz">{word.hanzi}</div>
            <div class="py">{word.pinyin}</div>
          </>
        )}
      </div>
      {shown ? (
        <div class="grades" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button class="g0" onClick={() => onResult(false)}>Didn't have it<small>show me again later</small></button>
          <button class="g2" onClick={() => onResult(true)}>I had it<small>sound + characters</small></button>
        </div>
      ) : (
        <button class="btn block" onClick={() => { setShown(true); playWordAudio(word); }}><IconEye width="20" /> Check</button>
      )}
    </>
  );
}
