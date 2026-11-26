// Countries and the explorer's scope. Every company has a country (an ISO
// code; GB for the UK), and a country shows only when the data marks it live.
// The scope is what the explorer covers: the UK (the default), one other live
// country, or a bloc (Europe, North America) of live countries. Russia is
// never a scope, whatever the data says.
import { UK_BOUNDS } from './map-config';
import type { Company, Option } from './types';
import type { Bbox } from './url-state';

export type Bloc = 'europe' | 'north-america' | 'other';

export interface Country {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  name: string;
  bloc: Bloc;
  live: boolean;
  /** West, south, east, north; present for every live country. */
  bounds?: Bbox;
  /** First-level regions, in order; present for every live country. */
  regions?: string[];
}

/** The UK's twelve regions, as the taxonomy names them. */
export const UK_REGION_NAMES = [
  'North East',
  'North West',
  'Yorkshire and The Humber',
  'East Midlands',
  'West Midlands',
  'East of England',
  'London',
  'South East',
  'South West',
  'Scotland',
  'Wales',
  'Northern Ireland',
] as const;

/** The UK as a country, for data that carries no countries list. */
export const UNITED_KINGDOM: Country = { code: 'GB', name: 'United Kingdom', bloc: 'europe', live: true, bounds: UK_BOUNDS, regions: [...UK_REGION_NAMES] };

export const DEFAULT_SCOPE = 'gb';
export const BLOCS = ['europe', 'north-america'] as const;
const NEVER = new Set(['ru']);
const SCOPE = /^(?:[a-z]{2}|europe|north-america)$/;

/** A scope fit to hold in the URL (not yet checked against the data). */
export function isScopeValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && SCOPE.test(value) && !NEVER.has(value);
}

/** The company's country code: its own, or GB for a company with no country, or '' when overseas and unknown. */
export function countryOf(company: Company): string {
  const code = (company.country_code ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  return company.country || company.region === 'Overseas' ? '' : 'GB';
}

/** The live countries a scope covers. */
export function scopeCountries(scope: string, countries: Country[]): Country[] {
  if (!isScopeValue(scope)) return [];
  const live = countries.filter((c) => c.live && c.bounds && c.regions?.length && !NEVER.has(c.code.toLowerCase()));
  if (scope === 'europe') return live.filter((c) => c.bloc === 'europe');
  if (scope === 'north-america') return live.filter((c) => c.bloc === 'north-america');
  return live.filter((c) => c.code.toLowerCase() === scope);
}

/** The bounds that hold every live country in the scope; the UK's when there is none. */
export function scopeBounds(scope: string, countries: Country[]): Bbox {
  const boxes = scopeCountries(scope, countries).map((c) => c.bounds as Bbox);
  if (!boxes.length) return [...UK_BOUNDS] as Bbox;
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

/** Whether a company is in one of the scope's live countries. */
export function inScope(company: Company, scope: string, countries: Country[]): boolean {
  const code = countryOf(company);
  return Boolean(code) && scopeCountries(scope, countries).some((c) => c.code === code);
}

export interface RegionChoices {
  /** `region` for one country; `country` across several. */
  facet: 'region' | 'country';
  options: Option[];
}

/** The place choices the filters offer: the country's regions, or the countries by name across several. */
export function regionChoices(scope: string, countries: Country[]): RegionChoices {
  const inView = scopeCountries(scope, countries);
  if (inView.length > 1) {
    const options = inView.map((c) => ({ slug: c.code.toLowerCase(), label: c.name })).sort((a, b) => a.label.localeCompare(b.label, 'en-GB'));
    return { facet: 'country', options };
  }
  const regions = inView[0]?.regions ?? [...UK_REGION_NAMES];
  return { facet: 'region', options: regions.map((r) => ({ slug: r, label: r })) };
}

/** Whether the matrix shows each company's country: only across two or more live countries. */
export function showsCountry(scope: string, countries: Country[]): boolean {
  return scopeCountries(scope, countries).length > 1;
}

/** A country's English name from its code, or the code itself. */
export function countryName(code: string, countries: Country[]): string {
  return countries.find((c) => c.code === code)?.name ?? code;
}
