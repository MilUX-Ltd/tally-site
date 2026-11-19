// Acceptance tests: Ask Tally, the read-only MCP connector at /mcp. The Worker
// is called in-process with a fake ASSETS binding serving the fixture build, a
// fake rate limiter, and a spy on the global fetch. Committed failing before
// the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index';
import { slimClusters, slimData, slimEvents, SIGNPOST } from '../../scripts/fetch-data.mjs';
import type { TallyData } from '../../src/lib/types';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data = slimData(read('../fixtures/tally-data.json'), read('../fixtures/taxonomy.json')) as TallyData;
// A published postcode for one Portsmouth company, so a postcode can be placed from Tally's own data.
const harbour = data.companies.find((c) => c.name === 'Example Harbour Systems')!;
harbour.postcode = 'PO1 3LJ';
// A company whose UK location is not published, carrying coordinates it must never reveal.
data.companies.push({
  ...harbour,
  id: 'example-hidden-location',
  name: 'Example Hidden Location',
  postcode: '',
  location_source: 'region',
  lat: 50.82,
  lon: -1.09,
});
const clusters = slimClusters(read('../fixtures/clusters.json'));
const events = slimEvents(read('../fixtures/events.json'), clusters, new Date().toISOString().slice(0, 10));

// Tool results are untyped JSON read back from the wire.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const ALLOWED_ASSETS = ['/data/tally.json', '/data/clusters.json', '/data/events.json'];
const TOOLS = ['get_company', 'list_capabilities', 'list_clusters_and_events', 'search_companies'];
const URL_MCP = 'https://tally.example/mcp';
const MARKER = 'zqxjv-marker';

function makeEnv() {
  const state = { allow: true, limiterCalls: 0, assetPaths: [] as string[] };
  const limiter = {
    limit: async () => {
      state.limiterCalls++;
      return { success: state.allow };
    },
  };
  const env = {
    SEARCH_RATE_LIMIT: limiter,
    MCP_RATE_LIMIT: limiter,
    SEARCH_BUDGET: {},
    ASSETS: {
      fetch: async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        state.assetPaths.push(url.pathname);
        const body =
          url.pathname === '/data/tally.json' ? data : url.pathname === '/data/clusters.json' ? clusters : url.pathname === '/data/events.json' ? events : null;
        if (body === null) return new Response('not found', { status: 404 });
        return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      },
    },
  };
  return { env: env as never, state };
}

let nextId = 1;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      'cf-connecting-ip': '192.0.2.1',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Reads a JSON-RPC message from a JSON or an event-stream response. */
async function message(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    return JSON.parse(line!.slice(5).trim());
  }
  return JSON.parse(text);
}

async function rpc(env: never, method: string, params: Record<string, unknown> = {}) {
  const res = await worker.fetch(post({ jsonrpc: '2.0', id: nextId++, method, params }), env);
  return { res, msg: await message(res.clone()), raw: await res.text() };
}

const initialize = (env: never) =>
  rpc(env, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acceptance-test', version: '1.0.0' } });

interface ToolResult {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
}

async function call(env: never, name: string, args: Record<string, unknown>) {
  const { msg, raw } = await rpc(env, 'tools/call', { name, arguments: args });
  const result = msg.result as ToolResult | undefined;
  const body = result?.structuredContent ?? (result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : undefined);
  return { msg, raw, result, body: body as Record<string, Json> };
}

interface Located {
  lat: number;
  lon: number;
}
const miles = (a: Located, b: Located) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
};

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('no outbound calls', { status: 599 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
});

describe('Ask Tally speaks MCP', () => {
  it('initialize names Tally and offers tools', async () => {
    const { env } = makeEnv();
    const { res, msg } = await initialize(env);
    expect(res.status).toBe(200);
    const result = msg.result as { serverInfo: { name: string }; capabilities: Record<string, unknown> };
    expect(result.serverInfo.name.toLowerCase()).toContain('tally');
    expect(result.capabilities.tools).toBeDefined();
  });

  it('lists exactly the four read-only tools with strict input schemas', async () => {
    const { env } = makeEnv();
    await initialize(env);
    const { msg } = await rpc(env, 'tools/list');
    const tools = (msg.result as { tools: Array<Record<string, Json>> }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
    for (const tool of tools) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });
});

describe('search_companies', () => {
  it('search_companies returns matching companies with page links', async () => {
    const { env } = makeEnv();
    const capability = await call(env, 'search_companies', { capabilities: ['uas'] });
    expect(capability.result?.isError).not.toBe(true);
    const names = capability.body.results.map((r: { name: string }) => r.name);
    const expected = data.companies.filter((c) => c.tags.some((t) => t === 'uas' || t.startsWith('uas/'))).map((c) => c.name);
    expect(names.sort()).toEqual(expected.sort());
    expect(capability.body.total).toBe(expected.length);
    for (const r of capability.body.results) {
      expect(typeof r.summary).toBe('string');
      expect(Array.isArray(r.capabilities)).toBe(true);
      expect(r.location).toBeDefined();
      expect(r.page_url).toMatch(new RegExp(`^https://[^/]+/\\?sel=${r.id}$`));
      expect(JSON.stringify(r)).not.toContain('must not reach the browser');
    }

    const combined = await call(env, 'search_companies', { regions: ['South West'], memberships: ['mbr-ads'], sizes: ['size-small'] });
    const want = data.companies
      .filter((c) => c.region === 'South West' && c.tags.includes('mbr-ads') && (c.tags.includes('size-small') || c.size === 'small'))
      .map((c) => c.name);
    expect(combined.body.results.map((r: { name: string }) => r.name).sort()).toEqual(want.sort());

    const cluster = await call(env, 'search_companies', { cluster: 'SCRDSC' });
    const members = data.companies.filter((c) => c.tags.includes('mbr-scrdsc')).map((c) => c.name);
    expect(cluster.body.results.map((r: { name: string }) => r.name).sort()).toEqual(members.sort());

    const keyword = await call(env, 'search_companies', { keyword: 'harbour' });
    expect(keyword.body.results.map((r: { name: string }) => r.name)).toContain('Example Harbour Systems');

    const group = await call(env, 'search_companies', { groups: ['uncrewed'] });
    expect(group.result?.isError).not.toBe(true);
    expect(group.body.total).toBeGreaterThan(0);
  });

  it('search_companies near a point or postcode keeps to the radius', async () => {
    const { env } = makeEnv();
    const portsmouth = { lat: 50.8198, lon: -1.088 };
    const byPoint = await call(env, 'search_companies', { near: { lat: portsmouth.lat, lon: portsmouth.lon, radius_miles: 30 } });
    expect(byPoint.result?.isError).not.toBe(true);
    const results = byPoint.body.results as Array<{ name: string; distance_miles: number; location: { lat: number | null; lon: number | null } }>;
    expect(results.length).toBeGreaterThan(0);
    const expected = data.companies
      .filter((c) => c.location_source !== 'region' && !c.country && c.lat != null && c.lon != null && miles(portsmouth, c as Located) <= 30)
      .map((c) => c.name);
    expect(results.map((r) => r.name).sort()).toEqual(expected.sort());
    for (let i = 1; i < results.length; i++) expect(results[i].distance_miles).toBeGreaterThanOrEqual(results[i - 1].distance_miles);
    expect(results.map((r) => r.name)).not.toContain('Example Hidden Location');
    expect(results.map((r) => r.name)).not.toContain('Example Nordic Defence');

    const byPostcode = await call(env, 'search_companies', { near: { postcode: 'po1 3lj', radius_miles: 10 } });
    expect(byPostcode.result?.isError).not.toBe(true);
    expect(byPostcode.body.results.map((r: { name: string }) => r.name)).toContain('Example Harbour Systems');

    const unknownPostcode = await call(env, 'search_companies', { near: { postcode: 'ZE3 9JZ', radius_miles: 10 } });
    expect(unknownPostcode.result?.isError).toBe(true);
    expect(unknownPostcode.raw).not.toContain('ZE3');

    const hidden = await call(env, 'search_companies', { keyword: 'Hidden Location' });
    const hiddenResult = hidden.body.results.find((r: { name: string }) => r.name === 'Example Hidden Location');
    expect(hiddenResult).toBeDefined();
    expect(hiddenResult.location.lat ?? null).toBeNull();
    expect(hiddenResult.location.lon ?? null).toBeNull();
    expect(hidden.raw).not.toContain('50.82');
  });

  it('search_companies never returns more than 25 results', async () => {
    const { env } = makeEnv();
    const all = await call(env, 'search_companies', { limit: 25 });
    expect(all.body.total).toBe(data.companies.length);
    expect(all.body.results.length).toBe(25);
    const tooMany = await call(env, 'search_companies', { limit: 1000 });
    expect(tooMany.result?.isError === true || tooMany.msg.error !== undefined).toBe(true);
    const defaulted = await call(env, 'search_companies', {});
    expect(defaulted.body.results.length).toBeLessThanOrEqual(25);
  });
});

describe('the other tools', () => {
  it('get_company returns the public profile by id or exact name', async () => {
    const { env } = makeEnv();
    const byId = await call(env, 'get_company', { id: harbour.id });
    expect(byId.result?.isError).not.toBe(true);
    expect(byId.body.company.name).toBe('Example Harbour Systems');
    expect(byId.body.company.summary).toBe(harbour.summary);
    expect(byId.body.company.page_url).toMatch(new RegExp(`^https://[^/]+/\\?sel=${harbour.id}$`));
    expect(byId.raw).not.toContain('must not reach the browser');

    const byName = await call(env, 'get_company', { name: 'example harbour systems' });
    expect(byName.body.company.id).toBe(harbour.id);

    const missing = await call(env, 'get_company', { name: `No such ${MARKER}` });
    expect(missing.result?.isError).toBe(true);
    expect(missing.raw).not.toContain(MARKER);

    const hidden = await call(env, 'get_company', { id: 'example-hidden-location' });
    expect(hidden.raw).not.toContain('50.82');
  });

  it('list_capabilities returns the grouped taxonomy', async () => {
    const { env } = makeEnv();
    const { body, result } = await call(env, 'list_capabilities', {});
    expect(result?.isError).not.toBe(true);
    expect(body.groups.map((g: { slug: string }) => g.slug)).toEqual(data.taxonomy.groups.map((g) => g.slug));
    const all = body.groups.flatMap((g: { capabilities: Array<{ slug: string }> }) => g.capabilities.map((c) => c.slug));
    expect(all.sort()).toEqual(data.taxonomy.capabilities.map((c) => c.slug).sort());
    const uas = body.groups.flatMap((g: { capabilities: Array<{ slug: string; label: string }> }) => g.capabilities).find((c: { slug: string }) => c.slug === 'uas');
    expect(typeof uas.label).toBe('string');
  });

  it('list_clusters_and_events shows members-only events only as signposts', async () => {
    const { env } = makeEnv();
    const { body, result } = await call(env, 'list_clusters_and_events', {});
    expect(result?.isError).not.toBe(true);
    expect(body.clusters.map((c: { id: string }) => c.id).sort()).toEqual(clusters.clusters.map((c: { id: string }) => c.id).sort());
    const members = body.events.filter((e: { audience: string }) => e.audience === 'members');
    expect(members.length).toBeGreaterThan(0);
    for (const e of members) {
      expect(Object.keys(e).sort()).toEqual(['audience', 'cluster', 'date', 'link', 'text']);
      expect(e.text).toBe(SIGNPOST);
    }
    const today = new Date().toISOString().slice(0, 10);
    expect(body.events.every((e: { date: string }) => e.date >= today)).toBe(true);

    const one = await call(env, 'list_clusters_and_events', { cluster: 'SCRDSC' });
    expect(one.body.events.every((e: { cluster: string }) => e.cluster === 'SCRDSC')).toBe(true);
  });
});

describe('untrusted input', () => {
  it('rejects arguments outside the schema with a generic error', async () => {
    const { env } = makeEnv();
    const bad: Array<[string, Record<string, unknown>]> = [
      ['search_companies', { capabilities: ['uas'], [MARKER]: true }],
      ['search_companies', { keyword: 42 }],
      ['search_companies', { keyword: `${MARKER} ${'x'.repeat(500)}` }],
      ['search_companies', { capabilities: [`${MARKER}-not-a-capability`] }],
      ['search_companies', { regions: [`${MARKER} region`] }],
      ['search_companies', { near: { lat: 999, lon: 0, radius_miles: 10 } }],
      ['get_company', { id: `${MARKER}-nobody` }],
      ['get_company', {}],
      ['list_capabilities', { [MARKER]: 1 }],
      ['list_clusters_and_events', { cluster: `${MARKER}` }],
    ];
    for (const [name, args] of bad) {
      const { msg, result, raw } = await call(env, name, args);
      expect(result?.isError === true || msg.error !== undefined, `${name} ${JSON.stringify(args).slice(0, 80)}`).toBe(true);
      expect(raw).not.toContain(MARKER);
    }
  });

  it('refuses non-JSON, oversized, wrong-method and rate-limited requests', async () => {
    const { env, state } = makeEnv();
    const text = await worker.fetch(post('{"jsonrpc":"2.0","id":1,"method":"tools/list"}', { 'content-type': 'text/plain' }), env);
    expect(text.status).toBe(415);
    const form = await worker.fetch(post('a=b', { 'content-type': 'application/x-www-form-urlencoded' }), env);
    expect(form.status).toBe(415);
    const big = await worker.fetch(post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(200_000) } }), env);
    expect(big.status).toBe(413);
    const get = await worker.fetch(new Request(URL_MCP, { method: 'GET', headers: { accept: 'text/event-stream' } }), env);
    expect(get.status).toBe(405);

    state.allow = false;
    state.assetPaths.length = 0;
    const limited = await worker.fetch(post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_capabilities', arguments: {} } }), env);
    expect(limited.status).toBe(429);
    expect(state.assetPaths).toEqual([]);
    expect(limited.headers.get('cache-control')).toBe('no-store');
  });

  it("only reads the site's own public data and calls nothing else", async () => {
    const { env, state } = makeEnv();
    await initialize(env);
    await rpc(env, 'tools/list');
    await call(env, 'search_companies', { capabilities: ['cyber'], near: { lat: 51.5, lon: -0.12, radius_miles: 50 } });
    await call(env, 'search_companies', { near: { postcode: 'PO1 3LJ', radius_miles: 25 } });
    await call(env, 'get_company', { id: harbour.id });
    await call(env, 'list_capabilities', {});
    await call(env, 'list_clusters_and_events', {});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.assetPaths.every((p) => ALLOWED_ASSETS.includes(p))).toBe(true);
    expect(state.limiterCalls).toBeGreaterThan(0);
  });
});
