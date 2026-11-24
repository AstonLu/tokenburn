// Metaphors: turn a usage summary into physical, human-scale comparisons.
// Pure functions, no IO. Every result carries its formula and assumptions so the page can show its working.

/** Tunable assumptions. All are estimates; the UI labels them as such. */
export const ASSUMPTIONS = {
  modelParams: 4e11,          // assumed average model size (parameters); vendors do not publish this
  h100Flops: 989e12,          // H100 SXM dense BF16 peak, FLOP/s
  utilization: 0.4,           // share of peak reached in real serving
  h100Watts: 700,             // H100 SXM board power
  pue: 1.2,                   // data-centre overhead multiplier
  iphoneWh: 13,               // one full iPhone charge, Wh
  evKwhPer100km: 15,          // efficient EV consumption
  wordsPerToken: 0.75,
  typingWpm: 40,
  tokensPerCodeLine: 10,
  linuxKernelLines: 40e6,
  charsPerToken: 4,
  mmPerChar: 2,
  earthKm: 40075,
  taiwanLoopKm: 968,          // Taiwan Cycling Route No. 1
  contextTokens: 100000,      // one full working context re-read from cache
  seniorUsdPerHour: 100,
};

const HOUR = 3600, DAY = 24, YEAR_H = 8760;

/** Pick the largest unit that keeps the value at 1 or more: years, then days, then hours, then minutes. */
export function humanDuration(hours) {
  if (hours >= YEAR_H) return { value: hours / YEAR_H, unit: '年' };
  if (hours >= DAY) return { value: hours / DAY, unit: '天' };
  if (hours >= 1) return { value: hours, unit: '小時' };
  return { value: hours * 60, unit: '分鐘' };
}

function round(v) {
  if (v >= 100) return Math.round(v);
  if (v >= 10) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

/**
 * @param {{ totals: { in: number, out: number, cr: number, cw: number, tokens: number }, usdTotal: number }} s  usdTotal in cents
 * @param {Partial<typeof ASSUMPTIONS>} [over]
 */
export function computeMetaphors(s, over = {}) {
  const A = { ...ASSUMPTIONS, ...over };
  const t = s.totals;
  const all = t.in + t.out + t.cr + t.cw;
  const computed = t.in + t.out + t.cw;            // cached reads skip the heavy recompute
  const eff = A.h100Flops * A.utilization;
  const gpuHours = tokens => (2 * A.modelParams * tokens) / eff / HOUR;
  const hNoCache = gpuHours(all), hCache = gpuHours(computed);
  const kwh = hCache * A.h100Watts / 1000 * A.pue;
  const outWords = t.out * A.wordsPerToken;
  const typingHours = outWords / A.typingWpm / 60;
  const lines = t.out / A.tokensPerCodeLine;
  const km = all * A.charsPerToken * A.mmPerChar / 1e6;
  const usd = s.usdTotal / 100;

  const d1 = humanDuration(hNoCache), d2 = humanDuration(hNoCache - hCache), d3 = humanDuration(hCache), d5 = humanDuration(typingHours);
  const earthLaps = km / A.earthKm, taiwanLaps = km / A.taiwanLoopKm;

  return [
    { id: 'gpu-days', title: '一張 H100 不眠不休要跑', value: round(d1.value), unit: d1.unit, estimate: true,
      formula: '2 × 模型參數 × 全部 tokens ÷ (H100 算力 × 利用率)',
      note: `假設模型 ${A.modelParams / 1e8} 億參數，H100 每秒 ${A.h100Flops / 1e12} 兆次運算、利用率 ${A.utilization * 100}%`, raw: { hours: hNoCache } },
    { id: 'cache-saved', title: '快取幫你省下的 H100 時間', value: round(d2.value), unit: d2.unit, estimate: true,
      formula: '沒有快取的顯卡時間 − 實際需要重算的顯卡時間',
      note: '讀取快取的 tokens 不需重新運算', raw: { hours: hNoCache - hCache, withCache: hCache } },
    { id: 'gpu-share', title: hCache >= YEAR_H ? '你等於獨占幾張 H100 整整一年' : '一張 H100 整年裡專門為你運轉', value: hCache >= YEAR_H ? round(hCache / YEAR_H) : round(d3.value), unit: hCache >= YEAR_H ? '張' : d3.unit, estimate: true,
      formula: '實際重算的顯卡小時 ÷ 一年 8,760 小時', note: '有快取後的實際用量', raw: { hours: hCache } },
    { id: 'typing', title: 'AI 寫出來的字，人要打', value: round(d5.value), unit: d5.unit, estimate: false,
      formula: '輸出 tokens × 0.75 字 ÷ 每分鐘 40 字', note: '不吃不睡連續打字', raw: { hours: typingHours, words: outWords } },
    { id: 'code-lines', title: 'AI 幫你寫的程式', value: round(lines / 1e4), unit: '萬行', estimate: false,
      formula: '輸出 tokens ÷ 每行 10 tokens', note: lines / A.linuxKernelLines >= 0.01 ? `約 ${round(lines / A.linuxKernelLines)} 個 Linux 核心（約 4,000 萬行）` : `約 ${round(lines / 15000)} 本 300 頁的書`, raw: { lines, linux: lines / A.linuxKernelLines } },
    { id: 'laps', title: earthLaps >= 1 ? '把 tokens 排成一行字，可以繞地球' : taiwanLaps >= 1 ? '把 tokens 排成一行字，可以環島' : '把 tokens 排成一行字，長度有', value: earthLaps >= 1 ? round(earthLaps) : taiwanLaps >= 1 ? round(taiwanLaps) : round(km), unit: earthLaps >= 1 || taiwanLaps >= 1 ? '圈' : '公里', estimate: false,
      formula: 'tokens × 4 字元 × 每字 2 公釐', note: `總長 ${Math.round(km).toLocaleString('en-US')} 公里，等於環島 ${round(taiwanLaps)} 圈`, raw: { km, earthLaps, taiwanLaps } },
    { id: 'rereads', title: 'AI 把你的整個專案重讀了', value: round(t.cr / A.contextTokens), unit: '次', estimate: false,
      formula: '快取讀取 tokens ÷ 一次約 10 萬 tokens 的上下文', note: '每次對話都從頭讀一遍你的程式碼', raw: {} },
    { id: 'energy', title: '這些算力用掉的電，夠 iPhone 充飽', value: round(kwh * 1000 / A.iphoneWh), unit: '次', estimate: true,
      formula: '顯卡小時 × 700 瓦 × 機房係數 1.2', note: `共 ${round(kwh)} 度電，夠電動車開 ${Math.round(kwh / A.evKwhPer100km * 100).toLocaleString('en-US')} 公里`, raw: { kwh, evKm: kwh / A.evKwhPer100km * 100 } },
    { id: 'value', title: '但這一切的等效價值，只等於資深工程師工作', value: round(humanDuration(usd / A.seniorUsdPerHour).value), unit: humanDuration(usd / A.seniorUsdPerHour).unit, estimate: false,
      formula: '等效 API 價值 ÷ 時薪 100 美元', note: `對比：AI 的輸出量人要打 ${round(d5.value)} ${d5.unit}`, raw: { usd } },
  ];
}
