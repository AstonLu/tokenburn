#!/usr/bin/env node
import { main } from '../src/main.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`pyrometer: ${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  },
);
