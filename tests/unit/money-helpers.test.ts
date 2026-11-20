// Unit tests for the Money view's helpers, its map overlay and the build's
// check of money.json. Added by the builder alongside the acceptance tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData, slimMoney } from '../../scripts/fetch-data.mjs';
import { capabilityRows, chosenYear, companyAwards, overseasRows, regionRows, sharePercent, tallyWinners, yearTotals, type MoneyData } from '../../src/lib/money';
import { arcBounds, COUNTRY_CENTROIDS, greatCircle, overseasArcs, shadedRegions } from '../../src/lib/money-map';
import type { TallyData } from '../../src/lib/types';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const rawMoney = fixture('money.json');
const money = slimMoney(rawMoney) as MoneyData;
const data = slimData(fixture('tally-data.json'), fixture('taxonomy.json')) as TallyData;

describe('money helpers', () => {
  it('totals a year across UK regions, overseas and not placed', () => {
    expect(yearTotals(money, 2025)).toEqual({ uk: { value: 17_800_000, count: 6 }, overseas: { value: 20_600_000, count: 3 }, unplaced: { value: 100_000, count: 1 } });
    expect(yearTotals(money, 2026).overseas.value).toBe(0);
  });
  it('lists all 12 regions, highest first', () => {
    const rows = regionRows(money, 2025);
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, 3).map((r) => r.region)).toEqual(['South East', 'London', 'Scotland']);
    expect(rows[11].value).toBe(0);
  });
  it('lists overseas countries by value', () => {
    expect(overseasRows(money, 2025).map((r) => r.country)).toEqual(['United States', 'Norway']);
  });
  it('names only Tally companies as winners, highest first', () => {
    const winners = tallyWinners(money, 2025, data.companies);
    expect(winners.map((w) => w.company.name)).toEqual(['Example EW Systems', 'Example Cyber Defence', 'Example Naval Engineering', 'Example Nordic Defence']);
    expect(tallyWinners({ ...money, companies: { 'Not In Tally Ltd': money.companies['Example EW Systems'] } }, 2025, data.companies)).toEqual([]);
  });
  it('totals Tally money by top-level capability', () => {
    const rows = capabilityRows(tallyWinners(money, 2025, data.companies), data.taxonomy);
    expect(rows.find((r) => r.slug === 'cyber')).toMatchObject({ label: 'Cyber', value: 2_600_000, companies: 2 });
    expect(rows.find((r) => r.slug === 'maritime')).toMatchObject({ value: 1_400_000 });
    expect(rows.every((r) => !r.slug.includes('/'))).toBe(true);
  });
  it('falls back to the default year', () => {
    expect(chosenYear(money, 2024)).toBe(2024);
    expect(chosenYear(money, 1999)).toBe(2025);
    expect(chosenYear(money, null)).toBe(2025);
  });
  it('lists a company’s awards newest first', () => {
    expect(companyAwards(money, 'Example Cyber Defence').map((a) => a.date)).toEqual(['2025-03-10', '2024-05-05']);
    expect(companyAwards(money, 'Example Avionics')).toEqual([]);
  });
  it('writes shares as whole percentages', () => {
    expect(sharePercent(4, 12)).toBe('33%');
    expect(sharePercent(0, 0)).toBe('0%');
    expect(sharePercent(1, 1000)).toBe('under 1%');
  });
});

describe('money map overlay', () => {
  it('draws a great circle from the UK that ends at the country', () => {
    const line = greatCircle([-1.5, 52.6], COUNTRY_CENTROIDS['United States']);
    expect(line[0]).toEqual([-1.5, 52.6]);
    expect(line[line.length - 1][0]).toBeCloseTo(-98.5, 1);
    // A great circle to the US bows north of both ends.
    expect(Math.max(...line.map((p) => p[1]))).toBeGreaterThan(52.6);
  });
  it('makes arcs for known countries, widest for the most money', () => {
    const arcs = overseasArcs([...overseasRows(money, 2025), { country: 'Atlantis', value: 5, count: 1 }]);
    expect(arcs.map((a) => a.country)).toEqual(['United States', 'Norway']);
    expect(arcs[0].width).toBeGreaterThan(arcs[1].width);
    const [w, , e] = arcBounds(arcs, [-8.7, 49.8, 1.9, 60.9]);
    expect(w).toBeLessThan(-98);
    expect(e).toBeGreaterThanOrEqual(9);
  });
  it('shades regions on the ramp and leaves empty ones unshaded', () => {
    const shapes = ['South East', 'Wales'].map((name) => ({ type: 'Feature' as const, properties: { name }, geometry: null }));
    const fc = shadedRegions(shapes, regionRows(money, 2025));
    expect(fc.features[0].properties).toMatchObject({ value: 12_000_000, t: 1 });
    expect(fc.features[1].properties.t).toBe(-1);
  });
});

describe('the build’s check of money.json', () => {
  const copy = () => JSON.parse(JSON.stringify(rawMoney));
  it('passes the fixture and drops supplier names outside Tally', () => {
    expect(JSON.stringify(money)).not.toContain('Prime Aerospace');
    expect(JSON.stringify(money)).not.toContain('Big Systems');
    expect(money.years).toEqual([2024, 2025, 2026]);
  });
  it('refuses fields outside the contract', () => {
    const extra = copy();
    extra.secret = 1;
    expect(() => slimMoney(extra)).toThrow(/outside the contract/);
    const award = copy();
    award.companies['Example EW Systems'][0].contact = 'someone';
    expect(() => slimMoney(award)).toThrow(/outside the contract/);
    const bucket = copy();
    bucket.regions['2025'].London.note = 'x';
    expect(() => slimMoney(bucket)).toThrow(/outside the contract/);
  });
  it('refuses unknown regions, bad links and missing attribution', () => {
    const region = copy();
    region.regions['2025'].Narnia = region.regions['2025'].London;
    expect(() => slimMoney(region)).toThrow(/region/);
    const link = copy();
    link.companies['Example EW Systems'][0].url = 'javascript:alert(1)';
    expect(() => slimMoney(link)).toThrow(/https/);
    const ogl = copy();
    ogl.attribution = '';
    expect(() => slimMoney(ogl)).toThrow(/attribution/);
  });
});
