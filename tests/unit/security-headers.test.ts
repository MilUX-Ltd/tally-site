import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');

describe('security headers baseline', () => {
  it('applies to every path', () => {
    expect(headers).toMatch(/^\/\*$/m);
  });
  it.each([
    ['Content-Security-Policy', "default-src 'self'"],
    ['Content-Security-Policy', "frame-ancestors 'none'"],
    ['Content-Security-Policy', "object-src 'none'"],
    ['Strict-Transport-Security', 'max-age=31536000'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Frame-Options', 'DENY'],
    ['Permissions-Policy', 'camera=()'],
  ])('sets %s with %s', (name, fragment) => {
    const line = headers.split('\n').find((l) => l.trim().startsWith(`${name}:`));
    expect(line, `${name} missing`).toBeDefined();
    expect(line).toContain(fragment);
  });
  it('allows the map tile host for connect and images only', () => {
    const csp = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:')) ?? '';
    const directives = csp.replace('Content-Security-Policy:', '').split(';').map((d) => d.trim());
    const tileHost = 'https://tiles.openfreemap.org';
    const withHost = directives.filter((d) => d.split(/\s+/).slice(1).some((token) => token === tileHost)).map((d) => d.split(/\s+/)[0]);
    expect(withHost.sort()).toEqual(['connect-src', 'img-src']);
    const thirdParty = csp.match(/https:\/\/[a-z0-9.-]+/g) ?? [];
    expect(new Set(thirdParty)).toEqual(new Set([tileHost]));
  });
  it('never allows inline script', () => {
    expect(headers).not.toContain("'unsafe-inline'");
    expect(headers).not.toContain("'unsafe-eval'");
  });
});
