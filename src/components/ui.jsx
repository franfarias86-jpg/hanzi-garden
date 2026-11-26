import { useEffect, useState } from 'preact/hooks';
import { IconX } from './icons.jsx';

export function Sheet({ onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => (document.body.style.overflow = prev);
  }, []);
  return (
    <>
      <div class="sheet-bg" onClick={onClose} />
      <div class="sheet" role="dialog">
        <button class="icon-btn plain sheet-close" onClick={onClose} aria-label="Close"><IconX /></button>
        <div class="grab" />
        {children}
      </div>
    </>
  );
}

let toastFn = null;
export function toast(msg) {
  toastFn?.(msg);
}
export function Toaster() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    toastFn = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2200);
    };
  }, []);
  return msg ? <div class="toast">{msg}</div> : null;
}

export function Seg({ value, options, onChange }) {
  return (
    <div class="seg">
      {options.map(([v, label]) => (
        <button key={v} class={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export const Spinner = () => <span class="spin" />;
