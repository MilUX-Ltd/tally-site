// H3 hexagon binning, done in the browser so the map redraws as filters change.
import { cellToBoundary, getResolution, isValidCell as isValidCellH3, latLngToCell } from 'h3-js';
import { isLocated } from './filters';
import { hasCapability } from './matrix';
import type { Company } from './types';

/** At and above this zoom the map shows clustered pins instead of hexagons. */
export const PIN_ZOOM = 9;

// Zoom thresholds and the H3 resolution used up to each one.
const RESOLUTIONS: Array<[number, number]> = [
  [4, 3],
  [5.5, 4],
  [7, 5],
  [8, 6],
  [Infinity, 7],
];

export function resolutionForZoom(zoom: number): number {
  for (const [maxZoom, res] of RESOLUTIONS) if (zoom < maxZoom) return res;
  return 7;
}

export interface Bin {
  cell: string;
  count: number;
  ids: string[];
}

export function binCompanies(companies: Company[], resolution: number): Bin[] {
  const bins = new Map<string, Bin>();
  for (const c of companies) {
    if (!isLocated(c)) continue;
    const cell = latLngToCell(c.lat, c.lon, resolution);
    let bin = bins.get(cell);
    if (!bin) {
      bin = { cell, count: 0, ids: [] };
      bins.set(cell, bin);
    }
    bin.count++;
    bin.ids.push(c.id);
  }
  return [...bins.values()];
}

export interface HexFeature {
  type: 'Feature';
  id: number;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties: { cell: string; count: number; colour: string };
}

export interface HexCollection {
  type: 'FeatureCollection';
  features: HexFeature[];
}

export function binsToGeoJSON(bins: Bin[], colourFor: (count: number) => string = () => ''): HexCollection {
  return {
    type: 'FeatureCollection',
    features: bins.map((b, i) => ({
      type: 'Feature',
      id: i,
      // GeoJSON order is [lon, lat]; the ring is closed by cellToBoundary.
      geometry: { type: 'Polygon', coordinates: [cellToBoundary(b.cell, true)] },
      properties: { cell: b.cell, count: b.count, colour: colourFor(b.count) },
    })),
  };
}

/** Ids of the given companies whose point falls in an H3 cell. */
export function companiesInCell(companies: Company[], cell: string): string[] {
  let res: number;
  try {
    res = getResolution(cell);
  } catch {
    return [];
  }
  if (res < 0) return [];
  return companies.filter((c) => isLocated(c) && latLngToCell(c.lat, c.lon, res) === cell).map((c) => c.id);
}

export function isValidCell(cell: string): boolean {
  return isValidCellH3(cell);
}

/**
 * Places for capability overlap: hexagons at a fixed resolution (about 250
 * square kilometres), so the answer does not change with the map's zoom.
 */
export const OVERLAP_RESOLUTION = 5;

/**
 * Companies in places where every chosen capability is found. A place is an
 * overlap when, for each capability, at least one company there has it (or a
 * sub-capability); the companies returned are those in overlap places with at
 * least one chosen capability, in input order. With fewer than two
 * capabilities the companies are returned unchanged.
 */
export function overlapCompanies(companies: Company[], caps: string[], resolution = OVERLAP_RESOLUTION): Company[] {
  if (caps.length < 2) return companies;
  const cellOf = new Map<string, string>();
  const found = new Map<string, Set<string>>();
  for (const c of companies) {
    if (!isLocated(c)) continue;
    const has = caps.filter((cap) => hasCapability(c, cap));
    if (!has.length) continue;
    const cell = latLngToCell(c.lat, c.lon, resolution);
    cellOf.set(c.id, cell);
    let set = found.get(cell);
    if (!set) found.set(cell, (set = new Set()));
    for (const cap of has) set.add(cap);
  }
  return companies.filter((c) => {
    const cell = cellOf.get(c.id);
    return cell !== undefined && (found.get(cell)?.size ?? 0) === caps.length;
  });
}
