import { useEffect, useMemo, useState } from 'preact/hooks';
import { useWords, useSettings, updateSettings, openWord, closeSheet } from '../lib/store.js';
import { listStories, getStory, putStory, deleteStory } from '../lib/db.js';
import { estimateLevel } from '../lib/level.js';
import { isDue } from '../lib/srs.js';
import { HSK_LABEL, isHan } from '../lib/data.js';
import { generateStory, friendlyError, LENGTHS } from '../lib/claude.js';
import { speak, stop } from '../lib/speech.js';
import { Seg, Spinner, toast } from '../components/ui.jsx';
import { IconPlus, IconBack, IconSound, IconTrash, IconSparkle, IconChev, IconPlay } from '../components/icons.jsx';

const isWordTok = (t) => [...t.t].some(isHan);
const tokText = (toks) => toks.map((t) => t.t).join('');
const tokPinyin = (toks) => toks.filter(isWordTok).map((t) => t.p).join(' ');

export function storyCoverage(story, words) {
  let total = 0, known = 0;
  const seen = new Set();
  for (const p of story.paragraphs) for (const s of p.sentences) for (const t of s.tokens) {
    if (!isWordTok(t)) continue;
    total++;
    if (words.has(t.t)) known++;
    seen.add(t.t);
  }
  const unknown = [...seen].filter((w) => !words.has(w));
  return { total, known, pct: total ? known / total : 0, unknown };
}

export function Stories() {
  const [view, setView] = useState({ name: 'list' });
  if (view.name === 'new') return <NewStory onBack={() => setView({ name: 'list' })} onCreated={(id) => setView({ name: 'read', id })} />;
  if (view.name === 'read') return <Reader id={view.id} onBack={() => { stop(); setView({ name: 'list' }); }} />;
  return <StoryList onNew={() => setView({ name: 'new' })} onOpen={(id) => setView({ name: 'read', id })} />;
}

function StoryList({ onNew, onOpen }) {
  const words = useWords();
  const [stories, setStories] = useState(null);
  useEffect(() => { listStories().then(setStories); }, []);
  return (
    <div class="page">
      <div class="page-head">
        <div><h1>Stories</h1><div class="sub">Graded to the words you know</div></div>
        <button class="btn" onClick={onNew}><IconSparkle width="18" /> New</button>
      </div>
      {stories?.length ? (
        <div class="card list">
          {stories.map((s) => {
            const c = words ? storyCoverage(s, words) : null;
            return (
              <button class="row" key={s.id} onClick={() => onOpen(s.id)}>
                <span class="meta">
                  <div class="zh" style={{ fontSize: 20 }}>{tokText(s.title)}</div>
                  <div class="def">{s.title_en} · {HSK_LABEL(s.level)}{c ? ` · ${Math.round(c.pct * 100)}% known` : ''}</div>
                </span>
                {s.highlights?.length > 0 && <span class="chip" style={{ background: 'var(--hl)', color: 'var(--ink)' }}>{s.highlights.length}</span>}
                <IconChev width="18" class="chev" />
              </button>
            );
          })}
        </div>
      ) : stories ? (
        <div class="empty">
          <div class="big">故事</div>
          Create a story written with the words in your library.<br />
          <button class="btn" style={{ marginTop: 16 }} onClick={onNew}><IconSparkle width="18" /> Write my first story</button>
        </div>
      ) : null}
    </div>
  );
}

function NewStory({ onBack, onCreated }) {
  const words = useWords();
  const settings = useSettings();
  const [est, setEst] = useState(null);
  const [topic, setTopic] = useState('');
  const [length, setLength] = useState('medium');
  const [newPct, setNewPct] = useState(5);
  const [focusDue, setFocusDue] = useState(true);
  const [level, setLevel] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (words) estimateLevel(words).then(setEst); }, [words]);

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const lv = level === 'auto' ? est.storyLevel : Number(level);
      const list = [...words.values()];
      const focus = focusDue ? list.filter((w) => w.srs.meaning.reps > 0 && isDue(w.srs.meaning)).slice(0, 12).map((w) => w.id) : [];
      const { data } = await generateStory({
        apiKey: settings.apiKey, model: settings.model, level: lv,
        knownWords: list.map((w) => w.id), focusWords: focus, topic, length, newWordPct: newPct,
      });
      const story = { id: crypto.randomUUID(), createdAt: Date.now(), level: lv, topic, highlights: [], model: settings.model, ...data };
      await putStory(story);
      onCreated(story.id);
    } catch (e) {
      setErr(friendlyError(e));
    }
    setBusy(false);
  };

  return (
    <div class="page">
      <div class="page-head" style={{ justifyContent: 'flex-start' }}>
        <button class="icon-btn plain" onClick={onBack}><IconBack /></button>
        <h1>New story</h1>
      </div>
      {est && (
        <div class="card" style={{ padding: 14, marginBottom: 16 }}>
          <div class="between"><b>Your level</b><span class="chip">{est.level ? HSK_LABEL(est.level) : 'Beginner'}</span></div>
          <div class="note">Based on {est.count} words in your library. The story will use them, plus a few new words.</div>
        </div>
      )}
      {!settings.apiKey && <div class="error" style={{ marginBottom: 14 }}>Stories are written by Claude. Add your Anthropic API key in <b>Settings</b> first.</div>}
      <div class="form-row"><label>Topic (optional)</label><input class="field" placeholder="e.g. a lost cat, ordering food, a trip to Chengdu" value={topic} onInput={(e) => setTopic(e.target.value)} /></div>
      <div class="form-row"><label>Length</label><Seg value={length} onChange={setLength} options={Object.entries(LENGTHS).map(([k, v]) => [k, v.label])} /></div>
      <div class="form-row"><label>New words</label><Seg value={newPct} onChange={setNewPct} options={[[0, 'None'], [5, 'A few'], [10, 'More']]} /></div>
      <div class="form-row">
        <label>Story level</label>
        <select class="field" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="auto">Automatic ({est ? HSK_LABEL(est.storyLevel) : '…'})</option>
          {[1, 2, 3, 4, 5, 6, 7].map((l) => <option key={l} value={l}>{HSK_LABEL(l)}</option>)}
        </select>
      </div>
      <label class="check-row card" style={{ marginBottom: 16 }}>
        <input type="checkbox" checked={focusDue} onChange={(e) => setFocusDue(e.target.checked)} />
        <span>Use the words I'm due to review</span>
      </label>
      {err && <div class="error" style={{ marginBottom: 12 }}>{err}</div>}
      <button class="btn block" disabled={busy || !settings.apiKey || !est} onClick={go}>
        {busy ? <><Spinner /> Writing your story…</> : <><IconSparkle width="18" /> Write story</>}
      </button>
      {busy && <p class="note" style={{ textAlign: 'center' }}>This usually takes 20–60 seconds.</p>}
    </div>
  );
}

function Reader({ id, onBack }) {
  const words = useWords();
  const settings = useSettings();
  const [story, setStory] = useState(null);
  const [showEn, setShowEn] = useState(false);
  const [openEn, setOpenEn] = useState(new Set());
  const [sel, setSel] = useState(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { getStory(id).then(setStory); return () => stop(); }, [id]);
  const cov = useMemo(() => (story && words ? storyCoverage(story, words) : null), [story, words]);
  if (!story || !words) return null;
  const pinyin = settings.showPinyin;
  const hl = new Set(story.highlights || []);

  const toggleHighlight = (w) =>
    setStory((prev) => {
      const h = new Set(prev.highlights || []);
      h.has(w) ? h.delete(w) : h.add(w);
      const s = { ...prev, highlights: [...h] };
      putStory(s);
      return s;
    });
  const tapWord = (t, s, key) => {
    setSel(key);
    speak(t.t);
    openWord(t.t, {
      gloss: t.g, pinyin: t.p, source: 'story',
      sentence: { zh: tokText(s.tokens), py: tokPinyin(s.tokens), en: s.en },
      highlight: { get on() { return new Set(story.highlights || []).has(t.t); }, toggle: () => toggleHighlight(t.t) },
    });
  };
  const playAll = async () => {
    if (playing) { stop(); setPlaying(false); return; }
    setPlaying(true);
    let cancelled = false;
    for (const p of story.paragraphs) for (const s of p.sentences) {
      if (cancelled) break;
      await speak(tokText(s.tokens));
      if (!document.querySelector('.reader')) cancelled = true;
    }
    setPlaying(false);
  };
  const remove = async () => {
    if (!confirm('Delete this story?')) return;
    await deleteStory(id);
    onBack();
  };

  const Tok = ({ t, s, k }) => {
    if (!isWordTok(t)) return <span>{t.t}</span>;
    const cls = `tok ${words.has(t.t) ? '' : 'new'} ${hl.has(t.t) ? 'hl' : ''} ${sel === k ? 'sel' : ''}`;
    return (
      <span class={cls} onClick={() => tapWord(t, s, k)}>
        {pinyin ? <ruby>{t.t}<rt>{t.p}</rt></ruby> : t.t}
      </span>
    );
  };

  return (
    <div class="page" style={{ paddingTop: 0 }}>
      <div class="toolbar">
        <button class="icon-btn plain" onClick={onBack}><IconBack /></button>
        <div style={{ flex: 1 }} />
        <button class={`btn small ${pinyin ? '' : 'plain'}`} onClick={() => updateSettings({ showPinyin: !pinyin })}>Pīnyīn</button>
        <button class={`btn small ${showEn ? '' : 'plain'}`} onClick={() => setShowEn(!showEn)}>EN</button>
        <button class="icon-btn" onClick={playAll} aria-label="Read aloud">{playing ? <span style={{ fontWeight: 700 }}>■</span> : <IconPlay width="16" />}</button>
      </div>
      <div class="reader zh">
        <h1 style={{ fontSize: 30, margin: '6px 0 0', lineHeight: 1.6 }}>{story.title.map((t, i) => <Tok key={i} t={t} s={{ tokens: story.title, en: story.title_en }} k={`t${i}`} />)}</h1>
        <div class="sub" style={{ fontFamily: 'system-ui', marginBottom: 14 }}>{story.title_en}</div>
        {story.paragraphs.map((p, pi) => (
          <p key={pi} class={pinyin ? 'pinyin' : ''}>
            {p.sentences.map((s, si) => {
              const key = `${pi}-${si}`;
              return (
                <span key={si}>
                  {s.tokens.map((t, ti) => <Tok key={ti} t={t} s={s} k={`${key}-${ti}`} />)}
                  <button class="sent-play" aria-label="Play sentence" onClick={() => { speak(tokText(s.tokens)); const o = new Set(openEn); o.has(key) ? o.delete(key) : o.add(key); setOpenEn(o); }}><IconSound /></button>
                  {(showEn || openEn.has(key)) && <span class="sent-en">{s.en}</span>}
                </span>
              );
            })}
          </p>
        ))}
      </div>
      {cov && (
        <div class="card" style={{ padding: 14 }}>
          <div class="between"><b>You know {Math.round(cov.pct * 100)}% of this story</b><span class="chip muted">{HSK_LABEL(story.level)}</span></div>
          <div class="levelbar" style={{ marginTop: 8 }}><div style={{ width: `${cov.pct * 100}%`, background: 'var(--good)' }} /></div>
          <p class="note">Tap any word to see its meaning, hear it, highlight it or add it to your library. <span style={{ color: 'var(--new)' }}>Blue dotted</span> words are new to you.</p>
        </div>
      )}
      {(cov?.unknown.length > 0 || story.highlights?.length > 0) && (
        <>
          <h2>Words to study</h2>
          <div class="card list">
            {[...new Set([...(story.highlights || []), ...cov.unknown])].map((w) => {
              const nw = story.new_words?.find((n) => n.word === w);
              let gloss = nw?.meaning, py = nw?.pinyin;
              if (!gloss) for (const p of story.paragraphs) for (const s of p.sentences) for (const t of s.tokens) if (t.t === w && !gloss) { gloss = t.g; py = t.p; }
              return (
                <button class="row" key={w} onClick={() => openWord(w, { gloss, pinyin: py, source: 'story', highlight: { get on() { return true; }, toggle: () => toggleHighlight(w) } })}>
                  <span class="hz" style={hl.has(w) ? { background: 'var(--hl)', borderRadius: 6, padding: '0 4px' } : {}}>{w}</span>
                  <span class="meta"><div class="py">{py}</div><div class="def">{gloss}</div></span>
                  {words.has(w) ? <span class="chip good">saved</span> : <span class="chip new">new</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
      <button class="btn ghost block" style={{ marginTop: 20, color: 'var(--muted)' }} onClick={remove}><IconTrash width="18" /> Delete story</button>
    </div>
  );
}
