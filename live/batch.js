// live/batch.js — instanced sprite batch: many small sprites (the forest, stumps) from ONE atlas in ONE draw call.
// The atlas is baked on the GPU at startup from the already-loaded textures (no extra asset bytes); instances are drawn
// in the order they are added, so a row-by-row fill keeps the 3/4 depth order. Draws into whatever target is bound.
(function () {
  const B = (window.BATCH = {});
  let gl, prog, vao, ibuf, data, n = 0, CAP = 6000, atlas = null, U = {};
  const VS = `#version 300 es
layout(location=0) in vec2 a_pos; layout(location=1) in vec4 a_rect; layout(location=2) in vec4 a_uv; layout(location=3) in vec2 a_sway;
uniform vec2 u_res; uniform float u_t; out vec2 v_uv;
void main(){ vec2 q = a_pos; float top = (1.0 - q.y) * (1.0 - q.y);
  vec2 p = a_rect.xy + vec2(q.x * a_rect.z + a_sway.x * top * sin(u_t * 1.37 + a_sway.y) * a_rect.z, q.y * a_rect.w);
  v_uv = vec2(mix(a_uv.x, a_uv.z, q.x), mix(a_uv.y, a_uv.w, q.y));
  gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, 1.0 - p.y / u_res.y * 2.0, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision mediump float; in vec2 v_uv; uniform sampler2D u_tex; uniform vec4 u_tint; out vec4 o;
void main(){ vec4 c = texture(u_tex, v_uv); o = vec4(c.rgb * u_tint.rgb, c.a) * u_tint.a; }`;

  // names: textures to pack; cell: max px per sprite in the atlas (they are drawn smaller than this)
  B.init = (names, cell = 192) => {
    gl = G.gl;
    if (names.includes('blob')) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); G.canvasTex('blob', cv); }
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('batch: ' + gl.getShaderInfoLog(sh)); return sh; };
    prog = gl.createProgram(); gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    for (const k of ['u_res', 't', 'u_tex', 'u_tint']) U[k] = gl.getUniformLocation(prog, k === 't' ? 'u_t' : k);
    // ---- bake the atlas: one row of cells, each sprite fit inside with an 8 px gutter (no mip bleed between neighbours) ----
    const pad = 8, cols = names.length, AW = cols * (cell + 2 * pad), AH = cell + 2 * pad;
    const T = G.target(AW, AH, false); G.bind(T, [0, 0, 0, 0]); G.blend('none');
    const uv = {};
    names.forEach((nm, i) => { const tx = G.tex(nm), k = Math.min(cell / tx.w, cell / tx.h), w = tx.w * k, h = tx.h * k;
      const x = i * (cell + 2 * pad) + pad + (cell - w) / 2, y = pad + (cell - h);                       // bottom-aligned in its cell
      LIB.sprite(nm, x, y, { w, h });
      uv[nm] = [x / AW, 1 - y / AH, (x + w) / AW, 1 - (y + h) / AH, w / h]; });                     // render targets are y-up in uv
    G.blend(); G.bind(null);
    gl.bindTexture(gl.TEXTURE_2D, T.t); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    atlas = { T, uv };
    // ---- instanced quad: one shared unit quad + per-instance rect / uv / sway ----
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const q = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, q); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    ibuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); data = new Float32Array(CAP * 10); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    const st = 40; [[1, 4, 0], [2, 4, 16], [3, 2, 32]].forEach(([l, sz, off]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, st, off); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null);
  };
  B.aspect = (nm) => atlas.uv[nm][4];
  // add a sprite: name, top-left x, y, size w, h (view px), sway amount (fraction of width at the top), sway phase
  B.add = (nm, x, y, w, h, sway = 0, ph = 0) => { if (n >= CAP) B.flush(); const u = atlas.uv[nm], o = n * 10;
    data[o] = x; data[o + 1] = y; data[o + 2] = w; data[o + 3] = h; data[o + 4] = u[0]; data[o + 5] = u[1]; data[o + 6] = u[2]; data[o + 7] = u[3]; data[o + 8] = sway; data[o + 9] = ph; n++; };
  B.flush = (t = B.t || 0, tint = [1, 1, 1, 1]) => { if (!n) return;
    gl.useProgram(prog); gl.uniform2f(U.u_res, LIB.W, LIB.H); gl.uniform1f(U.t, t); gl.uniform4fv(U.u_tint, tint);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas.T.t); gl.uniform1i(U.u_tex, 0);
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 10);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); gl.bindVertexArray(null);
    G.stats.draws++; G.stats.inst += n; n = 0; };
})();
