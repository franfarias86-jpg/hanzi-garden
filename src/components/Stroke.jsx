import { useEffect, useRef, useState } from 'preact/hooks';
import HanziWriter from 'hanzi-writer';
import { getSettings } from '../lib/store.js';

const base = import.meta.env.BASE_URL;
export function charDataLoader(char, onLoad, onError) {
  fetch(`${base}strokes/${char}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .catch(() => fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${char}.json`).then((r) => (r.ok ? r.json() : Promise.reject())))
    .then(onLoad)
    .catch(() => onError?.(new Error('no stroke data')));
}

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// Animated stroke order (tap to replay)
export function StrokeAnim({ char, size = 150 }) {
  const ref = useRef();
  const w = useRef();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    ref.current.innerHTML = '';
    setMissing(false);
    w.current = HanziWriter.create(ref.current, char, {
      width: size, height: size, padding: 8,
      strokeColor: css('--ink'), radicalColor: css('--accent'), outlineColor: css('--line'),
      strokeAnimationSpeed: 1.2, delayBetweenStrokes: 180,
      charDataLoader: (c, ok) => charDataLoader(c, ok, () => setMissing(true)),
      onLoadCharDataSuccess: () => w.current?.animateCharacter(),
    });
  }, [char, size]);
  return (
    <div class="writer-wrap">
      <div class="writer" ref={ref} style={{ width: size, height: size }} onClick={() => w.current?.animateCharacter()} />
      {missing && <div class="note">No stroke data for {char}</div>}
    </div>
  );
}

export const LENIENCY = { relaxed: 1.9, normal: 1.35, strict: 1.0 };

// Writing quiz for one character. onDone({ mistakes, usedHint })
// `guide`: start with the grey outline visible. The learner can toggle it at any time.
export function StrokeQuiz({ char, size = 260, guide: guideInit = false, strictness, onDone }) {
  const ref = useRef();
  const w = useRef();
  const [state, setState] = useState({ mistakes: 0, done: false, missing: false });
  const [guide, setGuide] = useState(guideInit);
  const guideRef = useRef(guideInit);
  const hint = useRef(false);
  const level = strictness || getSettings().writingStrictness || 'relaxed';
  useEffect(() => {
    ref.current.innerHTML = '';
    setState({ mistakes: 0, done: false, missing: false });
    setGuide(guideInit);
    guideRef.current = guideInit;
    hint.current = false;
    w.current = HanziWriter.create(ref.current, char, {
      width: size, height: size, padding: 12, showCharacter: false, showOutline: guideInit,
      strokeColor: css('--ink'), outlineColor: css('--line'), highlightColor: css('--accent'), drawingColor: css('--ink'),
      drawingWidth: 24, showHintAfterMisses: 3, highlightOnComplete: true,
      charDataLoader: (c, ok) =>
        charDataLoader(c, ok, () => {
          setState((s) => ({ ...s, missing: true }));
        }),
      onLoadCharDataSuccess: () =>
        w.current.quiz({
          leniency: LENIENCY[level] || LENIENCY.relaxed,
          acceptBackwardsStrokes: level !== 'strict',
          markStrokeCorrectAfterMisses: level === 'strict' ? 0 : 4,
          onMistake: (d) => setState((s) => ({ ...s, mistakes: d.totalMistakes })),
          onComplete: (d) => {
            setState((s) => ({ ...s, done: true, mistakes: d.totalMistakes }));
            onDone?.({ mistakes: d.totalMistakes, usedHint: hint.current });
          },
        }),
    });
  }, [char, size, guideInit, level]);
  const toggleGuide = () => {
    const g = !guideRef.current;
    guideRef.current = g;
    setGuide(g);
    g ? w.current?.showOutline() : w.current?.hideOutline();
  };
  const showMe = () => {
    hint.current = true;
    // play the whole character once, then go back to the learner's guide setting
    w.current?.animateCharacter({
      onComplete: () => {
        w.current?.hideCharacter();
        if (!guideRef.current) w.current?.hideOutline();
      },
    });
  };
  return (
    <div class="writer-wrap">
      <div class="writer" ref={ref} style={{ width: size, height: size }} />
      {state.missing ? (
        <div class="note">No stroke data for {char}. <button class="btn ghost small" onClick={() => onDone?.({ mistakes: 0, skipped: true })}>Skip</button></div>
      ) : (
        <div class="between" style={{ width: size }}>
          <span class="sub">Mistakes: {state.mistakes}</span>
          {!state.done && (
            <span style={{ display: 'flex', gap: 4 }}>
              <button class={`btn small ${guide ? 'secondary' : 'plain'}`} onClick={toggleGuide}>{guide ? 'Guide on' : 'Guide off'}</button>
              <button class="btn ghost small" onClick={showMe}>Show me</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
