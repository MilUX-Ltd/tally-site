// Every view in the URL. The explorer's whole state is one ViewState, written
// to the query string on every change and read back on load. The parameters
// are a public interface, documented in CONTEXT.md.
//
// Anyone can send a link, so every value is parsed against a strict pattern
// and dropped if it does not fit; sanitiseState then drops values the data
// does not know. Nothing from the URL is ever rendered as HTML.
import { emptyFilters, FACETS, type Facet, type Filters } from './filters';
import { MONTH } from './history';
import { DEFAULT_RADIUS, isRadius, type Radius } from './sites';
import type { TallyData } from './types';

export interface MapPosition {
  zoom: number;
  lat: number;
  lon: number;
}

/** West, south, east, north in degrees. */
export type Bbox = [number, number, number, number];

export interface ViewState {
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
  /** Whether every defence site is drawn on the map. */
  sites: boolean;
}

export type CapMatch = 'any' | 'all';

export function defaultState(): ViewState {
  return { filters: emptyFilters(), map: null, cell: null, sel: [], area: null, matrix: { group: null, page: 1 }, page: 1, list: [], capMatch: 'any', month: null, site: null, radius: DEFAULT_RADIUS, sites: false };
}

const SLUG = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REGION = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const CELL = /^8[0-9a-f]{14}$/;
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

export function fromQuery(query: string): ViewState {
  const p = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const state = defaultState();
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
  if (p.get('sites') === '1') state.sites = true;
  return state;
}

// Keep commas and slashes readable; everything else is percent-encoded.
const enc = (v: string) => encodeURIComponent(v).replace(/%2C/gi, ',').replace(/%2F/gi, '/');

export function toQuery(state: ViewState): string {
  const parts: string[] = [];
  const add = (key: string, value: string) => parts.push(`${key}=${enc(value)}`);
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
  if (state.sites) add('sites', '1');
  return parts.join('&');
}

/** Rounds positions the way the URL does, so state and URL agree. */
export function roundPosition(position: MapPosition): MapPosition {
  return { zoom: round(position.zoom, 2), lat: round(position.lat, 5), lon: round(position.lon, 5) };
}

/** Drops values the data does not know: unknown capabilities, companies, groups and so on. */
export function sanitiseState(state: ViewState, data: TallyData): ViewState {
  const t = data.taxonomy;
  const known: Record<Facet, Set<string>> = {
    cap: new Set(t.capabilities.map((c) => c.slug)),
    size: new Set(t.sizes.map((o) => o.slug)),
    region: new Set(t.regions.map((o) => o.slug)),
    fw: new Set(t.frameworks.map((o) => o.slug)),
    accr: new Set(t.accreditations.map((o) => o.slug)),
    mbr: new Set(t.memberships.map((o) => o.slug)),
  };
  const ids = new Set(data.companies.map((c) => c.id));
  const filters = { ...state.filters };
  for (const facet of FACETS) filters[facet] = state.filters[facet].filter((v) => known[facet].has(v));
  const group = state.matrix.group && t.groups.some((g) => g.slug === state.matrix.group) ? state.matrix.group : null;
  const capMatch = filters.cap.length >= 2 ? state.capMatch : 'any';
  return { ...state, filters, capMatch, sel: state.sel.filter((id) => ids.has(id)), list: state.list.filter((id) => ids.has(id)), matrix: { ...state.matrix, group } };
}

/** Drops a chosen site the defence sites dataset does not know. */
export function sanitiseSites(state: ViewState, ids: Iterable<string>): ViewState {
  if (!state.site) return state;
  return new Set(ids).has(state.site) ? state : { ...state, site: null };
}
