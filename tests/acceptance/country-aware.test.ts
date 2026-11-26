// Acceptance tests: a country-aware Tally (card 7479). Unit level: the data
// contract, the Russia guard, the country scope in the URL, isLocated against
// the company's own country, region choices per scope, Near-me outside the UK
// and the locator per country. Committed failing before the build. Not edited
// after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimCountries, slimData } from '../../scripts/fetch-data.mjs';
import { companyLocator, sitemapXml } from '../../src/lib/company-page';
import { countryMap, countrySvg } from '../../src/lib/country-map';
import { isLocated } from '../../src/lib/filters';
import { findPlaceInScope, placeFromData } from '../../src/lib/near';
import { countryOf, DEFAULT_SCOPE, inScope, regionChoices, scopeBounds, scopeCountries, showsCountry, type Country } from '../../src/lib/scope';
import type { Company, TallyData } from '../../src/lib/types';
import { defaultState, fromQuery, sanitiseState, toQuery } from '../../src/lib/url-state';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const raw = read('tally-data.json');
const taxonomy = read('taxonomy.json');
const rawCountries = read('countries.json');

const countries = slimCountries(rawCountries) as Country[];
/** The fixture countries with Norway switched on, as card 7480 will. */
const withNorway = countries.map((c) => (c.code === 'NO' ? { ...c, live: true } : c));
const data = slimData(raw, taxonomy, rawCountries) as TallyData & { countries: Country[] };
const uk = data.companies.find((c) => c.name === 'Example Robotics') as Company;

const norwegian = (name: string, region: string, hq: string, lat: number | null, lon: number | null): Company =>
  ({ ...uk, id: name.toLowerCase().replace(/ /g, '-'), name, region, hq, lat, lon, postcode: '', location_source: 'town', country: 'Norway', country_code: 'NO' }) as Company;
const kongsberg = norwegian('Example Kongsberg Systems', 'Buskerud', 'Kongsberg, Norway', 59.6689, 9.6502);
const trondheim = norwegian('Example Trondheim Sonar', 'Trøndelag', 'Trondheim, Norway', 63.4305, 10.3951);

describe('the data carries countries', () => {
  it('every company has an ISO country code; UK companies are GB', () => {
    expect(data.companies.every((c) => /^[A-Z]{2}$/.test((c as Company & { country_code: string }).country_code))).toBe(true);
    expect(countryOf(uk)).toBe('GB');
    const nordic = data.companies.find((c) => c.name === 'Example Nordic Defence') as Company;
    expect(countryOf(nordic)).toBe('NO');
    // A UK company still has no country name, so readers of the old shape see it as UK.
    expect(uk.country).toBe('');
  });

  it('carries the countries with their live flags, and only the UK is live in the fixture', () => {
    expect(data.countries.map((c) => c.code)).toEqual(expect.arrayContaining(['GB', 'NO', 'US']));
    expect(data.countries.filter((c) => c.live).map((c) => c.code)).toEqual(['GB']);
    const gb = data.countries.find((c) => c.code === 'GB') as Country;
    expect(gb.bounds).toEqual([-8.7, 49.8, 1.9, 60.9]);
    expect(gb.regions).toHaveLength(12);
  });

  it('the build refuses a malformed countries file', () => {
    const gb = rawCountries.countries[0];
    expect(() => slimCountries({ countries: [gb, gb] })).toThrow();
    expect(() => slimCountries({ countries: [{ ...gb, code: 'gb' }] })).toThrow();
    expect(() => slimCountries({ countries: [{ ...gb, live: 'yes' }] })).toThrow();
    expect(() => slimCountries({ countries: [{ ...gb, bounds: [10, 10, 5, 5] }] })).toThrow();
    expect(() => slimCountries({ countries: [{ ...gb, regions: [] }] })).toThrow();
    expect(() => slimCountries({ countries: [{ ...gb, name: '<script>' }] })).toThrow();
  });
});

describe('Russia never reaches the site', () => {
  const russia = { code: 'RU', name: 'Russia', bloc: 'other', live: true, bounds: [19, 41, 180, 82], regions: ['Moscow'] };

  it('the build refuses Russia as a live country', () => {
    expect(() => slimCountries({ countries: [...rawCountries.countries, russia] })).toThrow(/russia|RU/i);
  });

  it('the build refuses a company in Russia', () => {
    const company = { ...raw.companies[0], name: 'Example Moscow Works', region: 'Overseas', country: 'Russia', country_code: 'RU' };
    expect(() => slimData({ ...raw, companies: [...raw.companies, company] }, taxonomy, rawCountries)).toThrow(/russia|RU/i);
  });

  it('a Russian scope is never accepted from a link', () => {
    expect(fromQuery('scope=ru').scope).toBe(DEFAULT_SCOPE);
    expect(sanitiseState({ ...defaultState(), scope: 'ru' }, data).scope).toBe(DEFAULT_SCOPE);
  });

  it('the sitemap refuses any Russia path', () => {
    expect(() => sitemapXml(['/', '/russia/'])).toThrow();
    expect(() => sitemapXml(['/', '/companies/example/', '/russia/companies/x/'])).toThrow();
  });
});

describe('the country scope in the URL', () => {
  it('the UK is the default, and every existing link reads as before', () => {
    expect(DEFAULT_SCOPE).toBe('gb');
    expect(defaultState().scope).toBe('gb');
    expect(toQuery(defaultState())).toBe('');
    expect(toQuery(fromQuery('scope=gb'))).toBe('');
    const old = 'cap=cyber&region=London&page=2&view=list';
    expect(toQuery(fromQuery(old))).toBe(old);
  });

  it('a single country or a bloc is held as scope', () => {
    expect(fromQuery('scope=no').scope).toBe('no');
    expect(fromQuery('scope=europe').scope).toBe('europe');
    expect(fromQuery('scope=north-america').scope).toBe('north-america');
    expect(toQuery({ ...defaultState(), scope: 'no' })).toBe('scope=no');
    for (const bad of ['NO', 'xyz', 'eu<script>', 'n', '']) expect(fromQuery(`scope=${encodeURIComponent(bad)}`).scope).toBe('gb');
  });

  it('a scope that is not live in the data falls back to the UK', () => {
    expect(sanitiseState(fromQuery('scope=no'), data).scope).toBe('gb');
    const live = { ...data, countries: withNorway };
    expect(sanitiseState(fromQuery('scope=no'), live).scope).toBe('no');
    expect(sanitiseState(fromQuery('scope=us'), live).scope).toBe('gb');
    // Europe with only the UK live is the UK.
    expect(scopeCountries('europe', countries).map((c) => c.code)).toEqual(['GB']);
  });

  it('regions with letters beyond A to Z are kept, and a country filter is held as country', () => {
    expect(fromQuery('scope=no&region=Møre og Romsdal').filters.region).toEqual(['Møre og Romsdal']);
    expect(fromQuery('scope=no&region=Trøndelag').filters.region).toEqual(['Trøndelag']);
    expect(fromQuery('region=London<b>').filters.region).toEqual([]);
    const state = fromQuery('scope=europe&country=gb,no,xx1');
    expect(state.countries).toEqual(['gb', 'no']);
    expect(toQuery(state)).toBe('scope=europe&country=gb,no');
  });
});

describe('scope helpers', () => {
  it('a scope covers its live countries, and its bounds are theirs', () => {
    expect(scopeCountries('gb', withNorway).map((c) => c.code)).toEqual(['GB']);
    expect(scopeCountries('no', withNorway).map((c) => c.code)).toEqual(['NO']);
    expect(scopeCountries('europe', withNorway).map((c) => c.code).sort()).toEqual(['GB', 'NO']);
    expect(scopeCountries('north-america', withNorway)).toEqual([]);
    expect(scopeBounds('gb', withNorway)).toEqual([-8.7, 49.8, 1.9, 60.9]);
    expect(scopeBounds('no', withNorway)).toEqual([4.5, 57.9, 31.2, 71.2]);
    expect(scopeBounds('europe', withNorway)).toEqual([-8.7, 49.8, 31.2, 71.2]);
  });

  it('a company is in a scope by its own country', () => {
    expect(inScope(uk, 'gb', withNorway)).toBe(true);
    expect(inScope(kongsberg, 'gb', withNorway)).toBe(false);
    expect(inScope(kongsberg, 'no', withNorway)).toBe(true);
    expect(inScope(kongsberg, 'europe', withNorway)).toBe(true);
    expect(inScope(kongsberg, 'europe', countries)).toBe(false);
  });

  it('the region choices are the scope country\'s regions, or countries across several', () => {
    const gb = regionChoices('gb', withNorway);
    expect(gb.facet).toBe('region');
    expect(gb.options.map((o) => o.label)).toHaveLength(12);
    const no = regionChoices('no', withNorway);
    expect(no.facet).toBe('region');
    expect(no.options.map((o) => o.label)).toContain('Trøndelag');
    expect(no.options.map((o) => o.label)).not.toContain('London');
    const europe = regionChoices('europe', withNorway);
    expect(europe.facet).toBe('country');
    expect(europe.options).toEqual([
      { slug: 'no', label: 'Norway' },
      { slug: 'gb', label: 'United Kingdom' },
    ]);
  });

  it('the matrix shows each company\'s country only across several countries', () => {
    expect(showsCountry('gb', withNorway)).toBe(false);
    expect(showsCountry('no', withNorway)).toBe(false);
    expect(showsCountry('europe', withNorway)).toBe(true);
    expect(showsCountry('europe', countries)).toBe(false);
  });
});

describe('isLocated checks the company\'s own country', () => {
  it('with no countries given, it is the UK rule exactly as before', () => {
    expect(isLocated(uk)).toBe(true);
    expect(isLocated(kongsberg)).toBe(false);
  });

  it('a point is drawn only when its country is in view, live, and the point is inside that country', () => {
    const no = scopeCountries('no', withNorway);
    const europe = scopeCountries('europe', withNorway);
    expect(isLocated(kongsberg, no)).toBe(true);
    expect(isLocated(uk, no)).toBe(false);
    expect(isLocated(kongsberg, europe)).toBe(true);
    expect(isLocated(uk, europe)).toBe(true);
    // Norway not live: never drawn.
    expect(isLocated(kongsberg, scopeCountries('europe', countries))).toBe(false);
    // A Norwegian company with a point in the UK is refused: outside its own country.
    expect(isLocated({ ...kongsberg, lat: 51.5, lon: -0.1 }, europe)).toBe(false);
    // A region-level location is never drawn, in any country.
    expect(isLocated({ ...kongsberg, location_source: 'region' }, no)).toBe(false);
  });
});

describe('Near-me outside the UK uses Tally\'s own data', () => {
  it('a town is found from the companies that give it', () => {
    expect(placeFromData('kongsberg', [kongsberg, trondheim])).toEqual({ name: 'Kongsberg', lat: 59.6689, lon: 9.6502 });
    expect(placeFromData('Bergen', [kongsberg, trondheim])).toBeNull();
    expect(placeFromData('<script>', [kongsberg])).toBeNull();
  });

  it('postcodes.io is asked only in the UK scope', async () => {
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(String(url));
      return new Response(JSON.stringify({ status: 200, result: { postcode: 'BS16 1QY', latitude: 51.5, longitude: -2.55 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const found = await findPlaceInScope('Kongsberg', 'no', [kongsberg, trondheim], fetcher);
    expect(found).toEqual({ kind: 'found', place: { name: 'Kongsberg', lat: 59.6689, lon: 9.6502 } });
    expect(await findPlaceInScope('Bergen', 'no', [kongsberg, trondheim], fetcher)).toEqual({ kind: 'not-found' });
    expect(asked).toEqual([]);
    const home = await findPlaceInScope('BS16 1QY', 'gb', [uk], fetcher);
    expect(home.kind).toBe('found');
    expect(asked).toHaveLength(1);
    expect(new URL(asked[0]).origin).toBe('https://api.postcodes.io');
  });

  it('a place from a link is kept when it is inside the scope', () => {
    const live = { ...data, countries: withNorway };
    const state = sanitiseState(fromQuery('scope=no&near=Kongsberg&at=59.6689,9.6502'), live);
    expect(state.near).toEqual({ name: 'Kongsberg', lat: 59.6689, lon: 9.6502 });
    expect(toQuery(state)).toBe('scope=no&near=Kongsberg&at=59.6689,9.6502');
    // The same point with the UK scope is outside it, and is dropped.
    expect(sanitiseState(fromQuery('near=Kongsberg&at=59.6689,9.6502'), live).near).toBeNull();
  });
});

describe('the locator per country', () => {
  it('a UK company keeps the UK outline', () => {
    const loc = companyLocator(uk);
    expect(loc.kind).toBe('point');
    expect((loc as { map?: string }).map ?? '/maps/uk.svg').toBe('/maps/uk.svg');
  });

  it('a company in a live country gets its point on its own country\'s outline', () => {
    const loc = companyLocator(kongsberg, withNorway);
    expect(loc.kind).toBe('point');
    const point = loc as { map: string; x: number; y: number };
    expect(point.map).toBe('/maps/no.svg');
    const size = countryMap('NO');
    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(size.width);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(size.height);
  });

  it('a company in a country that is not live gets no drawing', () => {
    expect(companyLocator(kongsberg, countries).kind).toBe('none');
    expect(companyLocator(kongsberg).kind).toBe('none');
  });

  it('the country outline is a plain SVG', () => {
    const svg = countrySvg('NO') as string;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path');
    expect(svg).not.toMatch(/<script|on[a-z]+=/i);
    expect(countrySvg('RU')).toBeNull();
  });
});
