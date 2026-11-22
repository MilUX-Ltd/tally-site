// Unit tests for MOD's official spend with industry by region (card 7475,
// D-tnpb9). Committed failing before the build. The builder does not edit this file.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimModSpend } from '../../scripts/fetch-data.mjs';
import {
  chosenFinancialYear,
  fyFromParam,
  fyParam,
  latestFinancialYear,
  recentFinancialYears,
  spendRows,
  type ModSpend,
} from '../../src/lib/mod-spend';

const fixture = (): ModSpend => JSON.parse(readFileSync(new URL('../fixtures/mod-spend.json', import.meta.url), 'utf8'));

describe('financial years', () => {
  it('writes and reads the year in the address', () => {
    expect(fyParam('2025/26')).toBe('2025-26');
    expect(fyFromParam('2025-26')).toBe('2025/26');
    expect(fyFromParam('2025/26')).toBe('2025/26');
    expect(fyFromParam('2025')).toBeNull();
    expect(fyFromParam('<script>')).toBeNull();
    expect(fyFromParam(null)).toBeNull();
  });

  it('opens on the latest year and falls back to it for a year not in the data', () => {
    const d = fixture();
    expect(latestFinancialYear(d)).toBe('2025/26');
    expect(chosenFinancialYear(d, '2024/25')).toBe('2024/25');
    expect(chosenFinancialYear(d, '2012/13')).toBe('2025/26');
    expect(chosenFinancialYear(d, null)).toBe('2025/26');
  });

  it('offers the last five years, latest first', () => {
    expect(recentFinancialYears(fixture())).toEqual(['2025/26', '2024/25', '2023/24', '2022/23', '2021/22']);
  });
});

describe('spendRows', () => {
  it('lists all 12 regions, highest spend first, with spend per person', () => {
    const rows = spendRows(fixture(), '2025/26');
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ region: 'South East', value: 8_451_000_000, per_person: 870 });
    expect(rows[1].region).toBe('South West');
    expect(rows[11].region).toBe('North East');
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].value).toBeGreaterThanOrEqual(rows[i].value);
    expect(spendRows(fixture(), '2024/25')[0].region).toBe('London');
  });
});

describe('slimModSpend', () => {
  it('passes a good file through with only its known fields', () => {
    const d = fixture();
    const slim = slimModSpend({ ...d, extra: 'dropped' });
    expect(Object.keys(slim).sort()).toEqual(['attribution', 'breaks', 'generated', 'regions', 'source', 'uk', 'years']);
    expect(slim.uk['2025/26']).toBe(34_128_000_000);
  });

  it('refuses a malformed file', () => {
    const d = fixture();
    const missingRegion = JSON.parse(JSON.stringify(d));
    delete missingRegion.regions['2025/26'].Wales;
    expect(() => slimModSpend(missingRegion)).toThrow(/mod-spend\.json/);
    const badValue = JSON.parse(JSON.stringify(d));
    badValue.regions['2025/26'].London.value = '9bn';
    expect(() => slimModSpend(badValue)).toThrow(/mod-spend\.json/);
    const badYear = JSON.parse(JSON.stringify(d));
    badYear.years = [...d.years, '2026'];
    expect(() => slimModSpend(badYear)).toThrow(/mod-spend\.json/);
    const badSource = JSON.parse(JSON.stringify(d));
    badSource.source.url = 'https://example.com/';
    expect(() => slimModSpend(badSource)).toThrow(/mod-spend\.json/);
  });
});
