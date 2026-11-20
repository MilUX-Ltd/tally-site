// Acceptance tests: the capability matrix (columns, ticks, paging, areas).
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { companiesInBbox, hasCapability, MATRIX_PAGE_SIZE, matrixColumns, matrixPage } from '../../src/lib/matrix';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const byName = (name: string) => data.companies.find((c) => c.name === name) as Company;

describe('capability matrix', () => {
  it('groups the matrix columns by the ten capability groups', () => {
    const all = matrixColumns(data.taxonomy, null);
    expect(all.map((g) => g.group.slug)).toEqual([...data.taxonomy.groups].sort((a, b) => a.order - b.order).map((g) => g.slug));
    expect(all).toHaveLength(10);
    const slugs = all.flatMap((g) => g.columns.map((c) => c.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const g of all) {
      expect(g.columns.length).toBeGreaterThan(0);
      for (const col of g.columns) {
        expect(col.slug).not.toContain('/');
        expect(data.taxonomy.capabilities.find((c) => c.slug === col.slug)?.group).toBe(g.group.slug);
      }
    }
    const cyber = matrixColumns(data.taxonomy, 'cyber-data-software');
    expect(cyber).toHaveLength(1);
    expect(cyber[0].columns.map((c) => c.slug)).toContain('cyber');
  });

  it('ticks a company that has the capability or a sub-capability', () => {
    expect(hasCapability(byName('Example Cyber Defence'), 'cyber')).toBe(true);
    expect(hasCapability(byName('Example Robotics'), 'cyber')).toBe(false);
    const childOnly = { ...byName('Example Robotics'), tags: ['cyber/pen-testing'] };
    expect(hasCapability(childOnly, 'cyber')).toBe(true);
    expect(hasCapability({ ...childOnly, tags: ['cyberspace'] }, 'cyber')).toBe(false);
  });

  it('pages through 1,800 companies', () => {
    const many: Company[] = Array.from({ length: 1800 }, (_, i) => ({ ...data.companies[0], id: `c-${i}`, name: `Company ${i}` }));
    const first = matrixPage(many, 1);
    expect(first.rows).toHaveLength(MATRIX_PAGE_SIZE);
    expect(first.pages).toBe(Math.ceil(1800 / MATRIX_PAGE_SIZE));
    expect(MATRIX_PAGE_SIZE).toBeLessThanOrEqual(50);
    const last = matrixPage(many, first.pages);
    expect(last.rows.length).toBe(1800 - (first.pages - 1) * MATRIX_PAGE_SIZE);
    expect(matrixPage(many, 9999).page).toBe(first.pages);
    expect(matrixPage([], 3)).toEqual({ rows: [], page: 1, pages: 1 });
  });

  it('narrows to companies inside an area', () => {
    const bristol = companiesInBbox(data.companies, [-2.7, 51.4, -2.4, 51.6]);
    expect(bristol.map((c) => c.name).sort()).toEqual(['Example Aerial Systems', 'Example Composites', 'Example Flight Test']);
    expect(companiesInBbox(data.companies, [-8.7, 49.8, 1.9, 60.9])).toHaveLength(55);
  });
});
