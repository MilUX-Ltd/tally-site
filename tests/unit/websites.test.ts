// Unit tests for the website link check (D-kzifn): the build's check of
// websites.json and how dead and moved websites change the directory.
// Committed failing before the build. The builder does not edit this file.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyWebsites, moneyIds, slimData, slimWebsites } from '../../scripts/fetch-data.mjs';
import type { TallyData } from '../../src/lib/types';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const raw = fixture('tally-data.json');
const rawWeb = fixture('websites.json');
const ids = moneyIds(raw);
const copy = () => JSON.parse(JSON.stringify(rawWeb));
const site = (data: TallyData, id: string) => data.companies.find((c) => c.id === id)?.website;

describe('slimWebsites', () => {
  it('keys dead and moved websites by Tally id with their URL, and drops pending', () => {
    const web = slimWebsites(rawWeb, ids);
    expect(web.dead).toEqual({ 'example-depot-services': 'https://example.com/example-depot-services', 'example-spares-supply': 'https://old.example.com/spares' });
    expect(web.moved).toEqual({ 'example-moorland-consulting': { url: 'https://example.com/example-moorland-consulting', home: 'https://example.com/' } });
    expect(web).not.toHaveProperty('pending');
  });
  it('refuses a malformed file', () => {
    const bad = [
      (d: typeof rawWeb) => { d.extra = 1; },
      (d: typeof rawWeb) => { d.dead[0].reason = 'slow'; },
      (d: typeof rawWeb) => { d.dead[0].url = 'javascript:alert(1)'; },
      (d: typeof rawWeb) => { d.moved[0].home = 'https://example.com/elsewhere/'; },
      (d: typeof rawWeb) => { d.moved[0].home = 'https://another.example/'; },
      (d: typeof rawWeb) => { d.moved[0].since = 'last week'; },
    ];
    for (const change of bad) {
      const doc = copy();
      change(doc);
      expect(() => slimWebsites(doc, ids)).toThrow();
    }
  });
});

describe('applyWebsites', () => {
  const data = applyWebsites(slimData(raw, fixture('taxonomy.json')) as TallyData, slimWebsites(rawWeb, ids)) as TallyData;
  it('drops a dead website', () => {
    expect(site(data, 'example-depot-services')).toBe('');
  });
  it('links a moved page to the home page', () => {
    expect(site(data, 'example-moorland-consulting')).toBe('https://example.com/');
  });
  it('leaves a website whose URL has since changed, and pending ones', () => {
    expect(site(data, 'example-spares-supply')).toBe('https://example.com/example-spares-supply');
    expect(site(data, 'example-range-services')).toBe('https://example.com/example-range-services');
  });
  it('keeps every company', () => {
    expect(data.count).toBe(57);
  });
});
