(function () {
'use strict';
const C = window.PyroCore, $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAY = 864e5;
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const ymd = s => s.replace(/-/g, '/');
const INK = '#1d1b18', PAPER = '#faf8f4', T0 = '#fffdf9', T1 = '#efeae0', T2 = '#d8d1c3', T3 = '#8f887b', EM = '#ea4a0c', EMD = '#b9390a', DK1 = '#34302a', DK2 = '#24211d', DK3 = '#151412';
const S = 0.866;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => 1 - Math.pow(1 - clamp(t), 3);
const io = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const seg = (p, a, b) => clamp((p - a) / (b - a));
const rnd = n => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const f1 = v => (Math.round(v * 10) / 10);
const P = (x, y, z = 0) => [(x - y) * S, (x + y) * .5 - z];
const pp = (...a) => a.map(q => { const r = P(q[0], q[1], q[2] || 0); return f1(r[0]) + ',' + f1(r[1]); }).join(' ');
const fmt = v => v >= 10000 ? Math.round(v).toLocaleString('en-US') : String(v);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
let uid = 0;

// ---------- Isometric kit ----------
function box(x, y, z, w, d, h, c = {}) {
  const s = c.s || INK;
  return `<g ${c.a || ''} stroke="${s}"><polygon fill="${c.l || T1}" points="${pp([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h])}"/><polygon fill="${c.r || T2}" points="${pp([x + w, y + d, z], [x + w, y, z], [x + w, y, z + h], [x + w, y + d, z + h])}"/><polygon fill="${c.t || T0}" points="${pp([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h])}"/></g>`;
}
const ground = (x, y, w, d, fill = T2, a = '') => `<polygon ${a} fill="${fill}" stroke="none" points="${pp([x, y], [x + w, y], [x + w, y + d], [x, y + d])}"/>`;
const mTop = (z = 0, ox = 0, oy = 0) => `matrix(${S},.5,${-S},.5,${f1((ox - oy) * S)},${f1((ox + oy) * .5 - z)})`;
const mLeft = (Y, ox, zTop) => `matrix(${S},.5,0,1,${f1((ox - Y) * S)},${f1((ox + Y) * .5 - zTop)})`;
const mRight = (X, oy, zTop) => `matrix(${S},-.5,0,1,${f1((X - oy) * S)},${f1((X + oy) * .5 - zTop)})`;
const at = (a, L) => { const v = L ? a[0] : a[1]; return `transform="translate(${v[0]},${v[1]}) scale(${v[2] || 1})"`; };

// ---------- Rolling counter ----------
function odo(value, size, o = {}) {
  const dec = (String(value).split('.')[1] || '').length, k = Math.pow(10, dec);
  const fin = Math.round(value * k), s = String(fin).padStart(dec + 1, '0'), il = s.length - dec;
  const cw = size * (o.cw || .5), lh = size, cols = [];
  let x = 0, out = '';
  for (let i = 0; i < s.length; i++) {
    if (dec && i === il) { out += `<text class="num" x="${x + size * .1}" y="0" font-size="${size}" text-anchor="middle">.</text>`; x += size * .2; }
    else if (i > 0 && i < il && (il - i) % 3 === 0 && il >= 5) { out += `<text class="num" x="${x + size * .09}" y="0" font-size="${size}" text-anchor="middle">,</text>`; x += size * .18; }
    const id = 'o' + (uid++);
    let col = '';
    for (let n = 0; n <= 10; n++) col += `<text class="num" x="${x + cw / 2}" y="${n * lh}" font-size="${size}" text-anchor="middle">${n % 10}</text>`;
    out += `<clipPath id="c${id}"><rect x="${x - 1}" y="${-size * .8}" width="${cw + 2}" height="${size * .92}"/></clipPath><g clip-path="url(#c${id})"><g id="${id}">${col}</g></g>`;
    cols.push({ id, place: s.length - 1 - i, x });
    x += cw;
  }
  return {
    svg: out, w: x, cols, cw,
    set(v) {
      let n = Math.min(fin, v * k); if (v >= value) n = fin;
      for (const c of cols) {
        if (!c.el) c.el = document.getElementById(c.id); if (!c.el) continue;
        const pw = Math.pow(10, c.place), f = n / pw, d = Math.floor(f + 1e-9), r = f - d;
        const roll = c.place === 0 ? Math.max(0, r) : Math.max(0, r * pw - (pw - 1));
        c.el.setAttribute('transform', `translate(0,${f1(-((d % 10) + roll) * lh)})`);
        c.el.setAttribute('opacity', d === 0 && c.place > dec ? .14 : 1);
      }
    }
  };
}
let CW = 1200;
function hero(m, size, x, y, anchor = 'start', fill = INK, maxW) {
  const av = maxW || (x === 0 ? 1e4 : anchor === 'start' ? CW - x - 12 : anchor === 'end' ? x - 12 : 2 * Math.min(x, CW - x) - 24);
  let o = odo(m.value, size), us = size * .34, uw = m.unit.length * us, tot = o.w + size * .08 + uw;
  if (tot > av) { size = Math.floor(size * av / tot); o = odo(m.value, size); us = size * .34; uw = m.unit.length * us; tot = o.w + size * .08 + uw; }
  const x0 = anchor === 'middle' ? x - tot / 2 : anchor === 'end' ? x - tot : x;
  return { svg: `<g transform="translate(${f1(x0)},${y})" fill="${fill}">${o.svg}<text class="zh" x="${f1(o.w + size * .08)}" y="0" font-size="${f1(us)}">${m.unit}</text></g>`, set: f => o.set(m.value * f), w: tot };
}
const partial = (pts, f) => { const n = (pts.length - 1) * clamp(f), i = Math.floor(n), r = n - i; let d = ''; for (let j = 0; j <= i; j++) d += (j ? 'L' : 'M') + f1(pts[j][0]) + ' ' + f1(pts[j][1]); if (r > 0 && i < pts.length - 1) d += 'L' + f1(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r) + ' ' + f1(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r); return d || 'M0 0'; };
const TAPE = 'const tokens = await burn(year); if (cache.hit) skip(); else think(); write(code); read(repo); ';
function tape(id, w = 13, back) {
  return back ? `<path id="${id}" fill="none" stroke="${T3}" stroke-width="${w}px" stroke-linecap="butt"/>`
    : `<path id="${id}b" fill="none" stroke="${INK}" stroke-width="${w + 3}px" stroke-linecap="butt"/><path id="${id}" fill="none" stroke="${T0}" stroke-width="${w}px" stroke-linecap="butt"/><text class="mono" font-size="${w > 12 ? 10 : 8}" fill="${EM}" dy="3.5"><textPath href="#${id}">${esc(TAPE.repeat(8))}</textPath></text>`;
}
const setTape = (id, d) => { const a = document.getElementById(id), b = document.getElementById(id + 'b'); if (a) a.setAttribute('d', d); if (b) b.setAttribute('d', d); };

// year / day slabs shared by the typing scene and the scale
function slabs(m, id) {
  const v = m.value, n = Math.min(Math.ceil(v), 36), th = Math.max(5, Math.min(20, 190 / n)), last = v <= 36 ? (v - Math.floor(v) || 1) : 1;
  let g = '', z = 0;
  for (let i = 0; i < n; i++) {
    const h = th * (i === n - 1 ? Math.max(last, .3) : 1) - 1.5, top = i === n - 1;
    g += `<g id="${id}${i}">${box(0, 0, z, 150, 110, h, { t: top ? EM : T0, l: T1, r: T2, s: th < 9 ? T3 : INK })}${th >= 14 && !top ? `<g transform="${mLeft(110, 0, z + h)}"><text class="mono" x="10" y="${f1(h - 4)}" font-size="10" fill="${T3}">${String(i + 1).padStart(2, '0')}</text><rect x="118" y="${f1(h / 2 - 2)}" width="22" height="4" fill="${INK}"/></g>` : ''}</g>`;
    z += th;
  }
  return { svg: g, n, h: z, set(f) { for (let i = 0; i < n; i++) { const e = document.getElementById(id + i), q = ease(seg(f * n, i, i + 1)); if (e) { e.setAttribute('transform', `translate(0,${f1(-(1 - q) * 70)})`); e.setAttribute('opacity', q < .02 ? 0 : 1); } } } };
}

// ---------- 1 GPU ----------
function gpuCard() {
  const W = 520, D = 210, Z = 54;
  let g = ground(46, 46, W, D + 6);
  g += box(-4, 6, Z, W - 4, D - 12, 5, { t: DK1, l: DK2, r: DK3 });
  g += box(64, D - 14, Z - 17, 236, 3, 17, { t: EM, l: EM, r: EMD });
  g += box(318, D - 14, Z - 17, 44, 3, 17, { t: EM, l: EM, r: EMD });
  g += `<g stroke="${EMD}" transform="${mLeft(D - 11, 64, Z)}">${Array.from({ length: 23 }, (_, i) => `<line x1="${6 + i * 10}" y1="3" x2="${6 + i * 10}" y2="17"/>`).join('')}</g>`;
  g += box(0, 0, Z + 5, W, D, 42, { t: DK1, l: DK2, r: DK3, s: '#000' });
  const zt = Z + 47;
  const blade = Array.from({ length: 9 }, (_, i) => `<path transform="rotate(${i * 40})" d="M4,-20 C30,-34 56,-44 44,-68 C24,-72 2,-52 -6,-22Z"/>`).join('');
  const fan = (cx) => `<g transform="translate(${cx},105)"><circle r="84" fill="${DK3}" stroke="${T3}"/><circle r="76" fill="#0c0b0a" stroke="none"/><g class="fan" fill="${DK1}" stroke="${T3}">${blade}</g><circle r="22" fill="${DK2}" stroke="${T3}"/><circle r="7" fill="${EM}" stroke="none"/></g>`;
  g += `<g transform="${mTop(zt)}" fill="none" stroke="${T3}"><rect x="10" y="10" width="${W - 20}" height="${D - 20}" rx="12"/>${Array.from({ length: 9 }, (_, i) => `<line x1="${228 + i * 8}" y1="26" x2="${228 + i * 8}" y2="184"/>`).join('')}${fan(120)}${fan(400)}<circle cx="26" cy="26" r="4"/><circle cx="${W - 26}" cy="26" r="4"/><circle cx="26" cy="${D - 26}" r="4"/><circle cx="${W - 26}" cy="${D - 26}" r="4"/></g>`;
  g += `<g transform="${mLeft(D, 0, zt)}"><rect x="18" y="13" width="${W - 150}" height="5" fill="${EM}"/><text class="num" x="${W - 22}" y="33" font-size="30" text-anchor="end" fill="${T1}" letter-spacing="2">H100</text></g>`;
  g += box(W, -10, Z - 26, 5, D + 20, 84, { t: T1, l: T2, r: T2 });
  g += `<g transform="${mRight(W + 5, D + 10, Z + 58)}" fill="${INK}" stroke="none">${Array.from({ length: 6 }, (_, r) => Array.from({ length: 13 }, (_, c) => `<rect x="${24 + c * 15}" y="${10 + r * 9}" width="9" height="4" rx="2"/>`).join('')).join('')}</g>`;
  return g;
}
function sGpu(m, L) {
  const g = gpuCard();
  // flip counter block
  const sz = 132, o = odo(m.value, sz, { cw: .56 }), us = 56, uw = m.unit.length * us, bw = o.w + uw + 62, bh = 176, bd = 64;
  let c = ground(18, 0, bw, bd) + box(0, 0, 0, bw, bd, bh, { t: T0, l: T1, r: T2 });
  let tiles = '';
  for (const k of o.cols) tiles += `<rect x="${f1(k.x + 3)}" y="${-sz * .8 - 4}" width="${f1(o.cw - 6)}" height="${sz * .92 + 8}" rx="7" fill="${DK2}" stroke="${INK}"/>`;
  c += `<g transform="${mLeft(bd, 0, bh)}"><g transform="translate(22,${bh - 34})">${tiles}<g fill="${T0}">${o.svg}</g><line x1="0" x2="${f1(o.w)}" y1="${-sz * .37}" y2="${-sz * .37}" stroke="${T1}" stroke-width="2.4px"/><text class="zh" x="${f1(o.w + 12)}" y="-8" font-size="${us}" fill="${INK}">${m.unit}</text></g><circle cx="12" cy="12" r="3" fill="${INK}"/><circle cx="${bw - 12}" cy="12" r="3" fill="${INK}"/></g>`;
  const svg = `<g ${at([[300, 205, 1], [100, 76, .5]], L)}>${g}</g><g ${at([[790, 330, .98], [L ? 0 : Math.max(52, 195 - bw * .33), 356, .78]], L)}>${c}</g>`;
  let fans, ang = 0;
  return { svg, update(p, dt, root) {
    o.set(m.value * ease(p / .85));
    if (!fans) fans = root.querySelectorAll('.fan');
    if (!reduce) ang = (ang + dt * (.12 + .7 * seg(p, 0, .85) * (p < .995 ? 1 : .35))) % 360;
    fans.forEach((f, i) => f.setAttribute('transform', `rotate(${f1(i ? -ang : ang)})`));
  } };
}

// ---------- 2 Cache ----------
function sCache(m, L, M) {
  const tot = M['gpu-days'].raw.hours, keepF = 1 - m.raw.hours / tot, dv = M['gpu-days'];
  let n = dv.value >= 24 ? Math.round(dv.value) : 96; n = Math.min(n, L ? 220 : 90); n = Math.max(1, Math.round(n / (L ? 22 : 9))) * (L ? 22 : 9);
  const cols = L ? 22 : 9, rows = Math.ceil(n / cols), keep = Math.max(1, Math.round(n * keepF)), px = 36, py = 46, id = 'k' + (uid++);
  let ghosts = '', pages = ''; const meta = [];
  const cx = cols * px / 2, cy = rows * py / 2;
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols), x = c * px, y = r * py, kept = i >= n - keep;
    const dist = Math.hypot((x - cx) / (cols * px), (y - cy) / (rows * py));
    ghosts += `<rect x="${x}" y="${y}" width="30" height="40" fill="none" stroke="${T2}" stroke-dasharray="3 3"/>`;
    const o = P(x, y);
    pages += `<g id="${id}${i}"><g transform="${mTop(0, x, y)}"><rect width="30" height="40" fill="${T0}" stroke="${INK}"/><rect width="30" height="10" fill="${kept ? EM : INK}" stroke="${INK}"/><line x1="6" y1="20" x2="24" y2="20" stroke="${T2}"/><line x1="6" y1="28" x2="18" y2="28" stroke="${T2}"/></g></g>`;
    meta.push({ kept, start: .04 + .5 * dist * 1.6 + rnd(i) * .1, dx: (rnd(i + 9) - .3) * 260, dy: 260 + rnd(i + 3) * 240, rot: (rnd(i + 5) - .5) * 80, ox: o[0], oy: o[1] });
  }
  const gw = (cols * px + rows * py) * S, gh = (cols * px + rows * py) * .5;
  const k = L ? Math.min(1, 1040 / gw, 520 / gh) : Math.min(.62, 366 / gw, 400 / gh);
  const ox = (L ? 600 : 195) - (cols * px - rows * py) * S * k / 2, oy = (L ? 360 : 400) - gh * k / 2;
  const h = hero(m, L ? 220 : 124, L ? 690 : 195, L ? 330 : 122, 'middle', INK);
  const svg = `<g transform="translate(${f1(ox)},${f1(oy)}) scale(${f1(k * 100) / 100})"><g transform="${mTop()}">${ghosts}</g>${pages}</g><g id="${id}h">${h.svg}</g>`;
  let els;
  return { svg, update(p) {
    if (!els) els = meta.map((_, i) => document.getElementById(id + i));
    for (let i = 0; i < n; i++) { const q = meta[i]; if (q.kept) continue; const t = seg(p, q.start, q.start + .22), e = t * t; els[i].setAttribute('transform', `translate(${f1(q.dx * e)},${f1(-q.dy * e)}) rotate(${f1(q.rot * t)} ${f1(q.ox)} ${f1(q.oy)})`); els[i].setAttribute('opacity', t >= 1 ? 0 : 1 - e * e); }
    h.set(ease(seg(p, .1, .9)));
    document.getElementById(id + 'h').setAttribute('opacity', L ? f1(seg(p, .12, .32)) : 1);
  } };
}

// ---------- 3 Rack ----------
function sRack(m, L) {
  const days = m.raw.hours / 24, W = 336, D = 150, uh = 33, H = 12 * uh + 34, id = 'r' + (uid++);
  const ml = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let g = ground(26, 0, W, D) + box(0, 0, 0, W, D, H, { t: DK1, l: DK2, r: DK3, s: '#000' });
  let f = '', n = 0;
  for (let u = 0; u < 12; u++) {
    const y = 18 + u * uh;
    f += `<rect x="10" y="${y}" width="${W - 20}" height="${uh - 5}" rx="3" fill="${DK1}" stroke="${T3}"/><text class="mono" x="18" y="${y + 18}" font-size="10" fill="${T3}">${String(u + 1).padStart(2, '0')}</text>`;
    for (let d = 0; d < ml[u]; d++, n++) f += `<circle id="${id}${n}" cx="${44 + d * 9}" cy="${y + 14}" r="3" fill="${DK3}" stroke="${T3}" stroke-width=".8px"/>`;
  }
  g += `<g transform="${mLeft(D, 0, H)}">${f}</g>`;
  g += `<g transform="${mRight(W, D, H)}" stroke="${T3}">${Array.from({ length: 22 }, (_, i) => `<line x1="22" x2="${D - 22}" y1="${30 + i * 18}" y2="${30 + i * 18}"/>`).join('')}</g>`;
  g += `<g transform="${mTop(H)}" fill="none" stroke="${T3}"><rect x="16" y="16" width="${W - 32}" height="${D - 32}" rx="8"/></g>`;
  const lit = Math.min(365, days), h = hero(m, L ? 250 : 120, L ? 620 : 195, L ? 380 : 118, L ? 'start' : 'middle', EM);
  const svg = `<g ${at([[300, 428, .85], [117, 520, .78]], L)}>${g}</g>${h.svg}`;
  let els, prev = -1;
  return { svg, update(p) {
    if (!els) els = Array.from({ length: 365 }, (_, i) => document.getElementById(id + i));
    const e = ease(p / .85), cur = lit * e; h.set(e);
    if (Math.abs(cur - prev) < .01 && prev >= 0) return; prev = cur;
    for (let i = 0; i < 365; i++) { const a = clamp(cur - i); if (a > 0) { els[i].setAttribute('fill', EM); els[i].setAttribute('stroke', EM); els[i].setAttribute('r', f1(Math.max(1.3, 3.4 * Math.sqrt(a)))); } else { els[i].setAttribute('fill', DK3); els[i].setAttribute('stroke', T3); els[i].setAttribute('r', 3); } }
  } };
}

// ---------- 4 Keyboard ----------
function keyboard(id) {
  const U = 36, rows = [[...Array(13).fill(1), 2], [1.5, ...Array(12).fill(1), 1.5], [1.75, ...Array(11).fill(1), 2.25], [2.25, ...Array(10).fill(1), 2.75], [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25]];
  let g = ground(24, 0, 560, 200) + box(0, 0, 0, 560, 200, 24, { t: DK1, l: DK2, r: DK3, s: '#000' }), nk = 0;
  rows.forEach((r, ri) => { let x = 10; r.forEach((w, ki) => {
    const em = ri === 2 && ki === r.length - 1, c = { t: em ? EM : T0, l: em ? EMD : T1, r: em ? EMD : T2 }, a = [x + 2, 10 + ri * U + 2, 24, w * U - 4, U - 4];
    g += `<g id="${id}${nk}">${box(...a, 15, c)}</g><g id="${id}${nk}d" display="none">${box(...a, 5, { ...c, t: em ? EMD : T1 })}</g>`; nk++; x += w * U; }); });
  return { svg: g, nk };
}
function sType(m, L) {
  const id = 'y' + (uid++), kb = keyboard(id), g = kb.svg, nk = kb.nk;
  const st = slabs(m, id + 's'), h = hero(m, L ? 210 : 118, L ? 742 : 195, L ? 215 : 112, L ? 'start' : 'middle', INK);
  const svg = `<g ${at([[215, 250, 1], [112, 400, .5]], L)}>${g}</g><g ${at([[930, 498, 1], [262, 330, .62]], L)}>${ground(18, 0, 150, 110)}${st.svg}</g>${h.svg}`;
  let els, down = [];
  return { svg, update(p) {
    if (!els) els = Array.from({ length: nk }, (_, i) => [document.getElementById(id + i), document.getElementById(id + i + 'd')]);
    const e = ease(p / .85); h.set(e); st.set(e);
    const step = Math.floor(p * 150), now = p > .995 || p < .004 ? [] : [Math.floor(rnd(step) * nk), Math.floor(rnd(step + 77) * nk), Math.floor(rnd(step + 31) * nk)];
    for (const i of down) if (!now.includes(i)) { els[i][0].removeAttribute('display'); els[i][1].setAttribute('display', 'none'); }
    for (const i of now) { els[i][0].setAttribute('display', 'none'); els[i][1].removeAttribute('display'); }
    down = now;
  } };
}

// ---------- 5 Code ----------
function sCode(m, L) {
  const linux = m.raw.linux >= .01, units = linux ? m.raw.linux : m.raw.lines / 15000, id = 'c' + (uid++);
  const nt = units > 4 ? 1 : Math.max(1, Math.ceil(units - 1e-9)), W = 200, H = 300, gap = 250;
  const fills = Array.from({ length: nt }, (_, i) => units > 4 ? 1 : clamp(units - i));
  let g = '';
  for (let t = nt - 1; t >= 0; t--) {
    const x0 = t * gap, y0 = -t * gap * 0; // tanks step along x
    let rowsL = '', rowsR = '';
    for (let r = 0; r < 36; r++) { const y = H - 6 - r * 8; let x = 8; while (x < W - 20) { const w = 8 + rnd(r * 13 + x + t) * 46; if (rnd(r * 7 + x) > .22) rowsL += `<line class="${id}r${t}" data-r="${r}" x1="${f1(x)}" x2="${f1(Math.min(W - 8, x + w))}" y1="${y}" y2="${y}"/>`; x += w + 7; } x = 8; while (x < W - 20) { const w = 8 + rnd(r * 17 + x + 5 + t) * 46; if (rnd(r * 3 + x) > .22) rowsR += `<line class="${id}r${t}" data-r="${r}" x1="${f1(x)}" x2="${f1(Math.min(W - 8, x + w))}" y1="${y}" y2="${y}"/>`; x += w + 7; } }
    g += `<g transform="translate(${f1(P(x0, 0)[0])},${f1(P(x0, 0)[1])})">${ground(20, 0, W, W)}
      <polyline fill="none" stroke="${T3}" points="${pp([0, W, 0], [0, 0, 0], [W, 0, 0])}"/><line stroke="${T3}" x1="0" y1="0" x2="0" y2="${-H}"/>
      <polygon id="${id}t${t}" fill="${EM}" stroke="${INK}" points=""/>
      <g transform="${mLeft(W, 0, H)}"><rect id="${id}l${t}" x="0" width="${W}" fill="${EM}" stroke="${INK}"/><g stroke="${T0}" stroke-width="1.5px">${rowsL}</g></g>
      <g transform="${mRight(W, W, H)}"><rect id="${id}q${t}" x="0" width="${W}" fill="${EMD}" stroke="${INK}"/><g stroke="${T0}" stroke-width="1.5px" opacity=".8">${rowsR}</g></g>
      <g fill="none" stroke="${INK}"><polygon points="${pp([0, 0, H], [W, 0, H], [W, W, H], [0, W, H])}"/><polyline points="${pp([0, W, H], [0, W, 0], [W, W, 0], [W, 0, 0], [W, 0, H])}"/><line x1="${P(W, W)[0]}" y1="${P(W, W)[1]}" x2="${P(W, W, H)[0]}" y2="${P(W, W, H)[1]}"/></g>
      <g transform="${mLeft(W, 0, H)}" stroke="${INK}">${[.25, .5, .75].map(q => `<line x1="0" x2="12" y1="${H * (1 - q)}" y2="${H * (1 - q)}"/>`).join('')}</g></g>`;
  }
  // falling lines
  let fall = ''; const NF = 34, fm = [];
  for (let i = 0; i < NF; i++) { const t = i % nt, x = 20 + rnd(i) * (W - 90), y = 20 + rnd(i + 40) * (W - 40), w = 20 + rnd(i + 80) * 50; fm.push({ t, x, y, w, ph: rnd(i + 120) }); fall += `<line id="${id}f${i}" stroke="${i % 5 === 0 ? EM : INK}" stroke-width="2.2px"/>`; }
  const tw = (nt - 1) * gap, k = L ? (nt > 2 ? .72 : nt > 1 ? .86 : 1) : (nt > 2 ? .3 : nt > 1 ? .42 : .6);
  const h = hero(m, L ? 200 : 110, L ? 80 : 195, L ? 300 : 108, L ? 'start' : 'middle', INK, L ? (nt > 1 ? 470 : 560) : 0);
  const lx = L ? 84 : 195, ly = L ? 352 : 136;
  const svg = `${h.svg}
    <g transform="translate(${f1((L ? 860 : 195) - tw * S * k / 2)},${f1((L ? 440 : 470) - tw * .25 * k)}) scale(${k})">${g}<g>${fall}</g></g>`;
  let els;
  return { svg, update(p) {
    if (!els) els = { f: fm.map((_, i) => document.getElementById(id + 'f' + i)), t: fills.map((_, t) => ({ top: document.getElementById(id + 't' + t), l: document.getElementById(id + 'l' + t), q: document.getElementById(id + 'q' + t), rows: [...document.querySelectorAll('.' + id + 'r' + t)] })) };
    const e = ease(p / .85); h.set(e);
    const lv = fills.map((f, t) => { const a = clamp(e * (units > 4 ? 1 : units) - t) ; return Math.min(f, a) * H; });
    lv.forEach((fh, t) => { const o = els.t[t]; o.top.setAttribute('points', pp([0, 0, fh], [W, 0, fh], [W, W, fh], [0, W, fh])); for (const r of [o.l, o.q]) { r.setAttribute('y', f1(H - fh)); r.setAttribute('height', f1(fh)); } o.top.setAttribute('opacity', fh < 1 ? 0 : 1); const nr = Math.floor((fh - 2) / 8); for (const r of o.rows) r.setAttribute('display', +r.dataset.r < nr ? 'inline' : 'none'); });
    fm.forEach((q, i) => { const el = els.f[i], run = p > .01 && p < .84 && lv[q.t] < fills[q.t] * H - .5 || (p > .01 && p < .84 && q.t === 0 && nt === 1); if (!run) { el.setAttribute('display', 'none'); return; } el.removeAttribute('display'); const u = (p * 7 + q.ph) % 1, z = 620 - u * u * (620 - lv[q.t]), a = P(q.t * gap + q.x, q.y, z), b = P(q.t * gap + q.x + q.w, q.y, z); el.setAttribute('x1', f1(a[0])); el.setAttribute('y1', f1(a[1])); el.setAttribute('x2', f1(b[0])); el.setAttribute('y2', f1(b[1])); });
  } };
}

// ---------- 6 Laps (always Taiwan) ----------
const TW = [[121.537, 25.298], [121.64, 25.23], [121.69, 25.21], [121.75, 25.16], [121.92, 25.13], [122.00, 25.01], [121.83, 24.86], [121.87, 24.59], [121.80, 24.45], [121.77, 24.31], [121.63, 23.98], [121.52, 23.60], [121.45, 23.32], [121.38, 23.10], [121.18, 22.76], [121.01, 22.61], [120.90, 22.34], [120.89, 22.20], [120.86, 21.90], [120.74, 21.92], [120.71, 22.07], [120.65, 22.26], [120.59, 22.37], [120.45, 22.46], [120.27, 22.62], [120.18, 22.88], [120.14, 23.00], [120.06, 23.12], [120.12, 23.27], [120.15, 23.38], [120.14, 23.46], [120.18, 23.70], [120.24, 23.80], [120.32, 23.97], [120.42, 24.07], [120.50, 24.27], [120.58, 24.40], [120.67, 24.50], [120.76, 24.62], [120.91, 24.82], [120.97, 24.92], [121.07, 25.04], [121.28, 25.12], [121.40, 25.17], [121.50, 25.28]];
function smoothClosed(pts, per = 6) { const n = pts.length, out = []; for (let i = 0; i < n; i++) { const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], d = pts[(i + 2) % n]; for (let j = 0; j < per; j++) { const t = j / per, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(k => .5 * ((2 * b[k]) + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3))); } } return out; }
const TWB = (() => { const k0 = Math.cos(23.6 * Math.PI / 180), sc = 118, base = smoothClosed(TW.map(q => [(q[0] - 121.03) * k0 * sc, -(q[1] - 23.6) * sc])), n = base.length;
  let area = 0; for (let i = 0; i < n; i++) { const a = base[i], b = base[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1, raw = base.map((_, i) => { const a = base[(i - 2 + n) % n], b = base[(i + 2) % n], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1; return [sg * ty / l, -sg * tx / l]; });
  const nor = raw.map((_, i) => { let x = 0, y = 0; for (let j = -5; j <= 5; j++) { const q = raw[(i + j + n) % n]; x += q[0]; y += q[1]; } const l = Math.hypot(x, y) || 1; return [x / l, y / l]; });
  return { base, nor, n, sc, k0 }; })();
// Taiwan with a text tape wound round the coast. loops = true lap count (drawn loops are capped).
function taiwan(id, loops, o = {}) {
  const { base, nor, n, sc, k0 } = TWB, maxL = o.maxL || 6, drawn = Math.max(.035, Math.min(loops, maxL)), gap = o.gap || 13, w = o.w || 11, all = [];
  for (let i = 0; i <= Math.round(drawn * n); i++) { const j = i % n, d = 12 + gap * (i / n); all.push([base[j][0] + nor[j][0] * d, base[j][1] + nor[j][1] * d]); }
  const d0 = partial(base.concat([base[0]]), 1) + 'Z', ll = (lo, la) => [(lo - 121.03) * k0 * sc, -(la - 23.6) * sc];
  const ridge = [[121.45, 24.6], [121.3, 24.3], [121.2, 24.0], [121.05, 23.6], [120.95, 23.25], [120.85, 22.9], [120.78, 22.6]].map(q => ll(q[0], q[1]));
  const tp = ll(121.52, 25.04);
  const svg = `<path d="${d0}" fill="${T2}" stroke="none" transform="translate(16,22)"/><path d="${d0}" fill="${T2}" stroke="${INK}" transform="translate(0,10)"/><path d="${d0}" fill="${T1}" stroke="${INK}"/>
    <g fill="none" stroke="${T3}">${ridge.map(r => `<path d="M${f1(r[0] - 9)} ${f1(r[1] + 6)}L${f1(r[0])} ${f1(r[1] - 7)}L${f1(r[0] + 9)} ${f1(r[1] + 6)}"/>`).join('')}</g>
    <line x1="${f1(tp[0])}" y1="${f1(tp[1])}" x2="${f1(tp[0])}" y2="${f1(tp[1] - 20)}" stroke="${INK}"/><circle cx="${f1(tp[0])}" cy="${f1(tp[1] - 24)}" r="5.5" fill="${EM}" stroke="${INK}"/>
    <path id="${id}b" fill="none" stroke="${INK}" stroke-width="${w + 3}px" stroke-linecap="butt"/><path id="${id}" fill="none" stroke="${T0}" stroke-width="${w}px" stroke-linecap="butt"/><text class="mono" font-size="${f1(w * .7)}" fill="${EM}" dy="${f1(w * .25)}"><textPath href="#${id}">${esc(TAPE.repeat(Math.ceil(drawn * 14)))}</textPath></text><circle id="${id}tip" r="6" fill="${EM}" stroke="${INK}"/>`;
  return { svg, set(e, tipOn = true) { setTape(id, partial(all, e)); const i = Math.min(all.length - 1, Math.round(clamp(e) * (all.length - 1))), tip = document.getElementById(id + 'tip'); if (tip) { tip.setAttribute('cx', f1(all[i][0])); tip.setAttribute('cy', f1(all[i][1])); tip.setAttribute('opacity', tipOn ? 1 : 0); } } };
}
function sLaps(m, L) {
  const id = 'l' + (uid++), tw = taiwan(id, m.raw.taiwanLaps);
  const h = hero(m, L ? 240 : 124, L ? 640 : 195, L ? 400 : 122, L ? 'start' : 'middle', INK);
  const svg = `<g ${at([[360, 322, 1.1], [190, 400, .78]], L)}>${tw.svg}</g>${h.svg}`;
  return { svg, update(p) { const e = io(p / .88); h.set(ease(p / .88)); tw.set(e, p < .995); } };
}

// ---------- 7 Rereads ----------
function sRead(m, L) {
  const W = 230, D = 300, id = 'b' + (uid++), NP = 6;
  let pg = ''; for (let i = 0; i < NP; i++) pg += `<path id="${id}p${i}" fill="${T0}" stroke="${INK}"/>`;
  const lines = (x0) => Array.from({ length: 11 }, (_, i) => `<line x1="${x0 + 22}" x2="${x0 + W - 24 - (i % 4 === 3 ? 70 : rnd(i + x0) * 30)}" y1="${34 + i * 22}" y2="${34 + i * 22}"/>`).join('');
  const svg = `<g ${at([[440, 392, .85], [200, 330, .52]], L)}>${ground(-W + 8, 14, 2 * W + 28, D)}${box(-W - 10, -8, 0, 2 * W + 20, D + 16, 8, { t: DK1, l: DK2, r: DK3 })}
    <g id="${id}L"></g><g id="${id}R"></g>
    <g id="${id}tl" fill="none" stroke="${T2}">${lines(-W)}</g><g id="${id}tr" fill="none" stroke="${T2}">${lines(0)}</g>
    <polygon id="${id}ear" fill="${T1}" stroke="${INK}"/><g id="${id}wear" stroke="${INK}" fill="none"></g>${pg}
    <polygon id="${id}rib" fill="${EM}" stroke="${INK}"/></g>`;
  const h = hero(m, L ? 185 : 112, L ? 1170 : 195, L ? 230 : 118, L ? 'end' : 'middle', INK);
  return { svg: svg + h.svg, update(p) {
    const e = ease(p / .85), q = L ? 1 : 1, hL = 12 + 34 * e, hR = 46 - 34 * e; h.set(e);
    document.getElementById(id + 'L').innerHTML = box(-W, 0, 8, W, D, hL, { t: T0, l: T1, r: T2 }) + `<g transform="${mLeft(D, -W, 8 + hL)}" stroke="${T3}" stroke-width=".8px">${Array.from({ length: Math.floor(hL / 4) }, (_, i) => `<line x1="2" x2="${W - 2}" y1="${i * 4 + 3}" y2="${i * 4 + 3}"/>`).join('')}</g>`;
    document.getElementById(id + 'R').innerHTML = box(0, 0, 8, W, D, hR, { t: T0, l: T1, r: T2 }) + `<g transform="${mLeft(D, 0, 8 + hR)}" stroke="${T3}" stroke-width=".8px">${Array.from({ length: Math.floor(hR / 4) }, (_, i) => `<line x1="2" x2="${W - 2}" y1="${i * 4 + 3}" y2="${i * 4 + 3}"/>`).join('')}</g><g transform="${mRight(W, D, 8 + hR)}" stroke="${T3}" stroke-width=".8px">${Array.from({ length: Math.floor(hR / 4) }, (_, i) => `<line x1="2" x2="${D - 2}" y1="${i * 4 + 3}" y2="${i * 4 + 3}"/>`).join('')}</g>`;
    document.getElementById(id + 'tl').setAttribute('transform', mTop(8 + hL));
    document.getElementById(id + 'tr').setAttribute('transform', mTop(8 + hR));
    // worn corner on the right block
    const c = 16 + 40 * e;
    document.getElementById(id + 'ear').setAttribute('points', pp([W - c, D, 8 + hR], [W, D - c, 8 + hR], [W - c * .7, D - c * .7, 8 + hR + c * .28]));
    document.getElementById(id + 'rib').setAttribute('points', pp([-60, D, 8 + hL], [-36, D, 8 + hL], [-36, D + 2, -44], [-48, D + 2, -32], [-60, D + 2, -44]));
    const th = []; for (let i = 0; i < NP; i++) { const u = (p * 9 + i / NP) % 1, on = p > .004 && p < .9; th.push(on ? Math.PI * io(u) : (i < NP / 2 ? 0 : Math.PI)); }
    th.sort((a, b) => Math.abs(b - Math.PI / 2) - Math.abs(a - Math.PI / 2));
    th.forEach((t, i) => { const el = document.getElementById(id + 'p' + i); if (t <= 0.001 || t >= Math.PI - .001) { el.setAttribute('display', 'none'); return; } el.removeAttribute('display');
      const z0 = 8 + (t < Math.PI / 2 ? hR : hL) , zz = 8 + hR + (hL - hR) * (t / Math.PI), r = W, bend = .5 * Math.sin(t), tm = t + (t < Math.PI / 2 ? bend : -bend) * .9, ex = r * Math.cos(t), ez = zz + r * Math.sin(t) * .92, mx = r * .5 * Math.cos(tm), mz = zz + r * .5 * Math.sin(tm) * .92;
      const A = P(0, 0, zz), B = P(0, D, zz), Cc = P(ex, D, ez), Dd = P(ex, 0, ez), m1 = P(mx, 0, mz), m2 = P(mx, D, mz);
      const cq = (a, mid, b) => [2 * mid[0] - (a[0] + b[0]) / 2, 2 * mid[1] - (a[1] + b[1]) / 2];
      const c1 = cq(A, m1, Dd), c2 = cq(B, m2, Cc);
      el.setAttribute('d', `M${f1(A[0])} ${f1(A[1])}Q${f1(c1[0])} ${f1(c1[1])} ${f1(Dd[0])} ${f1(Dd[1])}L${f1(Cc[0])} ${f1(Cc[1])}Q${f1(c2[0])} ${f1(c2[1])} ${f1(B[0])} ${f1(B[1])}Z`);
      el.setAttribute('fill', t > Math.PI / 2 ? T1 : T0); });
  } };
}

// ---------- 8 Energy ----------
function sEnergy(m, L) {
  const id = 'e' + (uid++), PW = 150, PH = 290, PD = 16, RL = L ? 540 : 520, km = Math.round(m.raw.evKm).toLocaleString('en-US');
  let ph = ground(14, 0, PW, PD) + box(0, 0, 0, PW, PD, PH, { t: DK1, l: DK2, r: DK3, s: '#000' });
  ph += `<g transform="${mLeft(PD, 0, PH)}"><rect x="8" y="8" width="${PW - 16}" height="${PH - 16}" rx="12" fill="${T0}" stroke="${INK}"/><rect x="55" y="16" width="40" height="9" rx="4.5" fill="${INK}"/>
    <rect x="34" y="62" width="82" height="176" rx="12" fill="${T0}" stroke="${INK}" stroke-width="2.4px"/><rect x="60" y="50" width="30" height="12" rx="4" fill="${INK}"/>
    <clipPath id="${id}cp"><rect x="41" y="69" width="68" height="162" rx="7"/></clipPath><g clip-path="url(#${id}cp)"><rect id="${id}lv" x="41" width="68" y="231" height="0" fill="${EM}"/></g>
    <path d="M80,116 L62,156 H78 L72,188 L96,144 H80 Z" fill="${T0}" stroke="${INK}"/></g>`;
  // tally marks on the ground
  const NT = 30; let tl = '';
  for (let i = 0; i < NT; i++) { const g5 = Math.floor(i / 5), j = i % 5, gx = (g5 % 3) * 86, gy = Math.floor(g5 / 3) * 70; tl += j < 4 ? `<line id="${id}m${i}" x1="${gx + j * 14}" y1="${gy}" x2="${gx + j * 14}" y2="${gy + 46}"/>` : `<line id="${id}m${i}" x1="${gx - 10}" y1="${gy + 38}" x2="${gx + 52}" y2="${gy + 8}"/>`; }
  const car = box(0, 0, 10, 132, 58, 24, { t: EM, l: EM, r: EMD }) + box(30, 4, 34, 70, 50, 22, { t: T0, l: T1, r: T2 }) +
    `<g transform="${mLeft(58, 0, 34)}"><circle cx="28" cy="26" r="13" fill="${DK2}" stroke="${INK}"/><circle cx="28" cy="26" r="5" fill="${T2}" stroke="none"/><circle cx="104" cy="26" r="13" fill="${DK2}" stroke="${INK}"/><circle cx="104" cy="26" r="5" fill="${T2}" stroke="none"/></g><g transform="${mLeft(54, 30, 56)}"><rect x="6" y="5" width="26" height="13" fill="${DK2}"/><rect x="38" y="5" width="26" height="13" fill="${DK2}"/></g><g transform="${mRight(132, 58, 34)}"><rect x="8" y="4" width="14" height="6" fill="${T0}" stroke="${INK}"/><rect x="36" y="4" width="14" height="6" fill="${T0}" stroke="${INK}"/></g>`;
  const sw = km.length * 17 + 74, e0 = P(RL, 46), sgn = `<line x1="${e0[0] + 30}" y1="${e0[1] + 4}" x2="${e0[0] + 30}" y2="${e0[1] - 96}" stroke="${INK}" stroke-width="3px"/><g transform="translate(${f1(e0[0] + 30)},${f1(e0[1] - 96)})"><g transform="scale(${L ? 1 : 1.5})"><rect x="${-sw / 2}" y="-46" width="${sw}" height="50" rx="5" fill="${T0}" stroke="${INK}"/><text class="num" x="${sw / 2 - 48}" y="-9" font-size="38" text-anchor="end" fill="${INK}">${km}</text><text class="zh" x="${sw / 2 - 42}" y="-11" font-size="15" fill="${INK}">公里</text></g></g>`;
  const road = `${ground(10, 10, RL, 92)}<polygon points="${pp([0, 0], [RL, 0], [RL, 92], [0, 92])}" fill="${T1}" stroke="${INK}"/><line x1="${P(10, 46)[0]}" y1="${P(10, 46)[1]}" x2="${P(RL - 10, 46)[0]}" y2="${P(RL - 10, 46)[1]}" stroke="${T0}" stroke-width="3px" stroke-dasharray="16 14"/><line id="${id}tr" x1="${P(0, 17)[0]}" y1="${P(0, 17)[1]}" stroke="${EM}" stroke-width="3px"/>`;
  const h = hero(m, L ? 190 : 116, L ? 1170 : 195, L ? 215 : 112, L ? 'end' : 'middle', INK);
  const svg = `<g ${at([[820, 290, .9], [262, 262, .6]], L)}><g transform="${mTop(0, 0, 0)}" stroke="${INK}" stroke-width="2.6px"><g transform="translate(-10,70)">${tl}</g></g></g>
    <g ${at([[130, 345, .92], [52, 372, .56]], L)}>${ph}</g>
    <g ${at([[370, 322, 1], [70, 418, .5]], L)}>${road}<g id="${id}car">${car}</g>${sgn}</g>${h.svg}`;
  let marks;
  return { svg, update(p) {
    if (!marks) marks = Array.from({ length: NT }, (_, i) => document.getElementById(id + 'm' + i));
    const e = ease(p / .7); h.set(e);
    const cyc = Math.min(m.value, 14), u = p >= .7 ? 1 : (seg(p, 0, .7) * cyc) % 1, lv = 162 * (p <= .002 ? 0 : u), r = document.getElementById(id + 'lv');
    r.setAttribute('y', f1(231 - lv)); r.setAttribute('height', f1(lv));
    const nt = Math.round(Math.min(NT, m.value) * e); marks.forEach((k, i) => k.setAttribute('opacity', i < nt ? 1 : 0));
    const cx = (RL - 150) * io(seg(p, .12, .96)), o = P(cx, 17);
    document.getElementById(id + 'car').setAttribute('transform', `translate(${f1(o[0])},${f1(o[1])})`);
    const t = document.getElementById(id + 'tr'), o2 = P(cx + 4, 17); t.setAttribute('x2', f1(o2[0])); t.setAttribute('y2', f1(o2[1]));
  } };
}

// ---------- 9 Engineer ----------
function engineer(id) {
  const leg = (x, y) => box(x, y, 0, 8, 8, 72, { t: T2, l: T2, r: T3 });
  const hp = P(106, -37, 134);
  const svg = ground(14, -60, 210, 176) +
    box(84, -58, 0, 44, 40, 44, { t: T1, l: T2, r: T2 }) +
    box(80, -50, 50, 52, 26, 60, { t: EM, l: EM, r: EMD }) +
    `<g transform="translate(${f1(hp[0])},${f1(hp[1])})"><rect x="-7" y="14" width="14" height="14" fill="${T0}" stroke="${INK}"/><circle r="23" fill="${T0}" stroke="${INK}"/><path d="M-23,-2 A23,23 0 0 1 23,-2 C14,-10 2,-12 -8,-8 C-14,-6 -19,-4 -23,-2Z" fill="${DK2}" stroke="${INK}"/><g fill="${T0}" stroke="${INK}"><circle cx="-11" cy="5" r="6.5"/><circle cx="5" cy="8" r="6.5"/></g><line x1="-4.5" y1="6" x2="-1.5" y2="7" stroke="${INK}"/></g>` +
    leg(6, 6) + leg(196, 6) + leg(6, 96) + leg(196, 96) + box(0, 0, 72, 210, 110, 8, { t: T0, l: T1, r: T2 }) +
    `<g id="${id}a1">${box(84, -26, 86, 10, 66, 9, { t: EM, l: EM, r: EMD })}</g><g id="${id}a2">${box(120, -26, 86, 10, 66, 9, { t: EM, l: EM, r: EMD })}</g>` +
    box(68, 34, 80, 78, 50, 4, { t: T2, l: T3, r: T3 }) + box(68, 80, 84, 78, 4, 52, { t: DK1, l: DK2, r: DK3 }) +
    `<g transform="${mLeft(84, 68, 136)}"><circle cx="39" cy="26" r="6" fill="${EM}"/></g>` +
    box(22, 62, 80, 22, 22, 20, { t: DK2, l: T0, r: T1 }) +
    `<g transform="translate(${f1(P(182, 40, 80)[0])},${f1(P(182, 40, 80)[1])})"><line x1="-12" y1="0" x2="-6" y2="-10" stroke="${INK}" stroke-width="3px"/><line x1="12" y1="0" x2="6" y2="-10" stroke="${INK}" stroke-width="3px"/><circle cy="-34" r="28" fill="${EM}" stroke="${INK}"/><circle cy="-34" r="21" fill="${T0}" stroke="${INK}"/><line id="${id}h1" x1="0" y1="-34" x2="0" y2="-51" stroke="${INK}" stroke-width="2.6px"/><line id="${id}h2" x1="0" y1="-34" x2="10" y2="-34" stroke="${INK}" stroke-width="2.6px"/><circle cy="-34" r="2.5" fill="${INK}"/></g>`;
  return { svg, set(p, e) {
    const r = d => d * Math.PI / 180, a1 = e * 1080, a2 = e * 90 + 60, h1 = document.getElementById(id + 'h1'), h2 = document.getElementById(id + 'h2'); if (!h1) return;
    h1.setAttribute('x2', f1(17 * Math.sin(r(a1)))); h1.setAttribute('y2', f1(-34 - 17 * Math.cos(r(a1))));
    h2.setAttribute('x2', f1(11 * Math.sin(r(a2)))); h2.setAttribute('y2', f1(-34 - 11 * Math.cos(r(a2))));
    const st = Math.floor(p * 90), on = p > .004 && p < .995;
    document.getElementById(id + 'a1').setAttribute('transform', `translate(0,${on && st % 2 ? -4 : 0})`);
    document.getElementById(id + 'a2').setAttribute('transform', `translate(0,${on && st % 2 === 0 ? -4 : 0})`);
  } };
}
function sValue(m, L, M) {
  const id = 'v' + (uid++), ty = M.typing, st = slabs(ty, id + 's'), en = engineer(id);
  const h = hero(m, L ? 210 : 120, L ? 60 : 195, L ? 250 : 122, L ? 'start' : 'middle', EM, L ? 560 : 0);
  const tag = P(0, 110, st.h * .55);
  const svg = `${h.svg}<g ${at([[250, 420, 1.15], [92, 330, .62]], L)}>${en.svg}</g>
    <g ${at([[900, 462, 1.45], [270, 520, .92]], L)}>${ground(20, 0, 150, 110)}${st.svg}<g id="${id}tg" transform="translate(${f1(tag[0] - 8)},${f1(tag[1])})"><line x1="0" y1="0" x2="-26" y2="-14" stroke="${INK}"/><g transform="translate(-26,-14)"><rect x="${-(fmt(ty.value).length * 9 + ty.unit.length * 15 + 82)}" y="-17" width="${fmt(ty.value).length * 9 + ty.unit.length * 15 + 82}" height="30" rx="3" fill="${T0}" stroke="${INK}"/><text class="zh" x="-9" y="4" font-size="14" text-anchor="end" fill="${INK}">人要打 ${fmt(ty.value)} ${ty.unit}</text></g></g></g>`;
  return { svg, update(p) { const e = ease(p / .8); h.set(e); st.set(seg(p, 0, .7)); en.set(p, e); document.getElementById(id + 'tg').setAttribute('opacity', f1(seg(p, .55, .7))); } };
}
window.__P = { setW: w => { CW = w; }, gpuCard, keyboard, taiwan, engineer, at, ground, C, $, reduce, DAY, iso, ymd, INK, T0, T1, T2, T3, EM, clamp, ease, fmt, esc, odo, hero, box, mTop, mLeft, P, pp, scenes: { 'gpu-days': sGpu, 'cache-saved': sCache, 'gpu-share': sRack, typing: sType, 'code-lines': sCode, laps: sLaps, rereads: sRead, energy: sEnergy, value: sValue } };
})();
