// Filesystem IO for the CLI. Finds log files and feeds them to the core aggregator.
// Only token counts, model ids and timestamps are extracted; nothing else is kept.
import { createReadStream } from 'node:fs';
import { opendir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { createAggregator } from '../vendor/core/index.js';

/**
 * Recursively yield files under `dir` whose name matches. Missing dirs yield nothing;
 * symlinked directories are not followed (avoids loops).
 * @param {string} dir
 * @param {(name: string) => boolean} match
 * @param {number} [maxDepth]
 * @returns {AsyncGenerator<string>}
 */
export async function* walk(dir, match, maxDepth = 12) {
  if (maxDepth < 0) return;
  let handle;
  try {
    handle = await opendir(dir);
  } catch {
    return;
  }
  for await (const ent of handle) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p, match, maxDepth - 1);
    else if ((ent.isFile() || ent.isSymbolicLink()) && match(ent.name)) yield p;
  }
}

/** @param {NodeJS.ProcessEnv} env */
export function claudeRoots(env = process.env) {
  const home = homedir();
  const roots = [join(home, '.config/claude/projects'), join(home, '.claude/projects')];
  if (env.CLAUDE_CONFIG_DIR) for (const d of env.CLAUDE_CONFIG_DIR.split(',')) if (d.trim()) roots.push(join(d.trim(), 'projects'));
  return roots;
}

/** @param {string[]} dirs */
async function uniqueExisting(dirs) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const d of dirs) {
    try {
      if ((await stat(d)).isDirectory()) out.add(await realpath(d));
    } catch {
      /* missing */
    }
  }
  return [...out];
}

/**
 * @typedef {{ files: number, records: number, duplicates: number }} ToolCount
 * @typedef {{ claude: ToolCount, codex: ToolCount, gemini: ToolCount }} ScanCounts
 */

/**
 * Scan all supported CLIs on this machine.
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
export async function scanAll(opts = {}) {
  const env = opts.env ?? process.env;
  const home = homedir();
  const agg = createAggregator();
  /** @type {ScanCounts} */
  const counts = {
    claude: { files: 0, records: 0, duplicates: 0 },
    codex: { files: 0, records: 0, duplicates: 0 },
    gemini: { files: 0, records: 0, duplicates: 0 },
  };
  /** @param {'claude'|'codex'|'gemini'} tool @param {() => Promise<void>} fn */
  const track = async (tool, fn) => {
    const before = agg.stats();
    try {
      await fn();
    } catch {
      /* unreadable file: skip */
    }
    const after = agg.stats();
    counts[tool].files++;
    counts[tool].records += after.records - before.records;
    counts[tool].duplicates += after.duplicates - before.duplicates;
  };

  /** @type {Set<string>} */
  const seenFiles = new Set();
  for (const root of await uniqueExisting(claudeRoots(env))) {
    for await (const file of walk(root, (n) => n.endsWith('.jsonl'))) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      await track('claude', async () => {
        const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
        for await (const line of rl) agg.addClaudeLine(line);
      });
    }
  }

  const codexHome = env.CODEX_HOME || join(home, '.codex');
  for (const root of await uniqueExisting([join(codexHome, 'sessions')])) {
    for await (const file of walk(root, (n) => n.startsWith('rollout-') && n.endsWith('.jsonl'))) {
      await track('codex', async () => agg.addCodexFile(await readFile(file, 'utf8')));
    }
  }

  for (const root of await uniqueExisting([join(home, '.gemini/tmp')])) {
    for await (const file of walk(root, (n) => n.startsWith('session-') && n.endsWith('.json'), 3)) {
      if (!file.includes(`${sep}chats${sep}`)) continue;
      await track('gemini', async () => agg.addGeminiFile(await readFile(file, 'utf8')));
    }
  }

  return { rows: agg.rows(), counts };
}
