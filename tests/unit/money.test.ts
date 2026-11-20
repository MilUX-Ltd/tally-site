// Unit tests for the Money view helpers. Committed failing before the build.
import { describe, expect, it } from 'vitest';
import { defaultYear, formatMoney, smeTotals, type MoneyData } from '../../src/lib/money';

describe('formatMoney', () => {
  it('writes short sterling amounts without a trailing .0', () => {
    expect(formatMoney(0)).toBe('£0');
    expect(formatMoney(950)).toBe('£950');
    expect(formatMoney(100_000)).toBe('£100k');
    expect(formatMoney(812_400)).toBe('£812k');
    expect(formatMoney(1_000_000)).toBe('£1m');
    expect(formatMoney(2_600_000)).toBe('£2.6m');
    expect(formatMoney(17_840_000)).toBe('£17.8m');
    expect(formatMoney(2_400_000_000)).toBe('£2.4bn');
  });
});

describe('defaultYear', () => {
  it('is the latest year the data covers in full', () => {
    expect(defaultYear({ years: [2024, 2025, 2026], period: { from: '2024-01-01', to: '2026-11-15' } })).toBe(2025);
    expect(defaultYear({ years: [2024, 2025], period: { from: '2024-01-01', to: '2025-12-31' } })).toBe(2025);
  });
  it('falls back to the latest year when none is complete', () => {
    expect(defaultYear({ years: [2026], period: { from: '2026-01-01', to: '2026-03-01' } })).toBe(2026);
  });
});

describe('smeTotals', () => {
  // Added for D-96j1u.
  const bucket = (value: number, extra: Record<string, number> = {}) => ({ count: 1, value, tally_count: 0, tally_value: 0, ...extra });
  const money = {
    regions: {
      '2025': {
        'South East': bucket(12_000_000, { sme_value: 4_000_000, sme_count: 1, large_value: 8_000_000, large_count: 1 }),
        London: bucket(5_000_000, { sme_value: 1_000_000, sme_count: 1, large_value: 3_000_000, large_count: 1 }),
        Scotland: bucket(800_000),
      },
      '2024': { London: bucket(1_000_000) },
    },
  } as unknown as MoneyData;
  it('sums SME, large and not-known money over the UK regions', () => {
    expect(smeTotals(money, 2025)).toEqual({ sme: 5_000_000, large: 11_000_000, unknown: 1_800_000 });
  });
  it('is null for a year with no sizes', () => {
    expect(smeTotals(money, 2024)).toBeNull();
    expect(smeTotals(money, 2019)).toBeNull();
  });
});
