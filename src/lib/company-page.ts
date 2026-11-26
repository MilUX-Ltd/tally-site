// The company page model: slug and address, safe Markdown, capability groups,
// location and the small static map, titles and descriptions, the shortlist
// link and the sitemap. Plain TypeScript with no framework imports; the page
// (src/pages/companies/[slug].astro) only renders what this returns.
import { countryMap, hasCountryMap, projectCountry } from './country-map';
import { isLocated } from './filters';
import { countryOf, type Country } from './scope';
import { UK_BOUNDS } from './map-config';
import { addToShortlist } from './shortlist';
import { distanceMiles, type Site } from './sites';
import type { Company, Taxonomy } from './types';

export const SITE_URL = 'https://tally.milux.co.uk';

/** A company page's path. The slug is the company id, the same value the shortlist uses. */
export const companyPath = (id: string) => `/companies/${id}/`;

/** The canonical address of a path on the site. */
export const canonicalUrl = (path: string) => `${SITE_URL}${path}`;

// Safe Markdown: paragraphs, bullet lists, bold, italic and http(s) links.
// Everything else, raw HTML included, stays text; the page renders text
// escaped and never as HTML.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block = { type: 'p'; inlines: Inline[] } | { type: 'ul'; items: Inline[][] };

const SAFE_HREF = /^https?:\/\/[^\s<>"]+$/i;
const LINK = /^\[([^\]\n]+)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/;

function pushText(out: Inline[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest[0] === '[') {
      const m = LINK.exec(rest);
      if (m) {
        if (SAFE_HREF.test(m[2])) out.push({ type: 'link', href: m[2], children: parseInline(m[1]) });
        else pushText(out, m[1]);
        i += m[0].length;
        continue;
      }
    }
    if (rest.startsWith('**')) {
      const end = rest.indexOf('**', 2);
      if (end > 2) {
        out.push({ type: 'strong', children: parseInline(rest.slice(2, end)) });
        i += end + 2;
        continue;
      }
    }
    if (rest[0] === '*' && rest[1] && rest[1] !== ' ' && rest[1] !== '*') {
      const m = /^\*([^*\n]*[^*\s])\*(?!\*)/.exec(rest);
      if (m) {
        out.push({ type: 'em', children: parseInline(m[1]) });
        i += m[0].length;
        continue;
      }
    }
    pushText(out, rest[0]);
    i += 1;
  }
  return out;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let items: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', inlines: parseInline(para.join(' ')) });
    if (items?.length) blocks.push({ type: 'ul', items: items.map(parseInline) });
    para = [];
    items = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      if (para.length) flush();
      items ??= [];
      items.push(bullet[1].trim());
      continue;
    }
    // Quote and heading marks are dropped; the words stay.
    const words = line.trim().replace(/^>\s?/, '').replace(/^#{1,6}\s+/, '');
    if (items && /^\s/.test(raw)) items[items.length - 1] += ` ${words}`;
    else {
      if (items) flush();
      para.push(words);
    }
  }
  flush();
  return blocks;
}

/** The company's capabilities under their groups, both in taxonomy order. */
export function capabilityGroups(company: Company, taxonomy: Taxonomy): Array<{ slug: string; label: string; capabilities: string[] }> {
  const tags = new Set(company.tags);
  return taxonomy.groups
    .map((g) => ({
      slug: g.slug,
      label: g.label,
      capabilities: taxonomy.capabilities.filter((c) => c.group === g.slug && tags.has(c.slug)).map((c) => c.label),
    }))
    .filter((g) => g.capabilities.length > 0);
}

/**
 * The capability tags a page shows under each group heading. A tag does not
 * repeat its heading: "Space / Ground Systems" under Space reads "Ground
 * Systems", and "Space" under Space is left out beside other tags (the
 * heading says it). When the group itself is the company's one capability
 * there, it is shown as the tag, so no heading is left with nothing under it.
 */
export function capabilityTagGroups(company: Company, taxonomy: Taxonomy): Array<{ slug: string; label: string; tags: string[] }> {
  return capabilityGroups(company, taxonomy).map((g) => {
    const prefix = `${g.label} / `.toLowerCase();
    const tags = g.capabilities
      .filter((c) => c.toLowerCase() !== g.label.toLowerCase())
      .map((c) => (c.toLowerCase().startsWith(prefix) ? c.slice(prefix.length) : c));
    return { slug: g.slug, label: g.label, tags: tags.length ? tags : g.capabilities.slice(0, 1) };
  });
}

/** Labels of the tags a company has from one facet, in taxonomy order. */
export const labelsFor = (company: Company, options: Array<{ slug: string; label: string }>) =>
  options.filter((o) => company.tags.includes(o.slug)).map((o) => o.label);

// Certification labels. Every certification shown says where it came from:
// the company's own statement, or a manual check against a public register
// recorded in the data repo. The wording never says or implies that a company
// is not certified; a check that cannot be read falls back to the statement.

export interface CertificationCheck {
  accreditation: string;
  register: string;
  /** YYYY-MM-DD */
  checked: string;
  /** https link to the register entry, or null. */
  link: string | null;
}

export const STATED = 'Stated by the company';

/** A YYYY-MM-DD date as "1 December 2026", or null when it is not a real date. */
export function longDate(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return date.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Whether a check can be shown: a register in words and a real date. */
const readable = (check: CertificationCheck | null | undefined): check is CertificationCheck =>
  Boolean(check && typeof check.register === 'string' && check.register.trim().length >= 2 && longDate(check.checked));

/** Where a certification came from, in words: "Stated by the company" or "Checked against <register> on <date>". */
export function certificationLabel(check: CertificationCheck | null | undefined): string {
  if (!readable(check)) return STATED;
  return `Checked against ${check.register.trim()} on ${longDate(check.checked)}`;
}

export interface Certification {
  slug: string;
  label: string;
  /** The recorded check, or null when the certification is as stated by the company. */
  check: CertificationCheck | null;
  /** The provenance label. */
  source: string;
}

/** A company's certifications (its accreditations) in taxonomy order, each with where it came from. */
export function companyCertifications(company: Company, taxonomy: Taxonomy, checks: CertificationCheck[] | undefined): Certification[] {
  return taxonomy.accreditations
    .filter((a) => company.tags.includes(a.slug))
    .map((a) => {
      const found = (checks ?? []).find((c) => c.accreditation === a.slug);
      // The link is checked again here: only an https address is ever rendered as a link.
      const check = readable(found) ? { ...found, link: found.link && /^https:\/\/[^\s<>"\\]+$/i.test(found.link) ? found.link : null } : null;
      return { slug: a.slug, label: a.label, check, source: certificationLabel(check) };
    });
}

export function sizeLabel(company: Company, taxonomy: Taxonomy): string {
  return taxonomy.sizes.find((s) => company.tags.includes(s.slug) || s.slug === `size-${company.size}`)?.label ?? company.size;
}

// The static map: the UK outline (src/pages/maps/uk.svg.ts) in a plain
// projection, scaled for the UK's middle latitude, with the company's point.
const [W, S, E, N] = UK_BOUNDS;
const SCALE = 36;
const X_SCALE = SCALE * Math.cos((((S + N) / 2) * Math.PI) / 180);
export const UK_MAP = { width: Math.round((E - W) * X_SCALE), height: Math.round((N - S) * SCALE) };

/** SVG coordinates of a longitude and latitude on the UK map, to one decimal place. */
export function projectUk(lon: number, lat: number): { x: number; y: number } {
  return { x: Math.round((lon - W) * X_SCALE * 10) / 10, y: Math.round((N - lat) * SCALE * 10) / 10 };
}

export interface CompanyLocation {
  /** Where the company is, in words. */
  text: string;
  /** Its point on the UK map, or null when it is not mapped. */
  point: { x: number; y: number } | null;
  /** Why there is no point, when there is none. */
  note: string;
}

/** The town a UK company gives, without "United Kingdom" or a repeat of its region: "London", not "London, United Kingdom, London". */
function townOf(company: Company): string[] {
  const skip = new Set(['united kingdom', 'uk', 'great britain', (company.region || '').toLowerCase()]);
  return (company.hq || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !skip.has(part.toLowerCase()));
}

export function companyLocation(company: Company, countries?: Country[]): CompanyLocation {
  const overseas = Boolean(company.country) || company.region === 'Overseas';
  // A company in a live country other than the UK is drawn on its own country's map.
  const abroad = countries ? companyLocator(company, countries) : null;
  if (overseas) {
    const country = company.country;
    const SHORT: Record<string, string[]> = { 'United States': ['USA', 'US', 'United States of America'], 'United Kingdom': ['UK'] };
    const named = (hq: string, c: string) => hq.includes(c) || (SHORT[c] ?? []).some((s) => hq.split(',').map((p) => p.trim()).includes(s));
    const text = company.hq && (!country || named(company.hq, country)) ? company.hq : [company.hq, country].filter(Boolean).join(', ');
    if (abroad?.kind === 'point') return { text: text || 'Outside the UK', point: { x: abroad.x, y: abroad.y }, note: '' };
    return { text: text || 'Outside the UK', point: null, note: 'Based outside the UK, so not on the UK map.' };
  }
  if (company.location_source === 'region') {
    return { text: company.region ? `${company.region}, United Kingdom` : 'United Kingdom', point: null, note: 'Only the region is published, so there is no point on the map.' };
  }
  // With a postcode, describe the point we place (postcode and region), not a headquarters elsewhere.
  const text = company.postcode
    ? [company.postcode, company.region].filter(Boolean).join(', ')
    : [...townOf(company), company.region].filter(Boolean).join(', ') || 'Location not known';
  if (isLocated(company)) return { text, point: projectUk(company.lon, company.lat), note: '' };
  return { text, point: null, note: 'No published location to put on the map.' };
}

// The locator: what the "Where they are" graphic draws. A located company
// gets its point on the UK outline, its coordinates and a local window 60
// miles across with a 25 mile ring; a company whose location is published
// only as a region gets that region shaded; anything else gets no drawing.

const MILES_PER_DEGREE = 69.055;
/** The local window is this many miles across; the ring is this many miles in radius. */
export const LOCAL_WINDOW_MILES = 60;
export const LOCAL_RING_MILES = 25;

/** The UK regions and countries a region-level company can be in, as the taxonomy names them. */
export const UK_REGIONS = [
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

/** A region name as a file name: "East of England" is "east-of-england". */
export const regionSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The shared outline of one region, in the same projection as /maps/uk.svg. */
export const regionMapPath = (name: string) => `/maps/region/${regionSlug(name)}.svg`;

const round1 = (n: number) => Math.round(n * 10) / 10;

export type Locator =
  | {
      kind: 'point';
      x: number;
      y: number;
      /** Latitude and longitude to two decimal places, as "51.51°N" and "0.13°W". */
      north: string;
      east: string;
      /** The local window on the UK map: its top-left corner and side, in map units. */
      window: { x: number; y: number; size: number };
      /** The 25 mile ring around the point, in map units: not quite a circle, because the map is drawn for the UK's middle latitude. */
      ring: { rx: number; ry: number };
      /** For a company in a live country other than the UK: its country's outline and that map's size. Absent for the UK (/maps/uk.svg). */
      map?: string;
      width?: number;
      height?: number;
      /** The country's name, for the text alternative. */
      country?: string;
    }
  | { kind: 'region'; region: string; href: string }
  | { kind: 'none' };

const coordinates = (lat: number, lon: number) => ({
  north: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`,
  east: `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
});

/** A company in a live country other than the UK: its point on that country's outline, or nothing. */
function countryLocator(company: Company, countries: Country[]): Locator {
  const code = countryOf(company);
  const country = countries.find((c) => c.code === code && c.live);
  if (!country || !hasCountryMap(code) || !isLocated(company, [country])) return { kind: 'none' };
  const size = countryMap(code);
  const { x, y } = projectCountry(code, company.lon, company.lat);
  if (x <= 0 || y <= 0 || x >= size.width || y >= size.height) return { kind: 'none' };
  const side = round1((LOCAL_WINDOW_MILES / MILES_PER_DEGREE) * size.scale);
  const rx = (LOCAL_RING_MILES / (MILES_PER_DEGREE * Math.cos((company.lat * Math.PI) / 180))) * size.xScale;
  return {
    kind: 'point',
    x,
    y,
    ...coordinates(company.lat, company.lon),
    window: { x: round1(x - side / 2), y: round1(y - side / 2), size: side },
    ring: { rx: round1(rx), ry: round1((LOCAL_RING_MILES / MILES_PER_DEGREE) * size.scale) },
    map: `/maps/${code.toLowerCase()}.svg`,
    width: size.width,
    height: size.height,
    country: country.name,
  };
}

/** What the company page draws. `countries` are the data's countries; without them, only the UK is drawn. */
export function companyLocator(company: Company, countries?: Country[]): Locator {
  const code = countryOf(company);
  if (countries && code && code !== 'GB') return countryLocator(company, countries);
  const overseas = Boolean(company.country) || company.region === 'Overseas';
  if (overseas) return { kind: 'none' };
  if (company.location_source === 'region') {
    const region = UK_REGIONS.find((r) => r === company.region);
    return region ? { kind: 'region', region, href: regionMapPath(region) } : { kind: 'none' };
  }
  if (!isLocated(company)) return { kind: 'none' };
  const { x, y } = projectUk(company.lon, company.lat);
  const size = round1((LOCAL_WINDOW_MILES / MILES_PER_DEGREE) * SCALE);
  const ry = (LOCAL_RING_MILES / MILES_PER_DEGREE) * SCALE;
  // A mile of longitude is drawn at X_SCALE for the whole map; on the ground it depends on the latitude.
  const rx = (LOCAL_RING_MILES / (MILES_PER_DEGREE * Math.cos((company.lat * Math.PI) / 180))) * X_SCALE;
  return {
    kind: 'point',
    x,
    y,
    north: `${Math.abs(company.lat).toFixed(2)}°${company.lat >= 0 ? 'N' : 'S'}`,
    east: `${Math.abs(company.lon).toFixed(2)}°${company.lon >= 0 ? 'E' : 'W'}`,
    window: { x: round1(x - size / 2), y: round1(y - size / 2), size },
    ring: { rx: round1(rx), ry: round1(ry) },
  };
}

export interface NearSite {
  id: string;
  name: string;
  /** Great-circle distance in whole miles. */
  miles: number;
  /** The site's point on the UK map. */
  x: number;
  y: number;
}

/** The defence sites nearest a company the map places, nearest first; none for any other company. */
export function nearestSites(company: Company, sites: Site[], count: number): NearSite[] {
  if (!isLocated(company) || company.location_source === 'region') return [];
  return sites
    .map((site) => ({ site, miles: distanceMiles(company.lat, company.lon, site.lat, site.lon) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count)
    .map(({ site, miles }) => ({ id: site.id, name: site.name, miles: Math.round(miles), ...projectUk(site.lon, site.lat) }));
}

/**
 * The check line under a company's name: when its public sources were last
 * checked, or that they have not been yet. The date is returned apart so the
 * page can mark it up as a time.
 */
export function checkLine(verified: string | null | undefined): { before: string; iso: string | null; date: string | null; after: string } {
  const date = verified ? longDate(verified) : null;
  if (!verified || !date) return { before: 'From public sources. Not yet checked.', iso: null, date: null, after: '' };
  return { before: 'Last checked against public sources on ', iso: verified, date, after: '.' };
}

export const pageTitle = (company: Company) => `${company.name}: company profile on Tally`;

const MAX_DESCRIPTION = 160;

export function metaDescription(company: Company): string {
  const text = (company.summary || `${company.name}: a company listed in Tally, the open directory of UK defence capability.`).replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_DESCRIPTION) return text;
  const cut = text.slice(0, MAX_DESCRIPTION - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Where "Add to shortlist" goes: the explorer with this company added. When
 * the visitor came from the explorer (a same-origin referrer on /), its view
 * and shortlist are kept; otherwise the shortlist is this company alone.
 */
export function shortlistHref(id: string, referrer: string, origin: string): string {
  const alone = `/?list=${id}`;
  let from: URL;
  try {
    from = new URL(referrer);
  } catch {
    return alone;
  }
  if (from.origin !== origin || from.pathname !== '/') return alone;
  const params = from.searchParams;
  const list = (params.get('list') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => ID.test(x));
  params.set('list', addToShortlist([...new Set(list)], id).join(','));
  return `/?${params.toString().replace(/%2C/gi, ',')}`;
}

const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string);

/** Refuses any path under /russia/: Russia is never shown on Tally. */
export function assertNoRussiaPath(paths: string[]): void {
  const bad = paths.find((p) => /(^|\/)russia(\/|$)/i.test(p));
  if (bad) throw new Error(`refusing a Russia path (${bad}): Russia is never shown on Tally`);
}

/** A sitemap (sitemaps.org 0.9) of site paths. Refuses any Russia path. */
export function sitemapXml(paths: string[]): string {
  assertNoRussiaPath(paths);
  const urls = paths.map((p) => `  <url><loc>${xmlEscape(canonicalUrl(p))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
