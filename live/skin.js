// live/skin.js — the HUD "skin": how panels, chips, buttons, text, callouts, the tutorial hand, the end card, the grade and the sounds
// LOOK and MOVE. scene.js and audio.js read window.SKIN and hold no look-and-feel constants of their own, so a new playable can start from
// the family look ('classic') or from another preset, and then adapt colours/fonts to its brand by editing the preset below.
//   pick:  ?skin=<name> in the URL (dev), "skin": "<name>" in variants/<variant>.json (A/B the look), or DEFAULT below
// Sameness is a choice, not an accident: keep a preset when the new ad belongs to the same family, switch (or fork a preset) when the brand or the
// reference asks for another voice. The tokens:
//   font, txt{outW em, shadow 0-1, weight}      text baking (outline width, soft shadow)
//   ink{token: [fill, outline]}                  text colours by meaning: base/hot/warn/danger (over the game), panelText/gold/brand (on panels),
//                                                chip, cta, ctaEnd (on buttons), logo/stat/plateText/endText (end card)
//   panel{a, b, alpha, round, rim}               HUD panels (money pill, price tags, tutorial banner, CTA bar); round 0.5 = pill; rim = light edge
//   chip{good, bad, round}                       level badges / small labels
//   cta{bar, end, endBase, round, pulse}         the persistent CTA button, the end-card button and its base
//   pop{ease, rise, from, life}                  floating callouts: easing (out|back|soft), rise px, start scale, life multiplier
//   hand{glow, ring, size}                       the tutorial hand
//   end{layout, dim, bg, plate}                  end card layout 'stack' (text over a dimmed game) or 'card' (own opaque card)
//   grade{bloom, vignette, warm, roll}           final grade passed to L.finish
//   sfx{lead, soft, bass, pitch}                 oscillator types and a pitch multiplier for audio.js
(function () {
  const DEFAULT = 'kvadrat';
  const PRESETS = {
    // the look of the first playables (dark translucent panels, heavy outlined type, bold arcade colours)
    classic: {
      font: '"Arial Black", "Arial Rounded MT Bold", "Segoe UI Black", sans-serif', txt: { outW: 0.16, shadow: 1, weight: 'bold' },
      ink: { base: ['#ffffff', '#173307'], gold: ['#ffe066', '#3a2300'], hot: ['#fff27a', '#5a3a00'], hotRed: ['#fff27a', '#7a1a00'], warn: ['#ffffff', '#8a1208'], need: ['#ffffff', '#6b4a00'],
        danger: ['#ff6a50', '#3a0400'], goalHot: ['#ffffff', '#7a0d06'], goalGold: ['#ffffff', '#6b4a00'], brand: ['#ffd84a', '#2a1a00'], logo: ['#ffd84a', '#3a2000'], stat: ['#bff58a', '#173307'],
        chip: ['#ffffff', '#1b2a0c'], cta: ['#ffffff', '#0a2a70'], ctaEnd: ['#ffffff', '#7a3a00'], plateText: ['#173307', '#fff4e2'], panelText: ['#ffffff', '#173307'], endText: ['#ffffff', '#173307'] },
      panel: { a: [0.10, 0.16, 0.08], b: [0.05, 0.09, 0.04], alpha: 0.78, round: 0.5, rim: 0 },
      chip: { good: [[0.24, 0.70, 0.18], [0.12, 0.48, 0.10]], bad: [[0.92, 0.22, 0.18], [0.70, 0.10, 0.08]], round: 0.5 },
      cta: { bar: [[0.35, 0.68, 1.0], [0.10, 0.42, 0.95]], end: [[1.0, 0.86, 0.30], [0.98, 0.58, 0.10]], endBase: [[0.55, 0.30, 0.02], [0.45, 0.22, 0.0]], round: 0.5, pulse: 0.03 },
      pop: { ease: 'out', rise: 90, from: 0.6, life: 1 }, hand: { glow: 0.35, ring: 0.8, size: 1 },
      end: { layout: 'stack', dim: 0.7, bg: [[0.07, 0.30, 0.12], [0.02, 0.12, 0.05]], plate: [[1.0, 0.96, 0.88], [0.98, 0.88, 0.70]] },
      grade: { bloom: [0.12, 0.10], vignette: 0.88, warm: 0.6, roll: 0.6 }, sfx: { lead: 'square', soft: 'triangle', bass: 'sine', pitch: 1 },
    },
    // light, modern, product-like: white cards, thin dark type, calm motion, own end-card sheet
    clean: {
      font: '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif', txt: { outW: 0.06, shadow: 0.35, weight: '800' },
      ink: { base: ['#ffffff', '#0e1b22'], gold: ['#14252b', '#ffffff'], hot: ['#ffffff', '#0e6b5a'], hotRed: ['#ffffff', '#b3261e'], warn: ['#ffffff', '#b3261e'], need: ['#ffffff', '#1c4b82'],
        danger: ['#ffffff', '#b3261e'], goalHot: ['#ffffff', '#b3261e'], goalGold: ['#ffffff', '#1c4b82'], brand: ['#14252b', '#ffffff'], logo: ['#ffffff', '#0e6b5a'], stat: ['#14252b', '#ffffff'],
        chip: ['#ffffff', '#0e1b22'], cta: ['#ffffff', '#0b3d91'], ctaEnd: ['#ffffff', '#0b3d91'], plateText: ['#14252b', '#ffffff'], panelText: ['#14252b', '#ffffff'], endText: ['#14252b', '#ffffff'] },
      panel: { a: [1.0, 1.0, 1.0], b: [0.92, 0.94, 0.96], alpha: 0.94, round: 0.5, rim: 0 },
      chip: { good: [[0.20, 0.72, 0.55], [0.10, 0.52, 0.40]], bad: [[0.95, 0.35, 0.30], [0.75, 0.20, 0.18]], round: 0.5 },
      cta: { bar: [[0.22, 0.52, 1.0], [0.06, 0.32, 0.86]], end: [[0.22, 0.52, 1.0], [0.06, 0.32, 0.86]], endBase: [[0.03, 0.16, 0.50], [0.02, 0.10, 0.36]], round: 0.5, pulse: 0.02 },
      pop: { ease: 'soft', rise: 60, from: 0.85, life: 1.15 }, hand: { glow: 0.2, ring: 0.5, size: 0.95 },
      end: { layout: 'card', dim: 0.8, bg: [[0.94, 0.97, 1.0], [0.82, 0.90, 0.98]], plate: [[1.0, 1.0, 1.0], [0.92, 0.94, 0.97]] },
      grade: { bloom: [0.06, 0.05], vignette: 0.97, warm: 0.15, roll: 0.2 }, sfx: { lead: 'sine', soft: 'sine', bass: 'sine', pitch: 1.0 },
    },
    // loud and chunky: thick outlines, flat saturated panels, springy callouts, bright sound
    arcade: {
      font: '"Arial Black", Impact, "Arial Rounded MT Bold", sans-serif', txt: { outW: 0.26, shadow: 0, weight: 'bold' },
      ink: { base: ['#ffffff', '#1a0f3c'], gold: ['#ffe14a', '#2b1066'], hot: ['#ffe14a', '#5a0f6b'], hotRed: ['#ffe14a', '#8a0f3a'], warn: ['#ffffff', '#b0102e'], need: ['#ffffff', '#5a0f6b'],
        danger: ['#ff7a8a', '#2b0a1e'], goalHot: ['#ffffff', '#b0102e'], goalGold: ['#ffffff', '#5a0f6b'], brand: ['#ffe14a', '#2b1066'], logo: ['#ffe14a', '#2b1066'], stat: ['#7dffb0', '#0b3b2a'],
        chip: ['#ffffff', '#1a0f3c'], cta: ['#ffffff', '#6b0a2a'], ctaEnd: ['#ffffff', '#6b3a00'], plateText: ['#2b1066', '#ffffff'], panelText: ['#ffffff', '#1a0f3c'], endText: ['#ffffff', '#1a0f3c'] },
      panel: { a: [0.20, 0.12, 0.42], b: [0.12, 0.07, 0.30], alpha: 0.96, round: 0.3, rim: 1 },
      chip: { good: [[0.20, 0.85, 0.45], [0.08, 0.60, 0.28]], bad: [[1.0, 0.30, 0.45], [0.75, 0.10, 0.28]], round: 0.28 },
      cta: { bar: [[1.0, 0.42, 0.60], [0.86, 0.12, 0.38]], end: [[1.0, 0.88, 0.25], [1.0, 0.55, 0.05]], endBase: [[0.45, 0.20, 0.0], [0.35, 0.14, 0.0]], round: 0.3, pulse: 0.05 },
      pop: { ease: 'back', rise: 130, from: 0.3, life: 1 }, hand: { glow: 0.5, ring: 1.0, size: 1.05 },
      end: { layout: 'card', dim: 0.78, bg: [[0.30, 0.14, 0.60], [0.12, 0.06, 0.30]], plate: [[1.0, 0.95, 0.75], [1.0, 0.82, 0.40]] },
      grade: { bloom: [0.22, 0.20], vignette: 0.8, warm: 0.9, roll: 0.9 }, sfx: { lead: 'square', soft: 'square', bass: 'triangle', pitch: 1.12 },
    },
    // frosted dark glass, hairline type without outlines, slow soft motion, chime-like sound, own end-card sheet
    glass: {
      font: '"SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif', txt: { outW: 0, shadow: 0.85, weight: '700' },
      ink: { base: ['#ffffff', '#000000'], gold: ['#ffe9a8', '#000000'], hot: ['#fff3c4', '#000000'], hotRed: ['#ffd0c4', '#000000'], warn: ['#ffb4a8', '#000000'], need: ['#e8f0ff', '#000000'],
        danger: ['#ff9a8a', '#000000'], goalHot: ['#ffb4a8', '#000000'], goalGold: ['#fff3c4', '#000000'], brand: ['#ffe9a8', '#000000'], logo: ['#ffffff', '#000000'], stat: ['#c9ffe0', '#000000'],
        chip: ['#ffffff', '#000000'], cta: ['#10203a', '#ffffff'], ctaEnd: ['#10203a', '#ffffff'], plateText: ['#ffffff', '#000000'], panelText: ['#ffffff', '#000000'], endText: ['#ffffff', '#000000'] },
      panel: { a: [0.12, 0.15, 0.22], b: [0.05, 0.07, 0.12], alpha: 0.5, round: 0.5, rim: 1 },
      chip: { good: [[0.20, 0.55, 0.45], [0.10, 0.36, 0.30]], bad: [[0.70, 0.28, 0.28], [0.45, 0.14, 0.16]], round: 0.5 },
      cta: { bar: [[1.0, 1.0, 1.0], [0.84, 0.89, 0.96]], end: [[1.0, 1.0, 1.0], [0.84, 0.89, 0.96]], endBase: [[0.30, 0.34, 0.42], [0.20, 0.23, 0.30]], round: 0.5, pulse: 0.015 },
      pop: { ease: 'soft', rise: 50, from: 0.9, life: 1.25 }, hand: { glow: 0.15, ring: 0.45, size: 0.9 },
      end: { layout: 'card', dim: 0.85, bg: [[0.10, 0.14, 0.24], [0.03, 0.05, 0.10]], plate: [[0.20, 0.25, 0.36], [0.10, 0.13, 0.22]] },
      grade: { bloom: [0.18, 0.14], vignette: 0.92, warm: 0.2, roll: 0.3 }, sfx: { lead: 'sine', soft: 'sine', bass: 'sine', pitch: 0.9 },
    },
    // developer brand: one signature orange, white cards, graphite type, airy and calm
    kvadrat: {
      font: '"onest", "Onest", "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif', txt: { outW: 0.1, shadow: 0.12, weight: '800' },
      ink: { base: ['#ffffff', '#1e1f22'], gold: ['#1e1f22', '#ffffff'], hot: ['#ff5a1f', '#ffffff'], hotRed: ['#ff5a1f', '#ffffff'], warn: ['#1e1f22', '#ffffff'], need: ['#ffffff', '#e0430a'],
        danger: ['#ff5a1f', '#ffffff'], goalHot: ['#ff5a1f', '#ffffff'], goalGold: ['#ff5a1f', '#ffffff'], brand: ['#ff5a1f', '#ffffff'], logo: ['#ff5a1f', '#ffffff'], stat: ['#1e1f22', '#ffffff'],
        chip: ['#1e1f22', '#f4f4f5'], cta: ['#ffffff', '#e0430a'], ctaEnd: ['#ffffff', '#e0430a'], plateText: ['#1e1f22', '#ffffff'], panelText: ['#1e1f22', '#ffffff'], endText: ['#1e1f22', '#ffffff'] },
      panel: { a: [1.0, 1.0, 1.0], b: [0.95, 0.96, 0.97], alpha: 0.96, round: 0.5, rim: 0 },
      chip: { good: [[0.96, 0.96, 0.97], [0.90, 0.91, 0.93]], bad: [[1.0, 0.90, 0.85], [1.0, 0.82, 0.74]], round: 0.5 },
      cta: { bar: [[1.0, 0.42, 0.20], [1.0, 0.35, 0.12]], end: [[1.0, 0.42, 0.20], [1.0, 0.35, 0.12]], endBase: [[0.88, 0.26, 0.04], [0.80, 0.22, 0.02]], round: 0.3, pulse: 0.025 },
      pop: { ease: 'soft', rise: 70, from: 0.8, life: 1.1 }, hand: { glow: 0.15, ring: 0.5, size: 0.9 },
      end: { layout: 'card', dim: 0.5, bg: [[0.18, 0.23, 0.40], [0.96, 0.60, 0.42]], plate: [[1.0, 1.0, 1.0], [0.96, 0.96, 0.97]] },
      grade: { bloom: [0.04, 0.03], vignette: 1.0, warm: 0, roll: 0, dither: 0 }, sfx: { lead: 'sine', soft: 'triangle', bass: 'sine', pitch: 1.0 },
    },
  };
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('skin') : null;
  const name = (typeof window !== 'undefined' && window.SKIN_NAME) || (q && PRESETS[q] ? q : DEFAULT);
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.SKIN = Object.assign({ name, presets: PRESETS }, PRESETS[name] || PRESETS[DEFAULT]);
})();
