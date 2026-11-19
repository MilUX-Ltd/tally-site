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
  it('never allows inline script', () => {
    expect(headers).not.toContain("'unsafe-inline'");
    expect(headers).not.toContain("'unsafe-eval'");
  });
});
