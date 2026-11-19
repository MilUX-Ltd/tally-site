// Filter logic. Within a facet, values are alternatives (any); facets combine
// (all). A capability also matches its sub-capabilities ("cyber" matches
// "cyber/pen-testing"), but not the other way round.
import { UK_BOUNDS } from './map-config';
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

/**
 * A company is drawn on the UK map only when it has a point, is not an
 * overseas company, its location is not region-level only, and the point is inside the UK bounds. This is the guard
 * that keeps overseas companies off the map even if the data carries a point.
 */
export function isLocated(company: Company): company is Company & { lat: number; lon: number } {
  const { lat, lon } = company;
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (company.country || company.region === 'Overseas') return false;
  // A region-level location means the UK location is not published.
  if (company.location_source === 'region') return false;
  const [w, s, e, n] = UK_BOUNDS;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}
