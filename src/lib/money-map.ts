// The Money view's map overlay, as plain GeoJSON: UK regions shaded by
// contract value, and arcs from the UK to each overseas supplier's country,
// width by value. The tables in the Money panel hold every figure; the map is
// never the only route to them. No framework imports.
import type { CountryRow, RegionRow } from './money';

type Point = [number, number];

/** Where arcs start: the middle of England, as [lon, lat]. */
export const UK_ORIGIN: Point = [-1.5, 52.6];

/**
 * A point near the middle of each country overseas suppliers come from, as
 * [lon, lat], rounded to a degree or so. Countries not listed are still in the
 * table; they only lack an arc.
 */
export const COUNTRY_CENTROIDS: Record<string, Point> = {
  Australia: [134, -25],
  Austria: [14.5, 47.5],
  Belgium: [4.5, 50.6],
  Brazil: [-51, -10],
  Bulgaria: [25.5, 42.7],
  Canada: [-100, 56],
  Croatia: [16, 45.2],
  Cyprus: [33.2, 35],
  'Czech Republic': [15.5, 49.8],
  Czechia: [15.5, 49.8],
  Denmark: [9.5, 56],
  Estonia: [25.5, 58.7],
  Finland: [26, 63],
  France: [2.5, 46.5],
  Germany: [10.4, 51.1],
  Gibraltar: [-5.35, 36.14],
  Greece: [22, 39.3],
  Guernsey: [-2.58, 49.45],
  Hungary: [19.5, 47.2],
  Iceland: [-18.5, 64.9],
  India: [79, 22],
  Ireland: [-8, 53.2],
  'Republic of Ireland': [-8, 53.2],
  'Isle of Man': [-4.55, 54.23],
  Israel: [34.9, 31.4],
  Italy: [12.5, 42.8],
  Japan: [138.5, 36.5],
  Jersey: [-2.13, 49.21],
  Latvia: [24.9, 56.9],
  Lithuania: [23.9, 55.3],
  Luxembourg: [6.1, 49.8],
  Malta: [14.4, 35.9],
  Netherlands: [5.3, 52.2],
  'The Netherlands': [5.3, 52.2],
  'New Zealand': [172.5, -41.5],
  Norway: [9, 61],
  Poland: [19.4, 52],
  Portugal: [-8.2, 39.6],
  Qatar: [51.2, 25.3],
  Romania: [25, 45.9],
  'Saudi Arabia': [45, 24],
  Singapore: [103.8, 1.35],
  Slovakia: [19.7, 48.7],
  Slovenia: [14.8, 46.1],
  'South Africa': [24.7, -29],
  'South Korea': [127.8, 36.4],
  'Republic of Korea': [127.8, 36.4],
  Spain: [-3.7, 40.2],
  Sweden: [15.5, 62],
  Switzerland: [8.2, 46.8],
  Turkey: [35, 39],
  Türkiye: [35, 39],
  Ukraine: [31.2, 49],
  'United Arab Emirates': [54, 24],
  UAE: [54, 24],
  'United States': [-98.5, 39.5],
  'United States of America': [-98.5, 39.5],
  USA: [-98.5, 39.5],
};

const RAD = Math.PI / 180;

/** Points along the great circle between two [lon, lat] points, with longitudes kept continuous. */
export function greatCircle(from: Point, to: Point, steps = 48): Point[] {
  const [l1, p1] = [from[0] * RAD, from[1] * RAD];
  const [l2, p2] = [to[0] * RAD, to[1] * RAD];
  const a = [Math.cos(p1) * Math.cos(l1), Math.cos(p1) * Math.sin(l1), Math.sin(p1)];
  const b = [Math.cos(p2) * Math.cos(l2), Math.cos(p2) * Math.sin(l2), Math.sin(p2)];
  const d = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  if (d < 1e-9) return [from, to];
  const out: Point[] = [];
  let last: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const s1 = Math.sin((1 - f) * d) / Math.sin(d);
    const s2 = Math.sin(f * d) / Math.sin(d);
    const x = s1 * a[0] + s2 * b[0];
    const y = s1 * a[1] + s2 * b[1];
    const z = s1 * a[2] + s2 * b[2];
    let lon = Math.atan2(y, x) / RAD;
    const lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
    if (last !== null) {
      while (lon - last > 180) lon -= 360;
      while (lon - last < -180) lon += 360;
    }
    last = lon;
    out.push([Number(lon.toFixed(3)), Number(lat.toFixed(3))]);
  }
  return out;
}

const MIN_WIDTH = 1.5;
const MAX_WIDTH = 10;

export interface Arc {
  country: string;
  value: number;
  width: number;
  line: Point[];
}

/** One arc per country with a known centre and money, widths by the square root of value. */
export function overseasArcs(rows: CountryRow[]): Arc[] {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return rows
    .filter((r) => r.value > 0 && COUNTRY_CENTROIDS[r.country])
    .map((r) => ({
      country: r.country,
      value: r.value,
      width: Number((MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * Math.sqrt(r.value / max)).toFixed(2)),
      line: greatCircle(UK_ORIGIN, COUNTRY_CENTROIDS[r.country]),
    }));
}

export function arcsGeoJSON(arcs: Arc[]) {
  return {
    type: 'FeatureCollection' as const,
    features: arcs.map((a) => ({
      type: 'Feature' as const,
      properties: { country: a.country, width: a.width },
      geometry: { type: 'LineString' as const, coordinates: a.line },
    })),
  };
}

export function arcEndsGeoJSON(arcs: Arc[]) {
  return {
    type: 'FeatureCollection' as const,
    features: arcs.map((a) => ({
      type: 'Feature' as const,
      properties: { country: a.country },
      geometry: { type: 'Point' as const, coordinates: a.line[a.line.length - 1] },
    })),
  };
}

/** West, south, east, north around the UK and every arc. */
export function arcBounds(arcs: Arc[], uk: [number, number, number, number]): [number, number, number, number] {
  let [w, s, e, n] = uk;
  for (const a of arcs) {
    for (const [lon, lat] of a.line) {
      w = Math.min(w, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  }
  return [Math.max(-180, w), Math.max(-85, s), Math.min(180, e), Math.min(85, n)];
}

export interface RegionShape {
  type: 'Feature';
  properties: { name: string };
  geometry: unknown;
}

/**
 * The region shapes with each region's value for the year and its place on
 * the ramp (0 to 1, by square root of value against the largest). Regions
 * with nothing get -1 and are drawn unshaded.
 */
export function shadedRegions(shapes: RegionShape[], rows: RegionRow[]) {
  const values = new Map(rows.map((r) => [r.region, r.value]));
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return {
    type: 'FeatureCollection' as const,
    features: shapes.map((f) => {
      const value = values.get(f.properties.name) ?? 0;
      return { ...f, properties: { name: f.properties.name, value, t: value > 0 && max > 0 ? Math.sqrt(value / max) : -1 } };
    }),
  };
}
