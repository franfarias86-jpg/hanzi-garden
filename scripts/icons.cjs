const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync('public/icon.svg', 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, rounded] of [['icon-192.png', 192, true], ['icon-512.png', 512, false], ['apple-touch-icon.png', 180, false]]) {
    const s = rounded ? svg : svg.replace('rx="112"', 'rx="0"');
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0">${s.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: `public/${name}`, omitBackground: true });
  }
  await b.close();
})();
