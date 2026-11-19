// Plain-English search in the browser: send the request to /api/search,
// apply the filters it returns after checking them against the data, or fall
// back to a keyword search over company names, summaries and tag labels.
import { emptyFilters, FACETS, type Filters } from './filters';
import { DEFAULT_RADIUS, isRadius, type Radius } from './sites';
import type { Company, Taxonomy } from './types';

export const MAX_QUERY_LENGTH = 300;

// Words that say nothing about a company.
const STOPWORDS = new Set(
  (
    'a an and any are as at be by can do for from has have i in into is it its me my near of on or our please show some that the their them ' +
    'there these they this those to uk us we what which who with within want need find looking firm firms company companies business businesses ' +
    'supplier suppliers provider providers organisation organisations no not'
  ).split(' '),
);

/** Words worth searching for: lower case, letters and digits, common words dropped. */
export function keywords(q: string): string[] {
  const words = q
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));
  return [...new Set(words)];
}

const words = (text: string) => keywords(text.replace(/[^\p{L}\p{N}]+/gu, ' '));

/**
 * Companies whose name, summary or tag labels contain every keyword (a word
 * starting with it, so "drone" matches "drones"). With no usable keyword,
 * every company is returned.
 */
export function keywordSearch(companies: Company[], q: string, taxonomy: Taxonomy): Company[] {
  const wanted = keywords(q);
  if (wanted.length === 0) return companies;
  const labels = new Map<string, string>();
  for (const o of [...taxonomy.capabilities, ...taxonomy.sizes, ...taxonomy.frameworks, ...taxonomy.accreditations, ...taxonomy.memberships]) {
    labels.set(o.slug, o.label);
  }
  return companies.filter((c) => {
    const text = [c.name, c.summary, ...c.tags.map((t) => `${labels.get(t) ?? ''} ${t}`)].join(' ');
    const have = words(text);
    return wanted.every((w) => have.some((h) => h.startsWith(w)));
  });
}

/** What /api/search returned, once checked. */
export type SearchAnswer =
  | { kind: 'filters'; filters: Filters; capMatch: 'any' | 'all'; site: string | null; radius: Radius; labels: string[] }
  | { kind: 'fallback' };

/**
 * Checks a /api/search answer against the data the browser holds. Anything
 * unknown is dropped; an answer with nothing usable left is a fallback.
 */
export function readSearchAnswer(body: unknown, taxonomy: Taxonomy, siteIds: Iterable<string>, siteNames: Map<string, string> = new Map()): SearchAnswer {
  if (typeof body !== 'object' || body === null || (body as { fallback?: unknown }).fallback !== false) return { kind: 'fallback' };
  const b = body as { filters?: unknown; capmatch?: unknown; site?: unknown; radius?: unknown };
  const given = typeof b.filters === 'object' && b.filters !== null ? (b.filters as Record<string, unknown>) : {};
  const options: Record<string, Array<{ slug: string; label: string }>> = {
    cap: taxonomy.capabilities,
    size: taxonomy.sizes,
    region: taxonomy.regions,
    fw: taxonomy.frameworks,
    accr: taxonomy.accreditations,
    mbr: taxonomy.memberships,
  };
  const filters = emptyFilters();
  const labels: string[] = [];
  for (const facet of FACETS) {
    const values = Array.isArray(given[facet]) ? (given[facet] as unknown[]) : [];
    for (const v of values) {
      const option = typeof v === 'string' ? options[facet].find((o) => o.slug === v) : undefined;
      if (option && !filters[facet].includes(option.slug)) {
        filters[facet].push(option.slug);
        labels.push(option.label);
      }
    }
  }
  const known = new Set(siteIds);
  const site = typeof b.site === 'string' && known.has(b.site) ? b.site : null;
  const radius = typeof b.radius === 'number' && isRadius(b.radius) ? b.radius : DEFAULT_RADIUS;
  if (site) labels.push(`within ${radius} miles of ${siteNames.get(site) ?? 'the chosen site'}`);
  if (labels.length === 0) return { kind: 'fallback' };
  const capMatch = b.capmatch === 'all' && filters.cap.length >= 2 ? 'all' : 'any';
  return { kind: 'filters', filters, capMatch, site, radius, labels };
}

/** Sends a request to the search route. Any failure is a fallback. */
export async function askSearch(q: string): Promise<unknown> {
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q }),
    });
    if (!response.ok) return { fallback: true };
    return await response.json();
  } catch {
    return { fallback: true };
  }
}
