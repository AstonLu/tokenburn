# Design prototypes

- `prototype/index.html`: the Tokenburn page (dashboard first screen plus nine metaphor scenes linked by ink). Self-contained; open it in a browser. Example data is labelled 範例資料; "讀取我的紀錄" parses `~/.claude/projects` locally in the browser.
- `prototype/src/`: page sources (`head.html` styles and shell, `a.js` scenes, `b.js` dashboard, ink and data). Rebuild with `sh design/prototype/build.sh`.
- `fx/pyrofx.js`: WebGL2 ink (stable fluids, Beer-Lambert on paper) and fire (raymarched) engine; `fx/demo.html` shows both.

Metaphor math lives in `packages/core/src/metaphors.js`.
