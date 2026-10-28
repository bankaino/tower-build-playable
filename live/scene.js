// live/scene.js — «Построй дом». Pure function of t and the sim state (no Math.random, no accumulated state).
// Layers: sky (by progress: day → golden hour → evening) → far / near city → yard → lobby, floors, roof → crane, hook and the block → FX → grade → HUD, hint, callouts, end card.
// Graybox: every building part is a flat rectangle at its final size and position; art replaces the rectangles, the layout stays.
(function () {
  const S = (window.SCENE = {}), A = window.ASSETS, L = LIB, M = L.M, W = SIM.VIEW.W, H = SIM.VIEW.H, Z = window.SIZES, K = SIM.K;
  S.REPEAT = [];
  S.programs = () => { L.init(W, H); L.glyphs('0123456789+$×'); };
  const has = (n) => !!A[n], SS = L.SS;
  const SK = window.SKIN, FONT = SK.font;                                               // look-and-feel lives in skin.js; the scene only asks for tokens
  const TXT = { font: FONT, outW: SK.txt.outW, shadow: SK.txt.shadow, weight: SK.txt.weight };
  const label = (slot, str, x, y, o = {}) => { const q = Object.assign({}, TXT, o); if (o.ink) { const k = SK.ink[o.ink] || SK.ink.base; q.col = k[0]; q.out = k[1]; } delete q.ink; return L.label(slot, str, x, y, q); };
  const labelW = (slot, str, o = {}) => L.labelW(slot, str, Object.assign({}, TXT, o));
  const rr = (x, y, w, h, round, c0, c1, a) => L.rrect(x, y, w, h, round <= 1 ? Math.min(w, h) * round : round, c0, c1, a);   // round <= 1: a fraction of the short side (0.5 = pill)
  const panel = (x, y, w, h, k = 1, rPx) => { const rad = SK.panel.round <= 1 ? Math.min(w, h) * SK.panel.round : SK.panel.round; rr(x, y, w, h, rPx ? Math.min(rPx, rad) : rad, SK.panel.a, SK.panel.b, Math.min(1, SK.panel.alpha * k)); };
  const EASE = { out: (x) => 1 - (1 - x) * (1 - x), back: (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2), soft: (x) => x * x * (3 - 2 * x) };
  const ease = (x) => 1 - (1 - x) * (1 - x), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const nf = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');       // 1 980
  const ORANGE = [1, 0.353, 0.122], ORANGE_D = [0.878, 0.263, 0.039], GRAPH = [0.118, 0.122, 0.133];
  const SKY = [[[0.75, 0.87, 0.95], [0.84, 0.92, 0.97], [0.93, 0.96, 0.97]], [[0.55, 0.74, 0.92], [0.98, 0.86, 0.82], [1.0, 0.86, 0.66]], [[0.18, 0.23, 0.40], [0.58, 0.38, 0.52], [0.96, 0.60, 0.42]]];   // day, golden hour, evening: top / middle / horizon
  S.hit = [];

  // a building block drawn from its sprite: centre x, bottom y (screen px), size, tilt about (pvx, pvy) (default: its centre), squash about the bottom,
  // lit 0..1 (the evening twin fades in over the day sprite), dusk (the evening mood tints the day sprite)
  const SPRITE = { floor: ['floor_a', 'floor_a_lit'], base: ['base', 'base_lit'], roof: ['roof', null] };
  let DUSK = 0;                                                                         // set once per frame from the finale progress
  const dtint = (k) => [0.42, 0.46, 0.72, k];
  const block = (kind, xc, yb, w, h, o = {}) => {
    const rot = o.rot || 0, sq = o.sq || 1, a = o.a === undefined ? 1 : o.a, lit = o.lit || 0, [day, night] = SPRITE[kind], yc = yb - h * sq / 2, pvx = o.pvx === undefined ? xc : o.pvx, pvy = o.pvy === undefined ? yc : o.pvy;
    const tw = A[day].w, th = A[day].h, ppx = w * 4 / (tw - 8), ppy = h * 4 / (th - 8), w2 = w + 2 * ppx, h2 = h + 2 * ppy;   // prep leaves 4 px of padding around the trimmed sprite
    const m = M.of(M.t(pvx, pvy), M.r(rot), M.t(-pvx, -pvy), M.t(xc, yb + ppy), M.s(1, sq)), alt = o.alt ? 0.035 : 0;      // alt: every other floor a hair darker, so the stack reads as floors
    const tint = DUSK > 0.01 ? dtint(0.38 * DUSK + (o.alt ? 0.04 : 0)) : o.alt ? [0.55, 0.58, 0.65, 0.07] : [1, 1, 1, 0];
    L.sprite(day, 0, 0, { m, w: w2, h: h2, pivot: [w2 / 2, h2], u: { alpha: a, tint } });
    if (night && A[night] && lit > 0.01) L.sprite(night, 0, 0, { m, w: w2, h: h2, pivot: [w2 / 2, h2], u: { alpha: a * lit } });
  };
  const line = (x0, y0, x1, y1, th, col, a = 1) => { const len = Math.hypot(x1 - x0, y1 - y0); L.solid(x0, y0 - th / 2, len, th, col, Math.atan2(y1 - y0, x1 - x0), 0, th / 2, a); };
  const heart = (x, y, s, full, a = 1) => { const cx = x + s / 2, cy = y + s * 0.55, one = (k, col) => { const d = s * 0.62 * k;           // a house-shaped heart; an empty one is a graphite ring
      L.solid(cx - s * 0.4 * k, cy - s * 0.13 * k, s * 0.8 * k, s * 0.58 * k, col, 0, 0, 0, a); L.solid(cx - d / 2, cy - s * 0.15 * k - d / 2, d, d, col, Math.PI / 4, d / 2, d / 2, a); };
    if (full) one(1, ORANGE); else { one(1, [0.46, 0.48, 0.52]); one(0.68, [0.97, 0.98, 0.99]); } };
  const dust = [0.62, 0.62, 0.66];

  S.render = (t) => {
    const ST = S.state || SIM.at(t), GT = ST.t, rnd = L.rnd, z = ST.zoom, nF = ST.floors.length, reg = ST.floors.filter((f) => !f.roof).length;
    // ---- camera + trauma shake from recent landings ----
    let tr = 0;
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue;
      if (e.k === 'land' && a < 0.3) tr = Math.max(tr, (e.q === 'perfect' ? 0.5 : e.q === 'great' ? 0.4 : 0.35) * (1 - a / 0.3)); if (e.k === 'miss' && a < 0.4) tr = Math.max(tr, 0.8 * (1 - a / 0.4)); }
    const sh = 28 * tr * tr, shx = sh * Math.sin(GT * 83), shy = sh * Math.sin(GT * 101 + 1);
    const cam = ST.cam, sx = (x) => W / 2 + (x - K.CX0) * z + shx, sy = (y) => H - (y - cam) * z + shy;
    // trees sway in the wind: a small angle about the foot
    const tree = (n, x, hgt, baseY) => { const hh = hgt * z, ww = L.hsz(n, hh), ang = 0.02 * Math.sin(t * 1.1 + x * 0.013) + 0.006 * Math.sin(t * 2.3 + x);
      L.sprite(n, 0, 0, { m: M.of(M.t(sx(x), baseY), M.r(n.startsWith('tree') ? ang : 0)), w: ww, h: hh, pivot: [ww / 2, hh], u: { tint: dtint(0.55 * DUSK) } }); };
    // ===== sky: day → golden hour with the height → evening in the finale =====
    const fin = ST.finaleT > 0 ? clamp((GT - ST.finaleT) / 1.8, 0, 1) : 0, stage = fin > 0 ? 0.5 + 0.5 * fin : 0.5 * Math.min(1, reg / K.FLOORS); DUSK = fin;
    const sk = stage < 0.5 ? SKY[0].map((c, i) => mix(c, SKY[1][i], stage / 0.5)) : SKY[1].map((c, i) => mix(c, SKY[2][i], (stage - 0.5) / 0.5));
    L.beginBG(sk[0].concat(1));
    rr(0, 0, W, H * 0.58, 0, sk[0], sk[1]); rr(0, H * 0.58 - 1, W, H * 0.42 + 2, 0, sk[1], sk[2]);
    const g0 = sy(0), dv = Math.max(0, (cam - SIM.CAM0) * z), dusk = dtint(0.55 * fin);   // g0: screen y of the ground line; dv: how far the camera has risen
    ['cloud_a', 'cloud_b', 'cloud_c', 'cloud_a'].forEach((n, i) => { const ww = [360, 280, 340, 300][i] * (0.8 + 0.4 * rnd(i, 1)), cx = ((rnd(i, 2) * (W + 600) + t * (5 + 4 * rnd(i, 3))) % (W + 600)) - 300 - ww / 2,
      cy = H * (0.1 + 0.34 * rnd(i, 4)) + dv * [0.07, 0.1, 0.05, 0.12][i]; L.sprite(n, cx, cy, { w: ww, u: { alpha: 0.95 * (1 - 0.7 * fin), tint: dusk } }); });
    // far and near city; the near skyline stands on a river (its reflection fills the screen below it, so there is never a flat cut); parallax with the camera
    for (const [n, f, up] of [['city_far', 0.12, 150], ['city_near', 0.3, 60]]) {
      const bw = W, bh = bw * A[n].h / A[n].w, bot = g0 - up * z - (1 - f) * dv;
      if (n === 'city_far') { const fc = mix([0.78, 0.85, 0.90], dusk.slice(0, 3), 0.55 * fin); rr(0, bot - 2, W, Math.max(0, H - bot + 4), 0, fc, fc.map((v) => v * 0.92)); }
      else { const w0 = mix([0.62, 0.77, 0.88], dusk.slice(0, 3), 0.55 * fin), w1 = mix([0.46, 0.64, 0.79], dusk.slice(0, 3), 0.55 * fin);
        rr(0, bot - 2, W, Math.max(0, H - bot + 4), 0, w0, w1);
        L.sprite(n, 0, 0, { m: M.of(M.t(0, bot + bh * 0.55), M.s(1, -0.55)), w: bw, h: bh, pivot: [0, 0], u: { alpha: 0.32, tint: [w0[0], w0[1], w0[2], 0.5] } });
        for (let j = 0; j < 5; j++) L.solid(W * (0.1 + 0.2 * j) + 30 * Math.sin(t * 0.6 + j), bot + bh * (0.12 + 0.1 * j), 170, 4, [1, 1, 1], 0, 0, 0, 0.25); }   // a few ripples
      L.sprite(n, 0, bot - bh, { w: bw, h: bh, u: { tint: dusk } }); }
    // yard: ground strip (hedge, lawn, curb, path, lawn), trees behind the house
    if (g0 < H + 400) { const gh = W * ASSETS.ground.h / ASSETS.ground.w * z, gt = g0 - 297 * z;            // the curb line of the sprite sits on the ground line
      L.sprite('ground', 0, gt, { w: W, h: gh, u: { tint: dusk } }); { const rest = H - (gt + gh) + 4; if (rest > 0) L.sprite('ground', 0, gt + gh - 2, { w: W, h: rest, src: [0, 0.93, 1, 1], u: { tint: dusk } }); }
      for (const [n, x, hgt, dy] of [['tree_c', 1030, 400, -6], ['tree_b', 935, 300, -4]]) tree(n, x, hgt, g0 + dy * z); }
    L.beginComp();
    L.beginComp();

    // ===== the building =====
    const litAt = (i) => (ST.finaleT > 0 && ST.ev.some((e) => e.k === 'lights') ? clamp((GT - (ST.finaleT + 1.2) - i * 0.09) / 0.25, 0, 1) : 0);
    const bw = K.BW * z, fh = K.FH * z;
    block('base', sx(K.CX0), sy(0), K.BASE_W * z, K.BASE_H * z, { lit: litAt(0) });
    if (z > 0.99 && sy(0) - K.BASE_H * 0.67 < H - 60) { const px0 = sx(K.CX0), py0 = sy(0) - K.BASE_H * 0.67; L.uiBox('lobbyb', px0 - 100, py0 - 22, 200, 44, 4); label('lobby', 'КВАДРАТ', px0, py0, { size: 26, ink: 'cta', al: 0.5 }); }   // the developer's name on the lobby sign
    for (const [n, x, hgt, dy] of [['tree_a', 100, 400, 6], ['lamp', 262, 330, -2], ['bush', 838, 74, 2], ['lamp', 905, 330, -2], ['bench', 150, 82, -112]]) {       // yard props in front of the lobby
      tree(n, x, hgt, sy(0) + dy * z); }
    const drawFloors = (arr, dy, a) => arr.forEach((f, i) => {
      const age = GT - f.t, newest = i === arr.length - 1 && !dy, slide = newest ? (f.lx - (f.x + SIM.off(ST, i + 1))) * (1 - SS(0, 0.12, age)) : 0;
      let sq = 1; if (newest && age < 0.35) sq = age < 0.09 ? 1 - 0.1 * (age / 0.09) : age < 0.18 ? 0.9 + 0.14 * ((age - 0.09) / 0.09) : 1.04 - 0.04 * Math.min(1, (age - 0.18) / 0.17);
      const w = (f.roof ? K.ROOF_W : K.BW) * z, h = (f.roof ? K.ROOF_H : K.FH) * z, x0 = f.x + SIM.off(ST, i + 1) + slide, x = x0 + (K.CX0 - x0) * (ST.finaleT > 0 ? 0.8 * SS(0.3, 1.3, GT - ST.finaleT) : 0);   // the finished house settles almost straight
      block(f.roof ? 'roof' : 'floor', sx(x), sy(K.BASE_H + i * K.FH) + (dy || 0), w, h, { sq, a, lit: litAt(i + 1), alt: i % 2, rot: f.roof || dy ? 0 : 1.5 * ST.swA * Math.sqrt((i + 1) / (K.FLOORS + 1)) / (K.FLOORS + 1) / K.FH * Math.sin(ST.swPh) });   // each floor leans with the sway
    });
    drawFloors(ST.floors, 0, 1);
    if (ST.lost && ST.phase === 'reset') { const q = ease(clamp(ST.pt / 0.9, 0, 1)); ST.lost.forEach((f, i) => { const a = 1 - SS(0.5, 1, q), w = K.BW * z, h = K.FH * z;
      block('floor', sx(f.x), sy(K.BASE_H + i * K.FH) - q * H * 1.3 * (0.6 + 0.4 * i / ST.lost.length), w, h, { a }); }); }

    // ===== crane: trolley on the jib, cable, hook, ropes, the swinging block =====
    const hg = SIM.hang(ST), inAim = ST.phase === 'aim' || ST.phase === 'enter';
    let enterDy = 0; if (ST.phase === 'enter') enterDy = -(1 - ease(clamp(ST.pt / K.TT.enter, 0, 1))) * K.ENTER_DIST;
    const tx = sx(ST.cx), ty = 40, bwid = K.BW * z, bx = sx(hg.x), bcy = hg.sy + enterDy + shy, hhk = 170, hwk = L.hsz('hook', hhk);
    { const jh = 64, jw = jh * A.crane_jib.w / A.crane_jib.h; for (let i = 0; i < 2; i++) L.sprite('crane_jib', -30 + i * (jw - 4), ty - 62, { w: jw, h: jh }); }   // the jib: two tiles of the truss across the top
    rr(tx - 56, ty - 10, 112, 38, 8, GRAPH, GRAPH); L.solid(tx - 56, ty + 18, 112, 6, ORANGE);                                                              // the trolley under it
    let hookX, hookY, hookA = 1;                                                                                                                           // (hookX, hookY): where the ropes meet
    if (inAim) { const ex = bx, ey = bcy - K.FH / 2 * z, dd = Math.hypot(ex - tx, ey - ty); hookX = ex + (tx - ex) * 150 / dd; hookY = ey + (ty - ey) * 150 / dd;
      const c = Math.cos(hg.rot), s = Math.sin(hg.rot);
      for (const sgn of [-1, 1]) { const cxp = bx + (sgn * 0.42 * bwid) * c - (-K.FH / 2 * z) * s, cyp = bcy + (sgn * 0.42 * bwid) * s + (-K.FH / 2 * z) * c; line(hookX, hookY, cxp, cyp, 3, GRAPH); }
      const bhh = (ST.roofBlk ? K.ROOF_H : K.FH) * z; block(ST.roofBlk ? 'roof' : 'floor', bx, bcy + bhh / 2, (ST.roofBlk ? K.ROOF_W : K.BW) * z, bhh, { rot: hg.rot, alt: ST.floors.length % 2 }); }
    else { const up = ST.dropT !== undefined ? ease(clamp((GT - ST.dropT) / 0.5, 0, 1)) : 1, x0 = ST.dropT !== undefined ? sx(ST.dropX) : tx, y0 = ST.dropT !== undefined ? ST.dropSy - K.FH / 2 * z - 150 : ty + 150;
      hookX = x0 + (tx - x0) * up; hookY = y0 + (ty + 150 - y0) * up; hookA = 1 - up * 0.2;
      if (ST.finaleT > 0) { const u = ease(clamp((GT - ST.finaleT) / 0.8, 0, 1)); hookY -= 520 * u; hookA *= 1 - u; } }
    { const phi = Math.atan2(hookX - tx, hookY - ty), tpx = hookX - Math.sin(phi) * 0.68 * hhk, tpy = hookY - Math.cos(phi) * 0.68 * hhk;                    // the hook hangs from the cable's end, along the cable
      line(tx, ty + 20, tpx, tpy, 6, GRAPH, hookA); L.sprite('hook', 0, 0, { m: M.of(M.t(tpx, tpy), M.r(-phi)), w: hwk, h: hhk, pivot: [hwk / 2, 0], u: { alpha: hookA } }); }
    // falling block
    if (ST.phase === 'fall' && ST.blk) { const b = ST.blk, h = (ST.roofBlk ? K.ROOF_H : K.FH) * z; block(ST.roofBlk ? 'roof' : 'floor', sx(b.x), sy(b.y) + h / 2, (ST.roofBlk ? K.ROOF_W : K.BW) * z, h, { rot: b.rot }); }
    // a miss: the block pivots over the edge of the tower and falls away (or just misses it)
    for (const e of ST.ev) { if (e.k !== 'miss') continue; const a = GT - e.t; if (a < 0 || a > 1.6) continue;
      const side = Math.sign(e.d) || 1, over = Math.abs(e.d) < K.BW, h = (e.roof ? K.ROOF_H : K.FH) * z, w = (e.roof ? K.ROOF_W : K.BW) * z;
      const rot = side * (over ? 2.4 * a * a : 1.4 * a), fall = 2600 * Math.pow(Math.max(0, a - (over ? 0.25 : 0)), 2) * z;
      const pvx = sx(e.topX + side * K.BW / 2), pvy = sy(e.y) - h / 2;
      block(e.roof ? 'roof' : 'floor', sx(e.x), sy(e.y) + h / 2 + fall, w, h, { rot, pvx: over ? pvx : sx(e.x), pvy: over ? pvy + fall : sy(e.y) + fall, a: 1 - SS(1.1, 1.6, a) });
      if (a < 0.5) for (let j = 0; j < 6; j++) { const q = a / 0.5; L.puff(pvx + (j - 2.5) * 22 * z * (1 + q), pvy - 14 * q * z, (18 + 26 * q) * z, dust, 0.7 * (1 - q), j + 3); } }
    // landing dust, the orange ring of a perfect landing
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0 || e.k !== 'land' || a > 0.6) continue; const seam = sy(K.BASE_H + (e.n - 1) * K.FH), f = ST.floors[e.n - 1], cx = sx(f ? f.x + SIM.off(ST, e.n) : e.x), q = a / 0.6;
      for (let j = 0; j < 12; j++) { const side = j % 2 ? 1 : -1, d = (60 + 120 * ease(q)) * z * (0.5 + 0.5 * rnd(j, 5)) + (K.BW / 2) * z * 0.7; L.puff(cx + side * d, seam - 8 * z - 18 * q * z, (20 + 33 * q) * z, dust, 0.8 * (1 - q), j); }
      if (a < 0.08) { const fl = 0.55 * (1 - a / 0.08), fw = (e.roof ? K.ROOF_W : K.BW) * z; L.solid(cx - fw / 2, seam - (e.roof ? K.ROOF_H : K.FH) * z, fw, (e.roof ? K.ROOF_H : K.FH) * z, [1, 1, 1], 0, 0, 0, fl); }   // a white flash on the floor that just landed
      if (e.q === 'perfect' && a < 0.5) for (let j = 0; j < 10; j++) { const an = (j / 10) * 6.283 + 0.3, d = (90 + 190 * ease(a / 0.5)) * z, gx = cx + Math.cos(an) * d * 1.3, gy = seam - K.FH * 0.35 * z + Math.sin(an) * d * 0.6 + 80 * a * a * z;
        L.star(gx, gy, 34 * z, j % 2 ? ORANGE : [1, 0.9, 0.55], 1 - SS(0.2, 0.5, a)); }
      if (e.q === 'perfect' && a < 0.45) { const k2 = a / 0.45; { L.ring(cx, seam - K.FH * 0.4 * z, (K.BW / 2 + 40 * k2) * z, (K.FH / 2 + 30 * k2) * z, ORANGE, 1.2 * (1 - k2), 0.12); L.ring(cx, seam - K.FH * 0.4 * z, (K.BW / 2 + 110 * k2) * z, (K.FH / 2 + 80 * k2) * z, [1, 0.8, 0.5], 0.8 * (1 - k2), 0.1); } } }
    // finale: fireworks over the house
    if (ST.finaleT > 0) { const a0 = GT - ST.finaleT;
      for (let j = 0; j < 7; j++) { const a = a0 - 0.25 - j * 0.34; if (a < 0 || a > 1.5) continue;                       // seven bursts, on the left and right of the house (the audio plays the same seven)
        const fx = W * ((j % 2 ? 0.72 : 0.08) + 0.2 * rnd(j, 11)), fy = H * (0.1 + 0.3 * rnd(j, 12)), col = j % 3 === 0 ? ORANGE : j % 3 === 1 ? [1, 0.85, 0.45] : [1, 1, 1];
        if (a < 0.14) L.glow(fx, fy, 190 * (a / 0.14), col, 0.85, 2.2);
        for (let s2 = 0; s2 < 24; s2++) { const an = s2 / 24 * 6.283 + 0.2 * j, d = 50 + 300 * ease(Math.min(1, a / 0.9)), d2 = Math.max(0, d - 55), al = 1 - SS(0.5, 1.5, a), g = 120 * a * a;
          L.star(fx + Math.cos(an) * d, fy + Math.sin(an) * d + g, 30, col, al); L.star(fx + Math.cos(an) * d2, fy + Math.sin(an) * d2 + g, 18, col, 0.6 * al); } } }
    if (ST.finaleT > 0 && nF > K.FLOORS) { const f = ST.floors[nF - 1], lv = litAt(nF);                         // the roof plaque glows once the lights are on
      if (lv > 0) L.glow(sx(f.x + SIM.off(ST, nF)), sy(K.BASE_H + K.FLOORS * K.FH) - K.ROOF_H * 0.75 * z, 170 * z, ORANGE, 0.5 * lv * (0.8 + 0.2 * Math.sin(t * 4)), 2.2); }
    L.finish(t, SK.grade);

    // ===================== HUD (screen space) =====================
    S.hit = [];
    const endCard = ST.end >= 0;
    if (!endCard) {
      // floor counter, top left: a big orange number and a caption
      const shownN = ST.phase === 'finale' ? K.FLOORS : Math.min(K.FLOORS, reg), s0 = 1 + 0.12 * (ST.lastLand && GT - ST.lastLand.t < 0.25 ? 1 - (GT - ST.lastLand.t) / 0.25 : 0);
      const TP = 34;                                                                       // safe margin under a notch / status bar
      L.uiBox('floorbox', 40, 56 + TP, 330, 250, 4);
      label('floorn', String(shownN), 62, 150 + TP, { size: Math.round(170 * s0), ink: 'brand', weight: '800' });
      label('floorc', 'этаж из ' + K.FLOORS, 66, 270 + TP, { size: 42, ink: 'stat', weight: '800' });
      // area pill, and the hearts in a capsule of their own (an empty heart must read on white, not on the sky)
      let inFlight = 0, bump = 0; for (const e of ST.ev) { if (e.k !== 'land' || !e.gain) continue; const a = GT - e.t; if (a >= 0 && a < 0.8) inFlight += e.gain; const b = GT - e.t - 0.8; if (b >= 0 && b < 0.18) bump = Math.max(bump, 1 - b / 0.18); }
      const at = nf(Math.max(0, ST.area - inFlight)) + ' м²', tw = Math.max(labelW('area', at, { size: 54 }), 120), pw = 40 + 44 + 18 + tw + 44, px = W - 40 - pw, pyb = 70 + TP - 9 * bump;   // the counter grows when the gain lands in it
      panel(px, pyb, pw, 96); L.uiBox('areabox', px, pyb, pw, 96, 4);
      L.solid(px + 36, pyb + 26, 44, 44, ORANGE); label('area', at, px + 36 + 44 + 18, pyb + 48, { size: 54, ink: 'panelText' });

      const hs = 60, gap = 14, hcw = 3 * hs + 2 * gap + 56, hcx = W - 40 - hcw, hcy = 70 + TP + 96 + 16;
      panel(hcx, hcy, hcw, hs + 36, 1, 40);
      for (let i = 0; i < K.HEARTS; i++) { let a = 1, hy = hcy + 18; for (const e of ST.ev) { const q = GT - e.t; if (e.k === 'heart' && e.left === i && q >= 0 && q < 0.5) { hy += 8 * Math.sin(q * 60) * (1 - q / 0.5); a = 1 - 0.5 * (1 - q / 0.5); } }
        heart(hcx + 28 + i * (hs + gap), hy, hs, i < ST.hearts, a); }
      for (const e of ST.ev) { if (e.k !== 'land' || !e.gain) continue; const a = GT - e.t; if (a < 0.1 || a > 0.8) continue; const q = ease((a - 0.1) / 0.7), f0 = ST.floors[e.n - 1];       // "+180 м²" flies from the landed floor to the counter
        const x0 = sx(f0 ? f0.x + SIM.off(ST, e.n) : e.x), y0 = sy(K.BASE_H + (e.n - 0.5) * K.FH), x1 = px + 58, y1 = pyb + 48;
        label('gain', '+' + e.gain + ' м²', x0 + (x1 - x0) * q, y0 + (y1 - y0) * q - 120 * Math.sin(Math.PI * q), { size: Math.round(52 * (1 - 0.25 * q)), ink: 'hot', al: 0.5, a: 1 - SS(0.85, 1, q) }); }
      // first screen: the offer on top, the verb ("tap when the block is over the house") on an orange pill, an arrow down to the house
      const fa = ST.firstIn < 0 ? 1 : 1 - clamp((GT - ST.firstIn) / 0.3, 0, 1);                      // the cluster fades out in 0.3 s after the first tap
      if (ST.floors.length === 0 && ST.attempt === 0 && fa > 0.01 && (ST.phase === 'aim' || ST.phase === 'fall')) { const line1 = SIM.K.HOOK === 'surprise' ? 'Построй дом мечты' : 'Построй дом — получи скидку 5 %', b = 1 + 0.03 * Math.sin(t * 5), lw = labelW('hook', line1, { size: 46 }), bw2 = lw + 70, by2 = Math.round(H * 0.235);
        panel(W / 2 - bw2 / 2, by2 - 46, bw2, 92, fa); L.uiBox('hookbox', W / 2 - bw2 / 2, by2 - 46, bw2, 92, 4); label('hook', line1, W / 2, by2, { size: Math.round(46 * b), ink: 'panelText', al: 0.5, a: fa });
        const ay = sy(K.BASE_H) - 150 + 10 * Math.sin(t * 6), axx = sx(K.CX0), itxt = 'ТАП, КОГДА НАД ДОМОМ', iw = labelW('arrow', itxt, { size: 46 }) + 70, iy = ay - 120;
        rr(axx - iw / 2, iy, iw, 84, 0.5, ORANGE, ORANGE_D, fa); L.uiBox('arrowbox', axx - iw / 2, iy, iw, 84, 4); label('arrow', itxt, axx, iy + 42, { size: 46, ink: 'cta', al: 0.5, a: fa });
        L.solid(axx - 18, ay - 20, 36, 50, ORANGE, 0, 0, 0, 0.95 * fa); L.solid(axx - 32, ay + 20, 64, 64, ORANGE, Math.PI / 4, 32, 32, 0.95 * fa); }
      // callouts
      for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue;
        const pop = (slot, txt, x, y, life0, size, ink) => { const life = life0 * SK.pop.life; if (a > life) return; const q = a / life, s = size * (a < 0.12 ? SK.pop.from + (1 - SK.pop.from) * a / 0.12 : 1);
          label(slot, txt, x, y - 90 + SK.pop.rise * (1 - EASE[SK.pop.ease](q)), { size: Math.round(s), ink, al: 0.5, a: 1 - SS(0.7, 1, q) }); };
        // callouts sit just above the top of the tower (the camera holds it at 70 % of the screen; the hanging block stays above them)
        const topY = sy(K.BASE_H + Math.min(e.n || reg, K.FLOORS + 1) * K.FH) - 70, cxp = clamp(e.x !== undefined ? sx(e.x) : W / 2, 340, W - 340);
        if (e.k === 'land' && !e.roof) pop('q', e.q === 'perfect' ? 'ИДЕАЛЬНО!' : e.q === 'great' ? 'ОТЛИЧНО' : 'ХОРОШО', cxp, topY, 1.0, e.q === 'perfect' ? 96 : 72, e.q === 'perfect' ? 'hot' : 'panelText');
        if (e.k === 'combo') pop('cmb', '×' + e.c, cxp, topY + 100, 1.0, 76, 'hot');
        if (e.k === 'miss') pop('miss', 'МИМО!', cxp, sy(K.BASE_H + e.n * K.FH) - 190, 0.78, 96, 'warn');       // gone before the game-over card fades in (0.9 s after the miss)
        if (e.k === 'half') pop('half', 'Полпути!', W / 2, H * 0.255, 1.4, 64, 'brand');
        if (e.k === 'lastroof') pop('roof', 'Осталась крыша!', W / 2, H * 0.255, 1.6, 64, 'brand'); }
      if (ST.phase === 'finale') { const a = GT - ST.finaleT, q = clamp((a - 0.3) / 0.45, 0, 1); if (q > 0.01) label('fin', 'Дом готов!', W / 2, H * 0.235, { size: Math.round(112 * (q < 1 ? 1.1 * ease(q) - 0.1 * q * q : 1)), ink: 'brand', al: 0.5, a: SS(0, 0.3, q) * (1 - SS(3.0, 3.5, a)) }); }
      // out of hearts: the house is not finished — start again
      if (ST.phase === 'over') { const q = SS(0, 0.35, ST.pt), cw = 860, ch = 520, cx = (W - cw) / 2, cy = H * 0.5 - ch / 2 + (1 - q) * 80;
        L.solid(0, 0, W, H, [0.1, 0.1, 0.12], 0, 0, 0, 0.35 * q);
        rr(cx, cy, cw, ch, 44, SK.panel.a, SK.panel.b, q); L.uiBox('overbox', cx, cy, cw, ch, 6);
        label('overh', 'Дом не достроен', W / 2, cy + 110, { size: Math.round(78 * (0.9 + 0.1 * q)), ink: 'panelText', al: 0.5, a: q });
        label('overs', 'Построено ' + reg + ' из ' + K.FLOORS + ' этажей', W / 2, cy + 215, { size: 46, ink: 'panelText', al: 0.5, a: q });
        const bw3 = 560, bh = 140, bx3 = W / 2 - bw3 / 2, by3 = cy + 310, pul = 1 + SK.cta.pulse * Math.sin(t * 5);
        rr(bx3 - (pul - 1) * bw3 / 2, by3 - (pul - 1) * bh / 2, bw3 * pul, bh * pul, SK.cta.round, SK.cta.bar[0], SK.cta.bar[1], q); L.uiBox('restartb', bx3, by3, bw3, bh, 4);
        label('restart', 'Заново', W / 2, by3 + bh / 2, { size: 64, ink: 'cta', al: 0.5, a: q });
        S.hit.push({ id: 'restart', x: bx3, y: by3, w: bw3, h: bh }); } }
    // ===== end card: the finished house above, a white card with the promo code below =====
    else { const a = GT - ST.end, k = SS(0, 0.5, a), cardH = 800, y0 = H - 30 - cardH + (1 - ease(clamp(a / 0.55, 0, 1))) * (cardH + 60), pop = (d) => { const q = clamp((a - d) / 0.35, 0, 1); return q < 1 ? 1.12 * ease(q) - 0.12 * q * q : 1; };
      const why = ST.endWhy, head = why === 'win' ? (SIM.K.OFFER === 'surprise' ? 'А это — вам!' : 'Дом построен!') : why === 'idle' ? 'Достроим дом?' : 'Построй свой дом';
      if (why === 'win') for (let j = 0; j < 90; j++) { const sp = 90 + 110 * rnd(j, 71), cyy = ((rnd(j, 72) * (y0 + 80) + a * sp) % (y0 + 80)) - 30, cxx = W * rnd(j, 73) + 30 * Math.sin(a * 2 + j), col = j % 3 === 0 ? ORANGE : j % 3 === 1 ? [1, 1, 1] : [1, 0.82, 0.4];
        if (cyy < y0 - 10) L.solid(cxx, cyy, 26, 14, col, a * (2 + 3 * rnd(j, 74)) + j, 13, 7, 0.9 * k); }   // a thin confetti fall above the card
      rr(24, y0, W - 48, cardH, 56, SK.end.plate[0], SK.end.plate[1], 1); L.uiBox('card', 24, y0, W - 48, cardH, 6);
      label('brand0', 'КВАДРАТ', W / 2, y0 + 46, { size: 34, ink: 'brand', al: 0.5 });
      label('endh', head, W / 2, y0 + 104, { size: 78, ink: 'endText', al: 0.5 });
      if (why === 'win') { const chips = [K.FLOORS + ' этажей', nf(ST.area) + ' м²'].concat(ST.perfects > 0 ? ['идеально ×' + ST.perfects] : []);
        const ws = chips.map((s, i) => labelW('chip' + i, s, { size: 38 }) + 56), tot = ws.reduce((x, y) => x + y, 0) + 20 * 2; let cx = W / 2 - tot / 2;
        chips.forEach((s, i) => { rr(cx, y0 + 166, ws[i], 72, 0.5, SK.chip.good[0], SK.chip.good[1]); L.uiBox('chipb' + i, cx, y0 + 166, ws[i], 72, 4); label('chip' + i, s, cx + ws[i] / 2, y0 + 202, { size: 38, ink: 'chip', al: 0.5 }); cx += ws[i] + 20; }); }
      { const w1 = labelW('off1', '−5 %', { size: 108 }), w2 = labelW('off2', 'на покупку квартиры', { size: 42 }), tot = w1 + 26 + w2, ox = W / 2 - tot / 2, oy = y0 + 312;   // the offer, big and orange
        L.uiBox('offbox', ox - 12, oy - 66, tot + 24, 132, 4); label('off1', '−5 %', ox, oy, { size: 108, ink: 'hot' }); label('off2', 'на покупку квартиры', ox + w1 + 26, oy + 12, { size: 42, ink: 'endText' }); }
      // promo field: dashed orange frame, the code, a copy button
      const px2 = 70, pw2 = W - 140, py2 = y0 + 400, ph2 = 118, copied = ST.ev.some((e) => e.k === 'copy' && GT - e.t < 2.5);
      rr(px2, py2, pw2, ph2, 28, [0.99, 0.93, 0.89], [0.99, 0.93, 0.89]); L.uiBox('promobox', px2, py2, pw2, ph2, 4);
      for (let u = 0; u < pw2; u += 36) { L.solid(px2 + u, py2, 22, 5, ORANGE); L.solid(px2 + u, py2 + ph2 - 5, 22, 5, ORANGE); }
      for (let u = 0; u < ph2; u += 36) { L.solid(px2, py2 + u, 5, 22, ORANGE); L.solid(px2 + pw2 - 5, py2 + u, 5, 22, ORANGE); }
      label('promo', SIM.K.PROMO, px2 + 36, py2 + ph2 / 2, { size: 62, ink: 'endText' });
      const cw2 = 340, cbx = px2 + pw2 - cw2 - 12, cby = py2 + 12, chh = ph2 - 24; rr(cbx, cby, cw2, chh, 0.5, copied ? [0.2, 0.7, 0.4] : ORANGE, copied ? [0.15, 0.6, 0.35] : ORANGE_D); L.uiBox('copyb', cbx, cby, cw2, chh, 4);
      label('copy', copied ? 'Скопировано' : 'Скопировать', cbx + cw2 / 2, cby + chh / 2, { size: 40, ink: 'cta', al: 0.5 }); S.hit.push({ id: 'copy', x: cbx - 12, y: cby - 12, w: cw2 + 24, h: chh + 24 });
      // call to action
      const pul = 1 + 0.03 * Math.sin(t * 6), bw4 = 900, bh4 = 150, bx4 = W / 2 - bw4 / 2 * pul, by4 = y0 + 548;
      rr(bx4, by4 + 10, bw4 * pul, bh4 * pul, SK.cta.round, SK.cta.endBase[0], SK.cta.endBase[1]); rr(bx4, by4, bw4 * pul, bh4 * pul, SK.cta.round, SK.cta.end[0], SK.cta.end[1]); L.uiBox('endcta', bx4, by4, bw4 * pul, bh4 * pul, 4);
      label('endcta', 'Выбрать квартиру', W / 2, by4 + bh4 * pul / 2, { size: 64, ink: 'ctaEnd', al: 0.5 }); S.hit.push({ id: 'cta', x: bx4, y: by4, w: bw4, h: bh4 });
      const ry = y0 + 757; if (a > 1.0) { const q = SS(1.0, 1.4, a), rw = 380; rr(W / 2 - rw / 2, ry - 40, rw, 80, 0.5, SK.chip.good[0], SK.chip.good[1], q); L.uiBox('replayb', W / 2 - rw / 2, ry - 40, rw, 80, 4);
        label('replay', 'Ещё раз', W / 2, ry, { size: 44, ink: 'endText', al: 0.5, a: q }); S.hit.unshift({ id: 'replay', x: W / 2 - rw / 2 - 20, y: ry - 40, w: rw + 40, h: 84 }); }
      if (a > 0.7) S.hit.push({ id: 'cta', x: 0, y: 0, w: W, h: H }); }                  // the house and the sky above the card open the store too (copy and replay sit inside the card, measured first)
  };

  // QA hooks: every HUD screen staged from the attract demo, where it happens naturally
  S.QA = () => {
    const tm = {}; { const s = SIM.spawn(0); for (let i = 0; i < SIM.L * 120 && s.end < 0; i++) { SIM.step(s, SIM.scriptInput(s.t, s)); for (const e of s.ev) { const k = e.k + (e.q || ''); if (!(k in tm)) tm[k] = e.t; } } }
    const clone = (x) => JSON.parse(JSON.stringify(x)), at = (tt, o = {}) => Object.assign(clone(SIM.at(tt)), o);
    const st = [['start', at(0.3)], ['aim', at(1.2)], ['perfect', at(tm.landperfect + 0.3)], ['good', at(tm.landgood + 0.3)], ['miss', at(tm.miss + 0.3)], ['half', at(tm.half + 0.3)],
      ['lastroof', at(tm.lastroof + 0.3)], ['finale', at(tm.finale + 2.0)]];
    const endS = at(SIM.L - 1);
    st.push(['over', Object.assign(clone(st[4][1]), { phase: 'over', hearts: 0, pt: 1.5, ev: [] })], ['end', endS], ['end_idle', Object.assign(clone(endS), { endWhy: 'idle' })], ['end_passive', Object.assign(clone(endS), { endWhy: 'passive' })],
      ['area_worst', Object.assign(clone(st[3][1]), { area: 99999 })], ['end_worst', Object.assign(clone(endS), { area: 99999, perfects: 99 })]);
    return { states: st, cycles: {}, sprites: {}, box: () => [0, 0, W, H] };
  };
})();
