// Build step: fetch the public Tally data, taxonomy, clusters, events and
// opportunities from MilUX-Ltd/tally, slim them for the browser and write
// public/data/tally.json, clusters.json, events.json and opportunities.json
// (git-ignored).
// With TALLY_DATA_SOURCE=fixture it reads tests/fixtures instead, so tests
// never touch the network.
// Usage: node scripts/fetch-data.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/MilUX-Ltd/tally/main';

// West, south, east, north: the UK map's bounds. Must match UK_BOUNDS in
// src/lib/map-config.ts (a unit test checks they agree).
export const UK_BOUNDS = [-8.7, 49.8, 1.9, 60.9];
const inUk = (lat, lon) => lon >= UK_BOUNDS[0] && lon <= UK_BOUNDS[2] && lat >= UK_BOUNDS[1] && lat <= UK_BOUNDS[3];

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
/** Stable ids, in data order: the slugified name, with -2, -3 and so on when names collide. Also the company page slug. */
export function companyIds(companies) {
  const used = new Set();
  return companies.map((c) => {
    let id = slugify(c.name) || 'company';
    for (let n = 2; used.has(id); n++) id = `${slugify(c.name) || 'company'}-${n}`;
    used.add(id);
    return id;
  });
}

export function slimData(raw, taxonomy) {
  if (!raw || !Array.isArray(raw.companies)) throw new Error('tally-data.json has no companies array');
  const ids = companyIds(raw.companies);
  const companies = raw.companies.map((c, i) => {
    const id = ids[i];
    // A "region" location means the UK location is not published: never map it.
    // Overseas companies are never mapped, and nor is any point outside the UK.
    const unpublished = str(c.location_source) === 'region';
    const overseas = Boolean(str(c.country)) || str(c.region) === 'Overseas';
    let lat = unpublished || overseas ? null : num(c.lat, -90, 90);
    let lon = unpublished || overseas ? null : num(c.lon, -180, 180);
    if (lat != null && lon != null && !inUk(lat, lon)) lat = lon = null;
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

// Company page text: two sections of each company's markdown body and the
// date its public sources were verified. Written to a build-only file that is
// never served; the rest of the body is dropped.
const SECTIONS = { what: 'What they do', products: 'Products and solutions' };

function validDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v ? null : v;
}

/** The "What they do" and "Products and solutions" sections and the sources-verified date of a body. */
export function companySections(body) {
  const sections = new Map();
  for (const part of str(body).split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    sections.set(heading, nl === -1 ? '' : part.slice(nl + 1).trim());
  }
  const verified = (sections.get('Sources') ?? '').match(/verified (\d{4}-\d{2}-\d{2})/i);
  return {
    what: sections.get(SECTIONS.what) ?? '',
    products: sections.get(SECTIONS.products) ?? '',
    verified: verified ? validDate(verified[1]) : null,
  };
}

/** Page text for every company, keyed by id. */
export function companyTexts(raw) {
  if (!raw || !Array.isArray(raw.companies)) throw new Error('tally-data.json has no companies array');
  const ids = companyIds(raw.companies);
  return Object.fromEntries(raw.companies.map((c, i) => [ids[i], companySections(c.body)]));
}

// Certification checks: a manual check of one of a company's accreditations
// against a public register, recorded on its page in the data repo. Kept only
// when well formed, for an accreditation the taxonomy knows and the company
// carries; anything else is dropped, so the certification stays "Stated by the
// company". Written to a build-only file that is never served.
const CHECK_HTTPS = /^https:\/\/[^\s<>"]+$/i;

/** Certification checks for every company that has any, keyed by id. `today` is the build's UTC date. */
export function certificationChecks(raw, taxonomy, today = new Date().toISOString().slice(0, 10)) {
  if (!raw || !Array.isArray(raw.companies)) throw new Error('tally-data.json has no companies array');
  const known = new Set(slimTaxonomy(taxonomy).accreditations.map((a) => a.slug));
  const ids = companyIds(raw.companies);
  const out = {};
  raw.companies.forEach((c, i) => {
    if (!Array.isArray(c.certification_checks)) return;
    const tags = new Set(Array.isArray(c.tags) ? c.tags : []);
    const seen = new Set();
    const kept = [];
    for (const check of c.certification_checks) {
      if (!check || typeof check !== 'object') continue;
      const accreditation = str(check.accreditation);
      const register = str(check.register);
      const checked = validDate(str(check.checked));
      const link = check.link == null || str(check.link) === '' ? null : str(check.link);
      if (!accreditation.startsWith('accr-') || !known.has(accreditation) || !tags.has(accreditation) || seen.has(accreditation)) continue;
      if (register.length < 2 || register.length > 80 || /[\n\r]|:\/\/|www\./i.test(register)) continue;
      if (!checked || checked > today) continue;
      if (link !== null && !CHECK_HTTPS.test(link)) continue;
      seen.add(accreditation);
      kept.push({ accreditation, register, checked, link });
    }
    if (kept.length) out[ids[i]] = kept;
  });
  return out;
}

// Clusters and events. Members-only events are signposts: cluster, date, this
// fixed text and the cluster's own website. The data repo exports them that
// way; the build checks again and refuses anything more.
export const SIGNPOST = "Members' event: join the cluster for details";
const CLUSTER_ID = /^[A-Za-z]{2,20}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(['live', 'pre-launch', 'proposed']);
const PUBLIC_KEYS = ['audience', 'cluster', 'date', 'time', 'where', 'title', 'summary', 'link'];
const MEMBERS_KEYS = ['audience', 'cluster', 'date', 'text', 'link'];
const https = (v) => (/^https:\/\/[^\s]+$/i.test(str(v)) ? str(v) : null);
const orNull = (v) => str(v) || null;

export function slimClusters(raw) {
  if (!raw || !Array.isArray(raw.clusters)) throw new Error('clusters.json has no clusters array');
  const clusters = raw.clusters.map((c) => {
    if (!CLUSTER_ID.test(str(c.id))) throw new Error(`clusters.json: bad cluster id ${JSON.stringify(c.id)}`);
    return {
      id: str(c.id),
      name: str(c.name),
      full: str(c.full),
      region: str(c.region),
      regions: (Array.isArray(c.regions) ? c.regions : []).map((r) => ({ code: str(r?.code), name: str(r?.name) })).filter((r) => r.code),
      status: STATUSES.has(str(c.status)) ? str(c.status) : 'live',
      web: https(c.web),
      linkedin: https(c.linkedin),
      colour: HEX.test(str(c.colour)) ? str(c.colour) : '#586F7C',
      membership: /^mbr-[a-z0-9-]+$/.test(str(c.membership)) ? str(c.membership) : null,
    };
  });
  return { as_of: str(raw.as_of), clusters };
}

/** Upcoming events (on or after today, YYYY-MM-DD), checked against the contract and sorted by date. */
export function slimEvents(raw, clusters, today) {
  if (!raw || !Array.isArray(raw.events)) throw new Error('events.json has no events array');
  const web = new Map(clusters.clusters.map((c) => [c.id, c.web]));
  const sameKeys = (e, keys) => Object.keys(e).length === keys.length && keys.every((k) => k in e);
  const events = [];
  for (const e of raw.events) {
    if (!e || !web.has(e.cluster)) throw new Error(`events.json: event for unknown cluster ${JSON.stringify(e?.cluster)}`);
    if (!DATE.test(str(e.date)) || Number.isNaN(Date.parse(e.date))) throw new Error(`events.json: bad date ${JSON.stringify(e.date)}`);
    if (e.audience === 'members') {
      if (!sameKeys(e, MEMBERS_KEYS) || e.text !== SIGNPOST || !web.get(e.cluster) || e.link !== web.get(e.cluster)) {
        throw new Error(`events.json: a members-only event for ${e.cluster} on ${e.date} carries more than the signpost; refusing to build`);
      }
      if (e.date >= today) events.push({ audience: 'members', cluster: e.cluster, date: e.date, text: SIGNPOST, link: e.link });
    } else if (e.audience === 'public') {
      if (!Object.keys(e).every((k) => PUBLIC_KEYS.includes(k))) throw new Error(`events.json: a public event carries fields outside the contract`);
      if (!str(e.title)) throw new Error('events.json: a public event has no title');
      if (e.date >= today) {
        events.push({
          audience: 'public',
          cluster: e.cluster,
          date: e.date,
          time: orNull(e.time),
          where: orNull(e.where),
          title: str(e.title),
          summary: orNull(e.summary),
          link: safeLink(e.link) || null,
        });
      }
    } else {
      throw new Error(`events.json: unknown audience ${JSON.stringify(e.audience)}`);
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.cluster.localeCompare(b.cluster));
  return { as_of: str(raw.as_of), events };
}

// Funding calls and opportunities. Only public items are exported by the data
// repo; members-only items are never published. The build refuses any field
// outside the contract, so nothing else can slip through.
const OPPORTUNITY_KEYS = ['kind', 'cluster', 'deadline', 'time', 'title', 'summary', 'link'];
const OPPORTUNITY_KINDS = new Set(['funding', 'opportunity']);

/** Open opportunities (deadline on or after today, YYYY-MM-DD, or none), checked against the contract and sorted by deadline. */
export function slimOpportunities(raw, clusters, today) {
  if (!raw || !Array.isArray(raw.opportunities)) throw new Error('opportunities.json has no opportunities array');
  const known = new Set(clusters.clusters.map((c) => c.id));
  const out = [];
  for (const o of raw.opportunities) {
    if (!o || typeof o !== 'object' || !Object.keys(o).every((k) => OPPORTUNITY_KEYS.includes(k))) {
      throw new Error('opportunities.json: an item carries fields outside the contract; refusing to build');
    }
    if (!OPPORTUNITY_KINDS.has(o.kind)) throw new Error(`opportunities.json: unknown kind ${JSON.stringify(o.kind)}`);
    if (!known.has(o.cluster)) throw new Error(`opportunities.json: item for unknown cluster ${JSON.stringify(o.cluster)}`);
    if (!str(o.title)) throw new Error('opportunities.json: an item has no title');
    const deadline = o.deadline == null ? null : str(o.deadline);
    if (deadline !== null && (!DATE.test(deadline) || Number.isNaN(Date.parse(deadline)))) {
      throw new Error(`opportunities.json: bad deadline ${JSON.stringify(o.deadline)}`);
    }
    const link = safeLink(o.link);
    if (!link || (deadline !== null && deadline < today)) continue;
    out.push({ kind: o.kind, cluster: o.cluster, deadline, time: orNull(o.time), title: str(o.title), summary: orNull(o.summary), link });
  }
  out.sort((a, b) => Number(a.deadline === null) - Number(b.deadline === null) || (a.deadline ?? '').localeCompare(b.deadline ?? '') || a.cluster.localeCompare(b.cluster) || a.title.localeCompare(b.title, 'en-GB'));
  return { as_of: str(raw.as_of), opportunities: out };
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const fixture = process.env.TALLY_DATA_SOURCE === 'fixture';
  const read = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8'));
  const names = ['tally-data.json', 'taxonomy.json', 'clusters.json', 'events.json', 'opportunities.json'];
  const [raw, taxonomy, rawClusters, rawEvents, rawOpportunities] = fixture
    ? names.map(read)
    : await Promise.all(names.map((name) => fetchJson(`${BASE}/${name}`)));
  const data = slimData(raw, taxonomy);
  if (data.companies.length === 0) throw new Error('no companies; refusing to build an empty site');
  const dir = new URL('../public/data/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('tally.json', dir), JSON.stringify(data));
  // Company page text: build-only, outside public/, never served.
  const buildDir = new URL('../.tally/', import.meta.url);
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(new URL('company-text.json', buildDir), JSON.stringify(companyTexts(raw)));
  const clusters = slimClusters(rawClusters);
  // Past events are dropped at build, by the build's own date (UTC).
  const todayUtc = new Date().toISOString().slice(0, 10);
  const checks = certificationChecks(raw, taxonomy, todayUtc);
  writeFileSync(new URL('certification-checks.json', buildDir), JSON.stringify(checks));
  console.log(`Wrote certification checks for ${Object.keys(checks).length} companies (build-only).`);
  const events = slimEvents(rawEvents, clusters, todayUtc);
  const opportunities = slimOpportunities(rawOpportunities, clusters, todayUtc);
  writeFileSync(new URL('clusters.json', dir), JSON.stringify(clusters));
  writeFileSync(new URL('events.json', dir), JSON.stringify(events));
  writeFileSync(new URL('opportunities.json', dir), JSON.stringify(opportunities));
  console.log(`Wrote opportunities.json (${opportunities.opportunities.length} open funding calls and opportunities).`);
  const signposts = events.events.filter((e) => e.audience === 'members').length;
  console.log(`Wrote clusters.json (${clusters.clusters.length} clusters) and events.json (${events.events.length - signposts} public events, ${signposts} members-only signposts).`);
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
