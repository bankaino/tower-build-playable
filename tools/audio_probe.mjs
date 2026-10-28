// audio_probe.mjs — plays the built page headless for a while and samples the master level: the music must be audible, the mix must not clip.
//   node tools/audio_probe.mjs [dist/default/applovin.html]
import { createRequire } from 'node:module'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const file = path.resolve(process.argv[2] || 'dist/default/applovin.html');
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.route('**/mraid.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.mraid = { getState: () => "default", isViewable: () => true, addEventListener() {}, open() {} };' }));
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(pathToFileURL(file).href); await p.waitForFunction(() => window.__ready, null, { timeout: 20000 });
const box = await p.locator('canvas').boundingBox(), VIEW = await p.evaluate(() => SIM.VIEW), cx = box.x + box.width / 2, cy = box.y + box.height * 0.8;
const peaks = [], endPeaks = []; const T0 = Date.now(); let tapped = 0, endAt = 0;
while (Date.now() - T0 < 50000) {
  const s = await p.evaluate(() => { const st = SCENE.state; return st ? { ph: st.phase, rel: st.phase === 'aim' ? SIM.nextCross(st, 0) : -1, end: st.end, pk: AUDIO.peak(), st: AUDIO.state() } : null; });
  if (s) { if (s.pk >= 0) { peaks.push(s.pk); if (s.end >= 0) endPeaks.push(s.pk); } if (s.end >= 0) { endAt = endAt || Date.now(); if (Date.now() - endAt > 3500) break; }
    if (s.ph === 'aim' && s.rel >= 0.05) { await p.waitForTimeout(Math.max(0, s.rel * 1000 - 60)); await p.mouse.click(cx, cy); tapped++; await p.waitForTimeout(120); continue; }
    if (s.ph === 'over') { await p.mouse.click(cx, cy); } }
  await p.waitForTimeout(60);
}
const state = await p.evaluate(() => AUDIO.state()); const endAvg = endPeaks.length ? endPeaks.reduce((a, b) => a + b, 0) / endPeaks.length : 0; await browser.close();
const max = Math.max(0, ...peaks), avg = peaks.length ? peaks.reduce((a, b) => a + b, 0) / peaks.length : 0, fails = [];
if (errors.length) fails.push('page errors: ' + errors.join(' | '));
if (state !== 'running') fails.push('audio context is ' + state);
if (!(max > 0.02)) fails.push('silent: peak ' + max.toFixed(3)); if (!(endAvg > 0.01)) fails.push('the end card is silent (victory theme missing): avg ' + endAvg.toFixed(3)); if (max > 0.8) fails.push('too loud: peak ' + max.toFixed(2));
console.log(JSON.stringify({ taps: tapped, samples: peaks.length, peak: +max.toFixed(3), avg: +avg.toFixed(3), endCardAvg: +endAvg.toFixed(3), state, fails })); process.exit(fails.length ? 1 : 0);
