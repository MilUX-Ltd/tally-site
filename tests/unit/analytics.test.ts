import { describe, expect, it } from 'vitest';
import { beaconConfig } from '../../src/lib/analytics';

describe('Cloudflare Web Analytics beacon (D-wsjc7)', () => {
  it('renders nothing until a valid site token is set', () => {
    expect(beaconConfig('')).toBeNull();
    expect(beaconConfig('not-a-token')).toBeNull();
    expect(beaconConfig('"><script>')).toBeNull();
  });
  it('carries only the token', () => {
    const token = '0123456789abcdef0123456789abcdef';
    expect(JSON.parse(beaconConfig(token) ?? '{}')).toEqual({ token });
  });
});
