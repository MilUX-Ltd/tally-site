// A bloc scope opens only with two or more live countries: with the UK alone
// live, a Europe link is the UK view, exactly as before country-aware Tally.
import { describe, expect, it } from 'vitest';
import { scopeOpens, UNITED_KINGDOM, type Country } from '../../src/lib/scope';
import { fromQuery, sanitiseState, toQuery } from '../../src/lib/url-state';
import type { TallyData } from '../../src/lib/types';

const norway: Country = { code: 'NO', name: 'Norway', bloc: 'europe', live: true, bounds: [4.5, 57.9, 31.2, 71.2], regions: ['Oslo'] };
const data = (countries: Country[]) =>
  ({ generated: '', count: 0, companies: [], countries, taxonomy: { groups: [], capabilities: [], sizes: [], regions: [{ slug: 'London', label: 'London' }], frameworks: [], accreditations: [], memberships: [] } }) as TallyData;

describe('bloc scopes', () => {
  it('a bloc with only the UK live falls back to the UK, keeping its other filters', () => {
    expect(scopeOpens('europe', [UNITED_KINGDOM])).toBe(false);
    const state = sanitiseState(fromQuery('scope=europe&region=London'), data([UNITED_KINGDOM, { ...norway, live: false }]));
    expect(state.scope).toBe('gb');
    expect(toQuery(state)).toBe('region=London');
  });

  it('a bloc with two live countries opens, and so does one live country on its own', () => {
    expect(scopeOpens('europe', [UNITED_KINGDOM, norway])).toBe(true);
    expect(scopeOpens('no', [UNITED_KINGDOM, norway])).toBe(true);
    expect(scopeOpens('north-america', [UNITED_KINGDOM, norway])).toBe(false);
    expect(sanitiseState(fromQuery('scope=europe'), data([UNITED_KINGDOM, norway])).scope).toBe('europe');
  });
});
