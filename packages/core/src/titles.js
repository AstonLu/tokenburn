/**
 * Title / badge rules. Pure data + predicates; display names are Traditional Chinese.
 * Thresholds use the Summary's integer units: tokens, US cents, basis points (10000 = 100%).
 *
 * @typedef {{
 *   totalTokens: number, usdTotal: number, peakDayTokens: number, cacheHitRate: number,
 *   opusShare: number, longestStreak: number, toolCount: number,
 * }} TitleMetrics
 * @typedef {{ id: string, name: string, nameEn: string, description: string, category: string, tier: number }} Title
 * @typedef {Title & { test: (m: TitleMetrics) => boolean }} TitleRule
 */

const M = 1_000_000;
/** Minimum volume before ratio-based titles (cache, Opus share) can be earned. */
export const RATIO_MIN_TOKENS = 1 * M;

/** @type {TitleRule[]} */
export const TITLE_RULES = [
  // Total tokens burned
  { id: 'burn-1m', category: 'tokens', tier: 1, name: '點火者', nameEn: 'Igniter', description: '累計燃燒 100 萬 tokens', test: (m) => m.totalTokens >= 1 * M },
  { id: 'burn-10m', category: 'tokens', tier: 2, name: '烈焰行者', nameEn: 'Flamewalker', description: '累計燃燒 1,000 萬 tokens', test: (m) => m.totalTokens >= 10 * M },
  { id: 'burn-100m', category: 'tokens', tier: 3, name: '熔爐之主', nameEn: 'Furnace Lord', description: '累計燃燒 1 億 tokens', test: (m) => m.totalTokens >= 100 * M },
  { id: 'burn-1b', category: 'tokens', tier: 4, name: '恆星引擎', nameEn: 'Stellar Engine', description: '累計燃燒 10 億 tokens', test: (m) => m.totalTokens >= 1000 * M },
  { id: 'burn-10b', category: 'tokens', tier: 5, name: '黑洞吞噬者', nameEn: 'Black Hole', description: '累計燃燒 100 億 tokens', test: (m) => m.totalTokens >= 10000 * M },
  // Peak day
  { id: 'peak-10m', category: 'peak', tier: 1, name: '單日爆燃', nameEn: 'Flash Burn', description: '單日燃燒超過 1,000 萬 tokens', test: (m) => m.peakDayTokens >= 10 * M },
  { id: 'peak-100m', category: 'peak', tier: 2, name: '超新星', nameEn: 'Supernova', description: '單日燃燒超過 1 億 tokens', test: (m) => m.peakDayTokens >= 100 * M },
  // Cache hit rate
  { id: 'cache-80', category: 'cache', tier: 1, name: '快取達人', nameEn: 'Cache Adept', description: '快取命中率達 80%', test: (m) => m.totalTokens >= RATIO_MIN_TOKENS && m.cacheHitRate >= 8000 },
  { id: 'cache-95', category: 'cache', tier: 2, name: '快取之神', nameEn: 'Cache Deity', description: '快取命中率達 95%', test: (m) => m.totalTokens >= RATIO_MIN_TOKENS && m.cacheHitRate >= 9500 },
  // Opus share of tokens
  { id: 'opus-50', category: 'opus', tier: 1, name: 'Opus 信徒', nameEn: 'Opus Devotee', description: '過半 tokens 由 Opus 燃燒', test: (m) => m.totalTokens >= RATIO_MIN_TOKENS && m.opusShare >= 5000 },
  { id: 'opus-90', category: 'opus', tier: 2, name: '只用最好的', nameEn: 'Only The Best', description: '九成以上 tokens 由 Opus 燃燒', test: (m) => m.totalTokens >= RATIO_MIN_TOKENS && m.opusShare >= 9000 },
  // Longest daily streak
  { id: 'streak-7', category: 'streak', tier: 1, name: '七日不熄', nameEn: 'Seven Day Flame', description: '連續 7 天都有燃燒', test: (m) => m.longestStreak >= 7 },
  { id: 'streak-30', category: 'streak', tier: 2, name: '長明之火', nameEn: 'Eternal Flame', description: '連續 30 天都有燃燒', test: (m) => m.longestStreak >= 30 },
  { id: 'streak-100', category: 'streak', tier: 3, name: '百日聖火', nameEn: 'Hundred Day Torch', description: '連續 100 天都有燃燒', test: (m) => m.longestStreak >= 100 },
  // Breadth
  { id: 'tri-tool', category: 'tools', tier: 1, name: '三刀流', nameEn: 'Three Sword Style', description: 'Claude、Codex、Gemini 三種 CLI 都有使用', test: (m) => m.toolCount >= 3 },
];

/**
 * All earned titles, in rule order, without predicates (JSON-safe).
 * @param {TitleMetrics} metrics
 * @returns {Title[]}
 */
export function computeTitles(metrics) {
  return TITLE_RULES.filter((r) => r.test(metrics)).map(({ test: _t, ...t }) => t);
}
