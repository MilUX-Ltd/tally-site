// Acceptance tests: near-me search. Typed places are read strictly, looked up
// with postcodes.io (mocked here, never the network), and held in the URL as
// the resolved place. Committed failing before the build. Not edited after
// that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { DEFAULT_NEAR_RADIUS, findPlace, GEOCODER_ORIGIN, NEAR_RADII, readPlaceQuery } from '../../src/lib/near';
import { companiesNearSite, distanceMiles } from '../../src/lib/sites';
import type { Company, TallyData } from '../../src/lib/types';
import { defaultState, fromQuery, toQuery } from '../../src/lib/url-state';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;

type Call = { url: string; init?: RequestInit };
function mockFetch(respond: (url: URL) => { status: number; body?: unknown } | 'fail') {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const answer = respond(new URL(url));
    if (answer === 'fail') throw new TypeError('network down');
    return new Response(answer.body === undefined ? '' : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

const NEWPORT = [
  { name_1: 'Newport', local_type: 'Village', latitude: 51.9833, longitude: 0.2167, county_unitary: 'Essex', country: 'England' },
  { name_1: 'Newport Pagnell', local_type: 'Town', latitude: 52.0868, longitude: -0.7224, county_unitary: 'Milton Keynes', country: 'England' },
  { name_1: 'Newport', name_2: 'Casnewydd', local_type: 'City', latitude: 51.5877, longitude: -2.9984, county_unitary: 'Newport', country: 'Wales' },
  { name_1: 'Newport', local_type: 'Town', latitude: 50.701, longitude: -1.2883, county_unitary: 'Isle of Wight', country: 'England' },
];

describe('near-me search', () => {
  it('reads postcodes, outward codes and place names strictly', () => {
    expect(readPlaceQuery('bs16 1qy')).toEqual({ kind: 'postcode', value: 'BS16 1QY' });
    expect(readPlaceQuery('  BS161QY ')).toEqual({ kind: 'postcode', value: 'BS16 1QY' });
    expect(readPlaceQuery('SW1A 2AA')).toEqual({ kind: 'postcode', value: 'SW1A 2AA' });
    expect(readPlaceQuery('bs16')).toEqual({ kind: 'outcode', value: 'BS16' });
    expect(readPlaceQuery('EC1A')).toEqual({ kind: 'outcode', value: 'EC1A' });
    expect(readPlaceQuery('Newport')).toEqual({ kind: 'place', value: 'Newport' });
    expect(readPlaceQuery("  King's   Lynn ")).toEqual({ kind: 'place', value: "King's Lynn" });
    expect(readPlaceQuery('Stoke-on-Trent')).toEqual({ kind: 'place', value: 'Stoke-on-Trent' });
    expect(readPlaceQuery('St. Albans')).toEqual({ kind: 'place', value: 'St. Albans' });
    for (const bad of ['', '   ', 'a', '<script>', 'Bristol/../../x', 'Bristol?x=1', 'Bristol#x', 'a'.repeat(61), 'Bristol\u0000', 'https://evil.example']) {
      expect(readPlaceQuery(bad), JSON.stringify(bad)).toEqual({ kind: 'invalid' });
    }
  });

  it('asks postcodes.io and picks a city or town first', async () => {
    expect(GEOCODER_ORIGIN).toBe('https://api.postcodes.io');

    const pc = mockFetch(() => ({ status: 200, body: { status: 200, result: { postcode: 'BS16 1QY', latitude: 51.50012, longitude: -2.54987 } } }));
    expect(await findPlace('bs161qy', pc.fetcher)).toEqual({ kind: 'found', place: { name: 'BS16 1QY', lat: 51.5001, lon: -2.5499 } });
    expect(pc.calls).toHaveLength(1);
    expect(new URL(pc.calls[0].url).origin).toBe(GEOCODER_ORIGIN);
    expect(new URL(pc.calls[0].url).pathname).toMatch(/^\/postcodes\/BS16(%20)?1QY$/);
    expect(pc.calls[0].init?.credentials).toBe('omit');
    expect(pc.calls[0].init?.referrerPolicy).toBe('no-referrer');
    expect(pc.calls[0].init?.headers).toBeUndefined();

    const oc = mockFetch(() => ({ status: 200, body: { status: 200, result: { outcode: 'BS16', latitude: 51.4891, longitude: -2.5136 } } }));
    expect(await findPlace('bs16', oc.fetcher)).toEqual({ kind: 'found', place: { name: 'BS16', lat: 51.4891, lon: -2.5136 } });
    expect(new URL(oc.calls[0].url).pathname).toBe('/outcodes/BS16');

    const pl = mockFetch(() => ({ status: 200, body: { status: 200, result: NEWPORT } }));
    expect(await findPlace('newport', pl.fetcher)).toEqual({ kind: 'found', place: { name: 'Newport', lat: 51.5877, lon: -2.9984 } });
    const placeUrl = new URL(pl.calls[0].url);
    expect(placeUrl.origin).toBe(GEOCODER_ORIGIN);
    expect(placeUrl.pathname).toBe('/places');
    expect(placeUrl.searchParams.get('q')).toBe('newport');

    // With no city among exact matches, a town comes before a village.
    const towns = mockFetch(() => ({ status: 200, body: { status: 200, result: NEWPORT.filter((p) => p.local_type !== 'City') } }));
    expect(await findPlace('Newport', towns.fetcher)).toEqual({ kind: 'found', place: { name: 'Newport', lat: 50.701, lon: -1.2883 } });
  });

  it('says when a place cannot be found or reached', async () => {
    const missing = mockFetch(() => ({ status: 404, body: { status: 404, error: 'Postcode not found' } }));
    expect(await findPlace('ZZ99 9ZZ', missing.fetcher)).toEqual({ kind: 'not-found' });
    const none = mockFetch(() => ({ status: 200, body: { status: 200, result: [] } }));
    expect(await findPlace('Nowhereville', none.fetcher)).toEqual({ kind: 'not-found' });
    const nullResult = mockFetch(() => ({ status: 200, body: { status: 200, result: null } }));
    expect(await findPlace('Nowhereville', nullResult.fetcher)).toEqual({ kind: 'not-found' });
    const noPoint = mockFetch(() => ({ status: 200, body: { status: 200, result: { postcode: 'BS16 1QY', latitude: null, longitude: null } } }));
    expect(await findPlace('BS16 1QY', noPoint.fetcher)).toEqual({ kind: 'not-found' });
    const abroad = mockFetch(() => ({ status: 200, body: { status: 200, result: { postcode: 'GY1 1AA', latitude: 49.45, longitude: -2.54 } } }));
    expect(await findPlace('GY1 1AA', abroad.fetcher)).toEqual({ kind: 'outside' });
    const badName = mockFetch(() => ({ status: 200, body: { status: 200, result: [{ name_1: '<img src=x>', local_type: 'City', latitude: 51.5, longitude: -2.5 }] } }));
    expect(await findPlace('Bristol', badName.fetcher)).toEqual({ kind: 'not-found' });
    const broken = mockFetch(() => ({ status: 500 }));
    expect(await findPlace('Bristol', broken.fetcher)).toEqual({ kind: 'unreachable' });
    const down = mockFetch(() => 'fail');
    expect(await findPlace('Bristol', down.fetcher)).toEqual({ kind: 'unreachable' });
    const untouched = mockFetch(() => 'fail');
    expect(await findPlace('<script>', untouched.fetcher)).toEqual({ kind: 'invalid' });
    expect(untouched.calls).toHaveLength(0);
  });

  it('keeps the place and radius in the URL', () => {
    expect([...NEAR_RADII]).toEqual([5, 10, 25, 50]);
    expect(DEFAULT_NEAR_RADIUS).toBe(25);
    expect(defaultState()).toMatchObject({ near: null, within: 25 });
    const state = { ...defaultState(), near: { name: 'BS16 1QY', lat: 51.5001, lon: -2.5499 }, within: 5 as const };
    const query = toQuery(state);
    const p = new URLSearchParams(query);
    expect(p.get('near')).toBe('BS16 1QY');
    expect(p.get('at')).toBe('51.5001,-2.5499');
    expect(p.get('within')).toBe('5');
    expect(fromQuery(query)).toEqual(state);
    expect(toQuery({ ...state, within: 25 })).not.toContain('within');
    const named = { ...defaultState(), near: { name: "King's Lynn", lat: 52.7517, lon: 0.4017 }, within: 10 as const };
    expect(fromQuery(toQuery(named))).toEqual(named);

    expect(fromQuery('near=Bristol&at=51.45,-2.58&within=15')).toMatchObject({ near: { name: 'Bristol' }, within: 25 });
    expect(fromQuery('near=Bristol').near).toBeNull();
    expect(fromQuery('at=51.45,-2.58').near).toBeNull();
    expect(fromQuery('near=%3Cscript%3E&at=51.45,-2.58').near).toBeNull();
    expect(fromQuery(`near=${'a'.repeat(61)}&at=51.45,-2.58`).near).toBeNull();
    expect(fromQuery('near=Paris&at=48.8566,2.3522').near).toBeNull();
    expect(fromQuery('near=Bristol&at=51.45,-2.58,1').near).toBeNull();
    expect(fromQuery('near=Bristol&at=abc,def').near).toBeNull();
    // One location filter at a time: a site wins over a place.
    const both = fromQuery('site=raf-brize-norton&near=Bristol&at=51.45,-2.58');
    expect(both.site).toBe('raf-brize-norton');
    expect(both.near).toBeNull();
    expect(toQuery({ ...defaultState(), site: 'raf-brize-norton', near: { name: 'Bristol', lat: 51.45, lon: -2.58 } })).toBe('site=raf-brize-norton');
  });

  it('finds companies within a radius of a place, never region-level or overseas', () => {
    const place = { lat: 51.5, lon: -2.55 };
    const names = (miles: number) => companiesNearSite(data.companies, place, miles).map((c) => c.name).sort();
    expect(names(5)).toEqual(['Example Aerial Systems', 'Example Composites', 'Example Flight Test']);
    for (const miles of NEAR_RADII) {
      for (const c of companiesNearSite(data.companies, place, miles)) {
        expect(distanceMiles(place.lat, place.lon, c.lat as number, c.lon as number)).toBeLessThanOrEqual(miles);
      }
    }
    expect(names(50).length).toBeGreaterThan(names(5).length);
    const base = data.companies[0] as Company;
    const regionLevel = { ...base, id: 'r', location_source: 'region', lat: 51.5, lon: -2.55 } as Company;
    const overseas = { ...base, id: 'o', country: 'Norway', region: 'Overseas', lat: 51.5, lon: -2.55 } as Company;
    const unplaced = { ...base, id: 'u', lat: null, lon: null } as Company;
    expect(companiesNearSite([regionLevel, overseas, unplaced], place, 50)).toEqual([]);
  });
});
