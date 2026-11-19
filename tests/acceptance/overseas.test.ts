// Acceptance tests: overseas companies by country, never on the UK map.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { binCompanies } from '../../src/lib/binning';
import { overseasByCountry } from '../../src/lib/countries';
import { isLocated } from '../../src/lib/filters';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const uk = data.companies.find((c) => c.name === 'Example Robotics') as Company;
const abroad = (name: string, country: string, extra: Partial<Company> = {}): Company => ({
  ...uk,
  id: name.toLowerCase().replace(/ /g, '-'),
  name,
  region: 'Overseas',
  country,
  hq: country,
  lat: null,
  lon: null,
  location_source: '',
  ...extra,
});

describe('overseas companies', () => {
  it('groups overseas companies by country, Europe first', () => {
    const companies = [
      uk,
      abroad('Zeta Systems', 'United States'),
      abroad('Alpha Systems', 'United States'),
      abroad('Fjord Radar', 'Norway'),
      abroad('Baltic Optics', 'Estonia'),
      abroad('Kiwi Marine', 'New Zealand'),
      abroad('Rhine Sensors', 'Germany'),
      abroad('Mystery Ltd', '', { region: 'Overseas' }),
    ];
    const { europe, world } = overseasByCountry(companies);
    expect(europe.map((g) => g.country)).toEqual(['Estonia', 'Germany', 'Norway']);
    expect(world.map((g) => g.country)).toEqual(['New Zealand', 'United States', 'Country not known']);
    expect(world[1].companies.map((c) => c.name)).toEqual(['Alpha Systems', 'Zeta Systems']);
    const all = [...europe, ...world].flatMap((g) => g.companies.map((c) => c.name));
    expect(all).not.toContain('Example Robotics');
    expect(all).toHaveLength(7);
    expect(overseasByCountry([uk])).toEqual({ europe: [], world: [] });
    // The fixture's one overseas company.
    expect(overseasByCountry(data.companies).europe).toEqual([
      { country: 'Norway', companies: [data.companies.find((c) => c.name === 'Example Nordic Defence')] },
    ]);
  });

  it('the build drops overseas and out-of-bounds points', () => {
    const rawCompany = raw.companies.find((c: { name: string }) => c.name === 'Example Robotics');
    const built = slimData(
      {
        ...raw,
        companies: [
          { ...rawCompany, name: 'Overseas With Point', region: 'Overseas', country: 'Norway', lat: 59.91, lon: 10.75, location_source: 'town' },
          { ...rawCompany, name: 'Paris Point', country: '', lat: 48.8566, lon: 2.3522, location_source: 'town' },
          { ...rawCompany, name: 'Jersey Point', country: '', lat: 49.21, lon: -2.13, location_source: 'town' },
          { ...rawCompany, name: 'Manchester Point' },
        ],
      },
      taxonomy,
    ) as TallyData;
    const point = (name: string) => {
      const c = built.companies.find((x) => x.name === name) as Company;
      return [c.lat, c.lon];
    };
    expect(point('Overseas With Point')).toEqual([null, null]);
    expect(point('Paris Point')).toEqual([null, null]);
    expect(point('Jersey Point')).toEqual([null, null]);
    expect(point('Manchester Point')).toEqual([53.4808, -2.2426]);
  });

  it('the browser refuses overseas and out-of-bounds points', () => {
    const oslo = abroad('Oslo Point', 'Norway', { lat: 59.91, lon: 10.75 });
    const london = abroad('London Overseas Office', 'United States', { lat: 51.5072, lon: -0.1276 });
    const paris = { ...uk, id: 'paris', country: '', lat: 48.8566, lon: 2.3522 };
    expect(isLocated(uk)).toBe(true);
    for (const c of [oslo, london, paris]) expect(isLocated(c)).toBe(false);
    const bins = binCompanies([uk, oslo, london, paris], 5);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(1);
    expect(bins[0].ids).toEqual([uk.id]);
  });
});
