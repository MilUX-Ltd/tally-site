// Unit tests for closed companies and the formed and dissolved trend (D-iyz0k):
// the build's check of companies-house.json and the page wording.
// Committed failing before the build. The builder does not edit this file.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moneyIds, slimCompaniesHouse, slimData, withoutClosed } from '../../scripts/fetch-data.mjs';
import { closedNote, flaggedNote, trendSummary, yearLabel, type CompaniesHouse } from '../../src/lib/companies-house';
import type { TallyData } from '../../src/lib/types';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const raw = fixture('tally-data.json');
raw.companies = [...raw.companies, ...fixture('tally-data-closed.json').companies];
const rawCh = fixture('companies-house.json');
const ids = moneyIds(raw);
const copy = () => JSON.parse(JSON.stringify(rawCh));

describe('slimCompaniesHouse', () => {
  const ch = slimCompaniesHouse(rawCh, ids) as CompaniesHouse;
  it('keys closed and flagged companies by Tally id', () => {
    expect(ch.closed).toEqual({ 'example-closed-engineering': { status: 'dissolved', date: '2024-05-14' } });
    expect(ch.flagged).toEqual({ 'example-munitions': { status: 'liquidation', detail: null } });
  });
  it('keeps the trend, the date and the licence line, and drops the not-found list', () => {
    expect(ch.trend.years.map((y) => y.year)).toEqual([2024, 2025, 2026]);
    expect(ch.trend.years[0].formed.total).toBe(151);
    expect(Object.keys(ch.trend.codes)).toEqual(['25400', '30400', '84220']);
    expect(ch.generated).toBe('2026-11-20');
    expect(ch.attribution).toMatch(/Open Government Licence v3\.0/);
    expect(ch).not.toHaveProperty('not_found');
  });
  it('skips a company Tally does not hold', () => {
    const doc = copy();
    doc.closed.push({ name: 'Not In Tally Ltd', ch: '09999999', status: 'dissolved' });
    expect(Object.keys(slimCompaniesHouse(doc, ids).closed)).toEqual(['example-closed-engineering']);
  });
  it('refuses a malformed file', () => {
    const bad = [
      (d: any) => { d.attribution = 'something else'; },
      (d: any) => { d.extra = 1; },
      (d: any) => { d.closed[0].status = 'active'; },
      (d: any) => { d.closed[0].date = '14/05/2024'; },
      (d: any) => { d.flagged[0].status = 'dissolved'; },
      (d: any) => { d.trend.years[0].formed.total = 300; },
      (d: any) => { d.trend.years[0].formed.total = 100; },
      (d: any) => { d.trend.years[1].year = 2023; },
      (d: any) => { d.trend.years[0].partial = true; },
      (d: any) => { d.trend.years[0].dissolved['25400'] = -1; },
      (d: any) => { d.trend.codes['25400'] = '<b>x</b>'; },
    ];
    for (const change of bad) {
      const doc = copy();
      change(doc);
      expect(() => slimCompaniesHouse(doc, ids)).toThrow();
    }
  });
});

describe('withoutClosed', () => {
  it('takes closed companies out of the directory and returns them for their pages', () => {
    const data = slimData(raw, fixture('taxonomy.json')) as TallyData;
    const ch = slimCompaniesHouse(rawCh, ids) as CompaniesHouse;
    const { open, closed } = withoutClosed(data, ch);
    expect(open.count).toBe(57);
    expect(open.companies.some((c) => c.id === 'example-closed-engineering')).toBe(false);
    expect(closed.map((c) => c.id)).toEqual(['example-closed-engineering']);
  });
});

describe('page wording', () => {
  it('says when a company closed', () => {
    expect(closedNote({ status: 'dissolved', date: '2024-05-14' })).toBe('Companies House lists this company as dissolved on 14 May 2024.');
    expect(closedNote({ status: 'converted-closed', date: null })).toBe('Companies House lists this company as closed.');
    expect(closedNote({ status: 'removed', date: null })).toBe('Companies House lists this company as removed from the register.');
  });
  it('names an insolvency process', () => {
    expect(flaggedNote({ status: 'liquidation', detail: null })).toBe('Companies House: in liquidation.');
    expect(flaggedNote({ status: 'administration', detail: null })).toBe('Companies House: in administration.');
    expect(flaggedNote({ status: 'active', detail: 'active-proposal-to-strike-off' })).toBe('Companies House: proposed to be struck off the register.');
  });
  it('labels a partial year and sums up the chart', () => {
    const ch = slimCompaniesHouse(rawCh, ids) as CompaniesHouse;
    expect(yearLabel(ch.trend.years[2], ch.generated)).toBe('2026 to 19 November');
    expect(yearLabel(ch.trend.years[0], ch.generated)).toBe('2024');
    expect(trendSummary(ch.trend)).toBe('Defence companies formed and dissolved each year, 2024 to 2026. In 2025, 162 formed and 104 dissolved.');
  });
});
