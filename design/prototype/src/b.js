var flame = null;
(function () {
'use strict';
const { C, $, reduce, DAY, iso, ymd, INK, T0, T1, T2, T3, EM, clamp, ease, fmt, esc, hero, box, P, pp, mTop, scenes, setW, gpuCard, keyboard, taiwan, engineer } = window.__P;
const SHORT = { 'gpu-days': () => '一張 H100 要連跑', typing: () => 'AI 寫的字，人要打', laps: m => m.unit === '圈' ? '全部 tokens 排成一行，環島台灣' : '全部 tokens 排成一行', value: () => '等效價值，只值工程師' };
const ORDER = ['gpu-days', 'cache-saved', 'gpu-share', 'typing', 'code-lines', 'laps', 'rereads', 'energy', 'value'];
const NOTE_IN_SCENE = { 'code-lines': 1, value: 1, energy: 1 };

// Example data, labelled 範例資料 in the bar
function sampleRows() {
  let seed = 7; const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const end = Date.UTC(2026, 10, 23), rows = [];
  const mix = [['claude-opus-4-5', 'claude', .58], ['claude-sonnet-4-5', 'claude', .2], ['gpt-5-codex', 'codex', .11], ['gemini-2.5-pro', 'gemini', .07], ['claude-haiku-4-5', 'claude', .04]];
  for (let i = 364; i >= 0; i--) {
    const t = end - i * DAY, dow = new Date(t).getUTCDay(), we = dow === 0 || dow === 6;
    if (r() < (we ? .35 : .08) && i > 20) continue;
    const ramp = .35 + 1.25 * Math.pow((365 - i) / 365, 1.5);
    let day = ramp * (10 + 52 * Math.pow(r(), 1.6)) * 1e6 * (we ? .6 : 1) * (dow === 2 || dow === 3 ? 1.18 : 1);
    if (i === 41) day = 212e6; if (i === 12) day = 168e6; if (i === 96) day = 151e6;
    for (const [model, tool, share] of mix) {
      const v = day * share * (.75 + r() * .5);
      rows.push({ d: iso(t), tool, model, in: Math.round(v * .006), out: Math.round(v * .034), cr: Math.round(v * .9), cw: Math.round(v * .06), cw1h: Math.round(v * .02), think: Math.round(v * .012), n: Math.round(v / 140000) + 1 });
    }
  }
  return rows;
}
const SAMPLE_NOW = Date.UTC(2026, 10, 23, 12);
const S = { rows: null, mine: false, list: [], sum: null, mets: null };
const isL = () => innerWidth > 720;
let wasL = isL();
const big = n => n >= 1e8 ? { value: Math.round(n / 1e7) / 10, unit: '億' } : n >= 1e4 ? { value: Math.round(n / 1e3) / 10, unit: '萬' } : { value: Math.round(n), unit: '' };
const colOf = m => /opus/.test(m) ? 'ember' : /sonnet/.test(m) ? 'amber' : /haiku/.test(m) ? 'sand' : /gemini/.test(m) ? 'cobalt' : /gpt|codex|^o\d/.test(m) ? 'graphite' : 'ember';
const MCOL = { ember: '#ea4a0c', amber: '#f0a030', sand: '#d9b48a', graphite: '#3a3632', cobalt: '#2f6fdc' };
const ICON = {
  'gpu-days': `<circle cx="22" cy="22" r="17" fill="${INK}"/>${[0, 72, 144, 216, 288].map(a => `<path transform="rotate(${a} 22 22)" d="M22,19 C28,14 32,10 28,6 C23,6 20,12 22,19Z" fill="${T1}"/>`).join('')}<circle cx="22" cy="22" r="3.5" fill="${EM}"/>`,
  typing: `<rect x="5" y="14" width="34" height="20" rx="3" fill="${T0}" stroke="${INK}"/>${[0, 1, 2, 3].map(i => `<rect x="${9 + i * 7}" y="18" width="5" height="5" fill="${i === 3 ? EM : INK}"/>`).join('')}<rect x="12" y="27" width="20" height="4" fill="${INK}"/>`,
  laps: `<circle cx="22" cy="22" r="14" fill="${T1}" stroke="${INK}"/><ellipse cx="22" cy="22" rx="20" ry="6" fill="none" stroke="${EM}" stroke-width="2.4px" transform="rotate(-18 22 22)"/>`,
  value: `<line x1="22" y1="8" x2="22" y2="38" stroke="${INK}"/><line x1="6" y1="16" x2="38" y2="9" stroke="${INK}" stroke-width="2.4px"/><rect x="2" y="24" width="12" height="8" fill="${INK}"/><circle cx="37" cy="20" r="5" fill="${EM}" stroke="${INK}"/><line x1="14" y1="38" x2="30" y2="38" stroke="${INK}" stroke-width="2.4px"/>`
};

function build() {
  const L = isL(); wasL = L; setW(L ? 1200 : 390);
  const s = S.sum, mets = S.mets, M = Object.fromEntries(mets.map(m => [m.id, m])), per = `${ymd(s.firstDay)}–${ymd(s.lastDay)}`;
  $('src').innerHTML = `<b>${S.mine ? '我的資料' : '範例資料'}</b>`;
  $('pick').textContent = S.mine ? '回到範例' : '讀取我的紀錄';
  const main = $('main'); let html = '';
  const tk = big(s.totals.tokens);
  setW(L ? 1200 : 390);
  const tw0 = taiwan('itw', M.laps.raw.taiwanLaps, { maxL: 3 }), en0 = engineer('ien'), kb0 = keyboard('ikb');
  const usd = c => '$' + (c >= 100000 ? Math.round(c / 100).toLocaleString('en-US') : (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const tokS = n => { const q = big(n); return fmt(q.value) + (q.unit ? ' ' + q.unit : ''); };
  const loopKm = (C.ASSUMPTIONS && C.ASSUMPTIONS.taiwanLoopKm) || 968;
  const TILE = [
    ['gpu-days', gpuCard(), 'translate(196,112) scale(.94)', '全部模型的 tokens，換成一張 H100 連續運算的時間'],
    ['typing', kb0.svg, 'translate(188,70) scale(.9)', '全部模型輸出的字，人以每分鐘 40 字連續打完的時間'],
    ['laps', tw0.svg, 'translate(330,216) scale(.86)', M.laps.unit === '圈' ? `全部 tokens 排成一行字的長度，環島一圈 ${loopKm} 公里` : '全部 tokens 排成一行字的長度'],
    ['value', en0.svg, 'translate(238,258) scale(1.26)', '等效 API 價值，換成時薪 100 美元的資深工程師工時']
  ];
  const totTok = s.perModel.reduce((a, m) => a + m.tokens, 0) || 1;
  const pct = v => { const q = v * 100; return (q >= 10 ? Math.round(q) : q >= 1 ? q.toFixed(1) : q > 0 ? '<1' : '0') + '%'; };
  html += `<section class="intro"><div class="dash">
    <div class="facts">
      <div class="fact big burn"><canvas id="flame" class="flame" aria-hidden="true"></canvas><span class="lb">總 tokens 燃燒量</span><b title="${s.totals.tokens.toLocaleString('en-US')} tokens">${fmt(tk.value)}<em>${tk.unit}</em></b></div>
      <div class="fact big"><span class="lb">等效 API 價值</span><b class="em">${usd(s.usdTotal)}</b></div>
      <div class="fact span"><span class="v">${per}　${s.activeDays} 天</span></div>
    </div>
    <div class="models">
      <div class="mbar" role="img" aria-label="各模型 tokens 占比">${s.perModel.map(m => `<i style="flex:${Math.max(m.tokens / totTok, .004)};background:${MCOL[colOf(m.model)]}" title="${esc(m.model)} ${pct(m.tokens / totTok)}"></i>`).join('')}</div>
      <table><tbody>${s.perModel.map(m => `<tr><td><i class="dot" style="background:${MCOL[colOf(m.model)]}"></i>${esc(m.model)}</td><td title="${m.tokens.toLocaleString('en-US')} tokens · ${pct(m.tokens / totTok)}">${tokS(m.tokens)}</td><td>${usd(m.usd)}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="tiles">${TILE.map(v => { const m = M[v[0]]; return `<a class="tile" href="#sc-${v[0]}" title="${esc(v[3])}"><svg viewBox="0 0 660 440" aria-hidden="true"><g transform="${v[2]}">${v[1]}</g></svg><span class="tt">${SHORT[v[0]](m)}</span><b${v[0] === 'value' ? ' class="em"' : ''}>${fmt(m.value)}<em>${m.unit}</em></b></a>`; }).join('')}</div>
  </div></section>`;
  setW(L ? 1200 : 390); S.list = [];
  ORDER.forEach((id, i) => {
    const m = M[id]; if (!m) return;
    const api = scenes[id](m, L, M);
    html += `<section class="sc" id="sc-${id}" data-id="${id}"><div class="stage"><h2><small>${i + 1}/9</small>${esc(m.title)}</h2><svg viewBox="0 0 ${L ? 1200 : 390} ${L ? 660 : 640}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(m.title)} ${fmt(m.value)} ${m.unit}">${api.svg}</svg></div></section>`;
    S.list.push({ id, api, sp: -1 });
  });
  const pick = ['gpu-days', 'typing', 'laps', 'value'].map(id => M[id]);
  const text = `我這一年燒掉 ${fmt(tk.value)} ${tk.unit} tokens。${pick[0].title} ${fmt(pick[0].value)} ${pick[0].unit}，${pick[1].title} ${fmt(pick[1].value)} ${pick[1].unit}`;
  html += `<section class="end"><div class="card"><h3>Tokenburn</h3><div class="per">${S.mine ? '' : '範例資料　'}${per}　${fmt(tk.value)} ${tk.unit} tokens</div><ul>${pick.map(m => `<li><svg viewBox="0 0 44 44" aria-hidden="true">${ICON[m.id]}</svg><span>${esc(m.title)}</span><b>${fmt(m.value)}<em>${m.unit}</em></b></li>`).join('')}</ul></div>
    <div class="acts"><a class="btn em" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}">分享到 X</a><a class="btn" target="_blank" rel="noopener" href="https://www.threads.net/intent/post?text=${encodeURIComponent(text)}">分享到 Threads</a><button class="btn" type="button" id="copy">複製文字</button></div>
    <details class="algo"><summary>算法</summary><dl>${ORDER.map(id => M[id]).filter(Boolean).map(m => `<dt>${esc(m.title)} ${fmt(m.value)} ${m.unit}${m.estimate ? '（估算）' : ''}</dt><dd>${esc(m.formula)}。${esc(m.note)}</dd>`).join('')}</dl></details></section>`;
  main.innerHTML = html;
  if (flame) { try { flame.destroy(); } catch (e) {} flame = null; }
  const fc = $('flame');
  if (fc && !reduce && window.PyroFX && PyroFX.supported()) { try { flame = PyroFX.fire(fc, { quality: 'low' }); if (flame) flame.setHeat(.62); } catch (e) { flame = null; } }
  S.list.forEach(sc => { sc.el = main.querySelector(`.sc[data-id="${sc.id}"]`); sc.root = sc.el.querySelector('svg'); });
  $('copy').onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => say('已複製'), () => say('無法複製')); };
  S.intro = null;
  tw0.set(1, false); en0.set(0, .3);
  S.ifans = main.querySelectorAll('.intro .fan'); S.mix = mixOf(s);
}
function load(rows, mine) {
  S.rows = rows; S.mine = mine;
  S.sum = C.computeSummary(rows, { now: mine ? Date.now() : SAMPLE_NOW });
  S.mets = C.computeMetaphors(S.sum);
  build();
}

// ---------- Ink between scenes ----------
const cv = $('ink'), veil = $('veil'); let ink = null;
if (!reduce && window.PyroFX && PyroFX.supported()) { try { ink = PyroFX.ink(cv, { quality: 'auto' }); } catch (e) { ink = null; } }
if (!ink) { cv.hidden = true; veil.hidden = true; }
function mixOf(s) { const col = m => /opus/.test(m) ? 'ember' : /sonnet/.test(m) ? 'amber' : /haiku/.test(m) ? 'sand' : /gemini/.test(m) ? 'cobalt' : /gpt|codex|^o\d/.test(m) ? 'graphite' : 'ember'; const tot = s.perModel.reduce((a, m) => a + m.tokens, 0) || 1; return s.perModel.map(m => [col(m.model), m.tokens / tot]); }
const pickInk = () => { let r = Math.random(), a = 0; for (const [c, w] of S.mix || []) { a += w; if (r <= a) return c; } return 'ember'; };
let lastY = scrollY, movedAt = 0, pourAcc = 0, veilO = 1, fanA = 0, lp = null;
addEventListener('pointermove', e => { if (!ink || e.pointerType === 'touch') return; const x = e.clientX / innerWidth, y = e.clientY / innerHeight; if (lp) ink.stir(x, y, x - lp[0], y - lp[1]); lp = [x, y]; }, { passive: true });
document.addEventListener('pointerleave', () => { lp = null; });

let last = performance.now();
function frame(t) {
  const dt = Math.min(64, t - last); last = t;
  const vh = innerHeight; let cur = 0;
  if (S.intro) { const f = reduce ? 1 : ease((t - S.intro.t0) / 1500); S.intro.set(f); if (f >= 1) S.intro = null; }
  S.list.forEach((sc, i) => {
    const r = sc.el.getBoundingClientRect();
    if (r.top < vh * .5) cur = i + 1;
    if (r.bottom < -50 || r.top > vh + 50) return;
    const p = reduce ? 1 : clamp(-r.top / Math.max(1, r.height - vh));
    if (sc.sp < 0) sc.sp = p; else { sc.sp += (p - sc.sp) * Math.min(1, dt / 110); if (Math.abs(p - sc.sp) < .0004) sc.sp = p; }
    try { sc.api.update(sc.sp, dt, sc.root); } catch (e) { if (!sc.err) { sc.err = 1; console.error(sc.id, e); } }
  });
  $('idx').textContent = cur ? `${Math.min(cur, 9)} / 9` : '';
  if (S.ifans && S.ifans.length && scrollY < vh && !reduce) { fanA = (fanA + dt * .25) % 360; S.ifans.forEach((f, i) => f.setAttribute('transform', `rotate(${(i ? -fanA : fanA).toFixed(1)})`)); }
  if (flame && scrollY < vh) flame.frame(t);
  if (ink) {
    // T = how close a scene boundary is to the middle of the screen
    let T = 0; const n = S.list.length;
    S.list.forEach((sc, i) => { const r = sc.el.getBoundingClientRect(); T = Math.max(T, 1 - Math.abs(r.top - vh * .5) / (vh * .52)); if (i === n - 1) T = Math.max(T, 1 - Math.abs(r.bottom - vh * .5) / (vh * .52)); });
    T = clamp(T);
    if (Math.abs(scrollY - lastY) > .5) movedAt = t; lastY = scrollY;
    if (T > .1 && t - movedAt < 260) { pourAcc += dt * 16 * T; while (pourAcc >= 1000) { pourAcc -= 1000; ink.pour(.08 + .84 * Math.random(), .35 + .55 * T * Math.random(), pickInk()); } }
    const vo = .93 * (1 - Math.min(1, T * 1.6)); veilO += (vo - veilO) * Math.min(1, dt / 320); veil.style.opacity = veilO.toFixed(3);
    ink.frame(t);
  }
  requestAnimationFrame(frame);
}

// ---------- Reading local logs ----------
const kindOf = path => { const n = path.split('/').pop(); if (/^rollout-.*\.jsonl$/.test(n)) return 'codex'; if (/\.jsonl$/.test(n)) return 'claude'; if (/^session-.*\.json$/.test(n) && /chats\//.test(path)) return 'gemini'; return null; };
const toast = $('toast'); let tt;
function say(m, keep) { toast.textContent = m; toast.hidden = false; clearTimeout(tt); if (!keep) tt = setTimeout(() => toast.hidden = true, 2200); }
let depth = 0;
async function ingest(files) {
  depth = 0; $('drop').hidden = true;
  const list = files.map(f => ({ f, p: f.webkitRelativePath || f._path || f.name })).map(x => (x.k = kindOf(x.p), x)).filter(x => x.k);
  if (!list.length) { say('這個資料夾裡沒有紀錄檔'); return; }
  const agg = C.createAggregator();
  for (let i = 0; i < list.length; i++) {
    try { const t = await list[i].f.text(); list[i].k === 'claude' ? agg.addClaudeFile(t) : list[i].k === 'codex' ? agg.addCodexFile(t) : agg.addGeminiFile(t); } catch (e) {}
    if (i % 25 === 0) { say(`解析中 ${i + 1} / ${list.length}`, true); await new Promise(r => setTimeout(r)); }
  }
  toast.hidden = true;
  const rows = agg.rows();
  if (!rows.length) { say('紀錄檔裡沒有用量資料'); return; }
  scrollTo({ top: 0 }); if (ink) ink.reset(); load(rows, true);
}
const dir = $('dir');
$('pick').onclick = () => { if (S.mine) { scrollTo({ top: 0 }); load(sampleRows(), false); } else dir.click(); };
dir.onchange = () => { if (dir.files.length) ingest([...dir.files]); dir.value = ''; };
async function walk(e, pre, out) {
  if (e.isFile) await new Promise(res => e.file(f => { f._path = pre + f.name; out.push(f); res(); }, res));
  else if (e.isDirectory) { const rd = e.createReader(); let b; do { b = await new Promise(res => rd.readEntries(res, () => res([]))); for (const x of b) await walk(x, pre + e.name + '/', out); } while (b.length); }
}
addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { depth++; $('drop').hidden = false; } });
addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) $('drop').hidden = true; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', async e => { e.preventDefault(); const it = [...(e.dataTransfer?.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean); const out = []; if (it.length) for (const x of it) await walk(x, '', out); else out.push(...(e.dataTransfer?.files || [])); ingest(out); });
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (isL() !== wasL) build(); if (ink) ink.resize(); }, 150); });

window.__pyro = { load, sampleRows };  // test hook: load(rows, mine)
load(sampleRows(), false);
requestAnimationFrame(frame);
})();
