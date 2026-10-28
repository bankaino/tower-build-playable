// live/sim.js — «Построй дом»: deterministic sim, fixed 120 Hz.
// Loop: a floor swings on the crane hook → tap drops it → it lands on the tower (centred = PERFECT, off-centre still stands, too far = it topples
// and costs a heart) → ten floors and a roof → fireworks, the lights come on, end card with the promo code. Out of hearts: the house starts again.
// Every reaction lives here; the scene only draws. World: x in view px, y UP from the ground (world px); the camera shows [cam, cam + H / zoom].
(function (root) {
  const DT = 1 / 120, L = 62;                                                     // L: length of the attract demo loop
  const ASPECT = typeof window !== 'undefined' && window.innerWidth ? window.innerHeight / window.innerWidth : 16 / 9;
  const VIEW = { W: 1080, H: Math.round(1080 * Math.max(16 / 9, Math.min(19.5 / 9, ASPECT))) }, W = VIEW.W, H = VIEW.H;
  const HINT = 'клик или пробел — сбросить этаж, когда он над домом';
  const K = {
    FLOORS: 10, HEARTS: 3,
    BW: 380, FH: 180, BASE_W: 620, BASE_H: 312, ROOF_W: 396, ROOF_H: 105, CX0: 540,   // from the art: floor 380 × 180 (the sprite's 2.1 : 1), lobby 620 × 312 (sprite 1.99 : 1), roof 396 × 105
    LC: 900, CX_MIN: 490, CX_MAX: 590,                            // cable length (the arc), crane centre limits, how far above the screen a new block starts
    // the block swings at ONE constant speed from the first floor to the roof: period (s) and half-width (px); the game gets harder from the tower, not from the block
    T: 2.0, AMP: 300,                                                                // tuned with tools/bots.mjs
    PERF: 0.08, GREAT: 0.22, MISS: 0.29,                                            // |offset| / BW: perfect snap, great, and the toppling limit
    AREA: 180, PERF_BONUS: 36, G: 5200,
    TT: { land: 0.35, enter: 0.5, topple: 0.9, reset: 1.0, finale: 3.6 }, AIM_LOCK: 0.1, OVER_LOCK: 0.5, CAM_K: 6.5, CAM_TOP: 0.30,
    SW_MAX: 60, SW_BASE: 4, SW_GAIN: 0.04, SW_T: 3.4,                              // tower sway: amplitude per floor over 3, per px of lean, period
    MERCY_TOL: 0.10, RETRY_TOL: 0.08,                                            // help that never touches the swing speed: the toppling limit widens after two misses in a row and with every restart
    END_NO_INPUT: 1e9, END_IDLE: 1e9, CTA_BAR: false, HOOK: 'discount', OFFER: 'discount', PROMO: 'KVADRAT5',
  };
  const BSY = Math.round(0.50 * H), CAM0 = K.BASE_H - K.CAM_TOP * H;                // screen y of a hanging block's centre (low: the drop is short); camera at the start
  K.ENTER_DIST = BSY + 260;                                                          // a new block starts this far above its hanging place (out of the screen)
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (x) => 1 - (1 - x) * (1 - x);

  const topYof = (S) => K.BASE_H + Math.min(S.floors.length, K.FLOORS) * K.FH;      // world y of the top surface of the tower (before the roof)
  const off = (S, i) => (i < 1 ? 0 : S.swA * Math.pow(i / (K.FLOORS + 1), 1.5) * Math.sin(S.swPh));   // sway of floor i (1 = first floor above the lobby)
  const topStored = (S) => (S.floors.length ? S.floors[S.floors.length - 1].x : K.CX0);
  const topDrawnX = (S) => topStored(S) + off(S, S.floors.length);

  function newBlock(S, enter) {
    const roof = S.floors.length >= K.FLOORS;
    S.roofBlk = roof; S.bh = roof ? K.ROOF_H : K.FH; S.bA = K.AMP; S.bT = K.T;
    S.blockId++; S.dir = -S.dir; S.ph = S.dir * Math.PI / 2 - (enter ? 2 * Math.PI / S.bT * K.TT.enter : 0);   // it reaches the edge of its swing exactly when aiming opens
    S.blk = null;
  }
  function create() {
    const S = { t: 0, steps: 0, wt0: 0, ev: [], phase: 'aim', pt: 0, floors: [], lost: null, lostT: -9, hearts: K.HEARTS, area: 0, combo: 0, perfects: 0, missStreak: 0,
      attempt: 0, sumDx: 0, misses: 0, landings: 0, firstLandT: -1, roofT: -1, finaleT: -1, cam: CAM0, zoom: 1, cx: K.CX0, ph: 0, dir: -1, swA: 0, swPh: 0, blockId: 0,
      blk: null, topple: null, lastTap: -9, lastLand: null, jumpPrev: 0, end: -1, endWhy: '', lastIn: 0, firstIn: -1, bT: 2.6, bA: 250, bh: K.FH, roofBlk: false };
    newBlock(S, false); return S;
  }
  const spawn = (worldT) => Object.assign(create(), { wt0: worldT });
  const respawn = (S, worldT) => spawn(worldT);
  const outOfPlay = () => false;

  // the hanging block: screen position (view px) and tilt, from the pendulum phase
  function hang(S) {
    const x = S.cx + S.bA * Math.sin(S.ph), ang = Math.asin(clamp((x - S.cx) / K.LC, -0.99, 0.99));
    return { x, sy: BSY - K.LC + K.LC * Math.cos(ang), rot: -0.5 * ang, ang };
  }
  // predicted landing offset (px, block − top of the tower − dOff) if the block is released k steps from now (k may be negative)
  function relErr(S, k, dOff) {
    const ph = S.ph + 2 * Math.PI / S.bT * k * DT, x = S.cx + S.bA * Math.sin(ph), ang = Math.asin(clamp((x - S.cx) / K.LC, -0.99, 0.99)), sy = BSY - K.LC + K.LC * Math.cos(ang);
    const wy = S.cam + (H - sy), dist = Math.max(0, wy - (topYof(S) + S.bh / 2)), tf = Math.sqrt(2 * dist / K.G), n = S.floors.length;
    const top = topStored(S) + (n < 1 ? 0 : S.swA * Math.pow(n / (K.FLOORS + 1), 1.5) * Math.sin(S.swPh + 2 * Math.PI / K.SW_T * (k * DT + tf)));
    return x - top - (dOff || 0);
  }
  // seconds until the block passes the release point that lands it dOff px off the tower's top (−1: not within a swing and a bit)
  function nextCross(S, dOff, nth) {                                                  // nth: skip that many passes first (0 = the next one)
    const k0 = Math.max(1, Math.ceil((K.AIM_LOCK - S.pt) / DT)), k1 = Math.ceil((1.3 + 0.5 * (nth || 0)) * S.bT / DT);
    let e0 = relErr(S, k0 - 1, dOff), seen = 0;
    for (let k = k0; k <= k1; k++) { const e1 = relErr(S, k, dOff); if (e0 * e1 <= 0 && e0 !== e1 && seen++ >= (nth || 0)) return k * DT; e0 = e1; }
    return -1;
  }

  const ev = (S, o) => S.ev.push(Object.assign({ t: S.t }, o));
  function drop(S) {
    const h = hang(S), wy = S.cam + (H - h.sy);
    S.blk = { x: h.x, y: wy, vy: 0, rot0: h.rot, t0: S.t, rot: h.rot }; S.phase = 'fall'; S.pt = 0; S.dropT = S.t; S.dropX = h.x; S.dropSy = h.sy;       // where the hook let go (the empty hook rises from there)
    ev(S, { k: 'drop', x: h.x, y: wy, n: S.floors.length });
  }
  function land(S) {
    const b = S.blk, n = S.floors.length, top = topYof(S), dTop = topDrawnX(S), d = b.x - dTop, a = Math.abs(d), roof = S.roofBlk;
    b.y = top + S.bh / 2;
    const lim = (n === 0 ? (K.BASE_W - K.BW) / 2 : 0) + K.MISS * K.BW * (1 + K.RETRY_TOL * Math.min(S.attempt, 2) + (S.missStreak >= 2 ? K.MERCY_TOL : 0));   // the toppling limit: the same overhang rule, measured from the edge of the lobby for floor 1; a little wider when the player is struggling
    if (a >= lim) {                                                                  // too far: it topples off the edge
      S.misses++; S.hearts--; S.missStreak++; S.combo = 0;
      ev(S, { k: 'miss', x: b.x, y: b.y, d, topX: dTop, n, roof, rot0: b.rot });
      ev(S, { k: 'heart', left: S.hearts }); S.topple = { x: b.x, y: b.y, d }; S.blk = null; S.phase = 'topple'; S.pt = 0; return;
    }
    const q = a <= K.PERF * K.BW ? 'perfect' : a <= K.GREAT * K.BW ? 'great' : 'good', prev = topStored(S);
    const x0 = q === 'perfect' ? prev : b.x - off(S, n + 1);                         // perfect snaps onto the floor below; the rest stand where they fell
    S.floors.push({ x: x0, q, t: S.t, d, roof, lx: b.x });                          // lx: where it actually touched down (the scene slides it onto x0)
    S.sumDx += Math.abs(x0 - prev); S.missStreak = 0; S.landings++; if (S.firstLandT < 0) S.firstLandT = S.t;
    let gain = 0;
    if (q === 'perfect') { S.sumDx *= 0.5; S.combo++; S.perfects++; S.nPerf = (S.nPerf || 0) + 1; } else S.combo = 0;
    if (!roof) gain = K.AREA + (q === 'perfect' ? K.PERF_BONUS * S.combo : 0);
    S.area += gain; S.lastLand = { t: S.t, q, n: n + 1 };
    ev(S, { k: 'land', x: b.x, y: b.y, q, d, n: n + 1, gain, combo: S.combo, roof });
    if (S.combo >= 2) ev(S, { k: 'combo', x: b.x, y: b.y, c: S.combo });
    if (!roof) { ev(S, { k: 'floor', n: n + 1 }); if (n + 1 === Math.round(K.FLOORS / 2)) ev(S, { k: 'half' }); if (n + 1 === K.FLOORS) ev(S, { k: 'lastroof' }); }
    else { S.roofT = S.t; ev(S, { k: 'roof' }); }
    S.blk = null; S.phase = 'land'; S.pt = 0;
  }
  function restart(S) {
    S.lost = S.floors; S.lostT = S.t; S.floors = []; S.attempt++; S.hearts = K.HEARTS; S.area = 0; S.combo = 0; S.perfects = 0; S.missStreak = 0; S.sumDx = 0; S.topple = null;
    ev(S, { k: 'restart', a: S.attempt }); S.phase = 'reset'; S.pt = 0;
  }
  function finish(S, why) { S.end = S.t; S.endWhy = why; ev(S, { k: 'endcard', why }); }

  function step(S, inp) {
    const t = S.t + DT; S.t = t; S.steps++; S.pt += DT;
    if (S.ev.length > 220) S.ev.splice(0, S.ev.length - 220);
    const tap = !!(inp.click || (inp.jump && !S.jumpPrev)); S.jumpPrev = !!inp.jump;
    if (inp.hit === 'copy') ev(S, { k: 'copy' });
    if (tap && S.end < 0) {
      S.lastIn = t; if (S.firstIn < 0) S.firstIn = t;
      if (S.phase === 'aim' && S.pt >= K.AIM_LOCK) { S.lastTap = t; drop(S); }
      else if (S.phase === 'over' && S.pt >= K.OVER_LOCK) { S.lastTap = t; restart(S); }
      else if (S.phase === 'finale' && S.pt >= 1.2) finish(S, 'win');                     // a tap during the finale skips to the end card
    }
    // tower sway (grows with height and lean) and the crane following the top of the tower
    const nF = S.floors.length, swT = nF < 4 ? 0 : Math.min(K.SW_MAX, K.SW_BASE * (nF - 3) + K.SW_GAIN * S.sumDx);
    const swFin = S.phase === 'finale' || S.end >= 0;                                  // the house settles when it is finished
    S.swA += ((swFin ? 0 : swT) - S.swA) * (1 - Math.exp(-(swFin ? 5 : 2) * DT)); S.swPh += 2 * Math.PI / K.SW_T * DT;
    S.cx += (clamp(topStored(S), K.CX_MIN, K.CX_MAX) - S.cx) * (1 - Math.exp(-4 * DT));
    const ph = S.phase;
    if (ph === 'enter' || ph === 'aim') S.ph += 2 * Math.PI / S.bT * DT;
    if (ph === 'enter' && S.pt >= K.TT.enter) { S.phase = 'aim'; S.pt = 0; }
    else if (ph === 'fall') {
      const b = S.blk; b.vy += K.G * DT; b.y -= b.vy * DT; b.rot = b.rot0 * Math.max(0, 1 - (t - b.t0) / 0.2);
      if (b.y - S.bh / 2 <= topYof(S)) land(S);
    } else if (ph === 'land' && S.pt >= K.TT.land) {
      if (S.roofBlk && S.floors.length > K.FLOORS) { S.phase = 'finale'; S.pt = 0; S.finaleT = t; ev(S, { k: 'finale' }); }
      else { newBlock(S, true); S.phase = 'enter'; S.pt = 0; }
    } else if (ph === 'topple' && S.pt >= K.TT.topple) {
      if (S.hearts <= 0) { S.phase = 'over'; S.pt = 0; ev(S, { k: 'over', n: S.floors.length }); }
      else { newBlock(S, true); S.phase = 'enter'; S.pt = 0; }
    } else if (ph === 'reset' && S.pt >= K.TT.reset) { newBlock(S, true); S.phase = 'enter'; S.pt = 0; }
    else if (ph === 'finale') {
      if (S.pt >= 1.2 && !S.lit) { S.lit = true; ev(S, { k: 'lights' }); }
      if (S.pt >= K.TT.finale && S.end < 0) finish(S, 'win');
    }
    // end card timers (off by default; a variant can switch them on: END_NO_INPUT / END_IDLE)
    if (S.end < 0) {
      if (S.firstIn < 0 && t > K.END_NO_INPUT) finish(S, 'passive');
      else if (S.firstIn >= 0 && t - S.lastIn > K.END_IDLE && (S.phase === 'aim' || S.phase === 'over')) finish(S, 'idle');
    }
    // camera: keeps the top of the tower at 62 % of the screen height; the finale pulls back to fit the whole house
    let camT, zT = 1, k = K.CAM_K;
    if (S.phase === 'finale' || S.end >= 0) {
      const hh = K.BASE_H + (S.floors.length - 1) * K.FH + K.ROOF_H, card = H - 830;                  // the end card covers the bottom 830 px: the house is fitted above it
      if (S.end >= 0) { zT = Math.min(1, (card - 150) / hh); camT = (card - 20 - H) / zT; } else { zT = Math.min(1, 0.7 * H / (hh + 300)); camT = -200 / zT; }
      k = 2.2;
    }
    else if (S.phase === 'reset') { camT = CAM0; k = 3.5; }
    else camT = Math.max(CAM0, topYof(S) - K.CAM_TOP * H);
    S.cam += (camT - S.cam) * (1 - Math.exp(-k * DT)); S.zoom += (zT - S.zoom) * (1 - Math.exp(-2.2 * DT));
    return S;
  }

  // ---- attract demo: a planner that plays the ad like a good player, expressed as taps (the scene draws the hand) ----
  // targets (px off the top): perfect 0 on floors 1, 2, 4, 6, 8; good on 3 and 7; one miss on floor 5; great on the rest
  const DEMO_Q = { 1: 'p', 2: 'p', 3: 'g', 4: 'p', 5: 'm', 6: 'p', 7: 'g', 8: 'p' };
  const DEMO_D = { p: 0, g: 94, m: 230, r: 45 };
  const scriptInput = (t, S) => {
    const inp = { click: 0, jump: 0 };
    if (S.end >= 0) return inp;
    if (S.phase === 'over') { if (S.pt > 1.0) inp.click = 1; return inp; }
    if (S.phase !== 'aim' || t < 1.5 || S.pt < K.AIM_LOCK) return inp;
    const n = S.floors.length + 1; let q = DEMO_Q[n] || 'r'; if (q === 'm' && S.misses > 0) q = 'p';
    const d = DEMO_D[q] * (S.blockId % 2 ? 1 : -1), e0 = relErr(S, -1, d), e1 = relErr(S, 0, d);
    if (e0 * e1 <= 0 && e0 !== e1) inp.click = 1;
    return inp;
  };
  let cache = null;
  function at(t) {
    const loop = Math.floor(t / L), q = t - loop * L, n = Math.round(q / DT);
    if (!cache || cache.loop !== loop || cache.S.steps > n) { const S0 = Object.assign(create(), { wt0: loop * L }); cache = { loop, S: S0 }; }
    const S = cache.S; while (S.steps < n) step(S, scriptInput(S.t, S));
    return Object.assign({}, S, { loop, q, demo: true, inp: scriptInput(S.t, S) });
  }
  // the demo must hit every beat of the ad inside its loop
  const demoCheck = (S) => {
    const f = [];
    if (!(S.firstLandT > 0 && S.firstLandT <= 3.5)) f.push('first landing at ' + S.firstLandT.toFixed(1) + ' s');
    if ((S.nPerf || 0) < 4) f.push('perfects ' + (S.nPerf || 0));
    if (S.misses !== 1) f.push('misses ' + S.misses);
    if (S.landings !== K.FLOORS + 1) f.push('landings ' + S.landings);
    if (!(S.roofT > 0)) f.push('no roof'); if (!(S.finaleT > 0)) f.push('no finale');
    if (S.end < 0 || S.end > 50) f.push('endcard at ' + S.end.toFixed(1)); if (S.endWhy !== 'win') f.push('endWhy ' + S.endWhy);
    return f;
  };

  root.SIM = { DT, L, K, VIEW, HINT, BSY, CAM0, create, spawn, respawn, outOfPlay, step, at, scriptInput, demoCheck, hang, off, topYof, topDrawnX, topStored, relErr, nextCross };
  if (typeof module !== 'undefined') module.exports = root.SIM;
})(typeof window !== 'undefined' ? window : globalThis);
