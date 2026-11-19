// Post-deploy check: the deployed page returns 200, shows the Tally marker,
// and carries every security header exactly as public/_headers sets it; the
// search route runs and refuses an over-long request without calling the
// model. With --expect-search-fallback (previews, which never hold the key),
// a normal search must answer {"fallback": true}. The Ask Tally connector at
// /mcp must answer an MCP initialize, list its four tools and refuse a batch.
// Usage: node scripts/check-deploy.mjs <deployed-url> [--expect-search-fallback]
/* global setTimeout */
import { readFileSync } from 'node:fs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/check-deploy.mjs <deployed-url>');
  process.exit(2);
}

const expected = Object.fromEntries(
  readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
    // Only the "/*" block: the security headers every page carries. Rules
    // for single paths (such as the feed's Content-Type) are not checked here.
    .split(/\n(?=\S)/)
    .filter((block) => block.startsWith('/*\n'))
    .flatMap((block) => block.split('\n'))
    .filter((l) => /^\s+[A-Za-z-]+:/.test(l))
    .map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

// A fresh deploy can take a few seconds to reach every Cloudflare location,
// so retry a 404 for up to a minute before judging the page.
let response = await fetch(url, { redirect: 'follow' });
for (let attempt = 1; attempt <= 12 && response.status === 404; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  response = await fetch(url, { redirect: 'follow' });
}
// A redeploy over an earlier preview can keep serving the old version for a
// little while; retry until the headers match this build, for up to a minute.
const csp = expected['Content-Security-Policy'];
for (let attempt = 1; attempt <= 12 && response.status === 200 && response.headers.get('Content-Security-Policy') !== csp; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  response = await fetch(url, { redirect: 'follow' });
}

const failures = [];
if (response.status !== 200) failures.push(`expected status 200, got ${response.status}`);
const body = await response.text();
if (!body.includes('Tally')) failures.push('page body is missing the marker "Tally"');
for (const [name, value] of Object.entries(expected)) {
  const actual = response.headers.get(name);
  if (actual !== value) failures.push(`header ${name}:\n  expected: ${value}\n  actual:   ${actual}`);
}
const searchUrl = new URL('/api/search', url).toString();
const post = (q) =>
  fetch(searchUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q }) });
// A new Worker can take a little while to reach every location; until it does, the
// old static-only version answers the route with 405. Retry for up to a minute.
let tooLong = await post('x'.repeat(301));
for (let attempt = 1; attempt <= 12 && tooLong.status === 405; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  tooLong = await post('x'.repeat(301));
}
if (tooLong.status !== 413) failures.push(`search: an over-long request should get 413, got ${tooLong.status}`);
if (process.argv.includes('--expect-search-fallback')) {
  const answer = await post('cyber companies');
  const text = await answer.text();
  if (answer.status !== 200 || text !== '{"fallback":true}') failures.push(`search: expected 200 {"fallback":true}, got ${answer.status} ${text.slice(0, 200)}`);
}

// Ask Tally: an MCP initialize and a tools/list on /mcp.
const mcpUrl = new URL('/mcp', url).toString();
const rpc = async (id, method, params = {}) => {
  const res = await fetch(mcpUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  const line = (res.headers.get('content-type') ?? '').includes('text/event-stream') ? text.split('\n').find((l) => l.startsWith('data:'))?.slice(5) : text;
  try {
    return { status: res.status, message: JSON.parse(line ?? '') };
  } catch {
    return { status: res.status, message: null };
  }
};
const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'deploy-check', version: '1.0.0' } });
if (init.status !== 200 || !init.message?.result?.serverInfo) failures.push(`mcp: initialize should answer 200 with serverInfo, got ${init.status}`);
const list = await rpc(2, 'tools/list');
const tools = (list.message?.result?.tools ?? []).map((t) => t.name).sort().join(',');
if (tools !== 'get_company,list_capabilities,list_clusters_and_events,search_companies') failures.push(`mcp: tools/list returned ${tools || 'nothing'}`);
const batch = await fetch(mcpUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
  body: JSON.stringify([{ jsonrpc: '2.0', id: 3, method: 'tools/list' }]),
});
if (batch.status !== 400) failures.push(`mcp: a batch should get 400, got ${batch.status}`);

if (failures.length) {
  console.error(`Deploy check FAILED for ${url}\n\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Deploy check passed for ${url}`);
