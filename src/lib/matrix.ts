// The capability matrix: companies against top-level capabilities, grouped by
// the taxonomy's capability groups, a page of rows at a time.
import { isLocated } from './filters';
import type { Capability, Company, Group, Taxonomy } from './types';
import type { Bbox } from './url-state';

export const MATRIX_PAGE_SIZE = 25;

export interface ColumnGroup {
  group: Group;
  columns: Capability[];
}

/** A company has a capability when it carries the tag or one of its sub-capabilities. */
export function hasCapability(company: Company, slug: string): boolean {
  return company.tags.some((t) => t === slug || t.startsWith(`${slug}/`));
}

/** Column groups in taxonomy order; one group only when `group` is set. */
export function matrixColumns(taxonomy: Taxonomy, group: string | null): ColumnGroup[] {
  return [...taxonomy.groups]
    .sort((a, b) => a.order - b.order)
    .filter((g) => !group || g.slug === group)
    .map((g) => ({ group: g, columns: taxonomy.capabilities.filter((c) => c.group === g.slug && !c.slug.includes('/')) }))
    .filter((g) => g.columns.length > 0);
}

export interface MatrixPage {
  rows: Company[];
  page: number;
  pages: number;
}

export function matrixPage(companies: Company[], page: number): MatrixPage {
  const pages = Math.max(1, Math.ceil(companies.length / MATRIX_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { rows: companies.slice((current - 1) * MATRIX_PAGE_SIZE, current * MATRIX_PAGE_SIZE), page: current, pages };
}

export function inBbox(company: Company, [w, s, e, n]: Bbox): boolean {
  return isLocated(company) && company.lon >= w && company.lon <= e && company.lat >= s && company.lat <= n;
}

export function companiesInBbox(companies: Company[], bbox: Bbox): Company[] {
  return companies.filter((c) => inBbox(c, bbox));
}
