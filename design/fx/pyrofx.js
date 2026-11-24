/* PyroFX: ink-in-water and volumetric fire on paper white. Raw WebGL2, no dependencies.
   window.PyroFX = { supported(), ink(canvas, opts), fire(canvas, opts) } */
(function () {
  'use strict';

  // ---------------------------------------------------------------- shared GL helpers
  const CTX_ATTR = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  const VS = '#version 300 es\nin vec2 aPos; out vec2 vUv; void main(){ vUv = aPos*.5+.5; gl_Position = vec4(aPos,0.,1.); }';
  const HEAD = '#version 300 es\nprecision highp float; precision highp sampler2D; precision highp sampler3D;\nin vec2 vUv; out vec4 o;\n';
  const COMMON = `
  float h21(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  // paper: mean is exactly #faf8f4; fine tooth plus faint fibre mottling
  vec3 paper(vec2 fc, float dpr){
    vec2 p = fc/dpr;
    float tooth = (h21(fc)-.5)*.014 + (vn(p*.9)-.5)*.012;
    float fibre = (vn(p*vec2(.045,.5)+7.)-.5)*.007 + (vn(p*.02+3.)-.5)*.006;
    return vec3(.980,.973,.957) + tooth + fibre;
  }
  // bicubic (B-spline) lookup from 4 bilinear taps: removes the diamond artefacts of magnified low-res fields
  vec4 bic(sampler2D t, vec2 uv, vec2 sz, float lod){
    vec2 p = uv*sz - .5, f = fract(p); p -= f;
    vec2 f2 = f*f, f3 = f2*f;
    vec2 w0 = (1.-f)*(1.-f)*(1.-f)/6., w1 = (3.*f3-6.*f2+4.)/6., w3 = f3/6., w2 = 1.-w0-w1-w3;
    vec2 g0 = w0+w1, g1 = w2+w3;
    vec2 a = (p - .5 + w1/g0)/sz, b = (p + 1.5 + w3/g1)/sz;
    return g0.y*(g0.x*textureLod(t, a, lod) + g1.x*textureLod(t, vec2(b.x,a.y), lod))
         + g1.y*(g0.x*textureLod(t, vec2(a.x,b.y), lod) + g1.x*textureLod(t, b, lod));
  }`;

  function makeGL(canvas) {
    const gl = canvas.getContext('webgl2', CTX_ATTR);
    if (!gl) return null;
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
    const res = [];           // every GL object we create, for destroy()
    const keep = (kind, obj) => (res.push([kind, obj]), obj);
    const quad = keep('Buffer', gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    function shader(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('PyroFX shader: ' + log); }
      return s;
    }
    function prog(fs, vs) {
      const p = keep('Program', gl.createProgram());
      const a = shader(gl.VERTEX_SHADER, vs || VS), b = shader(gl.FRAGMENT_SHADER, vs ? fs : HEAD + COMMON + fs);
      gl.attachShader(p, a); gl.attachShader(p, b);
      if (!vs) gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p); gl.deleteShader(a); gl.deleteShader(b);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('PyroFX link: ' + gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
      return { p, u };
    }
    function target(w, h, half, mip) {
      const t = keep('Texture', gl.createTexture()); gl.bindTexture(gl.TEXTURE_2D, t);
      if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = keep('Framebuffer', gl.createFramebuffer()); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      return { t, fb, w, h };
    }
    function free(rt) {
      if (!rt) return;
      gl.deleteTexture(rt.t); gl.deleteFramebuffer(rt.fb);
      for (let i = res.length - 1; i >= 0; i--) if (res[i][1] === rt.t || res[i][1] === rt.fb) res.splice(i, 1);
    }
    // run a full-screen pass; uniforms: number | [x,y(,z)] | render target | {tex3d}
    function run(P, dst, uniforms) {
      gl.useProgram(P.p); let unit = 0;
      for (const k in uniforms) {
        const loc = P.u[k], v = uniforms[k]; if (!loc) continue;
        if (typeof v === 'number') gl.uniform1f(loc, v);
        else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
        else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
        else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
        else if (v.tex3d) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D, v.tex3d); gl.uniform1i(loc, unit++); }
        else { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.t); gl.uniform1i(loc, unit++); }
      }
      if (dst) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h); }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function destroy() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(null);
      for (const [kind, obj] of res) gl['delete' + kind](obj);
      res.length = 0;
    }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    return { gl, prog, target, free, run, keep, destroy };
  }

  let _sup;
  function supported() {
    if (_sup !== undefined) return _sup;
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2');
      _sup = !!(gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')));
      const l = gl && gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
    } catch (e) { _sup = false; }
    return _sup;
  }
  const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
  function sizeOf(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, canvas.clientWidth || canvas.width || 300), ch = Math.max(1, canvas.clientHeight || canvas.height || 150);
    return { dpr, cw, ch, w: Math.max(2, Math.round(cw * dpr)), h: Math.max(2, Math.round(ch * dpr)) };
  }
  function pickQuality(q, s) {
    if (q === 'high' || q === 'low') return q;
    return (Math.min(s.cw, s.ch) < 520 || s.dpr < 1.5 || s.w * s.h < 9e5) ? 'low' : 'high';
  }
  function watchLoss(canvas, st) {
    const lost = e => { e.preventDefault(); st.dead = true; };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }

  // ================================================================ INK
  // Absorbance spectra (Beer-Lambert): thin films read as a translucent tint, thick ones saturate and darken.
  const INKS = {
    ember: [.06, 1.6, 2.7],      // Claude Opus: vivid red-orange
    amber: [.03, .55, 2.3],      // Claude Sonnet
    sand: [.17, .33, .66],       // Claude Haiku
    graphite: [2.2, 2.15, 2.0],  // GPT: near-black ink
    cobalt: [2.5, 1.25, .30],    // Gemini: blue
  };

  function ink(canvas, opts) {
    const G = makeGL(canvas); if (!G) return null;
    const { gl, prog, target, free, run } = G;
    const st = { dead: false }, unwatch = watchLoss(canvas, st);
    const NB = 'uniform vec2 tx;\n#define L(t) texture(t, vUv-vec2(tx.x,0.))\n#define R(t) texture(t, vUv+vec2(tx.x,0.))\n#define T(t) texture(t, vUv+vec2(0.,tx.y))\n#define B(t) texture(t, vUv-vec2(0.,tx.y))\n';
    // velocity texture: xy = velocity (canvas heights per second), z = heat (drives buoyancy, decays), w unused
    const P = {
      splat: prog(`uniform sampler2D src; uniform vec2 pt; uniform vec4 val; uniform float r, asp;
        void main(){ vec2 p = vUv-pt; p.x *= asp; o = texture(src,vUv) + exp(-dot(p,p)/(r*r))*val; }`),
      curl: prog(NB + `uniform sampler2D vel; void main(){ o = vec4(.5*(R(vel).y-L(vel).y-T(vel).x+B(vel).x)); }`),
      force: prog(NB + `uniform sampler2D vel, cu; uniform float dt, conf, buoy, time, asp;
        void main(){ vec4 v = texture(vel,vUv); float C = texture(cu,vUv).x;
          vec2 f = .5*vec2(abs(T(cu).x)-abs(B(cu).x), abs(R(cu).x)-abs(L(cu).x)); f /= length(f)+1e-5; f *= conf*C; f.y = -f.y;
          vec2 q = vec2(vUv.x*asp, vUv.y);
          float wob = vn(q*7.+vec2(time*.31,-time*.5)) - vn(q*7.+vec2(-time*.27,time*.4)+19.);
          v.xy += dt*(f + vec2(wob*.9, buoy)*v.z);
          o = v; }`),
      div: prog(NB + `uniform sampler2D vel; void main(){ vec2 C = texture(vel,vUv).xy; float l=L(vel).x, r=R(vel).x, t=T(vel).y, b=B(vel).y;
          if(vUv.x-tx.x<0.) l=-C.x; if(vUv.x+tx.x>1.) r=-C.x; if(vUv.y+tx.y>1.) t=-C.y; if(vUv.y-tx.y<0.) b=-C.y;
          o = vec4(.5*(r-l+t-b)); }`),
      pres: prog(NB + `uniform sampler2D pr, dv; void main(){ o = vec4((L(pr).x+R(pr).x+T(pr).x+B(pr).x-texture(dv,vUv).x)*.25); }`),
      grad: prog(NB + `uniform sampler2D pr, vel; void main(){ vec4 v = texture(vel,vUv); v.xy -= .5*vec2(R(pr).x-L(pr).x, T(pr).x-B(pr).x);
          if(vUv.x-tx.x<0. || vUv.x+tx.x>1.) v.x = 0.; if(vUv.y-tx.y<0. || vUv.y+tx.y>1.) v.y = 0.; o = v; }`),
      advV: prog(`uniform sampler2D vel; uniform float dt, asp, damp, cool;
        void main(){ vec2 v = texture(vel,vUv).xy; vec4 s = texture(vel, vUv - dt*v*vec2(1./asp,1.));
          s.xy /= 1.+damp*dt; s.z /= 1.+cool*dt; o = s; }`),
      // dye: rgb = absorbance, a = pigment amount. Velocity is fetched bicubically so the coarse grid never shows.
      // MacCormack advection (forward, backward, corrected + clamped) keeps filaments from smearing away
      trace: prog(`uniform sampler2D vel, src; uniform vec2 vsz; uniform float dt, asp;
        void main(){ vec2 v = bic(vel, vUv, vsz, 0.).xy; o = textureLod(src, vUv - dt*v*vec2(1./asp,1.), 0.); }`),
      mac: prog(`uniform sampler2D vel, src, fwd, bwd; uniform vec2 vsz, dsz; uniform float dt, asp, fade;
        void main(){ vec2 v = bic(vel, vUv, vsz, 0.).xy; vec2 c = vUv - dt*v*vec2(1./asp,1.), h = .5/dsz;
          vec4 a = textureLod(src, c+vec2(-h.x,-h.y), 0.), b = textureLod(src, c+vec2(h.x,-h.y), 0.), d = textureLod(src, c+vec2(-h.x,h.y), 0.), e = textureLod(src, c+h, 0.);
          vec4 r = textureLod(fwd, vUv, 0.) + .4*(textureLod(src, vUv, 0.) - textureLod(bwd, vUv, 0.));
          r = clamp(r, min(min(a,b),min(d,e)), max(max(a,b),max(d,e)));
          o = max(r/(1.+(fade*(1.+.9*r.a)+smoothstep(.86,1.,vUv.y)*1.6)*dt), 0.); }`),   // thick ink thins out faster, so a long pour never turns to mud
      copy: prog(`uniform sampler2D src; void main(){ o = textureLod(src, vUv, 0.); }`),
      show: prog(`uniform sampler2D dye; uniform vec2 res, dsz; uniform float dpr, asp;
        float hgt(float d){ return 1.-exp(-d*1.5); }
        void main(){
          vec2 px = 1./dsz;
          vec4 c0 = textureLod(dye, vUv, 0.), c2 = textureLod(dye, vUv, 2.2);
          vec4 c = max(c0 + (c0-c2)*.3, 0.);                          // unsharp mask: crisper filaments
          // thickness normal from the (slightly smoothed) density field
          vec2 e = px*2.6;
          float hl = hgt(textureLod(dye, vUv-vec2(e.x,0.), 1.3).a), hr = hgt(textureLod(dye, vUv+vec2(e.x,0.), 1.3).a);
          float hb = hgt(textureLod(dye, vUv-vec2(0.,e.y), 1.3).a), ht = hgt(textureLod(dye, vUv+vec2(0.,e.y), 1.3).a);
          vec2 g = vec2(hr-hl, ht-hb)/(2.*e.y);                         // per canvas-height
          float th = hgt(c.a);
          vec3 n = normalize(vec3(-g*.011, 1.));
          vec3 Ld = normalize(vec3(-.48,.62,.62));
          float dif = dot(n, Ld) - Ld.z;                                // <0 on slopes facing away from the light
          float edge = min(length(g)*.011, 1.6);
          // deeper, out-of-focus pigment behind the sharp layer, and the shadow the cloud casts on the paper below
          vec2 off = vec2(.011/asp, -.016);
          vec4 deep = bic(dye, vUv + off*.45, dsz/8., 3.);
          float sh = 1.-exp(-bic(dye, vUv + off, dsz/16., 4.).a*.9);
          float ao = 1.-exp(-deep.a*.5);
          vec3 A = c.rgb*(1. + .42*edge - .75*dif) + deep.rgb*.26;
          float gr = vn(gl_FragCoord.xy/dpr*.8) - .5;                   // pigment granulation in the paper tooth
          A *= 1. + gr*.22*smoothstep(.0,.5,th);
          A = 2.7*(1.-exp(-A/2.7));                                     // soft shoulder: thick ink stays coloured, not black
          vec3 pap = paper(gl_FragCoord.xy, dpr);
          pap *= 1. - sh*(1.-th*.7)*vec3(.105,.115,.13) - ao*.03;
          vec3 col = pap*exp(-A);
          // wet sheen: a tight highlight on steep, thick ridges
          vec3 hv = normalize(Ld + vec3(0.,0.,1.));
          float sp = pow(max(dot(n,hv),0.), 70.)*smoothstep(.25,.8,th)*smoothstep(.15,.6,edge);
          col += sp*.34*(1.-col);
          col += max(dif,0.)*.10*th*(1.-col);
          o = vec4(col, 1.);
        }`),
    };

    let S, quality, F1, F2, V, Vb, D, Db, Pr, Prb, Dv, Cu, sw, sh, dw, dh, last = 0, time = 0, calm = false;
    const emitters = [], reduce = reducedMotion();
    const swapV = () => { const t = V; V = Vb; Vb = t; }, swapD = () => { const t = D; D = Db; Db = t; }, swapP = () => { const t = Pr; Pr = Prb; Prb = t; };

    function alloc(preserve) {
      S = sizeOf(canvas); quality = pickQuality(opts && opts.quality, S);
      canvas.width = S.w; canvas.height = S.h;
      const asp = S.w / S.h, hi = quality === 'high';
      // grids are sized by cell count so portrait and landscape get the same detail
      const cells = hi ? 70000 : 34000; sh = Math.max(8, Math.round(Math.sqrt(cells / asp))); sw = Math.max(8, Math.round(sh * asp));
      const k = Math.min(1, Math.sqrt((hi ? 1.05e6 : 5.2e5) / (S.w * S.h)));
      dw = Math.max(16, Math.round(S.w * k)); dh = Math.max(16, Math.round(S.h * k));
      const oV = V, oD = D, old = [V, Vb, D, Db, Pr, Prb, Dv, Cu, F1, F2];
      F1 = F2 = null; { F1 = target(dw, dh, true); F2 = target(dw, dh, true); }
      V = target(sw, sh, true); Vb = target(sw, sh, true);
      D = target(dw, dh, true, true); Db = target(dw, dh, true, true);
      Pr = target(sw, sh, true); Prb = target(sw, sh, true); Dv = target(sw, sh, true); Cu = target(sw, sh, true);
      if (preserve && oV) { run(P.copy, V, { src: oV }); run(P.copy, D, { src: oD }); }
      old.forEach(free);
    }
    function splat(x, y, r, vel, dye) {
      const asp = sw / sh;
      if (vel) { run(P.splat, Vb, { src: V, pt: [x, y], val: vel, r, asp }); swapV(); }
      if (dye) { run(P.splat, Db, { src: D, pt: [x, y], val: dye, r, asp }); swapD(); }
    }

    function frame(now) {
      if (st.dead) return;
      let dt = last ? (now - last) / 1000 : 1 / 60; last = now;
      dt = Math.max(0, Math.min(1 / 30, dt)); if (reduce) dt *= .22;
      if (dt <= 0) dt = 1e-4;
      time += dt;
      const asp = S.w / S.h, tx = [1 / sw, 1 / sh], hi = quality === 'high';

      // pours: each is a short-lived source at the bottom edge; buoyancy does the lifting
      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i], k = Math.min(dt, e.life) / e.dur; e.life -= dt;
        const jx = Math.sin(time * 9.1 + e.ph) * .012, r = e.r * (1 + .25 * Math.sin(time * 13 + e.ph * 2));
        const a = e.amt * k;
        splat(e.x + jx / asp, .012, r, [e.vx * k, e.vy * k, e.heat * k, 0], [e.c[0] * a, e.c[1] * a, e.c[2] * a, a]);
        if (e.life <= 0) emitters.splice(i, 1);
      }

      run(P.curl, Cu, { tx, vel: V });
      run(P.force, Vb, { tx, vel: V, cu: Cu, dt, conf: calm ? 2 : 10, buoy: calm ? .25 : 1.7, time, asp }); swapV();
      run(P.div, Dv, { tx, vel: V });
      const it = hi ? 22 : 14;
      for (let i = 0; i < it; i++) { run(P.pres, Prb, { tx, pr: Pr, dv: Dv }); swapP(); }
      run(P.grad, Vb, { tx, pr: Pr, vel: V }); swapV();
      run(P.advV, Vb, { vel: V, dt, asp, damp: calm ? 1.6 : .22, cool: calm ? 2.5 : .30 }); swapV();
      const fade = calm ? .003 : .085, vsz = [sw, sh];
      run(P.trace, F1, { vel: V, src: D, vsz, dt, asp });
      run(P.trace, F2, { vel: V, src: F1, vsz, dt: -dt, asp });
      run(P.mac, Db, { vel: V, src: D, fwd: F1, bwd: F2, vsz, dsz: [dw, dh], dt, asp, fade });
      swapD();
      gl.bindTexture(gl.TEXTURE_2D, D.t); gl.generateMipmap(gl.TEXTURE_2D);
      run(P.show, null, { dye: D, res: [S.w, S.h], dsz: [dw, dh], dpr: S.dpr, asp });
    }

    alloc(false);
    return {
      pour(x01, strength01, color) {
        if (st.dead) return;
        const s = clamp01(strength01), c = INKS[color] || INKS.ember, x = Math.max(.02, Math.min(.98, +x01 || 0));
        if (emitters.length >= 28) emitters.shift();
        const dur = .32 + .25 * s, n = Math.sqrt(Math.max(.5, Math.min(1, S.w / S.h)));   // narrower canvas, smaller pours
        emitters.push({ x, c, dur, life: dur, ph: Math.random() * 6.28, r: (.010 + .017 * s) * n,
          amt: (.9 + 1.9 * s) * n, heat: .7 + 2.3 * s, vx: (Math.random() - .5) * .10, vy: .10 + .30 * s });
      },
      stir(x01, y01, dx01, dy01) {
        if (st.dead) return;
        const asp = S.w / S.h, k = 38, m = 2.2;
        const vx = Math.max(-m, Math.min(m, (+dx01 || 0) * asp * k)), vy = Math.max(-m, Math.min(m, -(+dy01 || 0) * k));
        splat(clamp01(x01), 1 - clamp01(y01), .055, [vx, vy, 0, 0], null);
      },
      calm(on) { calm = !!on; },
      frame,
      resize() { if (!st.dead) alloc(true); },
      reset() { if (st.dead) return; emitters.length = 0; last = 0; calm = false; alloc(false); },
      destroy() { if (st.dead) return; st.dead = true; unwatch(); emitters.length = 0; G.destroy(); },
    };
  }

  // ================================================================ FIRE
  // Tileable 3-D gradient-noise volume (64^3). g/b are the same field read at shifted offsets, which is free decorrelation.
  function noiseVolume(gl) {
    const N = 64, data = new Uint8Array(N * N * N * 4), f = new Float32Array(N * N * N);
    const perm = new Uint8Array(512); { let s = 1234567; const p = []; for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
    const GR = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    function octave(period, amp, seed) {
      const sc = period / N; let i = 0;
      const g = (ix, iy, iz, x, y, z) => { const h = perm[perm[perm[(ix % period) + seed] + (iy % period)] + (iz % period)] % 12 * 3; return GR[h] * x + GR[h + 1] * y + GR[h + 2] * z; };
      for (let z = 0; z < N; z++) { const pz = z * sc, iz = Math.floor(pz), fz = pz - iz, wz = fade(fz);
        for (let y = 0; y < N; y++) { const py = y * sc, iy = Math.floor(py), fy = py - iy, wy = fade(fy);
          for (let x = 0; x < N; x++) { const px = x * sc, ix = Math.floor(px), fx = px - ix, wx = fade(fx);
            const a = g(ix, iy, iz, fx, fy, fz), b = g(ix + 1, iy, iz, fx - 1, fy, fz), c = g(ix, iy + 1, iz, fx, fy - 1, fz), d = g(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz);
            const e = g(ix, iy, iz + 1, fx, fy, fz - 1), ff = g(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1), gg = g(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1), hh = g(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1);
            const x0 = a + (b - a) * wx, x1 = c + (d - c) * wx, x2 = e + (ff - e) * wx, x3 = gg + (hh - gg) * wx;
            const y0 = x0 + (x1 - x0) * wy, y1 = x2 + (x3 - x2) * wy;
            f[i++] += amp * (y0 + (y1 - y0) * wz);
          } } }
    }
    octave(4, 1, 0); octave(8, .5, 7); octave(16, .25, 13);
    const at = (x, y, z) => f[((z & 63) * N + (y & 63)) * N + (x & 63)];
    const q = v => Math.max(0, Math.min(255, Math.round((.5 + v * .62) * 255)));
    let i = 0;
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      data[i++] = q(at(x, y, z)); data[i++] = q(at(x + 23, y + 37, z + 11)); data[i++] = q(at(x + 41, y + 13, z + 29)); data[i++] = 255;
    }
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    return t;
  }

  function fire(canvas, opts) {
    const G = makeGL(canvas); if (!G) return null;
    const { gl, prog, target, free, run } = G;
    const st = { dead: false }, unwatch = watchLoss(canvas, st);
    const COV = .82;      // the volume buffer covers the lower 82% of the canvas
    const FIELD = `
      uniform sampler3D nz; uniform float time, H, flare, asp, xs;
      const float D = .30;
      // height of the fire bed at (x,z): slow-moving mounds so the fire has groups and gaps
      float bed(vec2 xz){ xz.x *= xs; float a = texture(nz, vec3(xz.x*.42+.37, time*.021, xz.y*.4)).r, b = texture(nz, vec3(xz.x*1.1+.11, time*.05, xz.y*.9+.5)).g;
        return H*(.30 + 1.25*smoothstep(.2,.8,a) + .45*(b-.5)); }`;
    const P = {
      // pass 1: raymarch a slab of fire at reduced resolution. out: r = mean temperature * A, g = A (opacity), b = hottest * A
      march: prog(FIELD + `uniform sampler2D prev; uniform vec2 res; uniform float cov, jo, keep; uniform int steps;
        void main(){
          vec2 uv = gl_FragCoord.xy/res;
          vec3 P0 = vec3((uv.x-.5)*asp, uv.y*cov, 0.), cam = vec3(0., .34, -2.3);
          vec3 dp = (P0-cam)/2.3;                                       // per unit of z
          float n = float(steps), dz = 2.*D/n;
          float jit = .5 + jo;
          float tau = 0., ws = 0., ts = 0., tm = 0.;
          for(int i=0;i<steps;i++){
            float z = -D + (float(i)+jit)*dz; vec3 p = P0 + dp*z;
            p.y = max(p.y, 0.);
            float zf = 1. - z*z/(D*D);
            float h = bed(p.xz);
            float u = p.y/h;
            if(u > 2.1) continue;
            vec3 q = vec3(p.x*1.3*xs, p.y*.44 - time*.52, p.z*.6);
            vec3 w = texture(nz, q*.45 + vec3(.2, -time*.1, time*.03)).rgb - .5;
            q.xz += w.xy*(.10+.34*u);                                   // lateral sway grows with height
            float n1 = texture(nz, q).r, n2 = texture(nz, q*2.6 + vec3(.3, -time*.55, .7)).g;
            float nn = (n1-.5)*1.5 + (n2-.5)*.5;
            float f = (1.-u) + nn*(.35+2.1*u) + flare*.25*(1.-u);
            f = f*(.35+.65*zf) - (1.-zf)*.25;
            float d = smoothstep(0., .38, f)*(1.-smoothstep(.70,.80,p.y));
            if(d <= 0.) continue;
            float T = clamp(min(f,1.)*(.30+.75*n1+.5*(n2-.5))*(.55+.45*zf)*(1.+flare*.22), 0., 1.5);
            float wgt = d*(.2 + T);
            tau += d*dz*7.; ts += T*wgt; ws += wgt; tm = max(tm, T*d);
            if(tau > 5.) break;
          }
          float A = 1.-exp(-tau);
          o = mix(vec4(ts/max(ws,1e-4)/1.5*A, A, tm/1.5*A, 1.), texture(prev, vUv), keep);
        }`),
      // pass 2: full-resolution composite on paper: light spill, smoke wash, colour ramp, grain
      comp: prog(FIELD + `uniform sampler2D fb; uniform vec2 res, fsz; uniform float cov, dpr, smokeAmt;
        vec3 ramp(float T){
          vec3 c = mix(vec3(.36,.035,.03), vec3(.74,.085,.03), smoothstep(.0,.2,T));
          c = mix(c, vec3(.93,.25,.035), smoothstep(.16,.38,T));
          c = mix(c, vec3(.99,.50,.06), smoothstep(.34,.56,T));
          c = mix(c, vec3(1.,.74,.20), smoothstep(.52,.76,T));
          return mix(c, vec3(1.,.90,.56), smoothstep(.78,1.,T));
        }
        void main(){
          vec2 uv = gl_FragCoord.xy/res; vec2 w = vec2((uv.x-.5)*asp, uv.y);
          vec3 col = paper(gl_FragCoord.xy, dpr);
          float hb = bed(vec2(w.x, 0.));
          // smoke: thin charcoal wash drifting up from the flame tips (subtractive, like graphite dust on paper)
          vec3 sq = vec3(w.x*.5, w.y*.42 - time*.06, time*.02);
          vec3 sw = texture(nz, sq*.7+.3).rgb-.5; sq.xy += sw.xy*.3;
          float sb = texture(nz, sq).r;                                   // soft billows
          vec3 s2 = vec3(w.x*1.1, w.y*.8 - time*.13, time*.035) + vec3(sw.yz*.55, 0.);
          float wisp = 1.-abs(2.*texture(nz, s2).g-1.); wisp *= wisp*wisp;  // thin curling threads
          float above = (w.y - H*.95)/(.26+.55*H);
          float env = smoothstep(-.25,.4,above)*(1.-smoothstep(.5,1.7,above));
          float smoke = (smoothstep(.42,.8,sb)*.30 + wisp*smoothstep(.38,.62,sb)*.26)*env*smokeAmt;
          col *= exp(-smoke*vec3(.42,.46,.50));
          // warm light spilling on the paper around the fire
          float spill = exp(-max(w.y-hb*.6,0.)/(.10+.25*H))*(.35+.65*H)*(1.+flare*.8);
          col *= 1. - spill*vec3(.0,.055,.14);
          vec4 f = vec4(0.);
          if(uv.y < cov) f = bic(fb, vec2(uv.x, uv.y/cov), fsz, 0.);
          float A = f.g;
          if(A > .003){
            float T = f.r/A*1.5, Tm = f.b/A*1.5;
            float gr = h21(gl_FragCoord.xy+17.)-.5;
            T = mix(T, Tm, .25) + gr*.03;
            float a = smoothstep(.2,.52,A);                           // crisp-ish silhouette from a soft low-res field
            float body = smoothstep(.3,.95,A);
            T *= .55+.45*body;                                         // thin outer licks stay deep red
            float fs = texture(nz, vec3(w.x*4.6, w.y*1.1 - time*1.5, time*.15)).r - .5;   // fine upward striations
            T += fs*.30*body*smoothstep(.15,.6,T);
            vec3 fc = ramp(clamp(T*1.08 - .04, 0., 1.));
            fc *= 1. - .10*(1.-body);                                  // darker rim
            col = mix(col, fc, a*(.90+.10*body));
          }
          o = vec4(col, 1.);
        }`),
      ember: prog(`#version 300 es
        precision highp float; in vec4 vE; in vec2 vD; out vec4 o;
        void main(){ vec2 p = gl_PointCoord*2.-1.; p.y = -p.y;
          float al = dot(p, vD); vec2 pr = p - vD*al;
          float d = length(vec2(max(abs(al)-.5,0.), length(pr)*2.1));    // capsule along the velocity
          float m = 1.-smoothstep(.25,.45,d); if(m<=0.) discard;
          float age = vE.x;
          vec3 hot = mix(vec3(1.,.58,.08), vec3(.90,.18,.03), smoothstep(.1,.55,age));
          vec3 c = mix(hot, vec3(.30,.27,.25), smoothstep(.6,.95,age));
          c = mix(c*vec3(.75,.5,.5), c, 1.-smoothstep(.05,.32,d));
          o = vec4(c, m*vE.y); }`,
        `#version 300 es
        in vec4 aE; in vec4 aV; out vec4 vE; out vec2 vD; uniform float px;
        void main(){ vE = vec4(aE.w, aV.z, 0., 0.); vD = aV.xy; gl_Position = vec4(aE.xy*2.-1., 0., 1.); gl_PointSize = aE.z*px; }`),
    };
    const nz = G.keep('Texture', noiseVolume(gl));
    const MAXE = 420, ebuf = new Float32Array(MAXE * 8), evbo = G.keep('Buffer', gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER, evbo); gl.bufferData(gl.ARRAY_BUFFER, ebuf.byteLength, gl.DYNAMIC_DRAW);
    const aE = gl.getAttribLocation(P.ember.p, 'aE'), aV = gl.getAttribLocation(P.ember.p, 'aV');

    let S, quality, FB, FB2, fno = 0, fw, fh, steps, last = 0, time = 0, heat = .15, heatT = .15, flare = 0, spawnAcc = 0;
    let embers = [];
    const reduce = reducedMotion();

    function alloc() {
      S = sizeOf(canvas); quality = pickQuality(opts && opts.quality, S);
      canvas.width = S.w; canvas.height = S.h;
      const hi = quality === 'high', asp = S.w / S.h;
      const k = Math.min(1, Math.sqrt((hi ? 4.4e5 : 2.4e5) / (S.w * S.h * COV)));
      fw = Math.round(S.w * k); fh = Math.round(S.h * COV * k);
      fw = Math.max(16, fw); fh = Math.max(16, fh); steps = hi ? 34 : 22;
      free(FB); free(FB2); FB = target(fw, fh, false); FB2 = target(fw, fh, false); fno = 0;
    }
    function spawn(n, boost) {
      const asp = S.w / S.h, Hh = .06 + .26 * heat;
      for (let i = 0; i < n && embers.length < MAXE; i++) {
        const life = (.6 + Math.random() * Math.random() * 2.4) * (1 + boost * .25);
        embers.push({ x: Math.random(), y: Math.random() * Hh * (.5 + .8 * boost), vx: (Math.random() - .5) * (.2 + boost * .35) / asp,
          vy: (.10 + Math.random() * .32) * (.7 + heat * .6) * (1 + boost * 1.3), life, age: 0, s: 1.5 + Math.pow(Math.random(), 2) * 3.6 + boost * .6, ph: Math.random() * 6.28 });
      }
    }

    function frame(now) {
      if (st.dead) return;
      let dt = last ? (now - last) / 1000 : 1 / 60; last = now;
      dt = Math.max(0, Math.min(1 / 20, dt)); if (reduce) dt *= .15;
      time += dt * (1 + flare * .6);
      heat += (heatT - heat) * (1 - Math.exp(-dt * 2.6));
      flare *= Math.exp(-dt * 1.9);
      const asp = S.w / S.h;
      const H = .05 + .15 * Math.pow(heat, 1.1) + flare * .03;
      const U = { nz: { tex3d: nz }, time, H, flare, asp, xs: Math.max(1, Math.min(1.7, .9 / asp)) };   // narrower tongues on portrait canvases
      { const t = FB; FB = FB2; FB2 = t; }
      run(P.march, FB, Object.assign({ prev: FB2, res: [fw, fh], cov: COV, jo: (fno * .61803) % 1 - .5, keep: fno ? .38 : 0 }, U)); fno++;
      run(P.comp, null, Object.assign({ fb: FB, res: [S.w, S.h], fsz: [fw, fh], cov: COV, dpr: S.dpr, smokeAmt: .2 + .8 * heat + flare * .3 }, U));

      // embers: a small CPU particle set drawn as velocity-aligned capsules
      spawnAcc += dt * (1.5 + 20 * heat * heat + flare * 14);
      const ns = Math.floor(spawnAcc); spawnAcc -= ns; if (ns) spawn(ns, flare * .5);
      let n = 0;
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]; e.age += dt;
        if (e.age >= e.life || e.y > 1.05) { embers.splice(i, 1); continue; }
        const k = e.age / e.life;
        e.vx += (Math.sin(e.ph + time * 3.1 + e.y * 9) * .22 / asp - e.vx * .9) * dt;
        e.vy += (-.05 - e.vy * .55) * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        const sp = Math.hypot(e.vx * asp, e.vy) || 1e-5, o = n * 8;
        ebuf[o] = e.x; ebuf[o + 1] = e.y; ebuf[o + 2] = e.s * (1 - k * .5) * (1 + Math.min(sp * 4, 2.2)); ebuf[o + 3] = k;
        ebuf[o + 4] = e.vx * asp / sp; ebuf[o + 5] = e.vy / sp; ebuf[o + 6] = Math.min(1, k * 12) * (1 - k * k) * .95; ebuf[o + 7] = 0;
        n++;
      }
      if (n) {
        gl.useProgram(P.ember.p); gl.uniform1f(P.ember.u.px, S.dpr);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, S.w, S.h);
        gl.bindBuffer(gl.ARRAY_BUFFER, evbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ebuf.subarray(0, n * 8));
        gl.enableVertexAttribArray(aE); gl.vertexAttribPointer(aE, 4, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(aV); gl.vertexAttribPointer(aV, 4, gl.FLOAT, false, 32, 16);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.POINTS, 0, n);
        gl.disable(gl.BLEND);
        if (aE !== 0) gl.disableVertexAttribArray(aE); if (aV !== 0) gl.disableVertexAttribArray(aV);
      }
    }

    alloc();
    gl.useProgram(P.march.p); gl.uniform1i(P.march.u.steps, steps);
    return {
      setHeat(h01) { heatT = clamp01(h01); },
      burst(strength01) { if (st.dead) return; const s = clamp01(strength01 === undefined ? 1 : strength01); flare = Math.min(1.6, flare + .35 + .75 * s); spawn(Math.round(10 + 34 * s), .5 + s); },
      frame,
      resize() { if (st.dead) return; alloc(); gl.useProgram(P.march.p); gl.uniform1i(P.march.u.steps, steps); },
      reset() { if (st.dead) return; embers = []; flare = 0; heat = heatT = .15; last = 0; spawnAcc = 0; },
      destroy() { if (st.dead) return; st.dead = true; unwatch(); embers = []; G.destroy(); },
    };
  }

  window.PyroFX = { supported, ink, fire };
})();
