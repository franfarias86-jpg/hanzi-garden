// Chinese text-to-speech (iOS has good built-in zh-CN voices) + recorded sentence audio.
import { sentenceAudioUrl } from './data.js';

let settings = { rate: 0.85, voiceURI: '' };
export function setSpeechSettings(s) {
  settings = { ...settings, ...s };
}

export function zhVoices() {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  return vs.filter((v) => /^zh[-_](CN|Hans)/i.test(v.lang) || v.lang === 'zh');
}

let current = null;
export function stop() {
  window.speechSynthesis?.cancel();
  if (current) {
    current.pause();
    current = null;
  }
}

export function speak(text, { rate } = {}) {
  return new Promise((resolve) => {
    stop();
    if (!window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = rate ?? settings.rate;
    const v = zhVoices().find((x) => x.voiceURI === settings.voiceURI) || zhVoices()[0];
    if (v) u.voice = v;
    u.onend = u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

// Play recorded audio for a dataset sentence; fall back to TTS if offline/unavailable.
export function playSentence(s, { slow = false } = {}) {
  stop();
  if (!s.id || s.custom) return speak(s.zh, slow ? { rate: 0.6 } : {});
  return new Promise((resolve) => {
    const a = new Audio(sentenceAudioUrl(s.id, slow));
    current = a;
    a.onended = () => resolve();
    a.onerror = () => speak(s.zh, slow ? { rate: 0.6 } : {}).then(resolve);
    a.play().catch(() => speak(s.zh, slow ? { rate: 0.6 } : {}).then(resolve));
  });
}

// iOS loads voices asynchronously
window.speechSynthesis?.addEventListener?.('voiceschanged', () => {});
