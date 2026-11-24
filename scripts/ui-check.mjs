#!/usr/bin/env node
// Browser check against a running site (default: local wrangler dev on :8787).
// Loads the home page, reads this machine's Claude logs through the folder picker, publishes,
// follows the redirect to /u/:id and checks the numbers there, then screenshots both widths.
//   node scripts/ui-check.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // preinstalled; run with NODE_PATH pointing at it if needed
import { cpSync, mkdtempSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const OUT = process.argv[3] || mkdtempSync(join(tmpdir(), 'tokenburn-ui-'));
const logs = mkdtempSync(join(tmpdir(), 'tokenburn-ui-logs-'));
if (existsSync(join(homedir(), '.claude/projects'))) cpSync(join(homedir(), '.claude/projects'), join(logs, 'projects'), { recursive: true });

const fail = (m) => { console.error('UI FAIL', m); process.exit(1); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.HTTPS_PROXY && !/127\.0\.0\.1|localhost/.test(BASE) ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const errors = [];
for (const [tag, vp] of [['d', { width: 1440, height: 900 }], ['m', { width: 393, height: 852 }]]) {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  const r = await p.goto(BASE + '/', { waitUntil: 'load' });
  if (r.status() !== 200) fail(`home ${r.status()}`);
  await p.waitForTimeout(1500);
  if ((await p.textContent('#src')).trim() !== '範例資料') fail('home is not in sample mode');
  if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail(`${tag}: horizontal scroll`);
  await p.screenshot({ path: join(OUT, `${tag}-home.png`) });
  if (tag === 'm') { await ctx.close(); continue; }
  await p.setInputFiles('#dir', join(logs, 'projects'));
  await p.waitForFunction(() => document.querySelector('#src')?.textContent.includes('我的資料'), null, { timeout: 30000 });
  const localTokens = await p.evaluate(() => window.__pyro && document.querySelector('.fact.big b')?.textContent);
  if (await p.isHidden('#publish')) fail('publish button hidden in mine mode');
  await p.click('#publish');
  await p.click('#sheet-ok');
  await p.waitForURL(/\/u\/[a-z2-7]{8}$/, { timeout: 30000 });
  await p.waitForTimeout(2000);
  if ((await p.textContent('#src')).trim() !== '公開紀錄') fail('profile page not in profile mode');
  const remoteTokens = await p.evaluate(() => document.querySelector('.fact.big b')?.textContent);
  if (localTokens !== remoteTokens) fail(`token total differs: local ${localTokens} vs profile ${remoteTokens}`);
  const og = await p.getAttribute('meta[property="og:image"]', 'content');
  if (!og || !/\/og\.png$/.test(og)) fail('og:image missing');
  await p.screenshot({ path: join(OUT, `${tag}-profile.png`) });
  console.log(`published ${p.url()} with ${remoteTokens} tokens`);
  // re-publish from the same browser updates the same profile
  await p.goto(BASE + '/'); await p.setInputFiles('#dir', join(logs, 'projects'));
  await p.waitForFunction(() => document.querySelector('#src')?.textContent.includes('我的資料'), null, { timeout: 30000 });
  const first = p.url();
  await p.click('#publish'); await p.click('#sheet-ok'); await p.waitForURL(/\/u\//, { timeout: 30000 });
  console.log(`re-publish went to ${p.url()}`);
  await ctx.close();
}
await b.close();
if (errors.length) fail(errors.join('\n'));
console.log('UI PASS ->', OUT);
