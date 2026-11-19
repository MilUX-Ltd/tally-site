// Build step: fetch the public Tally data and taxonomy from MilUX-Ltd/tally,
// slim them for the browser and write public/data/tally.json (git-ignored).
// With TALLY_DATA_SOURCE=fixture it reads tests/fixtures instead, so tests
// never touch the network.
// Usage: node scripts/fetch-data.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/MilUX-Ltd/tally/main';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const safeLink = (v) => (/^https?:\/\/[^\s]+$/i.test(str(v)) ? str(v) : '');

export function slugify(name) {
  return str(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const options = (facet) =>
  (facet?.values ?? []).filter((v) => v && typeof v.slug === 'string').map((v) => ({ slug: v.slug, label: str(v.label) || v.slug }));

export function slimTaxonomy(taxonomy) {
  const f = taxonomy?.facets ?? {};
  return {
    groups: (f.capability?.groups ?? [])
      .map((g) => ({ slug: str(g.slug), label: str(g.label), order: Number(g.order) || 0, description: str(g.description) }))
      .sort((a, b) => a.order - b.order),
    capabilities: (f.capability?.values ?? []).map((v) => ({ slug: str(v.slug), label: str(v.label) || str(v.slug), group: str(v.group) })),
    sizes: options(f.size),
    regions: (f.region?.values ?? []).map((v) => ({ slug: str(v.value), label: str(v.value) })).filter((v) => v.slug),
    frameworks: options(f.frameworks),
    accreditations: options(f.accreditations),
    memberships: options(f.memberships),
  };
}

/** Slims the raw data for the browser: drops page bodies, adds stable ids, keeps only safe links and valid points. */
export function slimData(raw, taxonomy) {
  if (!raw || !Array.isArray(raw.companies)) throw new Error('tally-data.json has no companies array');
  const used = new Set();
  const companies = raw.companies.map((c) => {
    let id = slugify(c.name) || 'company';
    for (let n = 2; used.has(id); n++) id = `${slugify(c.name) || 'company'}-${n}`;
    used.add(id);
    // A "region" location means the UK location is not published: never map it.
    const unpublished = str(c.location_source) === 'region';
    const lat = unpublished ? null : num(c.lat, -90, 90);
    const lon = unpublished ? null : num(c.lon, -180, 180);
    return {
      id,
      name: str(c.name),
      website: safeLink(c.website),
      linkedin: safeLink(c.linkedin),
      hq: str(c.hq),
      region: str(c.region),
      size: str(c.size),
      headcount: str(c.headcount),
      founded: str(c.founded),
      tags: Array.isArray(c.tags) ? c.tags.filter((t) => typeof t === 'string') : [],
      summary: str(c.summary),
      lat: lat != null && lon != null ? lat : null,
      lon: lat != null && lon != null ? lon : null,
      postcode: str(c.postcode),
      location_source: str(c.location_source),
      country: str(c.country),
    };
  });
  companies.sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  return { generated: str(raw.generated), count: companies.length, taxonomy: slimTaxonomy(taxonomy), companies };
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const fixture = process.env.TALLY_DATA_SOURCE === 'fixture';
  const read = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8'));
  const [raw, taxonomy] = fixture
    ? [read('tally-data.json'), read('taxonomy.json')]
    : await Promise.all([fetchJson(`${BASE}/tally-data.json`), fetchJson(`${BASE}/taxonomy.json`)]);
  const data = slimData(raw, taxonomy);
  if (data.companies.length === 0) throw new Error('no companies; refusing to build an empty site');
  const dir = new URL('../public/data/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('tally.json', dir), JSON.stringify(data));
  const located = data.companies.filter((c) => c.lat != null).length;
  console.log(`Wrote public/data/tally.json from ${fixture ? 'the test fixture' : 'MilUX-Ltd/tally'}: ${data.count} companies, ${located} with a point.`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  main().catch((err) => {
    console.error(`fetch-data failed: ${err.message}`);
    process.exit(1);
  });
}
