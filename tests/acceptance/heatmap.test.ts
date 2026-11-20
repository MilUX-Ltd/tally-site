// Acceptance tests: capability heatmap (data, filters, binning, colour, CSP).
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { emptyFilters, filterCompanies } from '../../src/lib/filters';
import { binCompanies, binsToGeoJSON, PIN_ZOOM, resolutionForZoom } from '../../src/lib/binning';
import { BRAND_SCALE, colourScale } from '../../src/lib/colour';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const companies = data.companies;
const located = companies.filter((c) => c.lat != null && c.lon != null);

describe('build data', () => {
  it('slims the data for the browser', () => {
    expect(companies).toHaveLength(57);
    const ids = new Set(companies.map((c) => c.id));
    expect(ids.size).toBe(companies.length);
    for (const c of companies) {
      expect(c).not.toHaveProperty('body');
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      if (c.website) expect(c.website).toMatch(/^https?:\/\//);
    }
    expect(companies.find((c) => c.name === 'Example Unplaced Ltd')?.website).toBe('');
    expect(located).toHaveLength(55);
    expect(companies.find((c) => c.name === 'Example Nordic Defence')?.country).toBe('Norway');
    expect(data.taxonomy.groups).toHaveLength(10);
    expect(data.taxonomy.capabilities.length).toBeGreaterThan(50);
  });
});

describe('filters', () => {
  it('filters combine across facets and match sub-capabilities', () => {
    expect(filterCompanies(companies, emptyFilters())).toHaveLength(57);
    // "cyber" matches cyber and cyber/... tags: four located, one overseas.
    const cyber = filterCompanies(companies, { ...emptyFilters(), cap: ['cyber'] });
    expect(cyber.map((c) => c.name).sort()).toEqual([
      'Example Analytics North',
      'Example Cyber Defence',
      'Example Nordic Defence',
      'Example Secure Comms',
      'Example Signals Intelligence',
    ]);
    // Within a facet: any. Across facets: all.
    expect(filterCompanies(companies, { ...emptyFilters(), cap: ['cyber'], size: ['size-small'] })).toHaveLength(2);
    expect(filterCompanies(companies, { ...emptyFilters(), cap: ['cyber', 'space'] })).toHaveLength(6);
    expect(filterCompanies(companies, { ...emptyFilters(), region: ['Scotland'] })).toHaveLength(4);
    expect(filterCompanies(companies, { ...emptyFilters(), accr: ['accr-as9100'], mbr: ['mbr-ads'] })).toHaveLength(3);
    expect(filterCompanies(companies, { ...emptyFilters(), fw: ['fw-dos'] })).toHaveLength(3);
    // A sub-capability does not match its parent.
    expect(filterCompanies(companies, { ...emptyFilters(), cap: ['cyber/pen-testing'] })).toHaveLength(1);
  });

  it('chooses a finer hexagon as the map zooms in', () => {
    let last = 0;
    for (let z = 3; z < PIN_ZOOM; z += 0.5) {
      const r = resolutionForZoom(z);
      expect(r).toBeGreaterThanOrEqual(last);
      expect(r).toBeGreaterThanOrEqual(2);
      expect(r).toBeLessThanOrEqual(9);
      last = r;
    }
    expect(resolutionForZoom(PIN_ZOOM - 0.1)).toBeGreaterThan(resolutionForZoom(4));
    expect(PIN_ZOOM).toBeGreaterThanOrEqual(7);
    expect(PIN_ZOOM).toBeLessThanOrEqual(12);
  });
});

describe('binning', () => {
  it('bins every located company into exactly one hexagon', () => {
    for (const res of [3, 4, 5, 6, 7]) {
      const bins = binCompanies(companies, res);
      const total = bins.reduce((n, b) => n + b.count, 0);
      expect(total).toBe(located.length);
      const seen = bins.flatMap((b) => b.ids);
      expect(new Set(seen).size).toBe(located.length);
      for (const b of bins) expect(b.ids).toHaveLength(b.count);
    }
    // The three Bristol companies share a point, so share a hexagon.
    const bristol = companies.filter((c) => c.hq.startsWith('Bristol')).map((c) => c.id).sort();
    const cell = binCompanies(companies, 5).find((b) => b.ids.includes(bristol[0]));
    expect([...(cell?.ids ?? [])].sort()).toEqual(bristol);
    const geo = binsToGeoJSON(binCompanies(companies, 4));
    expect(geo.type).toBe('FeatureCollection');
    for (const f of geo.features) {
      expect(f.geometry.type).toBe('Polygon');
      expect(f.properties.count).toBeGreaterThan(0);
      expect(typeof f.properties.cell).toBe('string');
    }
  });

  it('redraws 2,500 companies within 200 ms', () => {
    const caps = data.taxonomy.capabilities.map((c) => c.slug);
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const many: Company[] = Array.from({ length: 2500 }, (_, i) => ({
      ...companies[i % companies.length],
      id: `synthetic-${i}`,
      lat: 50 + rand() * 8.5,
      lon: -6 + rand() * 7.5,
      tags: [caps[Math.floor(rand() * caps.length)], caps[Math.floor(rand() * caps.length)], 'size-small'],
    }));
    const redraw = (zoom: number) =>
      binsToGeoJSON(binCompanies(filterCompanies(many, { ...emptyFilters(), size: ['size-small'] }), resolutionForZoom(zoom)));
    redraw(5); // warm up
    const times: number[] = [];
    for (const zoom of [4.5, 5.5, 6.5, 7.5, 5]) {
      const t0 = performance.now();
      redraw(zoom);
      times.push(performance.now() - t0);
    }
    expect(Math.max(...times)).toBeLessThan(200);
  });
});

describe('colour scale', () => {
  it('colour scale uses brand colours in order of count', () => {
    expect(BRAND_SCALE.map((c) => c.toLowerCase())).toEqual(['#d2c78d', '#b5b171', '#a35c17', '#113308']);
    for (const max of [1, 2, 3, 5, 12, 40, 150, 900]) {
      const s = colourScale(max);
      for (let i = 1; i < s.breaks.length; i++) expect(s.breaks[i]).toBeGreaterThan(s.breaks[i - 1]);
      expect(s.breaks[0]).toBe(1);
      expect(s.legend.length).toBe(s.breaks.length);
      expect(s.legend.length).toBeLessThanOrEqual(BRAND_SCALE.length);
      for (const entry of s.legend) expect(BRAND_SCALE).toContain(entry.colour);
      let lastIndex = -1;
      for (let n = 1; n <= max; n++) {
        const idx = BRAND_SCALE.indexOf(s.colourFor(n));
        expect(idx).toBeGreaterThanOrEqual(lastIndex);
        lastIndex = idx;
      }
      expect(s.colourFor(max)).toBe(s.legend[s.legend.length - 1].colour);
      for (const entry of s.legend) expect(entry.label).not.toMatch(/—/);
    }
  });
});

describe('content security policy', () => {
  it('allows the map tile host in the CSP', () => {
    const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    const csp = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:')) ?? '';
    const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';
    expect(directive('connect-src')).toContain('https://tiles.openfreemap.org');
    expect(directive('img-src')).toContain('https://tiles.openfreemap.org');
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('style-src')).toBe("style-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });
});
