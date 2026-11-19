// Near-me search: companies within a radius of a UK place the buyer types (a
// full postcode, the first part of one, or a town or city). Places are looked
// up with postcodes.io from the browser, only when the buyer asks, and only
// the typed place is sent. Distances and rings reuse src/lib/sites.ts.
//
// Typed text is read against strict patterns before any request, and the
// geocoder's answer is untrusted: only a name that fits the place-name pattern
// and a point inside the UK bounds are used.
import { UK_BOUNDS } from './map-config';

export const GEOCODER_ORIGIN = 'https://api.postcodes.io';
export const NEAR_RADII = [5, 10, 25, 50] as const;
export type NearRadius = (typeof NEAR_RADII)[number];
export const DEFAULT_NEAR_RADIUS: NearRadius = 25;
export const MAX_PLACE_LENGTH = 60;
const TIMEOUT_MS = 8000;

/** A resolved place: its name as shown and its point (4 decimal places). */
export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export type PlaceQuery =
  | { kind: 'postcode'; value: string }
  | { kind: 'outcode'; value: string }
  | { kind: 'place'; value: string }
  | { kind: 'invalid' };

export type FindResult = { kind: 'found'; place: Place } | { kind: 'not-found' } | { kind: 'outside' } | { kind: 'invalid' } | { kind: 'unreachable' };

const FULL_POSTCODE = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/;
const OUTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/;
const FORMATTED_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$/;
/** Letters, digits, spaces, apostrophes, hyphens, full stops and commas; starts with a letter or digit. */
const PLACE_NAME = /^[\p{L}\p{N}](?:[\p{L}\p{N} '’.,-]*[\p{L}\p{N}.])?$/u;

export const isNearRadius = (n: number): n is NearRadius => (NEAR_RADII as readonly number[]).includes(n);

/** A place name fit to show and to hold in the URL. */
export function isPlaceName(value: string): boolean {
  return value.length >= 2 && value.length <= MAX_PLACE_LENGTH && PLACE_NAME.test(value);
}

/** Whether a point is inside the UK bounds the map uses. */
export function inUk(lat: number, lon: number): boolean {
  const [w, s, e, n] = UK_BOUNDS;
  return Number.isFinite(lat) && Number.isFinite(lon) && lon >= w && lon <= e && lat >= s && lat <= n;
}

/** Tells a full postcode, an outward code and a place name apart; anything else is invalid. */
export function readPlaceQuery(text: string): PlaceQuery {
  if (typeof text !== 'string' || text.length > MAX_PLACE_LENGTH * 2) return { kind: 'invalid' };
  const value = text.replace(/[ \t\r\n]+/g, ' ').trim();
  if (!value || value.length > MAX_PLACE_LENGTH) return { kind: 'invalid' };
  const compact = value.replace(/ /g, '').toUpperCase();
  const full = FULL_POSTCODE.exec(compact);
  if (full && /^[A-Za-z0-9 ]+$/.test(value)) return { kind: 'postcode', value: `${full[1]} ${full[2]}` };
  if (!value.includes(' ') && OUTCODE.test(compact)) return { kind: 'outcode', value: compact };
  if (isPlaceName(value)) return { kind: 'place', value };
  return { kind: 'invalid' };
}

const round4 = (n: number) => Number(n.toFixed(4));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fold = (s: string) => s.toLowerCase().replace(/’/g, "'");

// Same-named places: a city, then a town, then smaller places.
const TYPE_RANK = ['City', 'Town', 'Village', 'Suburban Area', 'Hamlet', 'Other Settlement'];
const rank = (type: unknown) => {
  const i = TYPE_RANK.indexOf(String(type));
  return i === -1 ? TYPE_RANK.length : i;
};

interface Candidate {
  name: string;
  lat: number;
  lon: number;
  rank: number;
  exact: boolean;
}

/** Picks one place from a postcodes.io /places answer: exact name matches first, then names starting with the text; cities and towns first. */
function pickPlace(results: unknown, query: string): Candidate | null {
  if (!Array.isArray(results)) return null;
  const q = fold(query);
  const candidates: Candidate[] = [];
  for (const r of results as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue;
    const lat = num(r.latitude);
    const lon = num(r.longitude);
    if (lat === null || lon === null) continue;
    // A place may be listed under its Welsh or Gaelic name (name_1) with the
    // English name second (name_2), or the other way round: show the name the
    // buyer typed.
    const names = [r.name_1, r.name_2].map((n) => (typeof n === 'string' ? n.trim() : '')).filter(isPlaceName);
    const exactName = names.find((n) => fold(n) === q);
    const name = exactName ?? names.find((n) => fold(n).startsWith(q));
    if (!name) continue;
    const exact = Boolean(exactName);
    candidates.push({ name, lat, lon, rank: rank(r.local_type), exact });
  }
  const pool = candidates.some((c) => c.exact) ? candidates.filter((c) => c.exact) : candidates;
  // Array sort is stable, so equal ranks keep postcodes.io's order.
  return pool.sort((a, b) => a.rank - b.rank)[0] ?? null;
}

function lookupUrl(query: Exclude<PlaceQuery, { kind: 'invalid' }>): string {
  if (query.kind === 'postcode') return `${GEOCODER_ORIGIN}/postcodes/${encodeURIComponent(query.value.replace(' ', ''))}`;
  if (query.kind === 'outcode') return `${GEOCODER_ORIGIN}/outcodes/${encodeURIComponent(query.value)}`;
  return `${GEOCODER_ORIGIN}/places?q=${encodeURIComponent(query.value)}&limit=50`;
}

/**
 * Looks up a typed place with postcodes.io. Invalid text is refused without a
 * request. No cookies, referrer or custom headers are sent.
 */
export async function findPlace(text: string, fetcher: typeof fetch = fetch): Promise<FindResult> {
  const query = readPlaceQuery(text);
  if (query.kind === 'invalid') return { kind: 'invalid' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  let body: unknown;
  try {
    const response = await fetcher(lookupUrl(query), {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller?.signal,
    });
    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok) return { kind: 'unreachable' };
    body = await response.json();
  } catch {
    return { kind: 'unreachable' };
  } finally {
    if (timer) clearTimeout(timer);
  }
  const result = body && typeof body === 'object' ? (body as { result?: unknown }).result : null;
  if (!result) return { kind: 'not-found' };

  let found: { name: string; lat: number; lon: number } | null = null;
  if (query.kind === 'place') {
    found = pickPlace(result, query.value);
  } else if (typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    const lat = num(r.latitude);
    const lon = num(r.longitude);
    const given = query.kind === 'postcode' ? r.postcode : r.outcode;
    const ok = typeof given === 'string' && (query.kind === 'postcode' ? FORMATTED_POSTCODE.test(given) : OUTCODE.test(given));
    if (lat !== null && lon !== null) found = { name: ok ? (given as string) : query.value, lat, lon };
  }
  if (!found) return { kind: 'not-found' };
  if (!inUk(found.lat, found.lon)) return { kind: 'outside' };
  return { kind: 'found', place: { name: found.name, lat: round4(found.lat), lon: round4(found.lon) } };
}
