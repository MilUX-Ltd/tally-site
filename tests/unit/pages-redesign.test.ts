// Unit tests for the redesigned company page model: the check line, the
// capability tags, the locator and the nearest defence sites.
// Committed failing before the build.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { capabilityTagGroups, checkLine, companyLocator, nearestSites, regionSlug, UK_MAP } from '../../src/lib/company-page';
import type { Site } from '../../src/lib/sites';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const byName = (name: string) => data.companies.find((c) => c.name === name) as Company;
const sites = (JSON.parse(readFileSync(new URL('../../public/sites/defence-sites.json', import.meta.url), 'utf8')) as { sites: Site[] }).sites;

describe('check line', () => {
  it('says when the public sources were last checked', () => {
    expect(checkLine('2026-06-29')).toEqual({ before: 'Last checked against public sources on ', iso: '2026-06-29', date: '29 June 2026', after: '.' });
  });
  it('says so plainly when there is no date, or not a real one', () => {
    for (const value of [null, '', '2026-02-31', 'yesterday']) expect(checkLine(value)).toEqual({ before: 'From public sources. Not yet checked.', iso: null, date: null, after: '' });
  });
});

describe('capability tags', () => {
  it('groups tags in taxonomy order and keeps full labels', () => {
    const groups = capabilityTagGroups(byName('Example Cyber Defence'), data.taxonomy);
    expect(groups).toEqual([{ slug: 'cyber-data-software', label: 'Cyber, data and software', tags: ['Cyber', 'Cyber / Pen Testing'] }]);
  });
  it('never repeats the group name in its tags', () => {
    const [space] = capabilityTagGroups(byName('Example Space Systems'), data.taxonomy).filter((g) => g.slug === 'space');
    expect(space).toEqual({ slug: 'space', label: 'Space', tags: ['Satellite', 'Ground Systems'] });
    for (const company of data.companies) {
      for (const g of capabilityTagGroups(company, data.taxonomy)) {
        for (const tag of g.tags) {
          expect(tag.toLowerCase()).not.toBe(g.label.toLowerCase());
          expect(tag.startsWith(`${g.label} / `)).toBe(false);
        }
      }
    }
  });
  it('keeps a group whose only capability is the group itself', () => {
    const only = { ...byName('Example Space Systems'), tags: ['space'] };
    expect(capabilityTagGroups(only, data.taxonomy)).toEqual([{ slug: 'space', label: 'Space', tags: [] }]);
  });
});

describe('locator', () => {
  it('gives a located company its point, coordinates and a local window', () => {
    const locator = companyLocator(byName('Example Cyber Defence'));
    expect(locator.kind).toBe('point');
    if (locator.kind !== 'point') return;
    expect(locator.x).toBeGreaterThan(0);
    expect(locator.x).toBeLessThan(UK_MAP.width);
    expect(locator.y).toBeGreaterThan(0);
    expect(locator.y).toBeLessThan(UK_MAP.height);
    expect(locator.north).toBe('51.51°N');
    expect(locator.east).toBe('0.13°W');
    // The window is square on the ground and holds the 25 mile ring.
    expect(locator.ring.ry).toBeLessThan(locator.window.size / 2);
    expect(locator.ring.rx).toBeLessThan(locator.window.size / 2);
    // The map is drawn for the UK's middle latitude, so the ring is narrower than tall in the south and wider in the north.
    expect(locator.ring.rx).toBeLessThan(locator.ring.ry);
    const north = companyLocator(byName('Example Space Systems'));
    expect(north.kind === 'point' && north.ring.rx > north.ring.ry).toBe(true);
  });
  it('writes east of Greenwich as E', () => {
    const east = companyLocator({ ...byName('Example Cyber Defence'), lat: 52.6, lon: 1.25 });
    expect(east.kind === 'point' && east.east).toBe('1.25°E');
  });
  it('shades the region when only the region is published', () => {
    const company = { ...byName('Example Cyber Defence'), location_source: 'region' as const, region: 'Yorkshire and The Humber' };
    expect(companyLocator(company)).toEqual({ kind: 'region', region: 'Yorkshire and The Humber', href: '/maps/region/yorkshire-and-the-humber.svg' });
    expect(regionSlug('East of England')).toBe('east-of-england');
  });
  it('draws nothing for a region it does not know, an overseas company or an unplaced one', () => {
    expect(companyLocator({ ...byName('Example Cyber Defence'), location_source: 'region' as const, region: 'Atlantis' })).toEqual({ kind: 'none' });
    expect(companyLocator(byName('Example Nordic Defence'))).toEqual({ kind: 'none' });
    expect(companyLocator(byName('Example Unplaced Ltd'))).toEqual({ kind: 'none' });
  });
});

describe('nearest defence sites', () => {
  it('lists the nearest sites to a located company, nearest first, in whole miles', () => {
    const near = nearestSites(byName('Example Cyber Defence'), sites, 3);
    expect(near).toHaveLength(3);
    expect(near.map((s) => s.miles)).toEqual([...near.map((s) => s.miles)].sort((a, b) => a - b));
    for (const s of near) {
      expect(Number.isInteger(s.miles)).toBe(true);
      expect(sites.some((site) => site.id === s.id && site.name === s.name)).toBe(true);
    }
  });
  it('lists none for a company that is not on the map', () => {
    expect(nearestSites(byName('Example Nordic Defence'), sites, 3)).toEqual([]);
    expect(nearestSites(byName('Example Unplaced Ltd'), sites, 3)).toEqual([]);
    expect(nearestSites({ ...byName('Example Cyber Defence'), location_source: 'region' as const }, sites, 3)).toEqual([]);
  });
});
