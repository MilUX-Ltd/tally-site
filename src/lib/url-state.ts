// Every view in the URL. The explorer's whole state is one ViewState, written
// to the query string on every change and read back on load. The parameters
// are a public interface, documented in CONTEXT.md.
//
// Anyone can send a link, so every value is parsed against a strict pattern
// and dropped if it does not fit; sanitiseState then drops values the data
// does not know. Nothing from the URL is ever rendered as HTML.
import { emptyFilters, FACETS, type Facet, type Filters } from './filters';
import { MONTH } from './history';
import { MAX_QUERY_LENGTH } from './search';
import { DEFAULT_NEAR_RADIUS, inUk, isNearRadius, isPlaceName, type NearRadius, type Place } from './near';
import { DEFAULT_RADIUS, isRadius, type Radius } from './sites';
import type { TallyData } from './types';
import { DEFAULT_SCOPE, isScopeValue, regionChoices, scopeBounds, scopeOpens, UNITED_KINGDOM } from './scope';
import { fyFromParam, fyParam } from './mod-spend';

export interface MapPosition {
  zoom: number;
  lat: number;
  lon: number;
}

/** West, south, east, north in degrees. */
export type Bbox = [number, number, number, number];

export interface ViewState {
  /** Where the explorer looks: 'gb' (the default), a live country's lower-case code, 'europe' or 'north-america'. */
  scope: string;
  /** Across several countries, the countries chosen (lower-case codes); the region filter's place. */
  countries: string[];
  filters: Filters;
  /** Map centre and zoom; null means the default UK view. */
  map: MapPosition | null;
  /** Selected H3 hexagon. */
  cell: string | null;
  /** Selected companies (a cluster or pin on the map). */
  sel: string[];
  /** An area drawn on, or taken from, the map. */
  area: Bbox | null;
  /** Matrix view: which capability group's columns show, and the page of rows. */
  matrix: { group: string | null; page: number };
  /** Page of the results list. */
  page: number;
  /** Shortlisted companies, in the order added. */
  list: string[];
  /** How chosen capabilities combine: any of them, or only places where all overlap. */
  capMatch: CapMatch;
  /** Month shown by the growth slider (YYYY-MM); null means the latest. */
  month: string | null;
  /** Chosen defence site id, whose radius narrows the companies. */
  site: string | null;
  /** Radius around the chosen site, in miles. */
  radius: Radius;
  /** A typed place (resolved name and point) whose radius narrows the companies. Never set with a site. */
  near: Place | null;
  /** Radius around the place, in miles. */
  within: NearRadius;
  /** Whether every defence site is drawn on the map. */
  sites: boolean;
  /** Whether cluster areas and their events are drawn on the map. */
  clusters: boolean;
  /** Whether company hexagons and pins stay at full strength over the cluster map. */
  onTop: boolean;
  /** Chosen cluster id; companies narrow to its recorded members. */
  cluster: string | null;
  /** Keyword search text, set when plain-English search falls back; '' for none. */
  q: string;
  /** Whether the map is drawn flat; false means 3D columns, the default. */
  flat: boolean;
  /** Map and results panel, the results full width, the capability matrix full width, or contract money over the map. */
  view: View;
  /** Money view: the year shown; null means the data's default (the latest full year). */
  myear: number | null;
  /** Money view: contract awards (the default) or MOD's official spend with industry. */
  mmeasure: MoneyMeasure;
  /** Money view, MOD spend: the financial year shown, as "2025/26"; null means the latest. */
  mfy: string | null;
}

export type MoneyMeasure = 'awards' | 'spend';

export type View = 'map' | 'list' | 'matrix' | 'money';

export type CapMatch = 'any' | 'all';

export function defaultState(): ViewState {
  return { scope: DEFAULT_SCOPE, countries: [], filters: emptyFilters(), map: null, cell: null, sel: [], area: null, matrix: { group: null, page: 1 }, page: 1, list: [], capMatch: 'any', month: null, site: null, radius: DEFAULT_RADIUS, near: null, within: DEFAULT_NEAR_RADIUS, sites: false, clusters: false, onTop: false, cluster: null, q: '', flat: false, view: 'map', myear: null, mmeasure: 'awards', mfy: null };
}

const SLUG = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Letters (in any alphabet) and single spaces: "London", "Møre og Romsdal". */
const REGION = /^\p{L}+(?: \p{L}+)*$/u;
const COUNTRY = /^[a-z]{2}$/;
const CELL = /^8[0-9a-f]{14}$/;
const CLUSTER = /^[A-Za-z]{2,20}$/;
const MAX_ITEMS = 200;
const MAX_PAGE = 10_000;

const PATTERN: Record<Facet, RegExp> = { cap: SLUG, size: SLUG, region: REGION, fw: SLUG, accr: SLUG, mbr: SLUG };

const round = (n: number, dp: number) => Number(n.toFixed(dp));
const fmt = (n: number, dp: number) => String(round(n, dp));

function list(value: string | null, pattern: RegExp): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const part of value.split(',')) {
    const v = part.trim();
    if (v && pattern.test(v) && !out.includes(v)) out.push(v);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function numbers(value: string | null, sep: string, count: number): number[] | null {
  if (!value) return null;
  const parts = value.split(sep);
  if (parts.length !== count || parts.some((p) => !/^-?\d+(?:\.\d+)?$/.test(p))) return null;
  return parts.map(Number);
}

function pageNumber(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const n = Number(value);
  return n >= 1 && n <= MAX_PAGE ? n : 1;
}

const validLat = (n: number) => n >= -85 && n <= 85;
const validLon = (n: number) => n >= -180 && n <= 180;

/** Keyword text from the URL: control characters removed, spaces collapsed, length capped. */
export function keywordText(value: string | null): string {
  if (!value) return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
}

export function fromQuery(query: string): ViewState {
  const p = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const state = defaultState();
  const scope = p.get('scope');
  if (isScopeValue(scope)) state.scope = scope;
  state.countries = list(p.get('country'), COUNTRY);
  for (const facet of FACETS) state.filters[facet] = list(p.get(facet), PATTERN[facet]);

  const m = numbers(p.get('map'), '/', 3);
  if (m && m[0] >= 0 && m[0] <= 22 && validLat(m[1]) && validLon(m[2])) state.map = { zoom: m[0], lat: m[1], lon: m[2] };

  const cell = p.get('cell');
  if (cell && CELL.test(cell)) state.cell = cell;

  state.sel = list(p.get('sel'), ID);

  const a = numbers(p.get('area'), ',', 4);
  if (a && validLon(a[0]) && validLon(a[2]) && validLat(a[1]) && validLat(a[3]) && a[0] < a[2] && a[1] < a[3]) {
    state.area = [a[0], a[1], a[2], a[3]];
  }

  const group = p.get('mgroup');
  if (group && ID.test(group)) state.matrix.group = group;
  state.matrix.page = pageNumber(p.get('mpage'));
  state.page = pageNumber(p.get('page'));
  state.list = list(p.get('list'), ID);
  // Overlap needs two or more capabilities.
  if (p.get('capmatch') === 'all' && state.filters.cap.length >= 2) state.capMatch = 'all';
  const month = p.get('month');
  if (month && MONTH.test(month)) state.month = month;
  const site = p.get('site');
  if (site && ID.test(site)) state.site = site;
  const radius = Number(p.get('radius'));
  if (/^\d+$/.test(p.get('radius') ?? '') && isRadius(radius)) state.radius = radius;
  // A place needs both its name and its point: inside the UK for the UK
  // scope; inside another scope's bounds, checked once the data is loaded. One
  // location filter at a time: with a site chosen, the place is dropped.
  const place = p.get('near');
  const at = numbers(p.get('at'), ',', 2);
  const placed = at && (state.scope === DEFAULT_SCOPE ? inUk(at[0], at[1]) : validLat(at[0]) && validLon(at[1]));
  if (!state.site && place && isPlaceName(place) && at && placed) state.near = { name: place, lat: round(at[0], 4), lon: round(at[1], 4) };
  const within = Number(p.get('within'));
  if (/^\d+$/.test(p.get('within') ?? '') && isNearRadius(within)) state.within = within;
  if (p.get('sites') === '1') state.sites = true;
  if (p.get('clusters') === '1') state.clusters = true;
  if (p.get('ontop') === '1') state.onTop = true;
  const cluster = p.get('cluster');
  if (cluster && CLUSTER.test(cluster)) state.cluster = cluster;
  state.q = keywordText(p.get('q'));
  if (p.get('flat') === '1') state.flat = true;
  const view = p.get('view');
  if (view === 'list' || view === 'matrix' || view === 'money') state.view = view;
  // The year is checked against the data once the Money view has loaded it.
  const myear = p.get('myear');
  if (state.view === 'money' && myear && /^20\d{2}$/.test(myear)) state.myear = Number(myear);
  // MOD spend and its financial year; the year is checked against the data once loaded.
  if (state.view === 'money' && p.get('mmeasure') === 'spend') {
    state.mmeasure = 'spend';
    state.mfy = fyFromParam(p.get('mfy'));
  }
  return state;
}

// Keep commas and slashes readable; everything else is percent-encoded.
const enc = (v: string) => encodeURIComponent(v).replace(/%2C/gi, ',').replace(/%2F/gi, '/');

export function toQuery(state: ViewState): string {
  const parts: string[] = [];
  const add = (key: string, value: string) => parts.push(`${key}=${enc(value)}`);
  if (state.scope !== DEFAULT_SCOPE) add('scope', state.scope);
  if (state.countries.length) add('country', state.countries.join(','));
  for (const facet of FACETS) if (state.filters[facet].length) add(facet, state.filters[facet].join(','));
  if (state.map) add('map', [fmt(state.map.zoom, 2), fmt(state.map.lat, 5), fmt(state.map.lon, 5)].join('/'));
  if (state.cell) add('cell', state.cell);
  if (state.sel.length) add('sel', state.sel.join(','));
  if (state.area) add('area', state.area.map((n) => fmt(n, 5)).join(','));
  if (state.matrix.group) add('mgroup', state.matrix.group);
  if (state.matrix.page > 1) add('mpage', String(state.matrix.page));
  if (state.page > 1) add('page', String(state.page));
  if (state.list.length) add('list', state.list.join(','));
  if (state.capMatch === 'all' && state.filters.cap.length >= 2) add('capmatch', 'all');
  if (state.month) add('month', state.month);
  if (state.site) add('site', state.site);
  if (state.radius !== DEFAULT_RADIUS) add('radius', String(state.radius));
  if (state.near && !state.site) {
    add('near', state.near.name);
    add('at', `${fmt(state.near.lat, 4)},${fmt(state.near.lon, 4)}`);
    if (state.within !== DEFAULT_NEAR_RADIUS) add('within', String(state.within));
  }
  if (state.sites) add('sites', '1');
  if (state.clusters) add('clusters', '1');
  if (state.onTop) add('ontop', '1');
  if (state.cluster) add('cluster', state.cluster);
  if (state.q) add('q', state.q);
  if (state.flat) add('flat', '1');
  if (state.view !== 'map') add('view', state.view);
  if (state.view === 'money' && state.myear !== null) add('myear', String(state.myear));
  if (state.view === 'money' && state.mmeasure === 'spend') {
    add('mmeasure', 'spend');
    if (state.mfy) add('mfy', fyParam(state.mfy));
  }
  return parts.join('&');
}

/**
 * The state a link opens with. The matrix is a view of its own, so a link
 * from before views were named, with a matrix page or group, opens there.
 */
export function fromLink(query: string): ViewState {
  const state = fromQuery(query);
  const named = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query).has('view');
  return !named && (state.matrix.page > 1 || state.matrix.group) ? { ...state, view: 'matrix' } : state;
}

/** Rounds positions the way the URL does, so state and URL agree. */
export function roundPosition(position: MapPosition): MapPosition {
  return { zoom: round(position.zoom, 2), lat: round(position.lat, 5), lon: round(position.lon, 5) };
}

/** Drops values the data does not know: unknown capabilities, companies, groups and so on. */
export function sanitiseState(state: ViewState, data: TallyData): ViewState {
  const t = data.taxonomy;
  const countries = data.countries ?? [UNITED_KINGDOM];
  // A scope must be live in the data; otherwise the explorer opens on the UK.
  const scope = state.scope !== DEFAULT_SCOPE && scopeOpens(state.scope, countries) ? state.scope : DEFAULT_SCOPE;
  const places = regionChoices(scope, countries);
  const known: Record<Facet, Set<string>> = {
    cap: new Set(t.capabilities.map((c) => c.slug)),
    size: new Set(t.sizes.map((o) => o.slug)),
    // The UK keeps the taxonomy's regions; another country offers its own.
    region: new Set(scope === DEFAULT_SCOPE ? t.regions.map((o) => o.slug) : places.facet === 'region' ? places.options.map((o) => o.slug) : []),
    fw: new Set(t.frameworks.map((o) => o.slug)),
    accr: new Set(t.accreditations.map((o) => o.slug)),
    mbr: new Set(t.memberships.map((o) => o.slug)),
  };
  const ids = new Set(data.companies.map((c) => c.id));
  const filters = { ...state.filters };
  for (const facet of FACETS) filters[facet] = state.filters[facet].filter((v) => known[facet].has(v));
  const group = state.matrix.group && t.groups.some((g) => g.slug === state.matrix.group) ? state.matrix.group : null;
  const capMatch = filters.cap.length >= 2 ? state.capMatch : 'any';
  const chosen = places.facet === 'country' ? new Set(places.options.map((o) => o.slug)) : new Set<string>();
  const [w, s, e, n] = scopeBounds(scope, countries);
  // A place from a link must lie inside the scope: the UK, or the scope's countries.
  const inside = (lat: number, lon: number) => (scope === DEFAULT_SCOPE ? inUk(lat, lon) : lon >= w && lon <= e && lat >= s && lat <= n);
  const near = state.near && !inside(state.near.lat, state.near.lon) ? null : state.near;
  return { ...state, scope, countries: state.countries.filter((c) => chosen.has(c)), near, filters, capMatch, sel: state.sel.filter((id) => ids.has(id)), list: state.list.filter((id) => ids.has(id)), matrix: { ...state.matrix, group } };
}

/** Drops a chosen site the defence sites dataset does not know. */
export function sanitiseSites(state: ViewState, ids: Iterable<string>): ViewState {
  if (!state.site) return state;
  return new Set(ids).has(state.site) ? state : { ...state, site: null };
}

/** Drops a chosen cluster the cluster list does not know. */
export function sanitiseClusters(state: ViewState, ids: Iterable<string>): ViewState {
  if (!state.cluster) return state;
  return new Set(ids).has(state.cluster) ? state : { ...state, cluster: null };
}
