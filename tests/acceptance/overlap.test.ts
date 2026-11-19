// Acceptance tests: capability overlap (places where every chosen capability
// is found). Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { OVERLAP_RESOLUTION, overlapCompanies } from '../../src/lib/binning';
import { filterCompanies, emptyFilters } from '../../src/lib/filters';
import type { Company, TallyData } from '../../src/lib/types';
import { defaultState, fromQuery, toQuery } from '../../src/lib/url-state';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const byName = (name: string) => data.companies.find((c) => c.name === name) as Company;
const names = (cs: Company[]) => cs.map((c) => c.name).sort();
const anyOf = (cap: string[]) => filterCompanies(data.companies, { ...emptyFilters(), cap });

describe('capability overlap', () => {
  it('finds places where every chosen capability is present', () => {
    expect(OVERLAP_RESOLUTION).toBe(5);
    const caps = ['cyber', 'data'];
    expect(names(overlapCompanies(anyOf(caps), caps))).toEqual([
      'Example Analytics North',
      'Example Cyber Defence',
      'Example Data Labs',
      'Example Secure Comms',
    ]);
    // Order of the input is kept.
    const out = overlapCompanies(anyOf(caps), caps).map((c) => c.name);
    expect(out).toEqual([...out].sort((a, b) => a.localeCompare(b, 'en-GB')));
  });

  it('counts sub-capabilities and ignores companies without a point', () => {
    const caps = ['cyber', 'data'];
    const result = names(overlapCompanies(anyOf(caps), caps));
    expect(result).not.toContain('Example Signals Intelligence');
    expect(result).not.toContain('Example Nordic Defence');
    // A company tagged only with a sub-capability counts for its parent.
    const leeds = byName('Example Analytics North');
    const childOnly: Company = { ...byName('Example Robotics'), id: 'child-only', lat: leeds.lat, lon: leeds.lon, tags: ['cyber/pen-testing'] };
    const dataOnly: Company = { ...byName('Example Robotics'), id: 'data-only', lat: leeds.lat, lon: leeds.lon, tags: ['data/analytics'] };
    expect(overlapCompanies([childOnly, dataOnly], caps).map((c) => c.id)).toEqual(['child-only', 'data-only']);
    expect(overlapCompanies([childOnly], caps)).toEqual([]);
    // Three capabilities: London has cyber and data but not space.
    expect(overlapCompanies(anyOf(['cyber', 'data', 'space']), ['cyber', 'data', 'space'])).toEqual([]);
  });

  it('leaves the list alone with fewer than two capabilities', () => {
    const one = anyOf(['cyber']);
    expect(overlapCompanies(one, ['cyber'])).toEqual(one);
    expect(overlapCompanies(data.companies, [])).toEqual(data.companies);
  });

  it('keeps the overlap mode in the URL', () => {
    expect(defaultState().capMatch).toBe('any');
    const state = { ...defaultState(), filters: { ...emptyFilters(), cap: ['cyber', 'data'] }, capMatch: 'all' as const };
    const query = toQuery(state);
    expect(query).toContain('capmatch=all');
    expect(fromQuery(query)).toEqual(state);
    expect(toQuery({ ...state, capMatch: 'any' })).not.toContain('capmatch');
    expect(fromQuery('capmatch=ALL').capMatch).toBe('any');
    expect(fromQuery('capmatch=<script>').capMatch).toBe('any');
    expect(fromQuery('capmatch=any').capMatch).toBe('any');
  });
});
