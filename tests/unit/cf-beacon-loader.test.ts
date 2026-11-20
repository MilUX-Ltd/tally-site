import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// The loader adds Cloudflare's beacon on the live host only (D-wsjc7).
const source = readFileSync(new URL('../../public/scripts/cf-beacon.js', import.meta.url), 'utf8');

function run(hostname: string, config: string | null) {
  const added: { src?: string; attrs: Record<string, string> }[] = [];
  const document = {
    currentScript: { getAttribute: () => config },
    createElement: () => {
      const el: { src?: string; defer?: boolean; attrs: Record<string, string>; setAttribute: (k: string, v: string) => void } = {
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
      };
      return el;
    },
    head: { appendChild: (el: { src?: string; attrs: Record<string, string> }) => added.push(el) },
  };
  vm.runInNewContext(source, { document, window: { location: { hostname } } });
  return added;
}

const config = JSON.stringify({ token: '0123456789abcdef0123456789abcdef' });

describe('Cloudflare beacon loader', () => {
  it('loads the beacon on tally.milux.co.uk with the page config', () => {
    const added = run('tally.milux.co.uk', config);
    expect(added).toHaveLength(1);
    expect(added[0].src).toBe('https://static.cloudflareinsights.com/beacon.min.js');
    expect(added[0].attrs['data-cf-beacon']).toBe(config);
  });
  it('loads nothing on previews, local builds or test servers', () => {
    for (const host of ['pr-41-tally-site.milux.workers.dev', 'localhost', '127.0.0.1', 'tally-site.milux.workers.dev']) {
      expect(run(host, config)).toHaveLength(0);
    }
  });
  it('loads nothing without a config', () => {
    expect(run('tally.milux.co.uk', null)).toHaveLength(0);
  });
});
