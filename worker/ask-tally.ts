// Ask Tally: the four read-only tools behind /mcp, as plain functions over the
// site's own built data. Nothing here calls out: the data comes from the
// static assets (/data/tally.json, /data/clusters.json, /data/events.json)
// and every answer is a JSON object. Arguments are untrusted: the schemas in
// mcp.ts check their shape, and this module checks every value against the
// data. Errors are fixed sentences that never repeat what was sent.
import { companyPath } from '../src/lib/company-page';
import { clusterMembers, type Cluster, type ClusterEvent } from '../src/lib/clusters';
import { filterCompanies, isLocated, type Filters } from '../src/lib/filters';
import { keywordSearch } from '../src/lib/search';
import { distanceMiles } from '../src/lib/sites';
import { defaultState, toQuery } from '../src/lib/url-state';
import type { Company, TallyData } from '../src/lib/types';
import type { Assets } from './types';

export const MAX_RESULTS = 25;
export const DEFAULT_RESULTS = 10;
const MAX_SUMMARY = 600;
const MAX_EVENTS = 200;

/** A refusal whose message is safe to return as it is. */
export class ToolError extends Error {}

export const UNKNOWN_VALUE = 'One or more values are not known to Tally. Call list_capabilities for the accepted capability, group, size, region, accreditation, framework and membership values, and list_clusters_and_events for cluster ids.';
const UNKNOWN_COMPANY = 'No company in Tally has that id or exact name. Use search_companies to find companies.';
const UNKNOWN_CLUSTER = 'That cluster id is not known to Tally. Call list_clusters_and_events without arguments for the cluster ids.';
const UNPLACED_POSTCODE = 'Tally cannot place that postcode from its own data. Give a latitude and longitude instead.';
const BAD_NEAR = 'Give either a postcode, or both a latitude and a longitude, to search near a place.';

export interface Loaded {
  data: TallyData;
  clusters: Cluster[];
  events: ClusterEvent[];
}

// The data is read once per Worker instance and binding.
const cache = new WeakMap<object, Promise<Loaded>>();

async function readAsset(assets: Assets, path: string): Promise<unknown> {
  const response = await assets.fetch(new Request(`https://assets.local${path}`));
  if (!response.ok) throw new Error('asset unavailable');
  return response.json();
}

export function loadData(assets: Assets): Promise<Loaded> {
  let loaded = cache.get(assets);
  if (!loaded) {
    loaded = Promise.all([readAsset(assets, '/data/tally.json'), readAsset(assets, '/data/clusters.json'), readAsset(assets, '/data/events.json')]).then(
      ([data, clusters, events]) => ({
        data: data as TallyData,
        clusters: ((clusters as { clusters?: Cluster[] }).clusters ?? []) as Cluster[],
        events: ((events as { events?: ClusterEvent[] }).events ?? []) as ClusterEvent[],
      }),
    );
    cache.set(assets, loaded);
    loaded.catch(() => cache.delete(assets));
  }
  return loaded;
}

/** True when the site shows the company on the map; only then are its coordinates published. */
const mapped = (c: Company): c is Company & { lat: number; lon: number } => c.location_source !== 'region' && isLocated(c);

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const pageUrl = (origin: string, c: Company) => `${origin}/?sel=${encodeURIComponent(c.id)}`;
const profileUrl = (origin: string, c: Company) => `${origin}${companyPath(encodeURIComponent(c.id))}`;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function labeller(data: TallyData) {
  const t = data.taxonomy;
  const map = (list: Array<{ slug: string; label: string }>) => new Map(list.map((o) => [o.slug, o.label]));
  return { cap: map(t.capabilities), accr: map(t.accreditations), fw: map(t.frameworks), mbr: map(t.memberships), size: map(t.sizes) };
}

function location(c: Company) {
  const hidden = c.location_source === 'region';
  return {
    hq: c.hq,
    region: c.region,
    country: c.country,
    postcode: hidden ? '' : c.postcode,
    lat: mapped(c) ? c.lat : null,
    lon: mapped(c) ? c.lon : null,
  };
}

function summaryRecord(c: Company, origin: string, labels: ReturnType<typeof labeller>) {
  return {
    id: c.id,
    name: c.name,
    summary: clip(c.summary, MAX_SUMMARY),
    capabilities: c.tags.filter((t) => labels.cap.has(t)).map((t) => labels.cap.get(t)!),
    location: location(c),
    page_url: pageUrl(origin, c),
    profile_url: profileUrl(origin, c),
  };
}

// ---------------------------------------------------------------- search

export interface SearchArgs {
  capabilities?: string[];
  groups?: string[];
  regions?: string[];
  sizes?: string[];
  accreditations?: string[];
  frameworks?: string[];
  memberships?: string[];
  cluster?: string;
  keyword?: string;
  near?: { postcode?: string; lat?: number; lon?: number; radius_miles?: number };
  limit?: number;
}

/** Maps each given value to the data's own slug, case-insensitively; any unknown value refuses the call. */
function known(values: string[] | undefined, options: Array<{ slug: string }>): string[] {
  if (!values?.length) return [];
  const bySlug = new Map(options.map((o) => [o.slug.toLowerCase(), o.slug]));
  return [
    ...new Set(
      values.map((v) => {
        const lower = v.trim().toLowerCase();
        const slug = bySlug.get(lower) ?? bySlug.get(`size-${lower}`);
        if (!slug) throw new ToolError(UNKNOWN_VALUE);
        return slug;
      }),
    ),
  ];
}

const POSTCODE = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})?$/;
const squash = (postcode: string) => postcode.toUpperCase().replace(/\s+/g, '');

/** Places a postcode from Tally's own data: a published postcode, or the centre of its district's mapped companies. */
export function placePostcode(postcode: string, companies: Company[]): { lat: number; lon: number; from: 'postcode' | 'postcode-district' } {
  const wanted = squash(postcode);
  const match = POSTCODE.exec(wanted);
  if (!match) throw new ToolError(UNPLACED_POSTCODE);
  const located = companies.filter(mapped).filter((c) => POSTCODE.test(squash(c.postcode)));
  if (match[2]) {
    const exact = located.find((c) => squash(c.postcode) === wanted);
    if (exact) return { lat: exact.lat, lon: exact.lon, from: 'postcode' };
  }
  const district = match[1];
  const inDistrict = located.filter((c) => POSTCODE.exec(squash(c.postcode))?.[1] === district);
  if (!inDistrict.length) throw new ToolError(UNPLACED_POSTCODE);
  const lat = inDistrict.reduce((s, c) => s + c.lat, 0) / inDistrict.length;
  const lon = inDistrict.reduce((s, c) => s + c.lon, 0) / inDistrict.length;
  return { lat, lon, from: 'postcode-district' };
}

export function searchCompanies({ data, clusters }: Loaded, args: SearchArgs, origin: string) {
  const t = data.taxonomy;
  const groups = known(args.groups, t.groups);
  const groupCaps = t.capabilities.filter((c) => groups.includes(c.group) && !c.slug.includes('/')).map((c) => c.slug);
  const filters: Filters = {
    cap: [...new Set([...known(args.capabilities, t.capabilities), ...groupCaps])],
    size: known(args.sizes, t.sizes),
    region: known(args.regions, t.regions),
    fw: known(args.frameworks, t.frameworks),
    accr: known(args.accreditations, t.accreditations),
    mbr: known(args.memberships, t.memberships),
  };
  if (groups.length && !groupCaps.length) throw new ToolError(UNKNOWN_VALUE);
  let cluster: Cluster | undefined;
  if (args.cluster) {
    cluster = clusters.find((c) => c.id.toLowerCase() === args.cluster!.trim().toLowerCase());
    if (!cluster) throw new ToolError(UNKNOWN_VALUE);
  }

  let companies = filterCompanies(data.companies, filters);
  const membersRecorded = cluster ? Boolean(cluster.membership) : null;
  if (cluster) companies = clusterMembers(companies, cluster) ?? companies;
  const keyword = args.keyword?.trim() ?? '';
  if (keyword) companies = keywordSearch(companies, keyword, t);

  let near: { lat: number; lon: number; radius_miles: number; from: string } | null = null;
  let distances = new Map<string, number>();
  if (args.near) {
    const { postcode, lat, lon } = args.near;
    const radius = args.near.radius_miles ?? 25;
    let point: { lat: number; lon: number; from: string };
    if (postcode && lat === undefined && lon === undefined) point = placePostcode(postcode, data.companies);
    else if (!postcode && typeof lat === 'number' && typeof lon === 'number') point = { lat, lon, from: 'point' };
    else throw new ToolError(BAD_NEAR);
    near = { lat: round(point.lat, 4), lon: round(point.lon, 4), radius_miles: radius, from: point.from };
    distances = new Map(companies.filter(mapped).map((c) => [c.id, distanceMiles(point.lat, point.lon, c.lat, c.lon)]));
    companies = companies.filter((c) => (distances.get(c.id) ?? Infinity) <= radius);
    companies.sort((a, b) => distances.get(a.id)! - distances.get(b.id)! || a.name.localeCompare(b.name, 'en-GB'));
  }

  const limit = Math.min(Math.max(1, Math.trunc(args.limit ?? DEFAULT_RESULTS)), MAX_RESULTS);
  const labels = labeller(data);
  const state = defaultState();
  state.filters = filters;
  state.cluster = cluster?.id ?? null;
  state.q = keyword;
  const query = toQuery(state);
  return {
    total: companies.length,
    returned: Math.min(limit, companies.length),
    results: companies.slice(0, limit).map((c) => {
      const record = summaryRecord(c, origin, labels);
      return near ? { ...record, distance_miles: round(distances.get(c.id)!, 1) } : record;
    }),
    ...(near ? { near } : {}),
    ...(cluster ? { cluster_members_recorded: membersRecorded } : {}),
    explorer_url: query ? `${origin}/?${query}` : `${origin}/`,
  };
}

// ---------------------------------------------------------------- company

export function getCompany({ data }: Loaded, args: { id?: string; name?: string }, origin: string) {
  const id = args.id?.trim().toLowerCase();
  const name = args.name?.trim().toLowerCase();
  if (!id && !name) throw new ToolError(UNKNOWN_COMPANY);
  const company = data.companies.find((c) => (id && c.id === id) || (name && c.name.toLowerCase() === name));
  if (!company) throw new ToolError(UNKNOWN_COMPANY);
  const labels = labeller(data);
  const pick = (map: Map<string, string>) => company.tags.filter((t) => map.has(t)).map((t) => ({ slug: t, label: map.get(t)! }));
  return {
    company: {
      id: company.id,
      name: company.name,
      summary: clip(company.summary, MAX_SUMMARY * 2),
      website: company.website,
      linkedin: company.linkedin,
      location: { ...location(company), source: company.location_source },
      size: labels.size.get(`size-${company.size}`) ?? company.size,
      headcount: company.headcount,
      founded: company.founded,
      capabilities: pick(labels.cap),
      accreditations: pick(labels.accr),
      frameworks: pick(labels.fw),
      memberships: pick(labels.mbr),
      page_url: pageUrl(origin, company),
      profile_url: profileUrl(origin, company),
    },
  };
}

// ---------------------------------------------------------------- taxonomy

export function listCapabilities({ data }: Loaded) {
  const t = data.taxonomy;
  const option = (o: { slug: string; label: string }) => ({ slug: o.slug, label: o.label });
  return {
    groups: [...t.groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ slug: g.slug, label: g.label, description: g.description, capabilities: t.capabilities.filter((c) => c.group === g.slug).map(option) })),
    sizes: t.sizes.map(option),
    regions: t.regions.map((r) => r.slug),
    accreditations: t.accreditations.map(option),
    frameworks: t.frameworks.map(option),
    memberships: t.memberships.map(option),
  };
}

// ---------------------------------------------------------------- clusters and events

export function listClustersAndEvents({ clusters, events }: Loaded, args: { cluster?: string }, now = new Date()) {
  let chosen = clusters;
  if (args.cluster) {
    chosen = clusters.filter((c) => c.id.toLowerCase() === args.cluster!.trim().toLowerCase());
    if (!chosen.length) throw new ToolError(UNKNOWN_CLUSTER);
  }
  const ids = new Set(chosen.map((c) => c.id));
  const today = now.toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => ids.has(e.cluster) && e.date >= today)
    .slice(0, MAX_EVENTS)
    .map((e) =>
      e.audience === 'members'
        ? { audience: 'members' as const, cluster: e.cluster, date: e.date, text: e.text, link: e.link }
        : { audience: 'public' as const, cluster: e.cluster, date: e.date, time: e.time, where: e.where, title: e.title, summary: e.summary, link: e.link },
    );
  return {
    clusters: chosen.map((c) => ({ id: c.id, name: c.name, full: c.full, region: c.region, status: c.status, web: c.web, linkedin: c.linkedin, members_recorded: Boolean(c.membership) })),
    events: upcoming,
  };
}
