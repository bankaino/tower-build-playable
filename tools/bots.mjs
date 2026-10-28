// bots.mjs — a headless "casual player" funnel for the tower game.   node tools/bots.mjs [N=400] [--k KEY=VAL ...] [--v]
// (--k overrides SIM.K, so balance can be tuned without editing the game; K.T / K.AMP take a comma list: --k T=2.6,2.5,...)
// Four kinds of player tap the same way a finger does (SIM.step with click): they find the moment the block passes over the house with SIM.nextCross and miss it by
// a human timing error.  predictor (60 %): error σ 45–110 ms plus a small bias; reactor (30 %): reacts to what they SEE, 190–280 ms late, and learned to lead by 60–95 % of
// it, σ 50 ms; spammer (10 %): taps as soon as the block is ready.  Quitters leave after the 1st (10 %) or 2nd (5 %) lost house.  Prints the funnel and checks the corridors from SPEC.md.
import { createRequire } from 'node:module';
const SIM = createRequire(import.meta.url)('../live/sim.js');
const { K, DT } = SIM;
const args = process.argv.slice(2), N = +(args.find((a) => /^\d+$/.test(a)) || 400), verbose = args.includes('--v');
import fs from 'node:fs';
const vi = args.indexOf('--variant'); if (vi >= 0) Object.assign(K, JSON.parse(fs.readFileSync(new URL('../variants/' + args[vi + 1] + '.json', import.meta.url), 'utf8')).K);   // --variant floors7: the variant's SIM.K overrides
for (let i = 0; i < args.length; i++) if (args[i] === '--k') { const [k, v] = args[i + 1].split('='); K[k] = v.includes(',') ? v.split(',').map(Number) : isNaN(+v) ? v : +v; }
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function runBot(seed) {
  const R = rng(seed * 7919), U = (a, b) => a + (b - a) * R(), G = () => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R());
  const kind = R() < 0.6 ? 'pred' : R() < 0.75 ? 'react' : 'spam';
  const p = { kind, sigma: kind === 'pred' ? U(0.045, 0.11) : 0.05, bias: kind === 'pred' ? U(0, 0.04) : U(0.19, 0.28) * (1 - U(0.6, 0.95)), start: U(0.5, 1.6), look: U(0.15, 0.5), react: U(0.25, 0.9),
    quit: kind === 'spam' ? 3 : (() => { const r = R(); return r < 0.10 ? 1 : r < 0.15 ? 2 : 99; })(),   // quit: gives up after this many lost houses
    skip: (() => { const r = R(); return r < 0.40 ? 0 : r < 0.75 ? 1 : 2; })() };                      // passes of the block they let go by before tapping (patience)
  const S = SIM.spawn(0); let plan = -1, planned = -1, lastPhase = '', tapT = -9;
  const rec = { kind, quit: false, perf: 0 };
  for (let i = 0; i < 400 * 120 && S.end < 0; i++) {
    const inp = { click: 0 }, t = S.t;
    if (S.phase === 'over' && S.attempt + 1 >= p.quit) { rec.quit = true; break; }            // saw the "house not finished" card and left
    if (t > p.start) {
      if (S.phase === 'over') { if (S.pt > p.react + K.OVER_LOCK && lastPhase !== 'tapped') { inp.click = 1; lastPhase = 'tapped'; } }
      else if (S.phase === 'aim') {
        if (S.blockId !== planned) {                                                          // a new block: decide when to tap it
          planned = S.blockId; lastPhase = '';
          if (p.kind === 'spam') plan = t + U(0.1, 0.4);
          else { const c = SIM.nextCross(S, 0, p.skip), first = c < 0 ? -1 : t + c;                    // the moment the block passes over the house, then a human timing error
            plan = first < 0 ? t + 0.5 : first + G() * p.sigma + p.bias; }
        }
        if (plan >= 0 && t >= plan && S.pt >= K.AIM_LOCK) { inp.click = 1; plan = -1; tapT = t; }
        else if (plan < 0 && t - tapT > 0.3) plan = t + 0.1;                                  // the tap fell into the aim lock: tap again
      } else lastPhase = '';
    }
    SIM.step(S, inp);
  }
  rec.end = S.end >= 0; rec.t = S.end >= 0 ? S.end - Math.max(0, S.firstIn) : null; rec.att = S.attempt; rec.misses = S.misses; rec.perf = S.nPerf || 0; rec.landings = S.landings; rec.t0 = S.firstIn;
  rec.tTotal = S.end >= 0 ? S.end : null; rec.firstLand = S.firstLandT; rec.firstTry = S.end >= 0 && S.attempt === 0; rec.hadMiss = S.misses > 0;
  return rec;
}
const med = (a) => { const s = a.filter((x) => x !== null && !isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const q = (a, f) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const R = []; for (let i = 1; i <= N; i++) R.push(runBot(i));
const pct = (n, d = N) => (100 * n / d).toFixed(0) + '%', by = (k) => R.filter((r) => r.kind === k), done = R.filter((r) => r.end), play = R.filter((r) => !r.quit);
const playSeen = (r) => r.end;
const stats = {
  reach: done.length / play.length, tMed: med(done.map((r) => r.t)), tP95: q(done.map((r) => r.t), 0.95), tMax: Math.max(...done.map((r) => r.t)),
  first: done.filter((r) => r.firstTry && r.kind !== 'spam').length / R.filter((r) => r.kind !== 'spam' && !r.quit).length,
  within3: R.filter((r) => r.kind !== 'spam' && !r.quit && r.end && r.att <= 2).length / R.filter((r) => r.kind !== 'spam' && !r.quit).length,
  hadMiss: R.filter((r) => r.hadMiss).length / N, seen: R.filter((r) => r.end).length / N,
  perfPred: med(by('pred').map((r) => r.landings ? r.perf / r.landings : null)), spamDone: by('spam').filter((r) => r.end && r.att <= 2).length / Math.max(1, by('spam').length),
  firstLandMed: med(R.map((r) => r.firstLand)), quitPct: R.filter((r) => r.quit).length / N,
};
console.log(`bots ${N}: reached the end card ${pct(done.length)} (non-quitters ${pct(done.length, play.length)}) | time to end card median ${stats.tMed.toFixed(0)} s, p95 ${stats.tP95.toFixed(0)} s, max ${stats.tMax.toFixed(0)} s | first-try ${pct(stats.first * 100, 100)} | within 3 tries ${pct(stats.within3 * 100, 100)}`);
console.log(`  ≥1 miss ${pct(R.filter((r) => r.hadMiss).length)} | perfect share (predictors) ${(stats.perfPred * 100).toFixed(0)}% | quit ${pct(R.filter((r) => r.quit).length)} | first landing median ${stats.firstLandMed.toFixed(1)} s | spammers done ≤3 tries ${pct(stats.spamDone * 100, 100)}`);
for (const k of ['pred', 'react', 'spam']) { const b = by(k), d = b.filter((r) => r.end); console.log(`  ${k.padEnd(5)} n=${b.length} reached ${pct(d.length, b.length)} median ${med(d.map((r) => r.t)).toFixed(0)} s, tries med ${med(b.map((r) => r.att + 1))}`); }
const bad = [];
if (stats.first < 0.65 || stats.first > (K.FLOORS < 10 ? 0.90 : 0.80)) bad.push('first-try finish outside 65-80% (' + (stats.first * 100).toFixed(0) + '%)');
if (stats.within3 < 0.95) bad.push('within 3 tries < 95%');
const tLo = K.FLOORS < 10 ? 18 : 30; if (!(stats.tMed >= tLo && stats.tMed <= 55)) bad.push('median time outside ' + tLo + '-55 s');   // 30: the ad-rules ask for the end card by ~30 s if (stats.tP95 > 110) bad.push('p95 > 110 s');
if (stats.hadMiss < 0.55 || stats.hadMiss > 0.80) bad.push('share with a miss outside 55-80%');
if (stats.perfPred < 0.20 || stats.perfPred > 0.40) bad.push('predictor perfect share outside 20-40%');
if (stats.spamDone > 0.05) bad.push('spammers finish: aiming is not required');
console.log(bad.length ? 'CORRIDORS FAIL: ' + bad.join('; ') : 'corridors ok'); process.exit(bad.length ? 1 : 0);
