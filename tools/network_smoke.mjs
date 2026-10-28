// network_smoke.mjs — does the packed build talk to each ad network's own API?   node tools/network_smoke.mjs dist/floors10/<file> <network>
// Stubs the network's container (MRAID, DAPI, Mintegral window.install/gameReady/gameEnd, Google ExitApi, Meta FbPlayableAd), loads the file, steps the house to
// the end card, taps "Скопировать" and the CTA, and checks that the network's call happened (and Mintegral's lifecycle: gameReady on load, gameEnd at the end card).
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os'; import { pathToFileURL } from 'node:url'; import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
let file = path.resolve(process.argv[2]); const net = process.argv[3];
if (file.endsWith('.zip')) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tower-net-')); fs.writeFileSync(path.join(dir, 'index.html'), execFileSync('unzip', ['-p', file, 'index.html'], { maxBuffer: 1 << 28 })); file = path.join(dir, 'index.html'); }
const STUB = {
  applovin: 'window.mraid = { opened: [], getState: () => "default", isViewable: () => true, addEventListener() {}, open(u) { this.opened.push(u); window.__calls.push("mraid.open"); } };',
  unity: 'window.mraid = { opened: [], getState: () => "default", isViewable: () => true, addEventListener() {}, open(u) { this.opened.push(u); window.__calls.push("mraid.open"); } };',
  ironsource: 'window.dapi = { isReady: () => true, isViewable: () => true, addEventListener() {}, openStoreUrl() { window.__calls.push("dapi.openStoreUrl"); } };',
  mintegral: 'window.gameReady = () => window.__calls.push("gameReady"); window.gameEnd = () => window.__calls.push("gameEnd"); window.install = () => window.__calls.push("install");',
  google: 'window.ExitApi = { exit() { window.__calls.push("ExitApi.exit"); } };',
  meta: 'window.FbPlayableAd = { onCTAClick() { window.__calls.push("FbPlayableAd.onCTAClick"); } };',
  preview: 'window.open = (u) => { window.__calls.push("window.open"); return null; };',
};
const WANT = { applovin: 'mraid.open', unity: 'mraid.open', ironsource: 'dapi.openStoreUrl', mintegral: 'install', google: 'ExitApi.exit', meta: 'FbPlayableAd.onCTAClick', preview: 'window.open' };
if (!STUB[net]) { console.log('unknown network ' + net); process.exit(2); }
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [], external = [];
ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('file:')) external.push(u); });
await ctx.addInitScript('window.__calls = []; ' + STUB[net]);
await ctx.route('**/mraid.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));            // the stub above already defines mraid; the tag must not overwrite it
await ctx.route('**/exitapi.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(pathToFileURL(file).href); await p.waitForFunction(() => window.__ready, null, { timeout: 20000 });
const VIEW = await p.evaluate(() => SIM.VIEW), box = await p.locator('canvas').boundingBox(), V = (x, y) => [box.x + x / VIEW.W * box.width, box.y + y / VIEW.H * box.height];
await p.evaluate(() => { const s = SCENE.state; for (let i = 0; s && i < 120 * 90 && s.end < 0; i++) SIM.step(s, SIM.scriptInput(s.t, s)); });      // the demo planner plays the house for us
await p.waitForTimeout(1800);
const hit = (id) => p.evaluate((id) => (SCENE.hit || []).find((b) => b.id === id), id);
const copy = await hit('copy'); if (copy) { const [x, y] = V(copy.x + copy.w / 2, copy.y + copy.h / 2); await p.mouse.click(x, y); await p.waitForTimeout(200); }
const cta = await hit('cta'); if (cta) { const [x, y] = V(cta.x + cta.w / 2, cta.y + cta.h / 2); await p.mouse.click(x, y); await p.waitForTimeout(200); }
const calls = await p.evaluate(() => window.__calls), copied = await p.evaluate(() => SCENE.state.ev.some((e) => e.k === 'copy'));
await browser.close();
const fails = [], ext = external.filter((u) => !/\/(mraid|exitapi)\.js$/.test(u));
if (errors.length) fails.push('page errors: ' + errors.join(' | ')); if (ext.length) fails.push('external requests: ' + ext.join(', '));
if (!copied) fails.push('copy button did not register'); if (!calls.includes(WANT[net])) fails.push('CTA did not call ' + WANT[net] + ' (calls: ' + calls.join(',') + ')');
if (net === 'mintegral') { if (!calls.includes('gameReady')) fails.push('gameReady was not called on load'); if (!calls.includes('gameEnd')) fails.push('gameEnd was not called at the end card'); }
console.log(JSON.stringify({ net, calls, fails })); process.exit(fails.length ? 1 : 0);
