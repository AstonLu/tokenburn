# @astonlu/tokenburn

See how many AI tokens you burned in Claude Code, OpenAI Codex CLI and Gemini CLI, what that is worth at API prices, and get a public page to share.

```sh
npx @astonlu/tokenburn
```

It scans your local logs, shows you exactly what it would upload, and asks before sending anything. Your page lives at https://tokenburn.astonlu.com.

## Privacy

- Logs are parsed on your machine. Only daily, per-model token counts are uploaded: date, tool, model name and numbers.
- No file paths, project names, code or conversation text ever leave your computer.
- No runtime dependencies; the source is small enough to read in one sitting.

## Options

| Flag | What it does |
| --- | --- |
| `--dry-run` | Scan and print the payload; never touches the network |
| `--yes`, `-y` | Upload without asking |
| `--open` | Open your page in the browser after uploading |
| `--json` | Print the full payload as JSON |
| `--endpoint <url>` | Use another server (default `$TOKENBURN_ENDPOINT` or https://tokenburn.astonlu.com) |

Your profile token is kept in `~/.tokenburn/config.json` (set `$TOKENBURN_HOME` to move it), so later runs update the same page.

Requires Node 18 or later. MIT licensed.
