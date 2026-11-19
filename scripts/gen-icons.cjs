// Génère les icônes PNG de la PWA à partir de public/favicon.svg (Chromium headless).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const svg = fs.readFileSync(path.join(__dirname, '../public/favicon.svg'), 'utf8');
const targets = [
  { file: 'pwa-192.png', size: 192, pad: 0, bg: 'transparent' },
  { file: 'pwa-512.png', size: 512, pad: 0, bg: 'transparent' },
  { file: 'apple-touch-icon.png', size: 180, pad: 0.1, bg: '#0A0E1A' },
  { file: 'pwa-maskable-512.png', size: 512, pad: 0.2, bg: '#0A0E1A' },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const t of targets) {
    const inner = Math.round(t.size * (1 - t.pad * 2));
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(
      `<html><body style="margin:0;background:${t.bg};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">` +
        svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
        '</body></html>',
    );
    await page.screenshot({ path: path.join(__dirname, '../public', t.file), omitBackground: t.bg === 'transparent' });
    console.log('✓', t.file);
  }
  await browser.close();
})();
