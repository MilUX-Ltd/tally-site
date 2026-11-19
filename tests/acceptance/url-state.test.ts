// Acceptance tests: every view in the URL (serialise and restore).
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { defaultState, fromQuery, sanitiseState, toQuery, type ViewState } from '../../src/lib/url-state';
import type { TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;

const full: ViewState = {
  ...defaultState(),
  filters: {
    cap: ['cyber', 'uas/fixed-wing'],
    size: ['size-small', 'size-micro'],
    region: ['Yorkshire and The Humber', 'Wales'],
    fw: ['fw-dos'],
    accr: ['accr-ce-plus'],
    mbr: ['mbr-ads'],
  },
  map: { zoom: 7.25, lat: 51.5001, lon: -2.548 },
  cell: '85195da7fffffff',
  sel: ['example-aerial-systems', 'example-composites'],
  area: [-3.1, 50.9, -1.25, 51.75],
  matrix: { group: 'cyber-data-software', page: 2 },
  page: 3,
};

describe('URL state', () => {
  it('round-trips every part of the view through the query string', () => {
    const query = toQuery(full);
    expect(fromQuery(query)).toEqual(full);
    expect(fromQuery(`?${query}`)).toEqual(full);
    // Each part on its own also round-trips.
    for (const key of Object.keys(full) as Array<keyof ViewState>) {
      const one = { ...defaultState(), [key]: full[key] } as ViewState;
      expect(fromQuery(toQuery(one))).toEqual(one);
    }
  });

  it('keeps the default view out of the URL', () => {
    expect(toQuery(defaultState())).toBe('');
    expect(fromQuery('')).toEqual(defaultState());
    const q = toQuery({ ...defaultState(), filters: { ...defaultState().filters, cap: ['cyber'] } });
    expect(q).toBe('cap=cyber');
  });

  it('ignores unknown parameters and drops malformed values', () => {
    const s = fromQuery('utm_source=x&map=abc&page=-3&mpage=zero&cell=<script>&area=1,2,3&sel=ok-id,Bad%20Id&cap=cyber,,cyber');
    expect(s.map).toBeNull();
    expect(s.page).toBe(1);
    expect(s.matrix.page).toBe(1);
    expect(s.cell).toBeNull();
    expect(s.area).toBeNull();
    expect(s.sel).toEqual(['ok-id']);
    expect(s.filters.cap).toEqual(['cyber']);
    expect(fromQuery('map=40/95/-200').map).toBeNull();
  });

  it('drops values that are not in the data', () => {
    const s = sanitiseState(
      fromQuery('cap=cyber,not-a-capability&size=size-huge,size-small&region=Atlantis,Wales&sel=example-robotics,nobody&mgroup=nope'),
      data,
    );
    expect(s.filters.cap).toEqual(['cyber']);
    expect(s.filters.size).toEqual(['size-small']);
    expect(s.filters.region).toEqual(['Wales']);
    expect(s.sel).toEqual(['example-robotics']);
    expect(s.matrix.group).toBeNull();
  });

  it('keeps a shared link short', () => {
    expect(toQuery(full).length).toBeLessThan(400);
    expect(toQuery(full)).not.toMatch(/[<>"' ]/);
  });
});
