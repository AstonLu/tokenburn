#!/bin/sh
# Re-download the share-image fonts, subset by Google Fonts to the characters in src/fonts/chars.txt.
# Run after adding text to the share image. Fonts: Noto Sans TC and Big Shoulders Display (SIL OFL 1.1).
set -e
cd "$(dirname "$0")/src/fonts"
UA="Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30"
T=$(python3 -c "import urllib.parse;print(urllib.parse.quote(open('chars.txt').read()))")
get() { u=$(curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=$1&text=$T" | grep -o "https://fonts.gstatic.com/[^)]*" | head -1); curl -s -o "$2" "$u"; wc -c "$2"; }
get "Noto+Sans+TC:wght@700" noto-sans-tc-700.woff
get "Noto+Sans+TC:wght@900" noto-sans-tc-900.woff
get "Big+Shoulders+Display:wght@900" big-shoulders-900.woff
