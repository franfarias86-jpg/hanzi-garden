# Hanzi Garden

A personal Chinese-learning web app for iPhone (installable PWA, works offline).

- **Library** – save the words you learn (type, paste a sentence, or search by pinyin/English). Pinyin and
  definitions are filled in from CC-CEDICT; every word gets example sentences, a character breakdown and
  stroke-order animations. A *Characters* view lists every character in your words.
- **Review** – spaced repetition with a separate schedule for each skill:
  hanzi → meaning, multiple-choice definitions, listening in context (recorded sentence audio / iOS voice),
  and writing stroke by stroke.
- **Level** – estimates your HSK 3.1 level from your library and suggests the most useful next words.
- **Stories** – Claude writes graded stories using the words you know (plus a few new ones). Tap any word to
  see its meaning in context, hear it, highlight it or add it to your library.

Data is stored on the device (IndexedDB). Use *Settings → Backup* to export/import.
Stories need your own Anthropic API key (Settings), which stays on the device.

## Develop

```bash
npm install
npm run data     # builds public/data and public/strokes from the npm data packages
npm run dev
npm run build    # static site in dist/
```

`dist/` can be hosted on any static host with HTTPS (GitHub Pages, Netlify, Cloudflare Pages…).
Then open it in Safari on the iPhone → Share → **Add to Home Screen**.

## Data & licences

CC-CEDICT (CC BY-SA 4.0) · HSK 3.1 syllabus (hsk3.1-syllabus, MIT) · example sentences and audio from
hsk-sentences-audio (CC BY-SA 4.0) · stroke data from hanzi-writer-data / Make Me a Hanzi (Arphic Public License).
