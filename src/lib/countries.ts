// Overseas companies, grouped by country: Europe first, then the rest of the
// world. Overseas companies are listed, never drawn on the UK map (see
// isLocated in filters.ts and slimData in scripts/fetch-data.mjs).
import type { Company } from './types';

/** European countries, by the English short names the data uses (and common variants). */
const EUROPE = new Set(
  [
    'Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Cyprus',
    'Czech Republic', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland',
    'Ireland', 'Republic of Ireland', 'Italy', 'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta',
    'Moldova', 'Monaco', 'Montenegro', 'Netherlands', 'The Netherlands', 'North Macedonia', 'Norway', 'Poland',
    'Portugal', 'Romania', 'San Marino', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland',
    'Ukraine', 'Vatican City', 'Gibraltar', 'Guernsey', 'Jersey', 'Isle of Man', 'Faroe Islands', 'Turkey', 'Türkiye',
  ].map((c) => c.toLowerCase()),
);

export const UNKNOWN_COUNTRY = 'Country not known';

export interface CountryGroup {
  country: string;
  companies: Company[];
}

export interface OverseasGroups {
  europe: CountryGroup[];
  world: CountryGroup[];
}

export function isOverseas(company: Company): boolean {
  return Boolean(company.country) || company.region === 'Overseas';
}

export function isEuropean(country: string): boolean {
  return EUROPE.has(country.trim().toLowerCase());
}

const byName = (a: string, b: string) => a.localeCompare(b, 'en-GB');

/** Overseas companies by country: European countries, then the rest, alphabetically, with "Country not known" last. */
export function overseasByCountry(companies: Company[]): OverseasGroups {
  const groups = new Map<string, Company[]>();
  for (const c of companies) {
    if (!isOverseas(c)) continue;
    const country = c.country.trim() || UNKNOWN_COUNTRY;
    const list = groups.get(country);
    if (list) list.push(c);
    else groups.set(country, [c]);
  }
  const all = [...groups.entries()]
    .map(([country, list]) => ({ country, companies: [...list].sort((a, b) => byName(a.name, b.name)) }))
    .sort((a, b) => (a.country === UNKNOWN_COUNTRY ? 1 : b.country === UNKNOWN_COUNTRY ? -1 : byName(a.country, b.country)));
  return { europe: all.filter((g) => isEuropean(g.country)), world: all.filter((g) => !isEuropean(g.country)) };
}
