import { describe, expect, it } from 'vitest';
import { slimData, UK_BOUNDS as BUILD_BOUNDS } from '../../scripts/fetch-data.mjs';
import { UK_BOUNDS } from '../../src/lib/map-config';

const base = { website: 'https://example.com', linkedin: '', hq: '', region: 'Wales', size: 'small', headcount: '', founded: '', tags: ['defence'], summary: 'A test company.', body: 'x' };

describe('build data locations', () => {
  it('never maps a company whose location is published only as a region', () => {
    const data = slimData(
      {
        generated: 'test',
        companies: [
          { ...base, name: 'Region Only', location_source: 'region', lat: 51.5, lon: -3.2, postcode: '' },
          { ...base, name: 'Placed', location_source: 'website', lat: 51.5, lon: -3.2, postcode: 'CF10 1AA' },
          { ...base, name: 'Overseas', region: 'Overseas', country: 'France', location_source: '', lat: null, lon: null },
        ],
      },
      { facets: {} },
    );
    const byName = Object.fromEntries(data.companies.map((c: { name: string }) => [c.name, c]));
    expect(byName['Region Only']).toMatchObject({ lat: null, lon: null, location_source: 'region', region: 'Wales' });
    expect(byName['Placed']).toMatchObject({ lat: 51.5, lon: -3.2, postcode: 'CF10 1AA' });
    expect(byName['Overseas']).toMatchObject({ lat: null, lon: null, country: 'France' });
  });

  it('uses the same UK bounds as the map', () => {
    expect(BUILD_BOUNDS).toEqual(UK_BOUNDS);
  });
});
