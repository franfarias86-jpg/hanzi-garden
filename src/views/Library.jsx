import { useEffect, useMemo, useState } from 'preact/hooks';
import { useWords, useSettings, openWord, openChar } from '../lib/store.js';
import { charactersOf } from '../lib/level.js';
import { wordStrength } from '../lib/srs.js';
import { loadHsk, HSK_LABEL, hasHan, segment, searchDict, draftWord } from '../lib/data.js';
import { putWords, makeWord } from '../lib/db.js';
import { Seg, Spinner, toast } from '../components/ui.jsx';
import { IconPlus, IconSearch, IconBack, IconStar, IconChev } from '../components/icons.jsx';

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');

function StrengthDot({ w }) {
  const s = wordStrength(w);
  const color = s === 0 ? 'var(--line)' : s < 0.35 ? 'var(--warn)' : s < 0.7 ? 'var(--new)' : 'var(--good)';
  return <span style={{ width: 9, height: 9, borderRadius: 5, background: color, flex: 'none' }} title="Strength" />;
}

export function Library() {
  const words = useWords();
  const [tab, setTab] = useState('words');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [adding, setAdding] = useState(false);
  const [hsk, setHsk] = useState({});
  useEffect(() => { loadHsk().then(setHsk); }, []);

  const list = useMemo(() => {
    if (!words) return [];
    let l = [...words.values()];
    if (q) {
      const sq = strip(q);
      l = l.filter((w) => w.hanzi.includes(q) || strip(w.pinyin).includes(sq) || w.defs.some((d) => d.toLowerCase().includes(q.toLowerCase())));
    }
    if (sort === 'starred') l = l.filter((w) => w.starred);
    const by = {
      recent: (a, b) => b.addedAt - a.addedAt,
      starred: (a, b) => b.addedAt - a.addedAt,
      pinyin: (a, b) => strip(a.pinyin).localeCompare(strip(b.pinyin)),
      hsk: (a, b) => (hsk[a.id]?.[0] ?? 9) - (hsk[b.id]?.[0] ?? 9),
      weak: (a, b) => wordStrength(a) - wordStrength(b),
    };
    return l.sort(by[sort]);
  }, [words, q, sort, hsk]);

  const chars = useMemo(() => (words ? [...charactersOf(words).entries()] : []), [words]);

  if (adding) return <AddWords onBack={() => setAdding(false)} />;

  return (
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Library</h1>
          <div class="sub">{words?.size || 0} words · {chars.length} characters</div>
        </div>
        <button class="btn" onClick={() => setAdding(true)}><IconPlus width="20" /> Add</button>
      </div>
      <Seg value={tab} onChange={setTab} options={[['words', 'Words'], ['chars', 'Characters']]} />
      <div style={{ height: 12 }} />
      {tab === 'words' ? (
        <>
          <div class="search">
            <input class="field" placeholder="Search hanzi, pinyin, meaning" value={q} onInput={(e) => setQ(e.target.value)} />
          </div>
          <div class="chips" style={{ marginBottom: 12 }}>
            {[['recent', 'Recent'], ['pinyin', 'A–Z'], ['hsk', 'HSK'], ['weak', 'Weakest'], ['starred', '★ Starred']].map(([v, l]) => (
              <button key={v} class={`chip ${sort === v ? '' : 'muted'}`} style={{ border: 0, padding: '5px 11px', fontSize: 13 }} onClick={() => setSort(v)}>{l}</button>
            ))}
          </div>
          {list.length ? (
            <div class="card list">
              {list.map((w) => (
                <button class="row" key={w.id} onClick={() => openWord(w.id)}>
                  <span class="hz">{w.hanzi}</span>
                  <span class="meta">
                    <div class="py">{w.pinyin} {w.starred && <IconStar width="12" style={{ color: 'var(--accent)', verticalAlign: -1 }} />}</div>
                    <div class="def">{w.defs.slice(0, 3).join('; ')}</div>
                  </span>
                  {hsk[w.id] && <span class="chip muted">{hsk[w.id][0] === 7 ? '7–9' : hsk[w.id][0]}</span>}
                  <StrengthDot w={w} />
                </button>
              ))}
            </div>
          ) : (
            <div class="empty">
              <div class="big">字</div>
              {words?.size ? 'Nothing matches.' : <>Your library is empty.<br />Tap <b>Add</b> to save the words you're learning.</>}
            </div>
          )}
        </>
      ) : chars.length ? (
        <div class="card" style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 8 }}>
          {chars.map(([c, ws]) => (
            <button key={c} class="charbtn" style={{ width: '100%', position: 'relative' }} onClick={() => openChar(c)}>
              {c}
              {ws.length > 1 && <span style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 10, color: 'var(--muted)', fontFamily: 'system-ui' }}>{ws.length}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div class="empty"><div class="big">字</div>Characters appear here as you add words.</div>
      )}
    </div>
  );
}

function AddWords({ onBack }) {
  const words = useWords();
  const settings = useSettings();
  const by = settings.sync?.name || '';
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [cands, setCands] = useState(null); // segmented words from pasted Chinese
  const [results, setResults] = useState(null); // dictionary search results
  const [picked, setPicked] = useState(new Set());

  useEffect(() => {
    const text = q.trim();
    if (!text) { setCands(null); setResults(null); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      if (hasHan(text)) {
        const parts = text.split(/[\s,，、;；\n/]+/).filter(Boolean);
        let segs = [];
        for (const p of parts) {
          const d = await draftWord(p);
          if (d.found || [...p].length <= 4) segs.push(p);
          else segs.push(...(await segment(p)));
        }
        segs = [...new Set(segs)];
        const drafts = await Promise.all(segs.map(draftWord));
        setCands(drafts);
        setPicked(new Set(drafts.filter((d) => !words?.has(d.hanzi)).map((d) => d.hanzi)));
        const more = segs.length === 1 ? (await searchDict(segs[0], 15)).filter((r) => r.word !== segs[0]) : [];
        setResults(more);
      } else {
        setCands(null);
        setResults(await searchDict(text));
      }
      setBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const addPicked = async () => {
    const list = cands.filter((d) => picked.has(d.hanzi) && !words.has(d.hanzi)).map((d) => makeWord({ ...d, note: note.trim(), addedBy: by }));
    await putWords(list);
    toast(`Added ${list.length} word${list.length === 1 ? '' : 's'}`);
    setQ('');
    setNote('');
  };
  const addOne = async (word) => {
    const d = await draftWord(word);
    await putWords([makeWord({ ...d, note: note.trim(), addedBy: by })]);
    toast(`Added ${word}`);
  };

  return (
    <div class="page">
      <div class="page-head" style={{ justifyContent: 'flex-start' }}>
        <button class="icon-btn plain" onClick={onBack} aria-label="Back"><IconBack /></button>
        <h1>Add words</h1>
      </div>
      <div class="search">
        <textarea class="field zh" rows={2} autoFocus placeholder="Type or paste Chinese (one or many words, or a whole sentence), pinyin, or English" value={q} onInput={(e) => setQ(e.target.value)} />
      </div>
      {(cands?.length > 0 || results?.length > 0) && (
        <input class="field" style={{ marginBottom: 8, fontSize: 15 }} value={note} onInput={(e) => setNote(e.target.value)} placeholder="Note or context (optional): where you heard it, a mnemonic…" />
      )}
      <p class="note">New words go to <b>Review → Learn new words</b> first. Tip: switch your iPhone keyboard to Chinese Pinyin or Handwriting to type characters. Definitions come from CC-CEDICT; you can edit them later.</p>
      {busy && <div class="empty"><Spinner /></div>}

      {cands && cands.length > 0 && (
        <>
          <h2>Found in your text</h2>
          <div class="card list">
            {cands.map((d) => {
              const have = words?.has(d.hanzi);
              return (
                <div class="check-row" key={d.hanzi}>
                  <input type="checkbox" disabled={have} checked={have || picked.has(d.hanzi)} onChange={(e) => {
                    const s = new Set(picked);
                    e.target.checked ? s.add(d.hanzi) : s.delete(d.hanzi);
                    setPicked(s);
                  }} />
                  <button class="row" style={{ padding: 0, border: 0 }} onClick={() => openWord(d.hanzi)}>
                    <span class="hz">{d.hanzi}</span>
                    <span class="meta"><div class="py">{d.pinyin}</div><div class="def">{d.defs.slice(0, 3).join('; ') || 'No dictionary entry'}</div></span>
                    {have ? <span class="chip good">saved</span> : d.hsk && <span class="chip muted">{HSK_LABEL(d.hsk)}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <button class="btn block" style={{ marginTop: 12 }} disabled={![...picked].some((p) => !words?.has(p))} onClick={addPicked}>
            Add {[...picked].filter((p) => !words?.has(p)).length} selected
          </button>
        </>
      )}

      {results && results.length > 0 && (
        <>
          <h2>{cands ? 'Related words' : 'Dictionary'}</h2>
          <div class="card list">
            {results.map((r) => (
              <div class="row" key={r.word}>
                <button class="row" style={{ padding: 0, border: 0, flex: 1 }} onClick={() => openWord(r.word)}>
                  <span class="hz">{r.word}</span>
                  <span class="meta">
                    <div class="py">{r.entries.map((e) => e.py).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(' / ')}</div>
                    <div class="def">{r.entries[0].defs.slice(0, 3).join('; ')}</div>
                  </span>
                  {r.hsk && <span class="chip muted">{r.hsk === 7 ? '7–9' : r.hsk}</span>}
                </button>
                {words?.has(r.word) ? <span class="chip good">✓</span> : <button class="icon-btn" onClick={() => addOne(r.word)} aria-label="Add"><IconPlus /></button>}
              </div>
            ))}
          </div>
        </>
      )}
      {!busy && results && !results.length && !cands?.length && <div class="empty">No matches in the dictionary.</div>}
    </div>
  );
}
