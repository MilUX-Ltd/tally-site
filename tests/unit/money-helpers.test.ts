// Unit tests for the Money view's helpers, its map overlay and the build's
// check of money.json. Added by the builder alongside the acceptance tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertMoneyRef, isNoticeUrl, MONEY_LIMITS, moneyIds, slimData, slimMoney } from '../../scripts/fetch-data.mjs';
import { capabilityRows, chosenYear, companyAwards, overseasRows, regionRows, sharePercent, tallyWinners, yearTotals, type MoneyData } from '../../src/lib/money';
import { arcBounds, COUNTRY_CENTROIDS, greatCircle, overseasArcs, shadedRegions } from '../../src/lib/money-map';
import type { TallyData } from '../../src/lib/types';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const rawMoney = fixture('money.json');
const rawTally = fixture('tally-data.json');
const ids = moneyIds(rawTally);
const money = slimMoney(rawMoney, ids) as MoneyData;
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
    expect(tallyWinners({ ...money, companies: { 'not-in-tally-ltd': money.companies['example-ew-systems'] } }, 2025, data.companies)).toEqual([]);
  });
  it('totals Tally money by top-level capability', () => {
    const rows = capabilityRows(tallyWinners(money, 2025, data.companies), data.taxonomy);
    expect(rows.find((r) => r.slug === 'cyber')).toMatchObject({ label: 'Cyber', value: 2_600_000, companies: 2 });
    expect(rows.find((r) => r.slug === 'maritime')).toMatchObject({ value: 1_400_000 });
    expect(rows.every((r) => !r.slug.includes('/'))).toBe(true);
  });
  it('rolls sub-capabilities up to their parent, counting each company once', () => {
    const base = data.companies.find((c) => c.name === 'Example Cyber Defence')!;
    const only = { company: { ...base, tags: ['cyber/pen-testing', 'cyber/threat-intel'] }, value: 500_000, count: 1 };
    const rows = capabilityRows([only], data.taxonomy);
    expect(rows).toEqual([{ slug: 'cyber', label: 'Cyber', value: 500_000, companies: 1 }]);
  });
  it('falls back to the default year', () => {
    expect(chosenYear(money, 2024)).toBe(2024);
    expect(chosenYear(money, 1999)).toBe(2025);
    expect(chosenYear(money, null)).toBe(2025);
  });
  it('lists a company’s awards newest first', () => {
    expect(companyAwards(money, 'example-cyber-defence').map((a) => a.date)).toEqual(['2025-03-10', '2024-05-05']);
    expect(companyAwards(money, 'example-avionics')).toEqual([]);
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
    expect(() => slimMoney(extra, ids)).toThrow(/outside the contract/);
    const award = copy();
    award.companies['Example EW Systems'][0].contact = 'someone';
    expect(() => slimMoney(award, ids)).toThrow(/outside the contract/);
    const bucket = copy();
    bucket.regions['2025'].London.note = 'x';
    expect(() => slimMoney(bucket, ids)).toThrow(/outside the contract/);
  });
  it('carries supplier sizes and refuses bad ones (D-96j1u)', () => {
    expect(money.regions['2025']['South East']).toMatchObject({ sme_value: 4_000_000, sme_count: 1, large_value: 8_000_000, large_count: 1 });
    expect(money.regions['2025'].Scotland).not.toHaveProperty('sme_value');
    const partial = copy();
    delete partial.regions['2025']['South East'].large_count;
    expect(() => slimMoney(partial, ids)).toThrow(/size/);
    const over = copy();
    over.regions['2025'].London.large_value = 4_500_000;
    expect(() => slimMoney(over, ids)).toThrow(/size/);
  });
  it('refuses unknown regions, bad links and missing attribution', () => {
    const region = copy();
    region.regions['2025'].Narnia = region.regions['2025'].London;
    expect(() => slimMoney(region, ids)).toThrow(/region/);
    const link = copy();
    link.companies['Example EW Systems'][0].url = 'javascript:alert(1)';
    expect(() => slimMoney(link, ids)).toThrow(/https/);
    const ogl = copy();
    ogl.attribution = '';
    expect(() => slimMoney(ogl, ids)).toThrow(/attribution/);
  });
  it('keys awards by Tally id and leaves out names Tally does not hold', () => {
    expect(Object.keys(money.companies).sort()).toEqual(['example-cyber-defence', 'example-ew-systems', 'example-naval-engineering', 'example-nordic-defence', 'example-signals-intelligence']);
    const stranger = copy();
    stranger.companies['Not In Tally Ltd'] = stranger.companies['Example EW Systems'];
    expect(Object.keys(slimMoney(stranger, ids).companies)).not.toContain('not-in-tally-ltd');
  });
  it('refuses text over its limit or with control characters', () => {
    const title = copy();
    title.companies['Example EW Systems'][0].title = 'x'.repeat(MONEY_LIMITS.title + 1);
    expect(() => slimMoney(title, ids)).toThrow(/longer than 300/);
    const buyer = copy();
    buyer.companies['Example EW Systems'][0].buyer = 'b'.repeat(MONEY_LIMITS.buyer + 1);
    expect(() => slimMoney(buyer, ids)).toThrow(/longer than 200/);
    const name = copy();
    name.companies['n'.repeat(MONEY_LIMITS.name + 1)] = [];
    expect(() => slimMoney(name, ids)).toThrow(/longer than 200/);
    const control = copy();
    control.companies['Example EW Systems'][0].title = 'Example\u0007 upgrade';
    expect(() => slimMoney(control, ids)).toThrow(/control character/);
  });
  it('keeps only the newest awards for a company with more than the limit', () => {
    const many = copy();
    const one = many.companies['Example EW Systems'][0];
    many.companies['Example EW Systems'] = Array.from({ length: MONEY_LIMITS.awards + 5 }, (_, i) => ({ ...one, date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` }));
    const kept = (slimMoney(many, ids) as MoneyData).companies['example-ew-systems'];
    expect(kept).toHaveLength(MONEY_LIMITS.awards);
    expect(kept[0].date >= kept[kept.length - 1].date).toBe(true);
    expect(kept[0].date).toBe('2025-12-28');
  });
  it('refuses more companies or countries than the limits', () => {
    const companies = copy();
    for (let i = 0; i <= MONEY_LIMITS.companies; i++) companies.companies[`Company ${i}`] = [];
    expect(() => slimMoney(companies, ids)).toThrow(/more than 5000/);
    const countries = copy();
    for (let i = 0; i <= MONEY_LIMITS.countries; i++) countries.overseas['2025'][`Country ${String.fromCharCode(65 + (i % 26))}${i}`.replace(/\d/g, (d) => 'abcdefghij'[Number(d)])] = { count: 1, value: 1 };
    expect(() => slimMoney(countries, ids)).toThrow(/more than 250 countries/);
  });
  it('allows notice links only on Contracts Finder and Find a Tender', () => {
    expect(isNoticeUrl('https://www.contractsfinder.service.gov.uk/Notice/abc')).toBe(true);
    expect(isNoticeUrl('https://www.find-tender.service.gov.uk/Notice/123')).toBe(true);
    for (const bad of ['http://www.contractsfinder.service.gov.uk/Notice/abc', 'https://example.com/Notice/1', 'https://www.find-tender.service.gov.uk.evil.example/x', 'https://user@www.find-tender.service.gov.uk/x']) {
      expect(isNoticeUrl(bad)).toBe(false);
    }
    const other = copy();
    other.companies['Example EW Systems'][0].url = 'https://example.com/notice';
    expect(() => slimMoney(other, ids)).toThrow(/Contracts Finder or Find a Tender/);
  });
});

describe('the production data guard', () => {
  it('stops a build from main reading money.json from a branch', () => {
    expect(() => assertMoneyRef('feature/money-data', 'refs/heads/main')).toThrow(/must read it from main/);
    expect(() => assertMoneyRef('main', 'refs/heads/main')).not.toThrow();
    expect(() => assertMoneyRef('feature/money-data', 'refs/heads/feature/money-view')).not.toThrow();
    expect(() => assertMoneyRef('feature/money-data', undefined)).not.toThrow();
    // Fixture builds (tests on main) read no data repo.
    expect(() => assertMoneyRef('feature/money-data', 'refs/heads/main', true)).not.toThrow();
  });
});
