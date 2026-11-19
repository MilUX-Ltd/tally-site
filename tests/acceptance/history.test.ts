// Acceptance tests: growth over time, replayed from the data repo's history.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromFixture, historyFromSnapshots, pickMonthly } from '../../scripts/build-history.mjs';
import { defaultState, fromQuery, toQuery } from '../../src/lib/url-state';

const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));

describe('growth over time', () => {
  it('picks the last commit in each month and carries gaps forward', () => {
    const picked = pickMonthly([
      { sha: 'e', date: '2026-10-15T08:45:59+01:00' },
      { sha: 'a', date: '2026-06-29T12:20:37+01:00' },
      { sha: 'c', date: '2026-07-29T10:36:56+01:00' },
      { sha: 'b', date: '2026-07-01T09:00:00Z' },
      { sha: 'd', date: '2026-08-27T14:00:34+01:00' },
      { sha: 'f', date: '2026-11-19T16:32:14Z' },
    ]);
    expect(picked.map((p: { month: string; sha: string; carried: boolean }) => [p.month, p.sha, p.carried])).toEqual([
      ['2026-06', 'a', false],
      ['2026-07', 'c', false],
      ['2026-08', 'd', false],
      ['2026-09', 'd', true],
      ['2026-10', 'e', false],
      ['2026-11', 'f', false],
    ]);
    expect(pickMonthly([])).toEqual([]);
  });

  it('counts companies per month and capability group', () => {
    const h = historyFromSnapshots(
      [
        { month: '2026-06', companies: [{ tags: ['cyber', 'cyber/pen-testing', 'data'] }, { tags: ['space', 'not-a-tag'] }] },
        { month: '2026-07', companies: [{ tags: ['cyber/pen-testing'] }, { tags: ['space'] }, { tags: [] }] },
      ],
      taxonomy,
    );
    expect(h.groups.map((g: { slug: string }) => g.slug)).toEqual(taxonomy.facets.capability.groups.map((g: { slug: string }) => g.slug));
    expect(h.months[0]).toMatchObject({ month: '2026-06', total: 2 });
    expect(h.months[0].groups['cyber-data-software']).toBe(1);
    expect(h.months[0].groups.space).toBe(1);
    expect(h.months[0].groups.manufacturing).toBe(0);
    expect(h.months[1]).toMatchObject({ month: '2026-07', total: 3 });
    expect(h.months[1].groups['cyber-data-software']).toBe(1);
  });

  it('the fixture history has the documented shape and stays small', () => {
    const h = fromFixture();
    expect(h.months.map((m: { month: string }) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(h.months.map((m: { total: number }) => m.total)).toEqual([20, 26, 26, 26, 30, 32]);
    expect(h.months[0].groups).toMatchObject({ domains: 11, 'cyber-data-software': 4, space: 0 });
    expect(h.months[5].groups).toMatchObject({ domains: 14, 'cyber-data-software': 9, space: 1 });
    for (const g of h.groups) expect(typeof g.label).toBe('string');
    expect(JSON.stringify(h).length).toBeLessThan(20_000);
  });

  it('keeps the chosen month in the URL', () => {
    expect(defaultState().month).toBeNull();
    const state = { ...defaultState(), month: '2026-08' };
    expect(toQuery(state)).toBe('month=2026-08');
    expect(fromQuery(toQuery(state))).toEqual(state);
    expect(toQuery(defaultState())).toBe('');
    for (const bad of ['2026-13', '2026-8', '26-08', '2026-08-01', '<b>']) expect(fromQuery(`month=${bad}`).month).toBeNull();
  });
});
