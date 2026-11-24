#!/bin/sh
# Subset the page fonts to the characters the page can show, via Google Fonts' text= API (woff2),
# so production serves ~100 KB of fonts instead of whole CJK families. Run after changing page copy.
# Fonts: Noto Sans TC, Big Shoulders Display, JetBrains Mono (SIL OFL 1.1).
set -e
cd "$(dirname "$0")"
sh ../../design/prototype/build.sh >/dev/null
python3 - > src/fonts/page/chars.txt <<'PY'
import re
src = open('../../design/prototype/index.html', encoding='utf-8').read()
cjk = {c for c in src if ord(c) > 0x7e}
ascii_ = {chr(i) for i in range(0x20, 0x7f)}
print(''.join(sorted(cjk | ascii_)), end='')
PY
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
T=$(python3 -c "import urllib.parse;print(urllib.parse.quote(open('src/fonts/page/chars.txt',encoding='utf-8').read()))")
get() { u=$(curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=$1&text=$T" | grep -o "https://fonts.gstatic.com/[^)]*" | head -1); curl -s -o "src/fonts/page/$2" "$u"; printf '%s %s\n' "$2" "$(wc -c < src/fonts/page/$2)"; }
for w in 400 500 700 900; do get "Noto+Sans+TC:wght@$w" "noto-sans-tc-$w.woff2"; done
for w in 800 900; do get "Big+Shoulders+Display:wght@$w" "big-shoulders-$w.woff2"; done
for w in 500 700; do get "JetBrains+Mono:wght@$w" "jetbrains-mono-$w.woff2"; done
