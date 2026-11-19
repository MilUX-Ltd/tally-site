// A strict per-client limit for /mcp. Cloudflare's rate-limiting binding is
// approximate: each machine checks a locally cached count, so a burst of
// parallel requests can pass it before the counts meet. This Durable Object,
// one per client, holds the count in memory (nothing is stored), so every
// request from that client is counted in one place.
//
// A client is its network address: an IPv4 address whole, an IPv6 address by
// its /64 prefix (one network can rotate through the rest freely). Nothing the
// client sends, such as a session id, plays any part. Clients behind one
// shared address share one allowance.
//
// The limit per client per one-minute window is the wrangler var
// MCP_ADDRESS_LIMIT; a missing or invalid value refuses every request.
import type { Env } from './types';

export const WINDOW_MS = 60_000;

/** Parses a limit setting; anything but a positive whole number means none (refuse). */
export function parseLimit(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) return 0;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export class McpRateLimiter {
  private start = 0;
  private count = 0;
  private readonly now: () => number;

  constructor(_state: unknown, _env: unknown, now: () => number = Date.now) {
    this.now = now;
  }

  /** Counts one request; true when it is within the limit for this window. */
  take(limit: number): boolean {
    const now = this.now();
    if (now - this.start >= WINDOW_MS) {
      this.start = now;
      this.count = 0;
    }
    if (this.count >= limit) return false;
    this.count++;
    return true;
  }

  /** POST with {"limit": n}: {"ok": true} when the request may proceed. */
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    let limit = 0;
    try {
      const body = (await request.json()) as { limit?: unknown };
      if (typeof body.limit === 'number' && Number.isSafeInteger(body.limit) && body.limit > 0) limit = body.limit;
    } catch {
      limit = 0;
    }
    return Response.json({ ok: limit > 0 && this.take(limit) });
  }
}

/** The eight 16-bit groups of an IPv6 address, or null when it does not parse. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0];
  // An embedded IPv4 tail (::ffff:192.0.2.1) becomes two groups.
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const b = v4.slice(1).map(Number);
    if (b.some((n) => n > 255)) return null;
    text = `${text.slice(0, v4.index)}${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const part = (s: string) => (s ? s.split(':') : []);
  const head = part(halves[0]);
  const tail = halves.length === 2 ? part(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * The key a client is limited by: an IPv4 address whole, an IPv6 address by
 * its /64 prefix (an IPv4-mapped IPv6 address keys as its IPv4 address).
 */
export function clientKey(address: string): string {
  const text = address.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return `v4:${text}`;
  const groups = text.includes(':') ? ipv6Groups(text) : null;
  if (!groups) return `other:${text.slice(0, 64)}`;
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) return `v4:${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  return `v6:${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

/** The limit key for a request, from the address Cloudflare saw. */
export function requestKey(request: Request): string {
  return clientKey(request.headers.get('cf-connecting-ip') ?? 'unknown');
}

/**
 * Asks the client's limiter whether this request may proceed. Any failure
 * counts as no. A missing binding is skipped (the coarse binding still
 * applies): wrangler.jsonc binds it in production and previews, and a unit
 * test holds it there.
 */
export async function withinLimit(env: Env, request: Request): Promise<boolean> {
  const namespace = env.MCP_LIMITER;
  if (!namespace) return true;
  const limit = parseLimit(env.MCP_ADDRESS_LIMIT);
  if (!limit) return false;
  try {
    const stub = namespace.get(namespace.idFromName(`mcp:${requestKey(request)}`) as never);
    const response = await stub.fetch('https://limiter/take', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit }),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}
