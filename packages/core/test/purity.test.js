import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('core src never imports node built-ins (runs in a browser Web Worker)', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '../src');
  for (const f of readdirSync(src)) {
    const text = readFileSync(join(src, f), 'utf8');
    const specs = [...text.matchAll(/(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const s of specs) assert.ok(s.startsWith('./'), `${f} imports ${s}`);
    assert.doesNotMatch(text, /\brequire\(|process\.|Buffer\b/, f);
  }
});
