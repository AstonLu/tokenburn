#!/bin/sh
# Rebuild design/prototype/index.html from src/, the core package and the FX engine.
set -e
cd "$(dirname "$0")"
npx -y esbuild@0.24.2 ../../packages/core/src/index.js --bundle --format=iife --global-name=PyroCore --minify --outfile=core.tmp.js
{ cat src/head.html
  printf '<script>\n'; sed 's#</script#<\\/script#g' core.tmp.js | sed 's/^"use strict";var PyroCore=/"use strict";window.PyroCore=/'; printf '\n</script>\n'
  printf '<script>\n'; sed 's#</script#<\\/script#g' ../fx/pyrofx.js; printf '\n</script>\n'
  printf '<script>\n'; cat src/a.js; printf '\n</script>\n<script>\n'; cat src/b.js; printf '\n</script>\n'; } > index.html
rm core.tmp.js
wc -c index.html
