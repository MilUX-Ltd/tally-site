// The shortlist: companies a buyer has picked, held in the URL (`list`) and
// exportable as CSV. The CSV columns are a public interface (CONTEXT.md).
import type { Company, Taxonomy } from './types';

export const MAX_SHORTLIST = 100;

export function addToShortlist(list: string[], id: string): string[] {
  if (list.includes(id) || list.length >= MAX_SHORTLIST) return list;
  return [...list, id];
}

export function removeFromShortlist(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : list;
}

export const CSV_COLUMNS = [
  'Name',
  'Website',
  'LinkedIn',
  'Headquarters',
  'Region',
  'Country',
  'Postcode',
  'Location source',
  'Size',
  'Capabilities',
  'Accreditations',
  'Frameworks',
  'Memberships',
  'Summary',
] as const;

// A cell a spreadsheet would run as a formula gets a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function labels(tags: string[], options: Array<{ slug: string; label: string }>): string {
  return options
    .filter((o) => tags.includes(o.slug))
    .map((o) => o.label)
    .join('; ');
}

/** CSV text (RFC 4180, CRLF line ends), one row per company in shortlist order. */
export function shortlistCsv(companies: Company[], taxonomy: Taxonomy): string {
  const size = (c: Company) =>
    taxonomy.sizes.find((s) => c.tags.includes(s.slug) || s.slug === `size-${c.size}`)?.label ?? c.size;
  const rows = companies.map((c) => [
    c.name,
    c.website,
    c.linkedin,
    c.hq,
    c.region,
    c.country,
    c.postcode,
    c.location_source,
    size(c),
    labels(c.tags, taxonomy.capabilities),
    labels(c.tags, taxonomy.accreditations),
    labels(c.tags, taxonomy.frameworks),
    labels(c.tags, taxonomy.memberships),
    c.summary,
  ]);
  return [CSV_COLUMNS as readonly string[], ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
