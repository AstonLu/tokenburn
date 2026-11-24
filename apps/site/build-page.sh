#!/bin/sh
# Build public/index.html: the design prototype wrapped in a full HTML document.
set -e
cd "$(dirname "$0")"
sh ../../design/prototype/build.sh >/dev/null
{
  printf '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Tokenburn</title>\n<meta name="description" content="看看你這一年用 AI 燒掉多少 tokens，換算成顯卡、打字和環島台灣">\n<link rel="icon" href="data:image/svg+xml,%%3Csvg xmlns=%%22http://www.w3.org/2000/svg%%22 viewBox=%%220 0 16 16%%22%%3E%%3Ccircle cx=%%228%%22 cy=%%228%%22 r=%%226%%22 fill=%%22%%23ea4a0c%%22/%%3E%%3C/svg%%3E">\n</head>\n<body>\n'
  python3 - <<'PY'
import re
html = open('../../design/prototype/index.html', encoding='utf-8').read()
faces = [('Noto Sans TC', 'noto-sans-tc', [400, 500, 700, 900]), ('Big Shoulders Display', 'big-shoulders', [800, 900]), ('JetBrains Mono', 'jetbrains-mono', [500, 700])]
css = ''.join(f"@font-face{{font-family:'{fam}';font-weight:{w};font-style:normal;font-display:swap;src:url(/fonts/{slug}-{w}.woff2) format('woff2')}}" for fam, slug, ws in faces for w in ws)
pre = ''.join(f'<link rel="preload" href="/fonts/{f}" as="font" type="font/woff2" crossorigin>' for f in ['big-shoulders-900.woff2', 'noto-sans-tc-700.woff2'])
html = re.sub(r'<link rel="preconnect" href="https://fonts\.g[^>]*>\s*', '', html)
html, n = re.subn(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^>]*>', pre + '<style>' + css + '</style>', html)
assert n == 1, 'google fonts link not found'
print(html, end='')
PY
  printf '\n</body>\n</html>\n'
} > public/index.html
wc -c public/index.html
