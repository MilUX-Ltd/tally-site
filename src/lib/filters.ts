// Filter logic. Within a facet, values are alternatives (any); facets combine
// (all). A capability also matches its sub-capabilities ("cyber" matches
// "cyber/pen-testing"), but not the other way round.
import type { Company } from './types';

export interface Filters {
  cap: string[];
  size: string[];
  region: string[];
  fw: string[];
  accr: string[];
  mbr: string[];
}

export const FACETS = ['cap', 'size', 'region', 'fw', 'accr', 'mbr'] as const;
export type Facet = (typeof FACETS)[number];

export function emptyFilters(): Filters {
  return { cap: [], size: [], region: [], fw: [], accr: [], mbr: [] };
}

export function activeFilterCount(filters: Filters): number {
  return FACETS.reduce((n, f) => n + filters[f].length, 0);
}

function hasCapability(tags: string[], wanted: string[]): boolean {
  return wanted.some((w) => tags.some((t) => t === w || t.startsWith(`${w}/`)));
}

function hasAnyTag(tags: string[], wanted: string[]): boolean {
  return wanted.some((w) => tags.includes(w));
}

export function matches(company: Company, filters: Filters): boolean {
  const { tags } = company;
  if (filters.cap.length && !hasCapability(tags, filters.cap)) return false;
  if (filters.size.length && !hasAnyTag(tags, filters.size) && !filters.size.includes(`size-${company.size}`)) return false;
  if (filters.region.length && !filters.region.includes(company.region)) return false;
  if (filters.fw.length && !hasAnyTag(tags, filters.fw)) return false;
  if (filters.accr.length && !hasAnyTag(tags, filters.accr)) return false;
  if (filters.mbr.length && !hasAnyTag(tags, filters.mbr)) return false;
  return true;
}

export function filterCompanies(companies: Company[], filters: Filters): Company[] {
  if (activeFilterCount(filters) === 0) return companies;
  return companies.filter((c) => matches(c, filters));
}

export function isLocated(company: Company): company is Company & { lat: number; lon: number } {
  return typeof company.lat === 'number' && typeof company.lon === 'number';
}
