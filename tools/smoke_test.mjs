// smoke_test.mjs — plays a built single-file playable headless, like a QA tester on a phone would.
//   node tools/smoke_test.mjs [dist/default/applovin.html] [--shots dir]
// Mobile viewport + touch, a stub MRAID container that records mraid.open. The tester taps the way a decent player does (when the block is over the house,
// first with a REAL touch event, then with mouse clicks), plays the house to the end card, copies the promo code and taps the CTA.
// Fails (exit 1) on: page errors, any network request other than mraid.js, no floor built, the touch not reaching the game, the end card never coming,
// the copy button or the CTA not working, fps below 50.
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT || 'playwright');
const file = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dist/default/applovin.html');
const si = process.argv.indexOf('--shots'), shots = si > 0 ? process.argv[si + 1] : 'frames/smoke'; fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [], external = []; let touchFail = '';
ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('file:')) external.push(u); });
await ctx.route('**/mraid.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `
  window.mraid = { _l: {}, opened: [], getState: () => 'default', isViewable: () => true,
    addEventListener(k, f) { (this._l[k] = this._l[k] || []).push(f); }, open(u) { this.opened.push(u); } };` }));
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(pathToFileURL(file).href);
try { await p.waitForFunction(() => window.__ready, null, { timeout: 20000 }); }
catch (e) { console.log(JSON.stringify({ file: path.basename(file), fails: ['did not boot: ' + (errors.join(' | ') || e.message)] })); await browser.close(); process.exit(1); }
await p.waitForTimeout(600); await p.screenshot({ path: path.join(shots, '0_start.png') });
const box = await p.locator('canvas').boundingBox(), VIEW = await p.evaluate(() => SIM.VIEW);
const V = (x, y) => [box.x + x / VIEW.W * box.width, box.y + y / VIEW.H * box.height];
const cdp = await ctx.newCDPSession(p), tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const snap = () => p.evaluate(() => { const s = SCENE.state; return s ? { ph: s.phase, pt: s.pt, end: s.end, n: s.floors.length, hearts: s.hearts, first: s.firstIn, att: s.attempt, rel: s.phase === 'aim' ? SIM.nextCross(s, 0) : -1 } : null; });
const [cx, cy] = V(540, 1500);
// the first drop: a real touch (touchstart → touchend), the pointer must go down and come up again, and the game must see the tap
{ let s = await snap(); while (s && !(s.ph === 'aim' && s.rel >= 0.25 && s.pt > 0.3)) { await p.waitForTimeout(40); s = await snap(); }
  await p.waitForTimeout(s.rel * 1000 - 120); await tp('touchStart', cx, cy); await p.waitForTimeout(30);
  const mid = await p.evaluate(() => ({ down: window.__ptr && __ptr.down })); await tp('touchEnd'); await p.waitForTimeout(250);
  const after = await p.evaluate(() => ({ down: window.__ptr && __ptr.down, first: SCENE.state && SCENE.state.firstIn, ph: SCENE.state && SCENE.state.phase }));
  if (!mid.down) touchFail = 'touch did not press the pointer'; else if (after.down) touchFail = 'pointer still down after the finger lifted'; else if (!(after.first >= 0) || after.ph === 'aim') touchFail = 'the game did not see the touch tap (phase ' + after.ph + ')'; }
// play to the end card with mouse clicks at the right moment (a decent player); a lost house is simply started again
const fpsMid = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
// a slow phone: the same page with the CPU throttled 4× (informational: printed, only a collapse fails)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); const fpsSlow = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
// lose on purpose: tap where the block lands 230 px off the tower until the game-over card, then "Заново" must start the house again from floor 1
let restartFail = '';
{ let s0 = await snap(), guard = Date.now(); while (s0 && s0.ph !== 'over' && Date.now() - guard < 60000) {
    if (s0.ph === 'aim') { const rel = await p.evaluate(() => SIM.nextCross(SCENE.state, 230)); if (rel >= 0.03) { await p.waitForTimeout(Math.max(0, rel * 1000 - 40)); await p.mouse.click(cx, cy); await p.waitForTimeout(150); } else await p.waitForTimeout(40); } else await p.waitForTimeout(50);
    s0 = await snap(); }
  if (!s0 || s0.ph !== 'over') restartFail = 'three misses never produced the game-over card';
  else { await p.waitForTimeout(700); await p.screenshot({ path: path.join(shots, '1c_lost.png') }); await p.mouse.click(cx, cy); await p.waitForTimeout(900);
    const r = await snap(); if (!r || r.att !== 1 || r.n !== 0 || r.hearts !== 3 || !['reset', 'enter', 'aim'].includes(r.ph)) restartFail = 'restart did not start the house again: ' + JSON.stringify(r); } }
let shotMid = false, shotOver = true; const T0 = Date.now(); let s = await snap();
while (s && s.end < 0 && Date.now() - T0 < 150000) {
  if (s.ph === 'aim' && s.rel >= 0.05) { if (!shotMid && s.n >= 4) { shotMid = true; await p.screenshot({ path: path.join(shots, '1_tower.png') }); s = await snap(); if (s.rel < 0.05) continue; }
    await p.waitForTimeout(Math.max(0, s.rel * 1000 - 70)); await p.mouse.click(cx, cy); await p.waitForTimeout(150); }
  else if (s.ph === 'over' && s.pt > 1.0) { if (!shotOver) { shotOver = true; await p.screenshot({ path: path.join(shots, '1c_lost.png') }); } await p.mouse.click(cx, cy); await p.waitForTimeout(200); }
  else await p.waitForTimeout(40);
  s = await snap();
}
const done = await snap(); await p.waitForTimeout(1800); await p.screenshot({ path: path.join(shots, '1b_endcard.png') });
const finished = done && done.end >= 0 && done.n > 0;
// the end card: copy the promo code, then the CTA
const hit = (id) => p.evaluate((id) => (SCENE.hit || []).find((b) => b.id === id), id);
let copyOk = false, cta = await hit('copy');
if (cta) { const [x, y] = V(cta.x + cta.w / 2, cta.y + cta.h / 2); await p.mouse.click(x, y); await p.waitForTimeout(250); copyOk = await p.evaluate(() => SCENE.state.ev.some((e) => e.k === 'copy')); }
cta = await hit('cta');
if (cta) { const [x, y] = V(cta.x + cta.w / 2, cta.y + cta.h / 2); await p.mouse.click(x, y); }
const opened = await p.evaluate(() => (window.mraid && window.mraid.opened) || []);
await p.screenshot({ path: path.join(shots, '2_after_cta.png') });
await browser.close();
const fails = [];
if (errors.length) fails.push('page errors: ' + errors.join(' | '));
const ext = external.filter((u) => !u.endsWith('/mraid.js')); if (ext.length) fails.push('external requests: ' + ext.join(', '));
if (!finished) fails.push('the house never reached the end card (' + JSON.stringify(done) + ')');
if (touchFail) fails.push(touchFail);
if (restartFail) fails.push(restartFail);
if (fpsSlow < 15) fails.push('fps collapses on a throttled CPU: ' + fpsSlow);
if (!copyOk) fails.push('the copy button did not register');
if (!opened.length) fails.push('CTA did not call mraid.open');
if (fpsMid < 50) fails.push('fps ' + fpsMid);
console.log(JSON.stringify({ file: path.basename(file), view: VIEW, floors: done && done.n, attempts: done && done.att, fps: fpsMid, fpsSlow4x: fpsSlow, cta: opened[0] || null, fails }));
process.exit(fails.length ? 1 : 0);
