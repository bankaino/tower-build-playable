// live/audio.js — procedural sound (WebAudio, zero asset bytes) driven by the sim event bus S.ev.
// index.html calls AUDIO.tick(state) once per frame in play mode; the context starts on the first user gesture (autoplay policy)
// and AUDIO.mute(bool) is wired to ad-network viewability / audio-volume callbacks.
// Soft by design: every sound goes through one gentle top-end trim (high-shelf −4 dB from 3.5 kHz + low-pass 9 kHz). Music: a quiet pad on four chords with a
// light arpeggio and a soft hat, 100 BPM; the finale lifts it (octave arpeggio, chimes); the end card leaves the pad only. The crane creaks while the block swings.
(function () {
  let hid = false, ac = null, out = null, soft = null, mus = null, wbus = null, wNext = 0, wStep = 0, creak = null, an = null, anBuf = null, last = -1, muted = false, mStep = 0, mNext = 0;
  const start = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    ac = new C(); out = ac.createGain(); out.gain.value = muted || hid ? 0 : 1.6; out.connect(ac.destination);
    an = ac.createAnalyser(); an.fftSize = 1024; anBuf = new Float32Array(1024); out.connect(an);                // level probe for tools/audio_probe.mjs
    soft = ac.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 9000; const sh = ac.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 3500; sh.gain.value = -4;
    soft.connect(sh); sh.connect(out);
    wbus = ac.createGain(); wbus.gain.value = 0; wbus.connect(soft);                       // the victory theme's bus (silent until the finale)
    mus = ac.createGain(); mus.gain.value = 0.9; mus.connect(soft);                       // the music bus (ducked a little under big moments, softer on the end card)
    const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);   // silent buffer: wakes the context on touch devices
  };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, start, { capture: true });
  document.addEventListener('visibilitychange', () => { hid = document.hidden; if (out) out.gain.value = muted || hid ? 0 : 1.6; });   // silent while the page is hidden (every network, not only MRAID)
  let nbuf = null;
  const noise = () => { if (nbuf) return nbuf; nbuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate); const d = nbuf.getChannelData(0);
    let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; } return nbuf; };
  const env = (node, t0, a, peak, dur, dest) => { const g = ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); node.connect(g); g.connect(dest || soft); return g; };
  const tone = (freq, t0, dur, type = 'sine', peak = 0.2, slide = 0, dest) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur); env(o, t0, 0.005, peak, dur, dest); o.start(t0); o.stop(t0 + dur + 0.05); };
  const burst = (t0, dur, f0, f1, peak, q = 1.2, type = 'bandpass', dest) => { const s = ac.createBufferSource(); s.buffer = noise(); const f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); s.connect(f); env(f, t0, 0.004, peak, dur, dest); s.start(t0); s.stop(t0 + dur + 0.05); };
  const SK = (typeof window !== 'undefined' && window.SKIN && window.SKIN.sfx) || { lead: 'sine', soft: 'triangle', bass: 'sine', pitch: 1 };
  const PM = SK.pitch || 1, f_ = (x) => x * PM;

  // ---- music: C – Am – F – G, one chord per 4 beats ----
  const BPM = 100, STEP = 60 / BPM / 2, CH = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]], ARP = [0, 1, 2, 1, 0, 2, 1, 2];
  const musicStep = (t0, n, fin) => {
    const ch = CH[Math.floor(n / 8) % 4], k = n % 8;
    if (k === 0) for (const f of ch) { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f / 2; const g = ac.createGain(); g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(fin ? 0.03 : 0.02, t0 + 0.5); g.gain.linearRampToValueAtTime(0.0001, t0 + STEP * 8 + 0.6); o.connect(g); g.connect(mus); o.start(t0); o.stop(t0 + STEP * 8 + 0.7); }
    tone(ch[ARP[k]] * 2, t0, 0.42, 'sine', fin ? 0.05 : 0.032, 0, mus);                  // arpeggio
    if (fin && k % 2 === 0) tone(ch[ARP[(k + 3) % 8]] * 4, t0 + 0.02, 0.3, 'sine', 0.022, 0, mus);   // chimes above it in the finale
    if (k % 2 === 1) burst(t0, 0.04, 7000, 5000, fin ? 0.025 : 0.02, 1, 'highpass', mus);          // a soft hat on the off-beats
    if (k === 0) tone(ch[0] / 2, t0, 0.5, 'sine', 0.07, 0.6, mus);                      // a soft kick-like pulse on the chord change
  };

  // ---- victory theme (finale and end card): brighter and bouncier than the game loop — C – G – Am – F at 112 BPM: kick, syncopated bass, claps, chord stabs, a sparkling bell line with an echo ----
  const WSTEP = 60 / 112 / 2, WROOT = [130.81, 98.0, 110.0, 87.31], WCH = [[261.63, 329.63, 392.0], [246.94, 293.66, 392.0], [261.63, 329.63, 440.0], [261.63, 349.23, 440.0]], WBELL = [0, 2, 1, 2, 0, 2, 1, 2];
  const winStep = (t0, n) => {
    const bar = Math.floor(n / 8) % 4, k = n % 8, ch = WCH[bar], d = wbus;
    if (k === 0 || k === 4) { tone(150, t0, 0.2, 'sine', 0.16, 0.35, d); burst(t0, 0.02, 2500, 2000, 0.05, 1, 'bandpass', d); }                  // kick
    if (k === 0 || k === 3 || k === 4 || k === 7) tone(WROOT[bar] * 2, t0, 0.24, 'triangle', 0.09, 0.9, d);                                          // bass
    if (k === 2 || k === 6) { burst(t0, 0.09, 1900, 1500, 0.07, 1.2, 'bandpass', d); for (const f of ch) tone(f, t0, 0.2, 'triangle', 0.026, 0, d); }   // clap + stab
    tone(ch[WBELL[k]] * (k % 4 === 3 ? 4 : 2), t0, 0.3, 'sine', 0.04, 0, d);                                                                         // bells
    tone(ch[WBELL[k]] * 2, t0 + WSTEP * 3, 0.25, 'sine', 0.014, 0, d);                                                                               // their echo
    if (k % 2 === 1) burst(t0, 0.03, 8000, 6000, 0.022, 1, 'highpass', d);                                                                           // shaker
  };

  // ---- sound effects ----
  const SFX = {
    drop: (t0) => { burst(t0, 0.03, 3000, 2500, 0.15, 2); tone(1250, t0, 0.04, 'square', 0.05); tone(900, t0 + 0.02, 0.3, SK.soft, 0.05, 0.35); },        // a clear clack: the most repeated action        // the hook lets go, the block whistles down
    land: (t0, e) => { const up = 1 + 0.035 * (e.n || 0); tone(180 * up, t0, 0.22, 'triangle', 0.42, 0.5); tone(1200, t0, 0.03, 'square', 0.07); burst(t0, 0.14, 900, 250, 0.18);   // the thud has to live above ~250 Hz, small phone speakers drop everything below
      if (e.q === 'perfect') [659, 784, 988, 1319].slice(0, 2 + Math.min(2, (e.combo || 1) - 1)).forEach((f, i) => tone(f_(f) * up, t0 + 0.04 + i * 0.07, 0.25, SK.lead, 0.07)); else tone(f_(e.q === 'great' ? 698 : 523), t0 + 0.05, 0.18, SK.soft, 0.07);
      if (e.gain) tone(f_(1568), t0 + 0.8, 0.12, SK.lead, 0.045); },                                                  // the "+м²" lands in the counter
    miss: (t0) => { tone(190, t0, 0.3, 'triangle', 0.45, 0.5); burst(t0, 0.5, 1400, 120, 0.2, 0.8); tone(520, t0 + 0.12, 0.7, SK.soft, 0.06, 0.3); },
    heart: (t0) => tone(180, t0, 0.3, SK.bass, 0.22, 0.6),
    over: (t0) => [392, 330, 262].forEach((f, i) => tone(f_(f), t0 + i * 0.14, 0.4, SK.soft, 0.08)),
    restart: (t0) => { burst(t0, 0.5, 300, 900, 0.08, 1.4); },                                                       // the cable hauls the house away
    half: (t0) => { tone(130, t0, 0.5, 'triangle', 0.1, 0.8); [523, 659].forEach((f, i) => tone(f_(f), t0 + i * 0.08, 0.2, SK.lead, 0.06)); },
    lastroof: (t0) => [587, 740, 880].forEach((f, i) => tone(f_(f), t0 + i * 0.08, 0.2, SK.lead, 0.07)),
    roof: (t0) => [523, 659, 784, 1047].forEach((f, i) => tone(f_(f), t0 + i * 0.07, 0.3, SK.lead, 0.08)),
    finale: (t0) => { burst(t0, 1.15, 300, 3600, 0.08, 1.4); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f_(f), t0 + 0.05 + i * 0.18, 0.28, SK.lead, 0.05));      // the riser into the victory theme
      for (let i = 0; i < 7; i++) { burst(t0 + 0.25 + i * 0.34, 0.5, 2400, 500, 0.12, 0.9); tone(1400 + 200 * i, t0 + 0.25 + i * 0.34, 0.2, 'sine', 0.025, 1.6); } },
    lights: (t0) => { for (let i = 0; i < 8; i++) tone(f_(880 + i * 98), t0 + i * 0.13, 0.35, SK.lead, 0.04); },
    endcard: (t0) => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f_(f), t0 + i * 0.09, 0.3, SK.soft, 0.1)),
    copy: (t0) => { tone(f_(1100), t0, 0.06, SK.lead, 0.06); tone(f_(1480), t0 + 0.05, 0.09, SK.lead, 0.05); },
  };
  window.AUDIO = {
    mute: (m) => { muted = m; if (out) out.gain.value = muted || hid ? 0 : 1.6; },
    event: (k) => {},
    peak: () => { if (!an) return -1; an.getFloatTimeDomainData(anBuf); let m = 0; for (let i = 0; i < anBuf.length; i++) m = Math.max(m, Math.abs(anBuf[i])); return m; },
    state: () => (ac ? ac.state : 'none'),
    tick: (S) => {
      if (!ac || !S) return; const now = ac.currentTime;
      if (S.t < last) { last = -1; mNext = 0; }                                         // restart / replay
      if (ac.state !== 'running') { last = S.t; return; }                               // nothing is scheduled until the context really runs (touch devices)
      for (const e of S.ev) { if (e.t <= last || S.t - e.t > 0.6) continue; if (SFX[e.k]) SFX[e.k](now, e); }
      last = S.t;
      // music: the game loop until the roof is on; then it stops and the victory theme takes over (it goes on under the end card, a little lower)
      const won = S.finaleT > 0;
      if (!won) { wNext = 0; wStep = 0; if (!mNext || mNext < now) mNext = now + 0.08; while (mNext < now + 0.35) { musicStep(mNext, mStep++, false); mNext += STEP; }
        mus.gain.setTargetAtTime(0.85, now, 0.4); wbus.gain.setTargetAtTime(0, now, 0.05); }
      else { mus.gain.setTargetAtTime(0, now, 0.12); mNext = 0;
        if (!wNext) wNext = now + Math.max(0.05, 1.2 - (S.t - S.finaleT)); while (wNext < now + 0.35) { winStep(wNext, wStep++); wNext += WSTEP; }   // the beat drops with the lights (1.2 s into the finale)
        wbus.gain.setTargetAtTime(S.end >= 0 ? 0.65 : 1.0, now, 0.3); }
      // the crane creaks while the block swings: louder at the ends of the swing, silent once the block is released
      if (!creak) { const s = ac.createBufferSource(); s.buffer = noise(); s.loop = true; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 430; f.Q.value = 5; const g = ac.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(soft); s.start(); creak = { g, f }; }
      const swinging = S.phase === 'aim' || S.phase === 'enter';
      creak.g.gain.setTargetAtTime(swinging ? 0.012 * (0.25 + 0.75 * Math.abs(Math.sin(S.ph))) : 0, now, 0.05); creak.f.frequency.setTargetAtTime(380 + 160 * Math.abs(Math.sin(S.ph)), now, 0.05);
    },
  };
})();
