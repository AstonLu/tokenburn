// Copies packages/core/src into packages/cli/vendor/core so the published CLI has
// zero runtime dependencies while sharing the exact same parser as the web app.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../../core/src');
const dest = join(here, '../vendor/core');
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true, force: true });
