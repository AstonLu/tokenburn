import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** @param {string} dir @param {(name: string) => boolean} match @returns {string[]} */
export function walk(dir, match) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, match));
    else if (match(name)) out.push(p);
  }
  return out.sort();
}
export const read = (p) => readFileSync(p, 'utf8');
