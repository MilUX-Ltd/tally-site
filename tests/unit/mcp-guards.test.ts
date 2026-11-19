// Guards on /mcp added after review: no batches, no echoed request content,
// foreign origins refused, a fixed tool list, and a strict per-client limiter
// keyed on the client's network address alone (IPv6 by its /64 prefix).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';
import { clientKey, McpRateLimiter, WINDOW_MS } from '../../worker/mcp-limiter';
import { slimClusters, slimData, slimEvents } from '../../scripts/fetch-data.mjs';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data = slimData(read('../fixtures/tally-data.json'), read('../fixtures/taxonomy.json'));
const clusters = slimClusters(read('../fixtures/clusters.json'));
const events = slimEvents(read('../fixtures/events.json'), clusters, '2026-01-01');
const MARKUP = `<script>alert("x")</script>${'<b>zqxjv</b>'.repeat(40)}`;
const LIMIT = 3;

/** A fake namespace around the real limiter class, one object per name. */
function limiterNamespace() {
  const objects = new Map<string, McpRateLimiter>();
  const names: string[] = [];
  return {
    names,
    idFromName: (name: string) => {
      names.push(name);
      return name;
    },
    get: (id: string) => {
      if (!objects.has(id)) objects.set(id, new McpRateLimiter({}, {}));
      const object = objects.get(id)!;
      return {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => object.fetch(new Request(input, init)),
      };
    },
  };
}

function makeEnv(overrides: Record<string, unknown> = {}) {
  const state = { assetPaths: [] as string[], keys: [] as string[] };
  const env = {
    MCP_RATE_LIMIT: {
      limit: async ({ key }: { key: string }) => {
        state.keys.push(key);
        return { success: true };
      },
    },
    MCP_LIMITER: limiterNamespace(),
    MCP_ADDRESS_LIMIT: '1000',
    ASSETS: {
      fetch: async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        state.assetPaths.push(url.pathname);
        const body = url.pathname === '/data/tally.json' ? data : url.pathname === '/data/clusters.json' ? clusters : url.pathname === '/data/events.json' ? events : null;
        return body ? Response.json(body) : new Response('not found', { status: 404 });
      },
    },
    ...overrides,
  };
  return { env: env as never, state };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://tally.example/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      'cf-connecting-ip': '192.0.2.7',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'unit', version: '1' } } };

describe('/mcp request guards', () => {
  it('refuses a 100-call batch before the transport', async () => {
    const { env, state } = makeEnv();
    const batch = Array.from({ length: 100 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'list_capabilities', arguments: {} } }));
    const res = await worker.fetch(post(batch), env);
    expect(res.status).toBe(400);
    expect(state.assetPaths).toEqual([]);
    const modern = await worker.fetch(post(batch, { 'mcp-protocol-version': '2026-07-28' }), env);
    expect(modern.status).toBe(400);
    const single = await worker.fetch(post([initialize]), env);
    expect(single.status).toBe(400);
  });

  it('never repeats an unknown tool name, method or id', async () => {
    const { env } = makeEnv();
    const tool = await worker.fetch(post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: MARKUP, arguments: {} } }), env);
    const toolText = await tool.text();
    expect(toolText).not.toContain('zqxjv');
    expect(toolText).not.toContain('<');
    expect(JSON.parse(toolText).error.message).toMatch(/unknown tool/i);

    const method = await worker.fetch(post({ jsonrpc: '2.0', id: 3, method: `x/${MARKUP}`, params: {} }), env);
    const methodText = await method.text();
    expect(methodText).not.toContain('zqxjv');
    expect(methodText).not.toContain('<');

    const id = await worker.fetch(post({ jsonrpc: '2.0', id: MARKUP, method: 'tools/list' }), env);
    expect(id.status).toBe(400);
    expect(await id.text()).not.toContain('zqxjv');
  });

  it('refuses a foreign Origin and allows none or its own', async () => {
    const { env } = makeEnv();
    expect((await worker.fetch(post(initialize, { origin: 'https://evil.example' }), env)).status).toBe(403);
    expect((await worker.fetch(post(initialize, { origin: 'https://tally.example' }), env)).status).toBe(200);
    expect((await worker.fetch(post(initialize, { origin: 'https://tally.milux.co.uk' }), env)).status).toBe(200);
    expect((await worker.fetch(post(initialize), env)).status).toBe(200);
  });

  it('says its tool list never changes and issues no session id', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(post(initialize), env);
    const body = await res.json();
    expect(body.result.capabilities.tools.listChanged).toBe(false);
    expect(res.headers.get('mcp-session-id')).toBeNull();
  });
});

describe('/mcp rate limiting', () => {
  it('refuses with 429 and reads nothing when the strict limiter says no', async () => {
    const refuse = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => Response.json({ ok: false }) }),
    };
    const { env, state } = makeEnv({ MCP_LIMITER: refuse });
    const res = await worker.fetch(post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_capabilities', arguments: {} } }), env);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(state.assetPaths).toEqual([]);
  });

  it('fails closed when the limiter errors or its limit is not set', async () => {
    const broken = { idFromName: () => 'x', get: () => ({ fetch: async () => Promise.reject(new Error('down')) }) };
    expect((await worker.fetch(post(initialize), makeEnv({ MCP_LIMITER: broken }).env)).status).toBe(429);
    expect((await worker.fetch(post(initialize), makeEnv({ MCP_ADDRESS_LIMIT: undefined }).env)).status).toBe(429);
    expect((await worker.fetch(post(initialize), makeEnv({ MCP_ADDRESS_LIMIT: 'lots' }).env)).status).toBe(429);
  });

  it('limits a parallel burst from one address strictly, whatever session ids it sends', async () => {
    const namespace = limiterNamespace();
    const { env, state } = makeEnv({ MCP_LIMITER: namespace, MCP_ADDRESS_LIMIT: String(LIMIT) });
    const statuses = await Promise.all(
      Array.from({ length: 20 }, () => worker.fetch(post(initialize, { 'mcp-session-id': crypto.randomUUID() }), env).then((r) => r.status)),
    );
    expect(statuses.filter((s) => s === 200)).toHaveLength(LIMIT);
    expect(statuses.filter((s) => s === 429)).toHaveLength(20 - LIMIT);
    expect(new Set(namespace.names)).toEqual(new Set(['mcp:v4:192.0.2.7']));
    expect(new Set(state.keys)).toEqual(new Set(['v4:192.0.2.7']));
  });

  it('counts a window and starts again after it', () => {
    let now = 1_000_000;
    const limiter = new McpRateLimiter({}, {}, () => now);
    expect([limiter.take(LIMIT), limiter.take(LIMIT), limiter.take(LIMIT), limiter.take(LIMIT)]).toEqual([true, true, true, false]);
    now += WINDOW_MS;
    expect(limiter.take(LIMIT)).toBe(true);
  });

  it('keys IPv4 on the whole address and IPv6 on its /64 prefix', () => {
    expect(clientKey('198.51.100.1')).toBe('v4:198.51.100.1');
    expect(clientKey('198.51.100.2')).not.toBe(clientKey('198.51.100.1'));
    const a = clientKey('2001:db8:abcd:12:1111:2222:3333:4444');
    const b = clientKey('2001:0db8:abcd:0012::9');
    expect(a).toBe('v6:2001:db8:abcd:12::/64');
    expect(b).toBe(a);
    expect(clientKey('2001:db8:abcd:13::1')).not.toBe(a);
    expect(clientKey('::ffff:198.51.100.1')).toBe('v4:198.51.100.1');
    expect(clientKey('::1')).toBe('v6:0:0:0:0::/64');
  });

  it('binds the strict limiter and its limit in production and previews', () => {
    const text = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const config = JSON.parse(text);
    expect(config.assets.run_worker_first).toContain('/mcp');
    for (const block of [config, config.previews]) {
      expect(block.durable_objects.bindings).toContainEqual({ name: 'MCP_LIMITER', class_name: 'McpRateLimiter' });
      expect(block.ratelimits.map((r: { name: string }) => r.name)).toContain('MCP_RATE_LIMIT');
      expect(Number(block.vars.MCP_ADDRESS_LIMIT)).toBeGreaterThan(0);
      expect(block.vars.MCP_KEY_LIMIT).toBeUndefined();
    }
    expect(config.migrations.some((m: { new_sqlite_classes?: string[] }) => m.new_sqlite_classes?.includes('McpRateLimiter'))).toBe(true);
  });
});
