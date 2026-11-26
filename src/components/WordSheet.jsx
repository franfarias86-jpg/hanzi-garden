import { useEffect, useState } from 'preact/hooks';
import { Sheet, toast, Spinner } from './ui.jsx';
import { StrokeAnim, StrokeQuiz } from './Stroke.jsx';
import { IconSound, IconStar, IconTrash, IconPen, IconSparkle, IconPlus, IconHighlight } from './icons.jsx';
import { useWords, useSettings, closeSheet, openChar, openWord } from '../lib/store.js';
import { putWord, deleteWord, makeWord } from '../lib/db.js';
import { draftWord, examplesFor, lookup, HSK_LABEL, isHan, loadHsk, loadDict } from '../lib/data.js';
import { speak, playSentence } from '../lib/speech.js';
import { SKILLS, SKILL_LABEL, nextDueLabel } from '../lib/srs.js';
import { generateExamples, friendlyError } from '../lib/claude.js';
import { estimateLevel } from '../lib/level.js';

export function Highlight({ text, word }) {
  if (!word || !text.includes(word)) return <>{text}</>;
  const parts = text.split(word);
  return (
    <>
      {parts.map((p, i) => (
        <>
          {p}
          {i < parts.length - 1 && <mark>{word}</mark>}
        </>
      ))}
    </>
  );
}

export function ExampleList({ word, examples }) {
  if (!examples.length) return null;
  return (
    <div class="card list">
      {examples.map((s, i) => (
        <div class="ex" key={i}>
          <button class="icon-btn" onClick={() => playSentence(s)} aria-label="Play"><IconSound /></button>
          <div style={{ flex: 1 }}>
            <div class="zh"><Highlight text={s.zh} word={word} /></div>
            {s.py && <div class="py">{s.py}</div>}
            {s.en && <div class="en">{s.en}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WordSheet({ word: id, context }) {
  const words = useWords();
  const settings = useSettings();
  const saved = words?.get(id);
  const [draft, setDraft] = useState(null);
  const [examples, setExamples] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [practice, setPractice] = useState(null);
  const [hsk, setHsk] = useState(null);
  const [hlOn, setHlOn] = useState(false);
  useEffect(() => setHlOn(!!context?.highlight?.on), [id, context]);

  useEffect(() => {
    setEditing(false);
    setPractice(null);
    draftWord(id).then(setDraft);
    examplesFor(id).then(setExamples);
    lookup(id).then((l) => setHsk(l.hsk));
  }, [id]);

  const w = saved || (draft && { ...draft, defs: draft.defs, examples: [] });
  if (!w) return <Sheet onClose={closeSheet}><div class="empty"><Spinner /></div></Sheet>;

  const chars = [...id].filter(isHan);
  const allExamples = [...(saved?.examples || []).map((e) => ({ ...e, custom: true })), ...examples];

  const add = async () => {
    const extra = [];
    if (context?.sentence) extra.push({ zh: context.sentence.zh, py: context.sentence.py || '', en: context.sentence.en || '' });
    const defs = draft.defs.length ? draft.defs : context?.gloss ? [context.gloss] : [];
    if (context?.gloss && draft.defs.length && !draft.defs.some((d) => d.toLowerCase().includes(context.gloss.toLowerCase())))
      defs.unshift(context.gloss);
    await putWord(makeWord({ hanzi: id, pinyin: context?.pinyin || draft.pinyin, defs, examples: extra, source: context?.source || 'manual' }));
    toast(`Added ${id} to your library`);
  };

  const startEdit = () => {
    setForm({ pinyin: saved.pinyin, defs: saved.defs.join('\n'), note: saved.note || '' });
    setEditing(true);
  };
  const saveEdit = async () => {
    await putWord({ ...saved, pinyin: form.pinyin.trim(), defs: form.defs.split('\n').map((d) => d.trim()).filter(Boolean), note: form.note });
    setEditing(false);
  };
  const remove = async () => {
    if (!confirm(`Remove ${id} from your library? Its review history will be lost.`)) return;
    await deleteWord(id);
    closeSheet();
  };
  const aiExamples = async () => {
    setAiBusy(true);
    try {
      const est = await estimateLevel(words);
      const known = [...words.keys()];
      const { data } = await generateExamples({
        apiKey: settings.apiKey, model: settings.model, word: id, pinyin: w.pinyin, defs: w.defs, level: est.storyLevel, knownWords: known,
      });
      await putWord({ ...saved, examples: [...(saved.examples || []), ...data.examples] });
    } catch (e) {
      toast(friendlyError(e));
    }
    setAiBusy(false);
  };

  return (
    <Sheet onClose={closeSheet}>
      <div class="word-hero">
        <div class="hz">{id}</div>
        <div style={{ flex: 1 }}>
          <div class="py">{w.pinyin}</div>
          <div class="chips" style={{ marginTop: 4 }}>
            {hsk && <span class="chip muted">{HSK_LABEL(hsk)}</span>}
            {saved ? <span class="chip good">In library</span> : <span class="chip new">New word</span>}
          </div>
        </div>
        <button class="icon-btn" onClick={() => speak(id)} aria-label="Pronounce"><IconSound /></button>
      </div>

      {context?.gloss && (
        <p class="sub" style={{ margin: '4px 0 0' }}>
          In this story: <b style={{ color: 'var(--ink)' }}>{context.gloss}</b>
        </p>
      )}

      {context?.highlight && (
        <button class="btn plain block" style={{ marginTop: 12, background: hlOn ? 'var(--hl)' : undefined }} onClick={() => { context.highlight.toggle(); setHlOn(!hlOn); }}>
          <IconHighlight width="18" /> {hlOn ? 'Highlighted in this story' : 'Highlight in this story'}
        </button>
      )}

      {!saved && (
        <button class="btn block" style={{ marginTop: 14 }} onClick={add}>
          <IconPlus width="20" /> Add to my library
        </button>
      )}

      {editing ? (
        <div style={{ marginTop: 14 }}>
          <div class="form-row"><label>Pinyin</label><input class="field" value={form.pinyin} onInput={(e) => setForm({ ...form, pinyin: e.target.value })} /></div>
          <div class="form-row"><label>Definitions (one per line)</label><textarea class="field" rows={6} value={form.defs} onInput={(e) => setForm({ ...form, defs: e.target.value })} /></div>
          <div class="form-row"><label>My note</label><textarea class="field" value={form.note} onInput={(e) => setForm({ ...form, note: e.target.value })} placeholder="Mnemonic, where you heard it…" /></div>
          <div class="between"><button class="btn plain" onClick={() => setEditing(false)}>Cancel</button><button class="btn" onClick={saveEdit}>Save</button></div>
        </div>
      ) : (
        <>
          <h2>Definitions</h2>
          <div class="card" style={{ padding: '10px 14px' }}>
            {w.defs.length ? <ol class="defs">{w.defs.map((d, i) => <li key={i}>{d}</li>)}</ol> : <span class="sub">No dictionary entry. {saved && 'Tap edit to add your own.'}</span>}
            {saved?.note && <p style={{ margin: '8px 0 0' }}><i>{saved.note}</i></p>}
          </div>
        </>
      )}

      {saved && !editing && (
        <div class="between" style={{ marginTop: 10 }}>
          <div class="chips">
            {SKILLS.map((s) => <span key={s} class="chip muted">{SKILL_LABEL[s]}: {nextDueLabel(saved.srs[s])}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button class="icon-btn" style={saved.starred ? { background: 'var(--accent)', color: '#fff' } : {}} onClick={() => putWord({ ...saved, starred: !saved.starred })} aria-label="Star"><IconStar /></button>
            <button class="icon-btn" onClick={startEdit} aria-label="Edit"><IconPen /></button>
          </div>
        </div>
      )}

      <h2>Characters</h2>
      <div class="charbox">
        {chars.map((c, i) => <button key={i} class="charbtn" onClick={() => openChar(c)}>{c}</button>)}
        <button class="btn secondary small" style={{ alignSelf: 'center' }} onClick={() => setPractice(practice ? null : 0)}>
          <IconPen width="16" /> {practice !== null ? 'Close practice' : 'Practice writing'}
        </button>
      </div>
      {practice !== null ? (
        <div style={{ marginTop: 14 }}>
          <StrokeQuiz char={chars[practice]} size={240} showOutline onDone={() => setTimeout(() => setPractice((p) => (p + 1 < chars.length ? p + 1 : null)), 700)} />
          <p class="note" style={{ textAlign: 'center' }}>Trace {chars[practice]} ({practice + 1}/{chars.length}). The grey outline is shown while practising.</p>
        </div>
      ) : (
        <div class="charbox" style={{ marginTop: 12, justifyContent: 'center' }}>
          {chars.slice(0, 4).map((c, i) => <StrokeAnim key={c + i} char={c} size={chars.length > 2 ? 100 : 140} />)}
        </div>
      )}

      <div class="between" style={{ marginTop: 6 }}>
        <h2>Examples</h2>
        {saved && (
          <button class="btn ghost small" disabled={aiBusy} onClick={aiExamples}>
            {aiBusy ? <Spinner /> : <IconSparkle width="16" />} More with AI
          </button>
        )}
      </div>
      {allExamples.length ? <ExampleList word={id} examples={allExamples} /> : <div class="card empty" style={{ padding: 18 }}>No example sentences yet{saved ? ' — try “More with AI”.' : '.'}</div>}

      {saved && (
        <button class="btn ghost block" style={{ marginTop: 20, color: 'var(--muted)' }} onClick={remove}>
          <IconTrash width="18" /> Remove from library
        </button>
      )}
    </Sheet>
  );
}

export function CharSheet({ char }) {
  const words = useWords();
  const [info, setInfo] = useState(null);
  const [related, setRelated] = useState([]);
  const [quiz, setQuiz] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    setQuiz(false);
    lookup(char).then(setInfo);
    Promise.all([loadHsk(), loadDict()]).then(([hsk, dict]) => {
      const list = Object.keys(hsk)
        .filter((w) => w.includes(char) && w !== char)
        .sort((a, b) => hsk[a][0] - hsk[b][0] || a.length - b.length)
        .slice(0, 12)
        .map((w) => ({ w, py: hsk[w][1], def: dict[w]?.[0]?.[1]?.[0] || '' }));
      setRelated(list);
    });
  }, [char]);
  const mine = words ? [...words.values()].filter((w) => w.hanzi.includes(char)) : [];
  return (
    <Sheet onClose={closeSheet}>
      <div class="word-hero">
        <div class="hz">{char}</div>
        <div style={{ flex: 1 }}>
          <div class="py">{info?.entries.map((e) => e.py).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</div>
          {info?.hsk && <span class="chip muted">{HSK_LABEL(info.hsk)}</span>}
        </div>
        <button class="icon-btn" onClick={() => speak(char)}><IconSound /></button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
        {quiz ? (
          <div>
            <StrokeQuiz key={round} char={char} size={240} showOutline={round === 0} onDone={() => {}} />
            <div class="between" style={{ marginTop: 8 }}>
              <button class="btn plain small" onClick={() => setRound((r) => r + 1)}>Again {round > 0 ? '' : '(no outline)'}</button>
              <button class="btn plain small" onClick={() => setQuiz(false)}>Done</button>
            </div>
          </div>
        ) : (
          <StrokeAnim char={char} size={200} />
        )}
      </div>
      {!quiz && <button class="btn secondary block" onClick={() => { setRound(0); setQuiz(true); }}><IconPen width="18" /> Practice writing {char}</button>}
      {info?.entries.length > 0 && (
        <>
          <h2>Meanings</h2>
          <div class="card" style={{ padding: '10px 14px' }}>
            {info.entries.slice(0, 4).map((e, i) => (
              <div key={i} style={{ marginBottom: 6 }}><b style={{ color: 'var(--accent)' }}>{e.py}</b> {e.defs.slice(0, 5).join('; ')}</div>
            ))}
          </div>
        </>
      )}
      {mine.length > 0 && (
        <>
          <h2>In your library ({mine.length})</h2>
          <div class="card list">
            {mine.map((w) => (
              <button class="row" key={w.id} onClick={() => openWord(w.id)}>
                <span class="hz">{w.hanzi}</span>
                <span class="meta"><div class="py">{w.pinyin}</div><div class="def">{w.defs[0]}</div></span>
              </button>
            ))}
          </div>
        </>
      )}
      {related.length > 0 && (
        <>
          <h2>Common words with {char}</h2>
          <div class="card list">
            {related.map((r) => (
              <button class="row" key={r.w} onClick={() => openWord(r.w)}>
                <span class="hz" style={{ fontSize: 20 }}>{r.w}</span>
                <span class="meta"><div class="py">{r.py}</div><div class="def">{r.def}</div></span>
                {words?.has(r.w) && <span class="chip good">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
