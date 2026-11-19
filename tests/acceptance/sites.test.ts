// Acceptance tests: defence sites overlay and distance rings. The committed
// dataset must be verified and sourced. Committed failing before the build.
// Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { UK_BOUNDS } from '../../src/lib/map-config';
import { companiesNearSite, distanceMiles, RADII, ringPolygon, type SitesData } from '../../src/lib/sites';
import type { Company, TallyData } from '../../src/lib/types';
import { defaultState, fromQuery, sanitiseSites, toQuery } from '../../src/lib/url-state';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const sites = JSON.parse(readFileSync(new URL('../../public/sites/defence-sites.json', import.meta.url), 'utf8')) as SitesData;

const ALLOWED_HOSTS = ['en.wikipedia.org', 'api.postcodes.io', 'www.gov.uk'];
const ALLOWED_LICENCES = ['CC BY-SA 4.0', 'Open Government Licence v3.0'];
const KINDS = ['air-station', 'base', 'hq', 'naval-base', 'range', 'training-area'];

describe('defence sites', () => {
  it('every committed site has a source and none is unverified', () => {
    expect(sites.sites.length).toBeGreaterThanOrEqual(40);
    expect(sites.attribution).toMatch(/Wikipedia/);
    const ids = sites.sites.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const [w, s, e, n] = UK_BOUNDS;
    for (const site of sites.sites) {
      expect(site.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(site.name.length).toBeGreaterThan(2);
      expect(KINDS).toContain(site.kind);
      expect(site.lon).toBeGreaterThanOrEqual(w);
      expect(site.lon).toBeLessThanOrEqual(e);
      expect(site.lat).toBeGreaterThanOrEqual(s);
      expect(site.lat).toBeLessThanOrEqual(n);
      expect(site.source, site.id).toBeTruthy();
      expect(site.source.title.length).toBeGreaterThan(2);
      expect(ALLOWED_HOSTS).toContain(new URL(site.source.url).host);
      expect(new URL(site.source.url).protocol).toBe('https:');
      expect(ALLOWED_LICENCES).toContain(site.source.licence);
      expect(site.source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(site.source.revision)).toBe(true);
      expect(site.verification.status).toBe('verified');
      expect(site.verification.distance_km).toBeGreaterThanOrEqual(0);
      expect(site.verification.distance_km).toBeLessThanOrEqual(3);
    }
    const text = JSON.stringify(sites).toLowerCase();
    expect(text).not.toContain('unverified');
    expect(text).not.toContain('approximate');
  });

  it('measures distance in miles', () => {
    // London (Charing Cross) to Bristol (Temple Meads): about 106 miles.
    expect(distanceMiles(51.5074, -0.1278, 51.4545, -2.5879)).toBeCloseTo(106.0, -1);
    const d = distanceMiles(51.5074, -0.1278, 51.4545, -2.5879);
    expect(Math.abs(d - 106.0) / 106.0).toBeLessThan(0.01);
    expect(distanceMiles(52, -1, 52, -1)).toBe(0);
    // One degree of latitude is about 69.1 miles.
    expect(Math.abs(distanceMiles(50, 0, 51, 0) - 69.09) / 69.09).toBeLessThan(0.01);
  });

  it('finds companies within a radius of a site', () => {
    expect([...RADII]).toEqual([10, 25, 50]);
    const bristol = { lat: 51.5, lon: -2.55 };
    const names = (miles: number) => companiesNearSite(data.companies, bristol, miles).map((c) => c.name).sort();
    expect(names(10)).toEqual(['Example Aerial Systems', 'Example Composites', 'Example Flight Test']);
    expect(names(50)).toEqual(expect.arrayContaining(['Example Counter Drone', 'Example Signals Intelligence', 'Example CBRN Protection']));
    expect(names(50)).not.toContain('Example Cyber Defence');
    const overseas = { ...(data.companies[0] as Company), id: 'x', country: 'Norway', region: 'Overseas', lat: 51.5, lon: -2.55 };
    const unplaced = { ...(data.companies[0] as Company), id: 'y', lat: null, lon: null };
    expect(companiesNearSite([overseas, unplaced], bristol, 50)).toEqual([]);
  });

  it('draws a ring at the chosen radius', () => {
    const site = { lat: 51.75, lon: -1.58 };
    for (const miles of RADII) {
      const ring = ringPolygon(site, miles);
      expect(ring.length).toBeGreaterThanOrEqual(33);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      for (const [lon, lat] of ring) expect(Math.abs(distanceMiles(site.lat, site.lon, lat, lon) - miles) / miles).toBeLessThan(0.01);
    }
  });

  it('keeps the site and radius in the URL', () => {
    expect(defaultState()).toMatchObject({ site: null, radius: 25, sites: false });
    const state = { ...defaultState(), site: 'raf-brize-norton', radius: 10 as const, sites: true };
    const query = toQuery(state);
    expect(query).toContain('site=raf-brize-norton');
    expect(query).toContain('radius=10');
    expect(query).toContain('sites=1');
    expect(fromQuery(query)).toEqual(state);
    expect(toQuery({ ...state, radius: 25, sites: false })).toBe('site=raf-brize-norton');
    expect(fromQuery('site=raf-brize-norton&radius=15').radius).toBe(25);
    expect(fromQuery('site=<script>').site).toBeNull();
    expect(fromQuery('sites=yes').sites).toBe(false);
    const ids = sites.sites.map((s) => s.id);
    expect(sanitiseSites(fromQuery('site=raf-brize-norton'), ids).site).toBe('raf-brize-norton');
    expect(sanitiseSites(fromQuery('site=no-such-site&radius=50'), ids)).toMatchObject({ site: null });
  });
});
