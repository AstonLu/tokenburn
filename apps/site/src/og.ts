// 1200x630 share image: token total, dollar value and four metaphors, in the page's paper-and-ember style.
import { ImageResponse } from 'workers-og';
import tc700 from './fonts/noto-sans-tc-700.woff';
import tc900 from './fonts/noto-sans-tc-900.woff';
import bsd900 from './fonts/big-shoulders-900.woff';

type Summary = { totals: { tokens: number }; usdTotal: number; firstDay: string | null; lastDay: string | null };
type Metaphor = { id: string; title: string; value: number; unit: string };

const PAPER = '#faf8f4';
const INK = '#1d1a17';
const QUIET = '#8a8279';
const EMBER = '#ea4a0c';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : String(v));
function bigTokens(n: number) {
  if (n >= 1e8) return { v: (Math.round(n / 1e7) / 10).toString(), u: '億' };
  if (n >= 1e4) return { v: (Math.round(n / 1e3) / 10).toString(), u: '萬' };
  return { v: String(n), u: '' };
}
const usd = (cents: number) => '$' + (cents >= 100000 ? Math.round(cents / 100).toLocaleString('en-US') : (cents / 100).toFixed(2));
const SHORT: Record<string, (m: Metaphor) => string> = {
  'gpu-days': () => '一張 H100 要連跑',
  typing: () => 'AI 寫的字，人要打',
  laps: (m) => (m.unit === '圈' ? '排成一行字，環島台灣' : '排成一行字'),
  value: () => '等效價值，只值工程師',
};

export async function renderOg(s: Summary, mets: Metaphor[]): Promise<Response> {
  const t = bigTokens(s.totals.tokens);
  const per = s.firstDay && s.lastDay ? `${s.firstDay.replace(/-/g, '/')}–${s.lastDay.replace(/-/g, '/')}` : '';
  const by = Object.fromEntries(mets.map((m) => [m.id, m]));
  const fs = Math.min(172, Math.floor(1900 / (t.v.length + usd(s.usdTotal).length)));
  const four = ['gpu-days', 'typing', 'laps', 'value'].map((id) => by[id]).filter(Boolean) as Metaphor[];

  const cell = (m: Metaphor, i: number) => `
    <div style="display:flex;flex-direction:column;width:250px;padding-left:${i ? 22 : 0}px;border-left:${i ? `2px solid #e3ddd3` : '0'};margin-left:${i ? 22 : 0}px">
      <div style="display:flex;font-family:TC;font-weight:700;font-size:20px;color:${INK}">${esc(SHORT[m.id](m))}</div>
      <div style="display:flex;align-items:flex-end;margin-top:6px">
        <div style="display:flex;font-family:BSD;font-size:76px;line-height:1;color:${m.id === 'value' ? EMBER : INK}">${esc(fmt(m.value))}</div>
        <div style="display:flex;font-family:TC;font-weight:900;font-size:24px;margin:0 0 8px 6px;color:${m.id === 'value' ? EMBER : INK}">${esc(m.unit)}</div>
      </div>
    </div>`;

  const html = `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};padding:56px 64px 60px;justify-content:space-between;color:${INK}">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center">
        <div style="display:flex;width:18px;height:18px;border-radius:9px;background:${EMBER};margin-right:12px"></div>
        <div style="display:flex;font-family:BSD;font-size:34px;letter-spacing:1px">TOKENBURN</div>
      </div>
      <div style="display:flex;font-family:TC;font-weight:700;font-size:22px;color:${QUIET}">${esc(per)}</div>
    </div>
    <div style="display:flex;align-items:flex-end">
      <div style="display:flex;flex-direction:column">
        <div style="display:flex;font-family:TC;font-weight:700;font-size:22px;color:${QUIET}">總 tokens 燃燒量</div>
        <div style="display:flex;align-items:flex-end">
          <div style="display:flex;font-family:BSD;font-size:${fs}px;line-height:1;margin-top:8px">${esc(t.v)}</div>
          <div style="display:flex;font-family:TC;font-weight:900;font-size:46px;margin:0 0 14px 8px">${esc(t.u)}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;margin-left:64px">
        <div style="display:flex;font-family:TC;font-weight:700;font-size:22px;color:${QUIET}">等效 API 價值</div>
        <div style="display:flex;font-family:BSD;font-size:${fs}px;line-height:1;margin-top:8px;color:${EMBER}">${esc(usd(s.usdTotal))}</div>
      </div>
    </div>
    <div style="display:flex;height:2px;background:${INK};margin:8px 0 0"></div>
    <div style="display:flex">${four.map(cell).join('')}</div>
  </div>`;

  return new ImageResponse(html.replace(/>\s+</g, '><').trim(), {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'TC', data: tc700 as ArrayBuffer, weight: 700, style: 'normal' },
      { name: 'TC', data: tc900 as ArrayBuffer, weight: 900, style: 'normal' },
      { name: 'BSD', data: bsd900 as ArrayBuffer, weight: 900, style: 'normal' },
    ],
  });
}
