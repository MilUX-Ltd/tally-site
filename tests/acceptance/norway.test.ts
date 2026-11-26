// Acceptance tests: Norway (card 7480). Unit level: the Norwegian register
// file and closed companies, the scope choice once a second country is live,
// where a Norwegian company is, the data sources per live country, and the
// Near-me hint per scope. Committed failing before the build. Not edited after
// that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeStatus, moneyIds, slimCountries, slimData, slimNorwayRegister, withoutClosed } from '../../scripts/fetch-data.mjs';
import { companyLocation } from '../../src/lib/company-page';
import { nearHint } from '../../src/lib/near';
import { scopeOptions, UNITED_KINGDOM, type Country } from '../../src/lib/scope';
import { dataSources } from '../../src/lib/sources';
import type { Company } from '../../src/lib/types';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const raw = read('tally-data.json');
const taxonomy = read('taxonomy.json');
const rawCountries = read('countries.json');
const countries = slimCountries(rawCountries) as Country[];
const withNorway = countries.map((c) => (c.code === 'NO' ? { ...c, live: true } : c));

const NLOD = 'Contains data under the Norwegian licence for Open Government data (NLOD) distributed by the Brønnøysund Register Centre.';
const register = (extra: Record<string, unknown> = {}) => ({
  generated: '2026-12-07',
  attribution: NLOD,
  source: 'Brønnøysund Register Centre, Central Coordinating Register for Legal Entities',
  checked: { companies: 2, found: 2, not_found: 0, failed: 0 },
  closed: [{ name: 'Example Nordic Defence', brreg: '943753709', status: 'deleted', date: '2026-11-30' }],
  flagged: [],
  not_found: [],
  ...extra,
});

describe('the Norwegian register file', () => {
  const ids = moneyIds(raw);

  it('reads closed and flagged companies by name, as for Companies House', () => {
    const no = slimNorwayRegister(register(), ids);
    expect(Object.keys(no.closed)).toEqual(['example-nordic-defence']);
    expect(no.closed['example-nordic-defence'].status).toBe('deleted');
    expect(no.flagged).toEqual({});
  });

  it('refuses a malformed file or anything personal', () => {
    expect(() => slimNorwayRegister(register({ attribution: 'Anything else' }), ids)).toThrow();
    expect(() => slimNorwayRegister(register({ closed: [{ name: 'Example Nordic Defence', brreg: '943753708', status: 'deleted', date: '2026-11-30' }] }), ids)).toThrow();
    expect(() => slimNorwayRegister(register({ closed: [{ name: 'Example Nordic Defence', brreg: '943753709', status: 'deleted', date: '2026-11-30', telefon: '+47 00 00 00 00' }] }), ids)).toThrow();
    expect(() => slimNorwayRegister(register({ contacts: [] }), ids)).toThrow();
    expect(() => slimNorwayRegister(register({ closed: [{ name: 'Example Nordic Defence', brreg: '943753709', status: 'gone', date: '2026-11-30' }] }), ids)).toThrow();
  });

  it('a closed Norwegian company leaves the directory beside closed UK companies', () => {
    const data = slimData(raw, taxonomy, rawCountries);
    const ch = { closed: { 'example-robotics': { status: 'dissolved', date: '2026-01-01' } }, flagged: {} };
    const merged = mergeStatus(ch, slimNorwayRegister(register(), ids));
    expect(Object.keys(merged.closed).sort()).toEqual(['example-nordic-defence', 'example-robotics']);
    const { open, closed } = withoutClosed(data, merged);
    expect(open.companies.some((c: Company) => c.id === 'example-nordic-defence')).toBe(false);
    expect(closed.map((c: Company) => c.id).sort()).toEqual(['example-nordic-defence', 'example-robotics']);
  });
});

describe('the scope choice', () => {
  it('is offered only once a second country is live', () => {
    expect(scopeOptions([UNITED_KINGDOM])).toEqual([]);
    expect(scopeOptions(countries)).toEqual([]);
  });

  it('offers the UK first, then each live country, then each bloc with two or more live countries', () => {
    expect(scopeOptions(withNorway)).toEqual([
      { value: 'gb', label: 'United Kingdom' },
      { value: 'no', label: 'Norway' },
      { value: 'europe', label: 'Europe' },
    ]);
  });
});

describe('where a Norwegian company is', () => {
  const kongsberg = {
    ...(slimData(raw, taxonomy, rawCountries).companies[0] as Company),
    id: 'example-kongsberg-systems',
    name: 'Example Kongsberg Systems',
    hq: 'Kongsberg, Norway',
    region: 'Buskerud',
    postcode: '3616',
    lat: 59.6689,
    lon: 9.6502,
    location_source: 'register',
    country: 'Norway',
    country_code: 'NO',
  } as Company;

  it('reads as postcode, town and county from the register, with a point when Norway is live', () => {
    const live = companyLocation(kongsberg, withNorway);
    expect(live.text).toBe('3616 Kongsberg, Buskerud');
    expect(live.point).not.toBeNull();
    expect(live.note).toBe('');
  });

  it('stays an overseas company while Norway is not live', () => {
    const off = companyLocation(kongsberg, countries);
    expect(off.point).toBeNull();
    expect(off.note).toMatch(/outside the UK/);
  });
});

describe('data sources per live country', () => {
  it('names the UK sources always, and Norway\'s only once it is live', () => {
    const uk = dataSources(countries).map((s) => s.name);
    expect(uk).toEqual(expect.arrayContaining(['Companies House', 'postcodes.io']));
    expect(uk).not.toContain('Brønnøysund Register Centre');
    expect(uk).not.toContain('GeoNames');

    const both = dataSources(withNorway);
    const brreg = both.find((s) => s.name === 'Brønnøysund Register Centre');
    expect(brreg?.licence).toBe('NLOD 2.0');
    expect(brreg?.url).toMatch(/^https:\/\//);
    expect(both.find((s) => s.name === 'GeoNames')?.licence).toBe('CC BY 4.0');
    expect(both.find((s) => s.name === 'Natural Earth')?.licence).toBe('Public domain');
  });
});

describe('the Near-me hint per scope', () => {
  it('names postcodes.io only in the UK scope', () => {
    expect(nearHint('gb')).toMatch(/postcodes\.io/);
    for (const scope of ['no', 'europe']) {
      expect(nearHint(scope)).not.toMatch(/postcodes\.io/);
      expect(nearHint(scope)).toMatch(/town/i);
    }
  });
});
