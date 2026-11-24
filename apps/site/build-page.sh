#!/bin/sh
# Build public/index.html: the design prototype wrapped in a full HTML document.
set -e
cd "$(dirname "$0")"
sh ../../design/prototype/build.sh >/dev/null
{
  printf '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Tokenburn</title>\n<meta name="description" content="看看你這一年用 AI 燒掉多少 tokens，換算成顯卡、打字和環島台灣">\n<link rel="icon" href="data:image/svg+xml,%%3Csvg xmlns=%%22http://www.w3.org/2000/svg%%22 viewBox=%%220 0 16 16%%22%%3E%%3Ccircle cx=%%228%%22 cy=%%228%%22 r=%%226%%22 fill=%%22%%23ea4a0c%%22/%%3E%%3C/svg%%3E">\n</head>\n<body>\n'
  cat ../../design/prototype/index.html
  printf '\n</body>\n</html>\n'
} > public/index.html
wc -c public/index.html
