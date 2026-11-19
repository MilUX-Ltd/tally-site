import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { emptyFilters } from '../../src/lib/filters';
import { CSV_COLUMNS, overlapNote, shortlistCsv } from '../../src/lib/shortlist';
import type { TallyData } from '../../src/lib/types';
import { defaultState, fromQuery, sanitiseState, toQuery } from '../../src/lib/url-state';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;

describe('overlap mode needs two capabilities', () => {
  it('leaves capmatch out of the URL with fewer than two capabilities', () => {
    const one = { ...defaultState(), filters: { ...emptyFilters(), cap: ['cyber'] }, capMatch: 'all' as const };
    expect(toQuery(one)).not.toContain('capmatch');
    expect(toQuery({ ...one, filters: { ...emptyFilters() } })).toBe('');
    expect(fromQuery('cap=cyber&capmatch=all').capMatch).toBe('any');
    expect(fromQuery('cap=cyber,data&capmatch=all').capMatch).toBe('all');
  });

  it('drops overlap mode when unknown capabilities leave fewer than two', () => {
    const s = sanitiseState(fromQuery('cap=cyber,not-a-capability&capmatch=all'), data);
    expect(s.filters.cap).toEqual(['cyber']);
    expect(s.capMatch).toBe('any');
    expect(sanitiseState(fromQuery('cap=cyber,data&capmatch=all'), data).capMatch).toBe('all');
  });
});

describe('shortlist CSV note', () => {
  const companies = data.companies.slice(0, 2);
  const lines = (text: string) => text.split('\r\n').filter(Boolean);

  it('is unchanged without a note', () => {
    expect(lines(shortlistCsv(companies, data.taxonomy))).toHaveLength(3);
  });

  it('records overlap mode in a last row', () => {
    const note = overlapNote(['cyber', 'data'], data.taxonomy);
    expect(note).toBe('Note: downloaded in overlap mode; showing places where all of these capabilities are found: Cyber; Data');
    const out = lines(shortlistCsv(companies, data.taxonomy, note));
    expect(out).toHaveLength(4);
    expect(out[3]).toBe(`${note}${','.repeat(CSV_COLUMNS.length - 1)}`);
  });
});
