// Guards on /mcp added after review: no batches, no echoed request content,
// foreign origins refused, a fixed tool list, and a strict per-address limiter
// keyed on the address and the MCP session id.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';
import { McpRateLimiter, visitorKeys, WINDOW_MS } from '../../worker/mcp-limiter';
import { slimClusters, slimData, slimEvents } from '../../scripts/fetch-data.mjs';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data = slimData(read('../fixtures/tally-data.json'), read('../fixtures/taxonomy.json'));
const clusters = slimClusters(read('../fixtures/clusters.json'));
const events = slimEvents(read('../fixtures/events.json'), clusters, '2026-01-01');
const MARKUP = `<script>alert("x")</script>${'<b>zqxjv</b>'.repeat(40)}`;
const SESSION = '0b5c4d1e-8f2a-4c3b-9d7e-1a2b3c4d5e6f';
const LIMITS = { key: 3, address: 5 };

function limiterNamespace(limits = LIMITS) {
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
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          const body = (await request.clone().json()) as { key: string };
          return Response.json({ ok: object.take(body.key, limits) });
        },
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
    MCP_LIMITER: limiterNamespace({ key: 1000, address: 1000 }),
    MCP_KEY_LIMIT: '1000',
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

  it('says its tool list never changes and issues a session id on initialize', async () => {
    const { env, state } = makeEnv();
    const res = await worker.fetch(post(initialize), env);
    const body = await res.json();
    expect(body.result.capabilities.tools.listChanged).toBe(false);
    const session = res.headers.get('mcp-session-id');
    expect(session).toMatch(/^[0-9a-f-]{36}$/);

    const list = await worker.fetch(post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': session! }), env);
    expect(list.status).toBe(200);
    expect((await list.json()).result.tools).toHaveLength(4);
    expect(state.keys.at(-1)).toBe(`192.0.2.7|${session}`);
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

  it('fails closed when the limiter errors or its limits are not set', async () => {
    const broken = { idFromName: () => 'x', get: () => ({ fetch: async () => Promise.reject(new Error('down')) }) };
    expect((await worker.fetch(post(initialize), makeEnv({ MCP_LIMITER: broken }).env)).status).toBe(429);
    expect((await worker.fetch(post(initialize), makeEnv({ MCP_KEY_LIMIT: undefined }).env)).status).toBe(429);
  });

  it('limits a parallel burst from one address strictly', async () => {
    const namespace = limiterNamespace();
    const { env } = makeEnv({ MCP_LIMITER: namespace, MCP_KEY_LIMIT: '3', MCP_ADDRESS_LIMIT: '5' });
    const statuses = await Promise.all(Array.from({ length: 20 }, () => worker.fetch(post(initialize), env).then((r) => r.status)));
    expect(statuses.filter((s) => s === 200)).toHaveLength(LIMITS.key);
    expect(statuses.filter((s) => s === 429)).toHaveLength(20 - LIMITS.key);
    expect(new Set(namespace.names)).toEqual(new Set(['mcp:192.0.2.7']));
  });

  it('keys each session separately under a ceiling for the whole address', () => {
    let now = 1_000_000;
    const limiter = new McpRateLimiter({}, {}, () => now);
    const take = (key: string) => limiter.take(key, LIMITS);
    expect([take('a'), take('a'), take('a'), take('a')]).toEqual([true, true, true, false]);
    expect([take('b'), take('b'), take('c')]).toEqual([true, true, false]);
    now += WINDOW_MS;
    expect(take('a')).toBe(true);
  });

  it('keys on the address plus a well-formed session id, else the address', () => {
    const req = (headers: Record<string, string>) => new Request('https://t/mcp', { headers });
    expect(visitorKeys(req({ 'cf-connecting-ip': '198.51.100.1', 'mcp-session-id': SESSION })).key).toBe(`198.51.100.1|${SESSION}`);
    expect(visitorKeys(req({ 'cf-connecting-ip': '198.51.100.1', 'mcp-session-id': MARKUP })).key).toBe('198.51.100.1');
    expect(visitorKeys(req({ 'cf-connecting-ip': '198.51.100.1' })).key).toBe('198.51.100.1');
  });

  it('binds the strict limiter and its limits in production and previews', () => {
    const text = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const config = JSON.parse(text);
    expect(config.assets.run_worker_first).toContain('/mcp');
    for (const block of [config, config.previews]) {
      expect(block.durable_objects.bindings).toContainEqual({ name: 'MCP_LIMITER', class_name: 'McpRateLimiter' });
      expect(block.ratelimits.map((r: { name: string }) => r.name)).toContain('MCP_RATE_LIMIT');
      expect(Number(block.vars.MCP_KEY_LIMIT)).toBeGreaterThan(0);
      expect(Number(block.vars.MCP_ADDRESS_LIMIT)).toBeGreaterThan(Number(block.vars.MCP_KEY_LIMIT));
    }
    expect(config.migrations.some((m: { new_sqlite_classes?: string[] }) => m.new_sqlite_classes?.includes('McpRateLimiter'))).toBe(true);
  });
});
