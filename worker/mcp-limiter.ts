// A strict per-visitor limit for /mcp. Cloudflare's rate-limiting binding is
// approximate: each machine checks a locally cached count, so a burst of
// parallel requests can pass it before the counts meet. This Durable Object,
// one per client address, holds the counts in memory (nothing is stored), so
// every request from that address is counted in one place.
//
// Two fixed one-minute windows apply: one per connection key (the address
// plus the MCP session id, when the client sends one) and a higher ceiling for
// the whole address, so a client that invents session ids cannot multiply its
// allowance. Claude connects from shared cloud addresses, so the session key
// keeps one conversation from using up another's allowance.
//
// The two limits are wrangler vars (MCP_KEY_LIMIT, MCP_ADDRESS_LIMIT); a
// missing or invalid value refuses every request.
import type { Env } from './types';

export const WINDOW_MS = 60_000;
/** Most connection keys tracked per address in one window; more are refused. */
const MAX_KEYS = 5000;

export interface Limits {
  key: number;
  address: number;
}

/** Parses a limit setting; anything but a positive whole number means none (refuse). */
export function parseLimit(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) return 0;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

interface Window {
  start: number;
  count: number;
}

export class McpRateLimiter {
  private address: Window = { start: 0, count: 0 };
  private readonly keys = new Map<string, Window>();
  private readonly now: () => number;

  constructor(_state: unknown, _env: unknown, now: () => number = Date.now) {
    this.now = now;
  }

  /** Counts one request for `key`; true when it is within both limits. */
  take(key: string, limits: Limits): boolean {
    const now = this.now();
    if (now - this.address.start >= WINDOW_MS) {
      this.address = { start: now, count: 0 };
      this.keys.clear();
    }
    let window = this.keys.get(key);
    if (!window || now - window.start >= WINDOW_MS) {
      if (!window && this.keys.size >= MAX_KEYS) return false;
      window = { start: now, count: 0 };
      this.keys.set(key, window);
    }
    if (this.address.count >= limits.address || window.count >= limits.key) return false;
    this.address.count++;
    window.count++;
    return true;
  }

  /** POST with {"key", "keyLimit", "addressLimit"}: {"ok": true} when the request may proceed. */
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    let body: { key?: unknown; keyLimit?: unknown; addressLimit?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ ok: false });
    }
    const whole = (n: unknown) => (typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : 0);
    const key = typeof body.key === 'string' && body.key.length <= 200 ? body.key : '';
    const limits = { key: whole(body.keyLimit), address: whole(body.addressLimit) };
    if (!key || !limits.key || !limits.address) return Response.json({ ok: false });
    return Response.json({ ok: this.take(key, limits) });
  }
}

/** A session id worth keying on: what this server issues, a UUID. Anything else is ignored. */
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The address and the connection key for a request. */
export function visitorKeys(request: Request): { address: string; key: string } {
  const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const session = request.headers.get('mcp-session-id') ?? '';
  return { address, key: SESSION.test(session) ? `${address}|${session.toLowerCase()}` : address };
}

/**
 * Asks the address's limiter whether this request may proceed. Any failure
 * counts as no. When the binding is not configured the check is skipped;
 * wrangler.jsonc always binds it, and a unit test holds it there.
 */
export async function withinLimit(env: Env, request: Request): Promise<boolean> {
  const namespace = env.MCP_LIMITER;
  if (!namespace) return true;
  const { address, key } = visitorKeys(request);
  const keyLimit = parseLimit(env.MCP_KEY_LIMIT);
  const addressLimit = parseLimit(env.MCP_ADDRESS_LIMIT);
  if (!keyLimit || !addressLimit) return false;
  try {
    const stub = namespace.get(namespace.idFromName(`mcp:${address}`) as never);
    const response = await stub.fetch('https://limiter/take', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, keyLimit, addressLimit }),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}
