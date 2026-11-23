// Generates synthetic fixtures that mimic the on-disk structure of real CLI logs.
// No real transcript content is used: every text field is placeholder text.
// Run: node packages/core/test/fixtures/generate.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const w = (p, s) => {
  mkdirSync(dirname(join(HERE, p)), { recursive: true });
  writeFileSync(join(HERE, p), s);
};
const jsonl = (objs) => objs.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n') + '\n';

// ---------- Claude Code ----------
const SESSION = '00000000-0000-4000-8000-000000000001';
let uuidN = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++uuidN).padStart(12, '0')}`;
const base = (ts, extra = {}) => ({
  parentUuid: uuid(),
  isSidechain: false,
  userType: 'external',
  entrypoint: 'cli',
  cwd: '/home/example/project',
  sessionId: SESSION,
  version: '2.0.0',
  gitBranch: 'main',
  uuid: uuid(),
  timestamp: ts,
  ...extra,
});
const usage = (u) => ({
  input_tokens: u.in,
  cache_creation_input_tokens: u.cw,
  cache_read_input_tokens: u.cr,
  output_tokens: u.out,
  output_tokens_details: { thinking_tokens: u.think },
  server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
  service_tier: 'standard',
  cache_creation: { ephemeral_1h_input_tokens: u.cw1h, ephemeral_5m_input_tokens: u.cw - u.cw1h },
  inference_geo: 'not_available',
  iterations: [{ type: 'message' }],
  speed: 'standard',
  fallback_credit: null,
});
// One API reply is written as one line per content block, all with identical id/requestId/usage.
function reply({ ts, model, msgId, reqId, u, blocks }) {
  return blocks.map((block, i) =>
    base(ts, {
      message: {
        model,
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [block],
        container: null,
        stop_reason: i === blocks.length - 1 ? 'tool_use' : null,
        stop_sequence: null,
        stop_details: null,
        usage: usage(u),
        input_transformations: [],
        diagnostics: null,
        context_management: null,
      },
      requestId: reqId,
      type: 'assistant',
      apiBlockIndex: i,
      requestedModel: model,
    }),
  );
}
const thinking = { type: 'thinking', thinking: 'placeholder reasoning', signature: 'c2lnbmF0dXJl' };
const text = { type: 'text', text: 'placeholder answer' };
const tool = { type: 'tool_use', id: 'toolu_placeholder', name: 'Bash', input: { command: 'echo placeholder' } };

const SONNET = 'claude-sonnet-4-5-20250929';
const OPUS = 'claude-opus-4-5-20251101';
const main = [
  base('2026-11-20T09:00:00.000Z', { type: 'user', message: { role: 'user', content: 'placeholder prompt' } }),
  base('2026-11-20T09:00:00.100Z', { type: 'attachment', attachment: { type: 'placeholder' } }),
  // reply A: 3 lines (thinking, text, tool_use)
  ...reply({ ts: '2026-11-20T09:00:05.000Z', model: SONNET, msgId: 'msg_fixture_A', reqId: 'req_fixture_A', u: { in: 10, out: 300, cr: 1000, cw: 2000, cw1h: 2000, think: 100 }, blocks: [thinking, text, tool] }),
  base('2026-11-20T09:00:06.000Z', { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_placeholder', content: 'placeholder output' }] } }),
  // reply B: 2 lines
  ...reply({ ts: '2026-11-20T09:00:09.000Z', model: SONNET, msgId: 'msg_fixture_B', reqId: 'req_fixture_B', u: { in: 5, out: 200, cr: 3000, cw: 500, cw1h: 0, think: 0 }, blocks: [text, tool] }),
  // synthetic model line: must be ignored
  ...reply({ ts: '2026-11-20T09:00:10.000Z', model: '<synthetic>', msgId: 'msg_fixture_S', reqId: 'req_fixture_S', u: { in: 999, out: 999, cr: 0, cw: 0, cw1h: 0, think: 0 }, blocks: [text] }),
  // malformed / foreign lines: must be skipped
  '{"type":"assistant","message":{"usage":',
  'not json at all',
  JSON.stringify({ type: 'assistant', timestamp: '2026-11-20T09:00:11.000Z', message: { model: SONNET, id: 'msg_no_usage' } }),
  JSON.stringify({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-11-20T09:00:12.000Z' }),
  // reply C next day (UTC), Opus, 2 lines
  ...reply({ ts: '2026-11-21T23:59:59.000Z', model: OPUS, msgId: 'msg_fixture_C', reqId: 'req_fixture_C', u: { in: 3, out: 1000, cr: 50000, cw: 4000, cw1h: 4000, think: 600 }, blocks: [thinking, text] }),
];
// Subagent transcript: sidechain lines, and reply B duplicated again (as when a file is re-read / copied).
const sub = [
  ...reply({ ts: '2026-11-21T10:00:00.000Z', model: 'claude-haiku-4-5-20251001', msgId: 'msg_fixture_D', reqId: 'req_fixture_D', u: { in: 100, out: 50, cr: 0, cw: 0, cw1h: 0, think: 0 }, blocks: [text, tool] }).map((l) => ({ ...l, isSidechain: true, agentId: 'fixture' })),
  ...reply({ ts: '2026-11-20T09:00:09.000Z', model: SONNET, msgId: 'msg_fixture_B', reqId: 'req_fixture_B', u: { in: 5, out: 200, cr: 3000, cw: 500, cw1h: 0, think: 0 }, blocks: [text] }),
];
w('claude/projects/-home-example-project/' + SESSION + '.jsonl', jsonl(main));
w('claude/projects/-home-example-project/' + SESSION + '/subagents/agent-fixture.jsonl', jsonl(sub));

// ---------- Codex CLI ----------
const tc = (ts, model) => ({ timestamp: ts, type: 'turn_context', payload: { cwd: '/home/example/project', approval_policy: 'on-request', model, effort: 'medium', summary: 'auto' } });
const u4 = (input, cached, output, reasoning) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output });
const tok = (ts, total, last) => ({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: total ? { total_token_usage: total, ...(last ? { last_token_usage: last } : {}), model_context_window: 272000 } : null, rate_limits: null } });
const codex = [
  { timestamp: '2026-11-20T08:00:00.000Z', type: 'session_meta', payload: { id: 'session-placeholder', timestamp: '2026-11-20T08:00:00.000Z', cwd: '/home/example/project', originator: 'codex_cli_rs', cli_version: '0.50.0' } },
  tc('2026-11-20T08:00:01.000Z', 'gpt-5-codex'),
  { timestamp: '2026-11-20T08:00:02.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'placeholder' }] } },
  tok('2026-11-20T08:00:02.500Z', null), // info null: ignored
  // turn 1: last present
  tok('2026-11-20T08:00:05.000Z', u4(1000, 200, 100, 40), u4(1000, 200, 100, 40)),
  // re-emitted identical total: must not double count
  tok('2026-11-20T08:00:05.100Z', u4(1000, 200, 100, 40), u4(1000, 200, 100, 40)),
  // turn 2: last present
  tok('2026-11-20T08:01:00.000Z', u4(3000, 1500, 300, 100), u4(2000, 1300, 200, 60)),
  // model switch, turn 3: no last_token_usage -> diff of totals
  tc('2026-11-21T08:00:00.000Z', 'gpt-5.1-codex'),
  tok('2026-11-21T08:00:05.000Z', u4(4000, 2000, 450, 150)),
  'garbage line',
  { timestamp: '2026-11-21T08:00:06.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'placeholder' } },
];
w('codex/sessions/2026/11/20/rollout-2026-11-20T08-00-00-placeholder.jsonl', jsonl(codex));

// ---------- Gemini CLI ----------
const gem = {
  sessionId: 'gemini-session-placeholder',
  projectHash: 'deadbeef',
  startTime: '2026-11-22T01:00:00.000Z',
  lastUpdated: '2026-11-22T01:10:00.000Z',
  messages: [
    { id: 'm1', timestamp: '2026-11-22T01:00:00.000Z', type: 'user', content: 'placeholder' },
    { id: 'm2', timestamp: '2026-11-22T01:00:05.000Z', type: 'gemini', content: 'placeholder', thoughts: [], model: 'gemini-2.5-pro', tokens: { input: 5000, output: 400, cached: 3000, thoughts: 250, tool: 10, total: 5660 } },
    { id: 'm3', timestamp: '2026-11-22T01:01:00.000Z', type: 'gemini', content: 'placeholder', model: 'gemini-2.5-flash' }, // no tokens
    { id: 'm4', timestamp: '2026-11-22T01:02:00.000Z', type: 'gemini', content: 'placeholder', tokens: { input: 100, output: 20 } }, // no model, partial tokens
    { id: 'm5', type: 'gemini', tokens: { input: 1, output: 1 } }, // no timestamp
    'weird entry',
  ],
};
w('gemini/tmp/deadbeef/chats/session-2026-11-22T01-00-placeholder.json', JSON.stringify(gem, null, 2));
w('gemini/tmp/deadbeef/chats/session-broken.json', '{"sessionId": "x", "messages": [');
w('gemini/tmp/cafebabe/chats/session-empty.json', JSON.stringify({ sessionId: 'y' }));
console.log('fixtures written');
